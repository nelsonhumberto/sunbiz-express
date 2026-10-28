import { describe, expect, it } from 'vitest';
import { checklistFormSource } from '@/lib/checklist-form-source';

describe('bottom checklist source', () => {
  it('tags the Florida LLC landing page and leaves other pages alone', () => {
    expect(checklistFormSource('/lp/florida-llc')).toBe('lp-florida-llc-bottom');
    expect(checklistFormSource('/es/lp/llc-florida')).toBe('lp-florida-llc-bottom');
    expect(checklistFormSource('/lp/florida-llc?utm_source=google')).toBe('lp-florida-llc-bottom');
    expect(checklistFormSource('/pricing')).toBeUndefined();
    expect(checklistFormSource('/lp/other')).toBeUndefined();
    expect(checklistFormSource('/es/lp/llc-florida-extra')).toBeUndefined();
  });
});
