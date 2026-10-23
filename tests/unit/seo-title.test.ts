import { describe, expect, it } from 'vitest';
import {
  homeTitlePhrase,
  pageTitle,
  statePageTitlePhrase,
  withBrand,
} from '@/lib/seo-title';

describe('page titles', () => {
  it('leads the homepage with the Florida search phrase and one brand suffix', () => {
    const phrase = homeTitlePhrase('Florida', 'FL');
    expect(phrase).toBe('Form a Florida LLC Online, State Fee Included');
    expect(withBrand(phrase)).toBe(
      'Form a Florida LLC Online, State Fee Included · LaunchForma',
    );
    expect(pageTitle(phrase)).toBe(phrase);
  });

  it('leads state pages with the search phrase and does not repeat the brand', () => {
    const phrase = statePageTitlePhrase('Delaware');
    expect(phrase).toBe('Form a Delaware LLC Online');
    expect(withBrand(phrase)).toBe('Form a Delaware LLC Online · LaunchForma');
    expect(pageTitle('About LaunchForma - Transparent Business Formation')).toEqual({
      absolute: 'About LaunchForma - Transparent Business Formation',
    });
    expect(pageTitle('LaunchForma · Form your Delaware business in minutes')).toEqual({
      absolute: 'LaunchForma · Form your Delaware business in minutes',
    });
  });
});
