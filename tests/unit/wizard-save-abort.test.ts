import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isWizardSaveCurrent, runWizardSave } from '@/lib/wizard-save';

describe('abortable wizard save', () => {
  it('stops waiting when a newer save or navigation aborts the request', async () => {
    const controller = new AbortController();
    const started = Date.now();
    const outcome = runWizardSave(() => new Promise(() => {}), 5_000, controller.signal);
    controller.abort();
    await expect(outcome).resolves.toEqual({ type: 'aborted' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('drops a stale value that arrives after abort', async () => {
    const controller = new AbortController();
    let finish: (value: string) => void = () => {};
    const outcome = runWizardSave(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      5_000,
      controller.signal,
    );
    controller.abort();
    finish('stale');
    await expect(outcome).resolves.toEqual({ type: 'aborted' });
  });

  it('still returns a value when nothing aborts it', async () => {
    await expect(runWizardSave(async () => 'saved', 1_000)).resolves.toEqual({
      type: 'value',
      value: 'saved',
    });
  });

  it('ignores a save that is no longer the current generation', () => {
    expect(isWizardSaveCurrent(2, 2)).toBe(true);
    expect(isWizardSaveCurrent(1, 2)).toBe(false);
  });

  it('cancels the in-flight save on unmount and resets Saving', () => {
    const submit = readFileSync('components/wizard/useWizardSubmit.ts', 'utf8');
    expect(submit).toContain('abortRef.current?.abort()');
    expect(submit).toContain("outcome.type === 'aborted'");
    expect(submit).toContain('setPending(false)');
    expect(submit).toContain('generation.current === gen');
    expect(submit).not.toContain('lock.current');
  });
});
