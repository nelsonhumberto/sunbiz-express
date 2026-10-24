import { afterEach, describe, expect, it, vi } from 'vitest';

const filingFindMany = vi.hoisted(() => vi.fn());
const noteFindMany = vi.hoisted(() => vi.fn());
const noteCreate = vi.hoisted(() => vi.fn());
const optOutFind = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findMany: filingFindMany, updateMany: vi.fn() },
    emailNotification: {
      findMany: noteFindMany,
      create: noteCreate,
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    marketingOptOut: { findUnique: optOutFind },
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail,
  renderTemplate: () => ({ subject: 'Saved', html: '<p>Hi</p>' }),
}));

import { runScheduledDraftRecovery } from '@/lib/draft-recovery';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function filing(id: string, updatedAt: number) {
  return {
    id,
    userId: `usr-${id}`,
    status: 'DRAFT',
    isTest: false,
    adminArchivedAt: null,
    userArchivedAt: null,
    abandonedAt: null,
    updatedAt: new Date(updatedAt),
    currentStep: 3,
    businessName: 'Acme',
    locale: 'en',
    entryPath: '/start',
    payments: [] as { id: string }[],
    user: {
      email: `${id}@example.com`,
      firstName: 'Pat',
      role: 'USER',
      accountStatus: 'GUEST',
      guestToken: 'tok',
      locale: 'en',
    },
  };
}

describe('resume drip starvation', () => {
  const previous = process.env.RESUME_DRIP_ENABLED;

  afterEach(() => {
    if (previous === undefined) delete process.env.RESUME_DRIP_ENABLED;
    else process.env.RESUME_DRIP_ENABLED = previous;
    vi.clearAllMocks();
  });

  it('pages past 50 between-step drafts and still attempts the newer 1h mail', async () => {
    process.env.RESUME_DRIP_ENABLED = 'true';
    const between = Array.from({ length: 50 }, (_, index) =>
      filing(`between-${index}`, NOW - 20 * HOUR - index * 1000),
    );
    const due = Array.from({ length: 5 }, (_, index) =>
      filing(`due-${index}`, NOW - 2 * HOUR + index * 1000),
    );
    const all = [...between, ...due].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

    filingFindMany.mockImplementation(async (args: { skip?: number; take?: number }) => {
      const skip = args.skip ?? 0;
      const take = args.take ?? all.length;
      return all.slice(skip, skip + take);
    });
    noteFindMany.mockImplementation(async (args: { where: { filingId: string } }) => {
      if (args.where.filingId.startsWith('between-')) {
        return [
          {
            notificationType: 'RESUME_1H',
            status: 'SENT',
            attemptCount: 1,
            claimedAt: new Date(NOW),
            createdAt: new Date(NOW),
          },
        ];
      }
      return [];
    });
    noteCreate.mockImplementation(async ({ data }: { data: { filingId: string } }) => ({
      id: `ntf-${data.filingId}`,
    }));
    optOutFind.mockResolvedValue(null);
    sendEmail.mockResolvedValue({ status: 'SENT' });

    const result = await runScheduledDraftRecovery(NOW);

    expect(result).toMatchObject({ scanned: 55, sent: 5, disabled: false });
    expect(filingFindMany.mock.calls.length).toBeGreaterThan(1);
    const sentIds = sendEmail.mock.calls.map(
      (call) => (call[0] as { filingId: string }).filingId,
    );
    expect(sentIds).toEqual(['due-0', 'due-1', 'due-2', 'due-3', 'due-4']);
    expect(sentIds.some((id) => id.startsWith('between-'))).toBe(false);
    const where = JSON.stringify(filingFindMany.mock.calls[0]?.[0]?.where);
    expect(where).toContain('RESUME_1H');
    expect(where).toContain('RESUME_1D');
    expect(where).toContain('RESUME_3D');
    expect(where).toContain('none');
  });
});
