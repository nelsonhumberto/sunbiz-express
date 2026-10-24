import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  shouldSkipSevenDayAbandoned,
  shouldStampAbandonedAt,
} from '@/lib/draft-recovery';

const findMany = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findMany, updateMany },
    emailNotification: { findFirst },
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail,
}));

import { runDraftRecovery } from '@/app/api/cron/recovery/route';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');

function draftAt(hoursAgo: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 'fil_1',
    status: 'DRAFT',
    isTest: false,
    adminArchivedAt: null,
    userArchivedAt: null,
    abandonedAt: null,
    updatedAt: new Date(NOW - hoursAgo * 60 * 60 * 1000),
    currentStep: 4,
    businessName: 'Acme LLC',
    userId: 'usr_1',
    user: {
      email: 'buyer@example.com',
      firstName: 'Pat',
      role: 'USER',
      accountStatus: 'ACTIVE',
      guestToken: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset();
  findFirst.mockReset();
  sendEmail.mockReset();
  findFirst.mockResolvedValue(null);
  updateMany.mockResolvedValue({ count: 1 });
  sendEmail.mockResolvedValue({ status: 'SENT' });
});

describe('7-day abandonedAt rules', () => {
  it('stamps only a successful 7-day send for a DRAFT', () => {
    expect(
      shouldStampAbandonedAt({
        status: 'DRAFT',
        notificationType: 'ABANDONED_7D',
        deliveryStatus: 'SENT',
      }),
    ).toBe(true);
    expect(
      shouldStampAbandonedAt({
        status: 'SUBMITTED',
        notificationType: 'ABANDONED_7D',
        deliveryStatus: 'SENT',
      }),
    ).toBe(false);
    expect(
      shouldStampAbandonedAt({
        status: 'DRAFT',
        notificationType: 'ABANDONED_24H',
        deliveryStatus: 'SENT',
      }),
    ).toBe(false);
    expect(
      shouldStampAbandonedAt({
        status: 'DRAFT',
        notificationType: 'ABANDONED_7D',
        deliveryStatus: 'FAILED',
      }),
    ).toBe(false);
    expect(shouldSkipSevenDayAbandoned({ abandonedAt: new Date(NOW) })).toBe(true);
    expect(shouldSkipSevenDayAbandoned({ abandonedAt: null })).toBe(false);
  });

  it('sets abandonedAt when the 7-day email is sent for a DRAFT', async () => {
    findMany.mockResolvedValue([draftAt(180)]);

    const stats = await runDraftRecovery(NOW);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ABANDONED_7D',
        to: 'buyer@example.com',
        filingId: 'fil_1',
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'fil_1', status: 'DRAFT', abandonedAt: null },
      data: { abandonedAt: new Date(NOW) },
    });
    expect(stats.sent).toBe(1);
  });

  it('does not send the 7-day email when abandonedAt is already set', async () => {
    findMany.mockResolvedValue([draftAt(180, { abandonedAt: new Date(NOW - 86_400_000) })]);

    const stats = await runDraftRecovery(NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(stats.sent).toBe(0);
  });

  it('does not stamp abandonedAt when the 7-day send fails', async () => {
    findMany.mockResolvedValue([draftAt(180)]);
    sendEmail.mockResolvedValue({ status: 'FAILED' });

    await runDraftRecovery(NOW);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not stamp abandonedAt for an earlier recovery email', async () => {
    findMany.mockResolvedValue([draftAt(30)]);

    await runDraftRecovery(NOW);

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ type: 'ABANDONED_24H' }));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not stamp a filing that is no longer a DRAFT', async () => {
    findMany.mockResolvedValue([draftAt(180, { status: 'SUBMITTED' })]);

    await runDraftRecovery(NOW);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
