import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { STEP2_SAVE_TIMEOUT_MS } from '@/lib/action-timeout';
import { NAME_CHECK_CLIENT_TIMEOUT_MS, requestNameCheck } from '@/lib/name-check';
import { NAME_CHECK_UPSTREAM_BUDGET_MS, runBudgetedSearches } from '@/lib/sunbiz';
import { runWizardSave } from '@/lib/wizard-save';

describe('step 2 save budget', () => {
  it('stops waiting when the save never settles', async () => {
    const outcome = await runWizardSave(() => new Promise(() => {}), 20);
    expect(outcome).toEqual({ type: 'timeout' });
  });

  it('caps step 2 and the name check at 5 seconds', () => {
    expect(STEP2_SAVE_TIMEOUT_MS).toBe(5_000);
    expect(NAME_CHECK_CLIENT_TIMEOUT_MS).toBe(5_000);
    expect(NAME_CHECK_UPSTREAM_BUDGET_MS).toBe(5_000);
  });

  it('starts every search term together and aborts them on one budget', async () => {
    const started: string[] = [];
    const search = (term: string, signal: AbortSignal) => {
      started.push(term);
      return new Promise<{ term: string }>((resolve, reject) => {
        const timer = setTimeout(() => resolve({ term }), 30_000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    };

    const startedAt = Date.now();
    await expect(
      runBudgetedSearches(['raw', 'stripped', 'normalized'], { budgetMs: 40 }, search),
    ).rejects.toThrow(/aborted/);
    expect(started).toEqual(['raw', 'stripped', 'normalized']);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it('treats an aborted name check as deferred', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
      return new Response('{}', { status: 200 });
    });

    const outcome = await requestNameCheck(
      '/api/sunbiz/name-check',
      fetchImpl as typeof fetch,
      NAME_CHECK_CLIENT_TIMEOUT_MS,
      controller.signal,
    );
    expect(outcome).toMatchObject({ deferred: true, status: 'error', result: null });
  });

  it('does not wait on Sunbiz or email inside the step 2 save', () => {
    const step = readFileSync('components/wizard/steps/Step2Name.tsx', 'utf8');
    const widget = readFileSync('components/wizard/NameCheckWidget.tsx', 'utf8');
    const submit = readFileSync('components/wizard/useWizardSubmit.ts', 'utf8');
    const save = readFileSync('actions/wizard.ts', 'utf8');
    const route = readFileSync('app/api/sunbiz/name-check/route.ts', 'utf8');

    expect(step).toContain('STEP2_SAVE_TIMEOUT_MS');
    expect(step).toContain('cancelRef={cancelNameCheck}');
    expect(widget).toContain('cancelRef');
    expect(widget).toContain('NAME_CHECK_CLIENT_TIMEOUT_MS');
    expect(submit).not.toMatch(/useTransition\s*\(/);
    expect(submit).toContain('setPending(false)');
    expect(save).not.toContain('checkNameAvailability');
    expect(save).not.toContain('sendEmail');
    expect(save).toContain('withActionTimeout(saveStep2Now(input), STEP2_SAVE_TIMEOUT_MS)');
    expect(route).toContain('signal: req.signal');
  });
});
