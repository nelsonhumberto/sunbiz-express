import { describe, it, expect } from 'vitest';
import { encryptString, decryptString, maskTaxId, maskPassport } from '@/lib/encryption';

describe('encryption', () => {
  it('round-trips a value', () => {
    const secret = '123-45-6789';
    const blob = encryptString(secret);
    expect(blob).not.toContain(secret);
    expect(blob.startsWith('v1:')).toBe(true);
    expect(decryptString(blob)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptString('hello');
    const b = encryptString('hello');
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe('hello');
    expect(decryptString(b)).toBe('hello');
  });

  it('rejects tampered ciphertext (auth tag)', () => {
    const blob = encryptString('sensitive');
    const parts = blob.split(':');
    // Flip a character in the ciphertext segment.
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'A' ? 'B' : 'A');
    expect(() => decryptString(parts.join(':'))).toThrow();
  });

  it('rejects an unsupported format', () => {
    expect(() => decryptString('not-a-real-blob')).toThrow();
  });

  it('masks tax ids and passports to last 4', () => {
    expect(maskTaxId('123456789')).toBe('●●●-●●-6789');
    expect(maskPassport('A12345678')).toContain('5678');
  });
});
