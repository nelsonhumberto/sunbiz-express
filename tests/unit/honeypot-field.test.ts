import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('honeypot field', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'components/marketing/HoneypotField.tsx'),
    'utf8',
  );

  it('hides the Company trap from sight and from screen readers', () => {
    expect(source).toContain('Company');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('tabIndex={-1}');
    expect(source).toContain('autoComplete="off"');
    expect(source).toContain("name = 'hp_field'");
    expect(source).toContain('name={name}');
    expect(source).toContain("left: '-10000px'");
    expect(source).not.toMatch(/name=["'](website|company|email)["']/);
  });

  it('is the field on the waitlist and the service inquiry form', () => {
    const waitlist = readFileSync(
      path.join(process.cwd(), 'components/marketing/StateWaitlistForm.tsx'),
      'utf8',
    );
    expect(waitlist).toContain('<HoneypotField />');
    expect(waitlist).toContain("get('hp_field')");
    expect(waitlist).not.toMatch(/name=["']website["']/);

    const inquiry = readFileSync(
      path.join(process.cwd(), 'components/marketing/ServiceInquiryForm.tsx'),
      'utf8',
    );
    expect(inquiry).toContain('<HoneypotField name="lf_hp" />');
    expect(inquiry).toContain("get('lf_hp')");
    expect(inquiry).not.toMatch(/name=["'](website|email|message)["']/);
  });
});
