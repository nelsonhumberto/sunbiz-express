import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieGet = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const userUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const filingFindMany = vi.hoisted(() => vi.fn());
const filingUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const filingUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const filingCount = vi.hoisted(() => vi.fn(async () => 0));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => cookieGet(name),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: () => ({ get: () => null }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique, update: userUpdate },
    filing: {
      findMany: filingFindMany,
      updateMany: filingUpdateMany,
      update: filingUpdate,
      count: filingCount,
    },
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { attachGuestDraftsToAccount } from '@/actions/guest-email';

const TYPED = 'buyer@example.com';
const paid = {
  id: 'filing_paid',
  status: 'SUBMITTED',
  currentStep: 11,
  optionalDetails: JSON.stringify({
    checkoutEmail: TYPED,
    typedGuestEmail: TYPED,
  }),
};

describe('sign-in claim of a paid guest filing', () => {
  beforeEach(() => {
    cookieGet.mockReset();
    userFindUnique.mockReset();
    userUpdate.mockClear();
    filingFindMany.mockReset();
    filingUpdateMany.mockClear();
    filingUpdate.mockClear();
    filingCount.mockReset();
    filingCount.mockResolvedValue(0);
    filingFindMany.mockResolvedValue([paid]);
    userFindUnique.mockImplementation(async (args: { where: { guestToken?: string; id?: string } }) => {
      if (args.where.guestToken === 'tok_1') {
        return {
          id: 'guest_1',
          email: 'guest.abc@guest.launchforma.invalid',
          accountStatus: 'GUEST',
        };
      }
      if (args.where.id === 'account_1') {
        return { id: 'account_1', email: TYPED };
      }
      if (args.where.id === 'account_other') {
        return { id: 'account_other', email: 'other@example.com' };
      }
      return null;
    });
  });

  it('moves the filing when the same browser signs in as the typed address', async () => {
    cookieGet.mockImplementation((name: string) =>
      name === 'LF_GUEST_TOKEN' ? { value: 'tok_1' } : undefined,
    );
    const result = await attachGuestDraftsToAccount('account_1');
    expect(result.movedIds).toContain('filing_paid');
    expect(filingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['filing_paid'] },
          userId: 'guest_1',
        }),
        data: { userId: 'account_1' },
      }),
    );
  });

  it('moves nothing from another browser', async () => {
    cookieGet.mockReturnValue(undefined);
    const result = await attachGuestDraftsToAccount('account_1');
    expect(result.movedIds).toEqual([]);
    expect(filingUpdateMany).not.toHaveBeenCalled();
    expect(filingFindMany).not.toHaveBeenCalled();
  });

  it('moves nothing when the signed-in email is different', async () => {
    cookieGet.mockImplementation((name: string) =>
      name === 'LF_GUEST_TOKEN' ? { value: 'tok_1' } : undefined,
    );
    const result = await attachGuestDraftsToAccount('account_other');
    expect(result.movedIds).toEqual([]);
    expect(filingUpdateMany).not.toHaveBeenCalled();
  });
});
