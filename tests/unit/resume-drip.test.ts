import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allDripCopyText, checklistCopy, resumeStepCopy } from '@/lib/drip-copy';
import { buildResumeEmail } from '@/lib/drip-email';
import { buildResumeEmailSentCapture } from '@/lib/posthog-server';
import { decorateResumeEmailHtml, withResumeUtms } from '@/lib/resume-utm';
import {
  guestResumeUrl,
  planResumeDrip,
  raRenewalTypeForDays,
  resolveDripLocale,
  resumeLinkPlan,
  shouldSkipDraftRecovery,
  wholeDaysUntil,
  wizardPathForDraft,
  type ResumeDripCandidate,
} from '@/lib/draft-recovery';
import { isResumeDripEnabled, isSignupCaptureEnabled, resumeEmailReplyTo } from '@/lib/feature-flags';
import {
  listUnsubscribeHeaders,
  readUnsubscribeToken,
  signUnsubscribeToken,
  unsubscribeLink,
} from '@/lib/unsubscribe';

const DAY = 24 * 60 * 60 * 1000;

const ready: ResumeDripCandidate = {
  enabled: true,
  ageHours: 2,
  sentTypes: [],
  status: 'DRAFT',
  paid: false,
  unsubscribed: false,
  deleted: false,
  skip: false,
};

const customer = {
  isTest: false,
  adminArchivedAt: null,
  userArchivedAt: null,
  user: { role: 'USER', email: 'buyer@example.com' },
};

describe('resume drip schedule', () => {
  it('sends about 1 hour, 1 day, and 3 days, and marks the last step final', () => {
    expect(planResumeDrip({ ...ready, ageHours: 0.9 }).reason).toBe('too-soon');
    expect(planResumeDrip({ ...ready, ageHours: 1 }).send).toBe('RESUME_1H');
    expect(planResumeDrip({ ...ready, ageHours: 23.5 }).send).toBe('RESUME_1H');
    expect(planResumeDrip({ ...ready, ageHours: 24 }).send).toBe('RESUME_1D');
    expect(planResumeDrip({ ...ready, ageHours: 71 }).send).toBe('RESUME_1D');
    const last = planResumeDrip({ ...ready, ageHours: 72 });
    expect(last.send).toBe('RESUME_3D');
    expect(last.final).toBe(true);
    expect(planResumeDrip({ ...ready, ageHours: 95 }).send).toBe('RESUME_3D');
    expect(planResumeDrip({ ...ready, ageHours: 96 }).reason).toBe('window-closed');
  });

  it('sends nothing when the flag is off', () => {
    expect(isResumeDripEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isResumeDripEnabled({ RESUME_DRIP_ENABLED: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isResumeDripEnabled({ RESUME_DRIP_ENABLED: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isResumeDripEnabled({ RESUME_DRIP_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(planResumeDrip({ ...ready, enabled: false }).reason).toBe('disabled');
    expect(planResumeDrip({ ...ready, enabled: false, ageHours: 80 }).send).toBeNull();
  });

  it('keeps each registered-agent reminder on one day window', () => {
    const now = Date.UTC(2026, 9, 1, 12, 0, 0);
    const target = now + 60 * DAY + 12 * 60 * 60 * 1000;
    const first = wholeDaysUntil(target, now);
    const anHourLater = wholeDaysUntil(target, now + 60 * 60 * 1000);
    expect(first).toBe(60);
    expect(anHourLater).toBe(first);
    expect(raRenewalTypeForDays(first)).toBe('RA_RENEWAL_60');
    expect(raRenewalTypeForDays(anHourLater)).toBe('RA_RENEWAL_60');
    expect(raRenewalTypeForDays(61)).toBeNull();
    expect(raRenewalTypeForDays(30)).toBe('RA_RENEWAL_30');
    expect(raRenewalTypeForDays(7)).toBe('RA_RENEWAL_7');
    expect(raRenewalTypeForDays(8)).toBeNull();
  });

  it('does not repeat a resume step or RA reminder when the route runs again an hour later', () => {
    const first = planResumeDrip({ ...ready, ageHours: 2 });
    expect(first.send).toBe('RESUME_1H');
    const hourLater = planResumeDrip({
      ...ready,
      ageHours: 3,
      sentTypes: [first.send!],
    });
    expect(hourLater.send).toBeNull();
    expect(hourLater.reason).toBe('already-sent');

    const now = Date.UTC(2026, 9, 1, 14, 15, 0);
    const renewal = now + 7 * DAY + 3 * 60 * 60 * 1000;
    const day = wholeDaysUntil(renewal, now);
    const nextHour = wholeDaysUntil(renewal, now + 60 * 60 * 1000);
    expect(raRenewalTypeForDays(day)).toBe('RA_RENEWAL_7');
    expect(raRenewalTypeForDays(nextHour)).toBe(raRenewalTypeForDays(day));

    const job = readFileSync('lib/draft-recovery.ts', 'utf8');
    const resumeCheck = job.indexOf('notificationType: { in: stepTypes }');
    const resumeSend = job.indexOf('type: decision.send');
    const raCheck = job.indexOf('notificationType: bucket');
    const raSend = job.lastIndexOf('type: bucket');
    expect(resumeCheck).toBeGreaterThan(-1);
    expect(raCheck).toBeGreaterThan(-1);
    expect(resumeCheck).toBeLessThan(resumeSend);
    expect(raCheck).toBeLessThan(raSend);
  });
});

describe('resume drip stop conditions', () => {
  it('stops when the order leaves draft, is paid, the person unsubscribes, or the filing is gone', () => {
    expect(planResumeDrip({ ...ready, status: 'SUBMITTED' }).reason).toBe('stopped');
    expect(planResumeDrip({ ...ready, status: 'APPROVED' }).reason).toBe('stopped');
    expect(planResumeDrip({ ...ready, paid: true }).reason).toBe('stopped');
    expect(planResumeDrip({ ...ready, unsubscribed: true }).reason).toBe('stopped');
    expect(planResumeDrip({ ...ready, deleted: true }).reason).toBe('stopped');
  });
});

describe('resume drip dedupe', () => {
  it('does not send a step that was already recorded', () => {
    expect(planResumeDrip({ ...ready, sentTypes: ['RESUME_1H'] }).reason).toBe('already-sent');
    expect(planResumeDrip({ ...ready, ageHours: 30, sentTypes: ['RESUME_1H'] }).send).toBe('RESUME_1D');
    expect(
      planResumeDrip({ ...ready, ageHours: 80, sentTypes: ['RESUME_1H', 'RESUME_1D', 'RESUME_3D'] }).reason,
    ).toBe('already-sent');
  });
});

describe('qa and e2e skip', () => {
  it('skips qa+ and e2e+ mailboxes and still mails a normal plus address', () => {
    expect(
      shouldSkipDraftRecovery({ ...customer, user: { role: 'USER', email: 'qa+draft@gmail.com' } }),
    ).toBe(true);
    expect(
      shouldSkipDraftRecovery({ ...customer, user: { role: 'USER', email: 'E2E+signup@example.com' } }),
    ).toBe(true);
    expect(
      shouldSkipDraftRecovery({ ...customer, user: { role: 'USER', email: 'buyer+qa@example.com' } }),
    ).toBe(false);
    const skip = shouldSkipDraftRecovery({
      ...customer,
      user: { role: 'USER', email: 'qa+draft@gmail.com' },
    });
    expect(planResumeDrip({ ...ready, skip }).reason).toBe('skip');
  });
});

describe('unsubscribe token', () => {
  const secret = 'test-unsubscribe-secret';

  it('round-trips a mailbox and rejects a tampered token', () => {
    const token = signUnsubscribeToken('Laura@Example.com', secret);
    expect(readUnsubscribeToken(token, secret)).toBe('laura@example.com');
    expect(readUnsubscribeToken(`${token}x`, secret)).toBeNull();
    expect(readUnsubscribeToken(token, 'other-secret')).toBeNull();
    expect(readUnsubscribeToken('not-a-token', secret)).toBeNull();
  });

  it('builds a link and the one-click headers', () => {
    const link = unsubscribeLink('https://launchforma.com/', 'a@b.co', secret);
    expect(link.startsWith('https://launchforma.com/unsubscribe?token=')).toBe(true);
    const token = new URL(link).searchParams.get('token') ?? '';
    expect(readUnsubscribeToken(token, secret)).toBe('a@b.co');
    expect(listUnsubscribeHeaders(link)).toEqual({
      'List-Unsubscribe': `<${link}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});

describe('resume copy and reply-to', () => {
  it('defaults to Spanish, keeps the English reply line, and avoids em dashes', () => {
    expect(resolveDripLocale(null, undefined)).toBe('es');
    expect(resolveDripLocale('en-US', 'es')).toBe('en');
    expect(resolveDripLocale(null, 'en')).toBe('en');
    const text = allDripCopyText();
    expect(text).not.toContain('—');
    expect(text).not.toContain('–');
    expect(resumeStepCopy('RESUME_1D', 'en').paragraphs.join(' ')).toContain('reply to this email');
    expect(resumeStepCopy('RESUME_1D', 'es').paragraphs.join(' ')).toContain('responde a este correo');
    const english = buildResumeEmail({
      step: 'RESUME_1D',
      locale: 'en',
      firstName: 'Ana',
      resumeUrl: 'https://launchforma.com/resume?f=1&t=2',
      unsubscribeUrl: 'https://launchforma.com/unsubscribe?token=abc',
    });
    expect(english.subject).toBe('Still thinking it over?');
    expect(english.inner).toContain('reply to this email');
    expect(english.inner).toContain('Unsubscribe');
    const spanish = buildResumeEmail({
      step: 'RESUME_1H',
      firstName: 'Ana',
      resumeUrl: 'https://launchforma.com/resume?f=1&t=2',
      unsubscribeUrl: 'https://launchforma.com/unsubscribe?token=abc',
    });
    expect(spanish.subject).toBe('Tu pedido de LaunchForma está guardado');
    expect(spanish.inner).not.toContain('—');
  });

  it('adds the resume campaign to every link in the email', () => {
    const steps = ['RESUME_1H', 'RESUME_1D', 'RESUME_3D'] as const;
    for (const step of steps) {
      const campaign = step.toLowerCase();
      const resume = withResumeUtms('https://launchforma.com/resume?f=1&t=2', step);
      const parsed = new URL(resume);
      expect(parsed.searchParams.get('f')).toBe('1');
      expect(parsed.searchParams.get('t')).toBe('2');
      expect(parsed.searchParams.get('utm_source')).toBe('resume_email');
      expect(parsed.searchParams.get('utm_medium')).toBe('email');
      expect(parsed.searchParams.get('utm_campaign')).toBe(campaign);

      const built = buildResumeEmail({
        step,
        locale: 'en',
        firstName: 'Ana',
        resumeUrl: 'https://launchforma.com/resume?f=1&t=2',
        unsubscribeUrl: 'https://launchforma.com/unsubscribe?token=abc',
      });
      const wrapped = decorateResumeEmailHtml(
        `${built.inner}<a href="https://launchforma.com">LF</a><a href="mailto:help@launchforma.com">help</a>`,
        step,
      );
      const hrefs = [...wrapped.matchAll(/href="([^"]+)"/g)].map((match) =>
        match[1]!.replace(/&amp;/g, '&'),
      );
      const web = hrefs.filter((href) => href.startsWith('http'));
      expect(web.length).toBeGreaterThan(0);
      for (const href of web) {
        const url = new URL(href);
        expect(url.searchParams.get('utm_source')).toBe('resume_email');
        expect(url.searchParams.get('utm_medium')).toBe('email');
        expect(url.searchParams.get('utm_campaign')).toBe(campaign);
      }
      expect(hrefs).toContain('mailto:help@launchforma.com');
    }
    expect(withResumeUtms('mailto:help@launchforma.com', 'RESUME_1H')).toBe(
      'mailto:help@launchforma.com',
    );
  });

  it('builds a resume_email_sent capture and skips an empty filing', () => {
    expect(
      buildResumeEmailSentCapture({ step: 'RESUME_1H', filingId: 'fil_1', locale: 'es' }),
    ).toEqual({
      event: 'resume_email_sent',
      distinct_id: 'fil_1',
      properties: { step: 'RESUME_1H', filingId: 'fil_1', locale: 'es' },
    });
    expect(buildResumeEmailSentCapture({ step: 'RESUME_1D', filingId: ' ', locale: 'en' })).toBeNull();
  });

  it('defaults Reply-To to admin@launchforma.com', () => {
    expect(resumeEmailReplyTo({} as NodeJS.ProcessEnv)).toBe('admin@launchforma.com');
    expect(resumeEmailReplyTo({ EMAIL_REPLY_TO: ' help@launchforma.com ' } as NodeJS.ProcessEnv)).toBe(
      'help@launchforma.com',
    );
  });

  it('uses the guest resume link and a login link for account holders', () => {
    expect(resumeLinkPlan({ accountStatus: 'GUEST', role: 'USER', guestToken: 'tok' })).toBe('guest');
    expect(guestResumeUrl('https://launchforma.com', 'filing1', 'tok')).toBe(
      'https://launchforma.com/resume?f=filing1&t=tok',
    );
    expect(resumeLinkPlan({ accountStatus: 'ACTIVE', role: 'USER', guestToken: null })).toBe('login-link');
    expect(wizardPathForDraft('filing1', 4)).toBe('/wizard/filing1/4');
    expect(wizardPathForDraft('filing1', 0)).toBe('/wizard/filing1/2');
  });
});

describe('checklist signup gate', () => {
  it('stays off unless the flag is on, and the consent box is not prechecked', () => {
    expect(isSignupCaptureEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isSignupCaptureEnabled({ SIGNUP_CAPTURE_ENABLED: 'yes' } as NodeJS.ProcessEnv)).toBe(true);
    const form = readFileSync('components/marketing/ChecklistSignupForm.tsx', 'utf8');
    expect(form).toContain('type="checkbox"');
    expect(form).not.toContain('defaultChecked');
    expect(form).not.toContain('checked={true}');
    const section = readFileSync('components/marketing/ChecklistSignupSection.tsx', 'utf8');
    expect(section).toContain('if (!isSignupCaptureEnabled()) return null');
    const layout = readFileSync('app/(marketing)/layout.tsx', 'utf8');
    expect(layout).toContain('<ChecklistSignupSection />');
    const english = checklistCopy('en');
    expect(`${english.consentBefore}${english.consentLink}${english.consentAfter}`).toBe(
      'Yes, I opt in to get the free checklist plus occasional tips and updates from LaunchForma by email. This list is opt-in only: we only add you if you check this box, and you can unsubscribe at any time. See our Privacy Policy.',
    );
    expect(checklistCopy('es').headline.length).toBeGreaterThan(0);
    const cron = readFileSync('vercel.json', 'utf8');
    expect(cron).toContain('"schedule": "0 14 * * *"');
    expect(cron).not.toContain('"schedule": "0 * * * *"');
    const workflow = readFileSync('.github/workflows/recovery-cron.yml', 'utf8');
    expect(workflow).toContain('15 * * * *');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('https://launchforma.com/api/cron/recovery');
    expect(workflow).toContain('Authorization: Bearer ${CRON_SECRET}');
    expect(workflow).toContain('::notice::');
    const route = readFileSync('app/api/cron/recovery/route.ts', 'utf8');
    expect(route).toContain('export async function GET');
    expect(route).not.toMatch(/^export (async )?function (?!GET)/m);
    expect(route).not.toContain('function run');
    expect(route).toContain('runScheduledDraftRecovery');
    expect(route).toContain('runRaRenewalReminders');
  });
});
