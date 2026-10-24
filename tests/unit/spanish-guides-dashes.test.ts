import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

describe('Spanish guide copy', () => {
  it('does not use an em dash in /es/guides content', () => {
    const messages = es as Record<string, unknown>;
    const namespaces = Object.keys(messages).filter(
      (key) => key === 'guidesPage' || key.startsWith('guide'),
    );
    expect(namespaces).toEqual(expect.arrayContaining(['guideLlcSinSsn', 'guideMiamiBtr']));
    for (const name of namespaces) {
      expect(JSON.stringify(messages[name]), name).not.toContain('—');
    }

    const guideDir = path.join(process.cwd(), 'app/(marketing)/guides');
    for (const file of walk(guideDir)) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('—');
    }
  });

  it('publishes the five new guides without a [VERIFICAR] marker', () => {
    const messages = es as Record<string, { body?: string }>;
    for (const name of [
      'guideLlcSinSsn',
      'guideMiamiBtr',
      'guideBrowardBtr',
      'guideLlcVsSole',
      'guideLlcApp',
    ]) {
      expect(messages[name]?.body, name).toBeTruthy();
      expect(messages[name].body).not.toContain('[VERIFICAR');
      expect(messages[name].body).toContain('/es/start');
      expect(messages[name].body).toContain('/es/pricing');
    }
  });

  it('keeps the QA wording on the live Florida guides', () => {
    const messages = es as Record<string, { body?: string; disclaimer?: string; badge?: string }>;
    expect(messages.guideFlAnnual.body).toContain('tarifas de reactivación (reinstatement)');
    expect(messages.guideFlAnnual.body).not.toContain('reinstalación');
    expect(messages.guideOa.disclaimer).toContain('esta guía no es asesoría legal ni fiscal.');
    expect(messages.guideFlForm.body).toContain(
      'Articles of Organization (acta de constitución de la LLC)',
    );
    expect(messages.guideOa.body).toContain('corporación tipo C (C-Corp)');
    expect(messages.boiPage.badge).toContain('11 de agosto de 2026');
    expect(readFileSync('components/marketing/GuideLayout.tsx', 'utf8')).not.toContain('max-w-none');
    expect(readFileSync('tailwind.config.ts', 'utf8')).toContain('@tailwindcss/typography');
    expect(readFileSync('components/marketing/Footer.tsx', 'utf8')).toContain(
      '/services#registered-agent',
    );
    expect(readFileSync('components/marketing/Footer.tsx', 'utf8')).not.toContain('<h4');
  });
});
