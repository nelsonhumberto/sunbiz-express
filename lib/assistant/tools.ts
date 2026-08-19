import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { computeCost, type AddOnSlug, type EntityType, type TierSlug } from '@/lib/pricing';
import {
  ACTIVE_FORMATION_STATES,
  getFormationState,
  type StateCode,
} from '@/lib/formation-states';
import { checkNameAvailability as sunbizCheckName, SunbizError } from '@/lib/sunbiz';
import { deliverEmailDirect } from '@/lib/email';
import { logger } from '@/lib/logger';
import { filingUtmCreateFields } from '@/lib/utm-attribution';
import { summarizeFiling } from './redact';
import {
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep4,
  saveStep7,
} from '@/actions/wizard';

export interface AssistantActor {
  kind: 'user' | 'guest';
  id: string;
  email?: string | null;
}

export interface AssistantToolContext {
  actor: AssistantActor | null;
  /** Verified to belong to the actor before tools are built. */
  filingId: string | null;
  entityType: EntityType;
  stateCode: StateCode;
  locale: string;
  /** Set to true by a tool when it mutated the active draft (client refreshes). */
  onWrite: () => void;
}

function asState(input: string | undefined, fallback: StateCode): StateCode {
  const up = (input ?? '').toUpperCase();
  return ACTIVE_FORMATION_STATES.includes(up as StateCode) ? (up as StateCode) : fallback;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Build the tool set bound to the current request's actor + verified filing.
 * Write tools call the same server actions (and Zod schemas) the wizard uses,
 * so validation + ownership checks are identical. There is intentionally NO
 * tool that accepts an SSN/Tax-ID.
 */
export function buildAssistantTools(ctx: AssistantToolContext) {
  const requireFiling = () =>
    ctx.filingId
      ? null
      : ({
          ok: false as const,
          error:
            'No active filing yet. Use startFiling first, or ask the user to start one.',
        });

  return {
    getPricing: tool({
      description:
        'Get the exact all-in price and line items for a package. Always use this for any price question; never quote fees from memory.',
      inputSchema: z.object({
        entityType: z.enum(['LLC', 'CORP']).optional(),
        state: z.enum(['FL', 'WY', 'DE']).optional(),
        tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM']).optional(),
        addOnSlugs: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        const entityType = (args.entityType ?? ctx.entityType) as EntityType;
        const state = asState(args.state, ctx.stateCode);
        const tier = (args.tier ?? 'STANDARD') as TierSlug;
        const breakdown = computeCost({
          entityType,
          tier,
          state,
          addOnSlugs: (args.addOnSlugs ?? []) as AddOnSlug[],
        });
        return {
          entityType,
          state,
          tier,
          total: dollars(breakdown.totalCents),
          totalCents: breakdown.totalCents,
          lines: breakdown.lines.map((l) => ({
            label: (l as { label?: string }).label ?? l.key,
            amount: dollars(l.cents),
          })),
        };
      },
    }),

    checkNameAvailability: tool({
      description:
        'Check whether a business name appears available on the state register. Returns availability + any conflicts.',
      inputSchema: z.object({
        name: z.string().min(2).max(120),
        entityType: z.enum(['LLC', 'CORP']).optional(),
      }),
      execute: async (args) => {
        try {
          const res = await sunbizCheckName(
            args.name,
            (args.entityType ?? ctx.entityType) as 'LLC' | 'CORP',
          );
          return {
            available: res.available,
            message: res.message,
            conflicts: (res.conflicts ?? []).slice(0, 5),
          };
        } catch (err) {
          const msg =
            err instanceof SunbizError
              ? 'The name-availability service is busy right now.'
              : 'Could not check the name right now.';
          return { available: null, message: msg };
        }
      },
    }),

    getWizardContext: tool({
      description:
        "Read the user's in-progress filing so you know what's already filled and what's left. Returns no sensitive data.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.filingId || !ctx.actor) {
          return { hasFiling: false as const };
        }
        const filing = await prisma.filing.findUnique({
          where: { id: ctx.filingId },
          include: {
            managersMembers: { orderBy: { position: 'asc' } },
            filingAdditionalServices: { include: { service: true } },
          },
        });
        if (!filing || filing.userId !== ctx.actor.id) return { hasFiling: false as const };
        return { hasFiling: true as const, ...summarizeFiling(filing) };
      },
    }),

    startFiling: tool({
      description:
        'Start a new filing for the user. For a signed-in/guest actor this creates a draft and returns a wizard link; otherwise it returns a /start link. Offer it when the user is ready.',
      inputSchema: z.object({
        entityType: z.enum(['LLC', 'CORP']),
        state: z.enum(['FL', 'WY', 'DE']),
        tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM']).optional(),
        businessName: z.string().max(100).optional(),
      }),
      execute: async (args) => {
        const tier = (args.tier ?? 'STANDARD') as TierSlug;
        if (ctx.actor) {
          const filing = await prisma.filing.create({
            data: {
              userId: ctx.actor.id,
              entityType: args.entityType,
              state: args.state,
              serviceTier: tier,
              businessName: args.businessName?.trim() || null,
              currentStep: args.businessName ? 3 : 2,
              completedSteps: JSON.stringify(args.businessName ? [1, 2] : [1]),
              ...filingUtmCreateFields(),
            },
          });
          ctx.onWrite();
          return {
            ok: true as const,
            url: `/wizard/${filing.id}/${args.businessName ? 3 : 2}`,
            created: true,
          };
        }
        const params = new URLSearchParams({ entity: args.entityType, state: args.state, tier });
        if (args.businessName) params.set('name', args.businessName);
        return { ok: true as const, url: `/start?${params.toString()}`, created: false };
      },
    }),

    setBusinessName: tool({
      description:
        "Set the business name on the active filing. Confirm the exact name with the user first.",
      inputSchema: z.object({ businessName: z.string().min(2).max(100) }),
      execute: async (args) => {
        const guard = requireFiling();
        if (guard) return guard;
        const res = await saveStep2({ filingId: ctx.filingId!, businessName: args.businessName });
        if (res && 'ok' in res && !res.ok) return { ok: false as const, error: res.error };
        ctx.onWrite();
        return { ok: true as const, updated: 'businessName', value: args.businessName };
      },
    }),

    setEntityAndState: tool({
      description: 'Set the entity type (LLC/CORP) and optionally the state on the active filing.',
      inputSchema: z.object({
        entityType: z.enum(['LLC', 'CORP']),
        state: z.enum(['FL', 'WY', 'DE']).optional(),
      }),
      execute: async (args) => {
        const guard = requireFiling();
        if (guard) return guard;
        await saveStep1({ filingId: ctx.filingId!, entityType: args.entityType, state: args.state });
        ctx.onWrite();
        return { ok: true as const, updated: 'entity/state', value: `${args.entityType}${args.state ? ` / ${args.state}` : ''}` };
      },
    }),

    setTier: tool({
      description: 'Set the package tier (BASIC, STANDARD, or PREMIUM) on the active filing.',
      inputSchema: z.object({ tier: z.enum(['BASIC', 'STANDARD', 'PREMIUM']) }),
      execute: async (args) => {
        const guard = requireFiling();
        if (guard) return guard;
        await saveStep3({ filingId: ctx.filingId!, tier: args.tier });
        ctx.onWrite();
        return { ok: true as const, updated: 'tier', value: args.tier };
      },
    }),

    setPrincipalAddress: tool({
      description: "Set the business's principal address on the active filing.",
      inputSchema: z.object({
        street1: z.string().min(1),
        street2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().min(2).max(2),
        zip: z.string().min(5).max(10),
      }),
      execute: async (args) => {
        const guard = requireFiling();
        if (guard) return guard;
        const res = await saveStep4({
          filingId: ctx.filingId!,
          address: {
            street1: args.street1,
            street2: args.street2 ?? null,
            city: args.city,
            state: args.state.toUpperCase(),
            zip: args.zip,
          },
        });
        if (res && 'ok' in res && !res.ok) return { ok: false as const, error: res.error };
        ctx.onWrite();
        return { ok: true as const, updated: 'principalAddress', value: `${args.city}, ${args.state}` };
      },
    }),

    goToWizardStep: tool({
      description:
        "Move the user FORWARD in the wizard. Call this after you've saved everything needed for the current step so the user visibly advances. Omit `step` to go to their next/furthest step, or pass a specific step number (1=entity, 2=name, 3=package, 4=principal address, 5=mailing, 6=registered agent, 7=people, 8=details, 9=review, 10=add-ons, 11=payment).",
      inputSchema: z.object({
        step: z.number().int().min(1).max(11).optional(),
      }),
      execute: async (args) => {
        if (!ctx.filingId || !ctx.actor) {
          return { ok: false as const, error: 'No active filing to navigate.' };
        }
        const filing = await prisma.filing.findUnique({
          where: { id: ctx.filingId },
          select: { userId: true, currentStep: true },
        });
        if (!filing || filing.userId !== ctx.actor.id) {
          return { ok: false as const, error: 'Filing not found.' };
        }
        const target = Math.min(11, Math.max(1, args.step ?? filing.currentStep ?? 2));
        return { ok: true as const, navigateTo: `/wizard/${ctx.filingId}/${target}`, step: target };
      },
    }),

    setOwnerName: tool({
      description:
        "Record the primary owner's name on the active filing (first + last). For an LLC this sets the managing member; for a Corp it records a director. Confirm the spelling first.",
      inputSchema: z.object({
        firstName: z.string().min(1).max(80),
        lastName: z.string().min(1).max(80),
      }),
      execute: async (args) => {
        const guard = requireFiling();
        if (guard) return guard;
        const fullName = `${args.firstName.trim()} ${args.lastName.trim()}`.trim();
        const isLlc = ctx.entityType === 'LLC';
        const res = await saveStep7({
          filingId: ctx.filingId!,
          managementType: isLlc ? 'member-managed' : undefined,
          members: [{ title: isLlc ? 'MGRM' : 'DIRECTOR', name: fullName }],
        });
        if (res && 'ok' in res && !res.ok) return { ok: false as const, error: res.error };
        ctx.onWrite();
        return {
          ok: true as const,
          updated: 'owner',
          value: fullName,
          note: isLlc
            ? undefined
            : 'A corporation also needs President, Treasurer, and Secretary - guide them to the people step to finish.',
        };
      },
    }),

    escalateToHuman: tool({
      description:
        'Hand the conversation to a human when you cannot help or the user asks for a person. Emails the LaunchForma team.',
      inputSchema: z.object({
        question: z.string().min(1).max(2000),
        email: z.string().email().optional(),
      }),
      execute: async (args) => {
        const to = process.env.ASSISTANT_HANDOFF_EMAIL?.trim();
        const userEmail = args.email || ctx.actor?.email || 'unknown';
        if (!to) {
          return {
            ok: false as const,
            error: 'Handoff is not configured. Share help@launchforma.com with the user.',
          };
        }
        try {
          await deliverEmailDirect(
            to,
            'Assistant handoff: a customer needs help',
            `<p><strong>From:</strong> ${userEmail}</p><p><strong>Question:</strong></p><p>${args.question.replace(/</g, '&lt;')}</p>`,
          );
          return { ok: true as const, message: 'A specialist will follow up by email shortly.' };
        } catch (err) {
          logger.error('assistant handoff email failed', { area: 'assistant', tag: 'handoff' }, err);
          return { ok: false as const, error: 'Could not reach the team just now; share help@launchforma.com.' };
        }
      },
    }),

    recommendAddOn: tool({
      description:
        'Surface ONE relevant add-on as a gentle suggestion (never pushy). Returns a label + link to pre-select it.',
      inputSchema: z.object({
        addOnSlug: z.enum(['ein', 'boi_report', 's_corp_election', 'operating_agreement_multi', 'operating_agreement_single']),
        reason: z.string().max(200),
      }),
      execute: async (args) => {
        const url = ctx.filingId ? `/wizard/${ctx.filingId}/10?addon=${args.addOnSlug}` : `/start?addon=${args.addOnSlug}`;
        return { ok: true as const, addOnSlug: args.addOnSlug, reason: args.reason, url };
      },
    }),
  };
}
