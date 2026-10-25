import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('purchase_completed_server fires once per paid filing', () => {
  it('captures only after the payment row is inserted', () => {
    const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8');
    const post = webhook.slice(webhook.indexOf('export async function POST'));
    const handler = post.slice(0, post.indexOf('async function reconcilePaidFiling'));
    expect(handler).not.toContain('capturePurchaseCompletedServer(');

    const created = webhook.indexOf('prisma.payment.create');
    const duplicate = webhook.indexOf("code === 'P2002'");
    const captured = webhook.indexOf('await capturePurchaseCompletedServer(');
    expect(created).toBeGreaterThan(-1);
    expect(duplicate).toBeGreaterThan(created);
    expect(captured).toBeGreaterThan(duplicate);

    const checkout = readFileSync('actions/payments.ts', 'utf8');
    const payCreated = checkout.indexOf('prisma.payment.create');
    const payCaptured = checkout.indexOf('await capturePurchaseCompletedServer(');
    expect(payCaptured).toBeGreaterThan(payCreated);
  });

  it('does not initialize posthog-js outside production', () => {
    const browser = readFileSync('lib/posthog-browser.ts', 'utf8');
    const init = browser.indexOf('posthog.init(');
    const gate = browser.indexOf("POSTHOG_ENV === 'production'");
    expect(gate).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(gate);
  });
});
