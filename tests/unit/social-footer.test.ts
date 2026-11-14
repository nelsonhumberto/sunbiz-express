import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attachSocialImages, SOCIAL_IMAGE } from '@/lib/locale-seo';
import { FOOTER_SOCIAL_LINKS } from '@/lib/social-links';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

describe('share image and footer social links', () => {
  it('attaches a 1200x630 image for pages that set their own openGraph', () => {
    const meta = attachSocialImages({
      title: 'Home',
      description: 'Form a Florida LLC',
      openGraph: { title: 'Home' },
    });
    expect(meta.openGraph).toMatchObject({
      images: [SOCIAL_IMAGE],
    });
    expect(readFileSync('lib/locale-seo.ts', 'utf8')).toContain('return attachSocialImages(');
    expect(SOCIAL_IMAGE).toMatchObject({ url: '/opengraph-image', width: 1200, height: 630 });
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      images: ['/opengraph-image'],
    });
    const spanish = attachSocialImages({
      openGraph: { title: 'Inicio', locale: 'es_US' },
    });
    expect(spanish.openGraph).toMatchObject({ images: [SOCIAL_IMAGE], locale: 'es_US' });
    const card = readFileSync('app/opengraph-image.tsx', 'utf8');
    expect(card).toContain('width: 1200, height: 630');
    expect(card).toContain('public/images/logo-full.png');
    expect(card).not.toContain('Wyoming');
    expect(card).not.toContain('Delaware');
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toContain("url: '/opengraph-image'");
    expect(layout).toContain('width: 1200, height: 630');
    expect(layout).toContain("images: ['/opengraph-image']");
  });

  it('links the verified profiles from the shared footer without rewriting the disclaimer', () => {
    expect(FOOTER_SOCIAL_LINKS.map((link) => link.href)).toEqual([
      'https://www.instagram.com/launch.forma/',
      'https://x.com/launchforma',
      'https://www.facebook.com/profile.php?id=61596210770146',
    ]);
    const footer = readFileSync('components/marketing/Footer.tsx', 'utf8');
    expect(footer).toContain('FOOTER_SOCIAL_LINKS');
    expect(footer).toContain('target="_blank"');
    expect(footer).toContain('rel="noopener noreferrer"');
    expect(footer).toContain('aria-label={tFooter(link.labelKey)}');
    expect(footer).toContain("{tDisc('notAffiliated')}");
    expect(en.footer.socialInstagram).toBe('LaunchForma on Instagram');
    expect(es.footer.socialInstagram).toBe('LaunchForma en Instagram');
    expect(es.footer.socialX).toBe('LaunchForma en X');
    expect(es.footer.socialFacebook).toBe('LaunchForma en Facebook');
    expect(en.footer.doNotSell).toBe('Do Not Sell or Share My Personal Information');
    expect(es.footer.doNotSell).toBe('No vender ni compartir mi información personal');
    expect(es.disclosure.notAffiliated.length).toBeGreaterThan(0);
  });
});
