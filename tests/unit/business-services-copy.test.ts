import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const FORBIDDEN = [
  /\bein\b/i,
  /certificate of status/i,
  /certified copy/i,
  /annual report/i,
  /sunbiz/i,
  /secretary of state/i,
  /department of state/i,
  /\birs\b/i,
  /articles of organization/i,
  /articles of incorporation/i,
  /\bfiling\b/i,
  /\bfile\b/i,
  /reporte anual/i,
  /informe anual/i,
  /copia certificada/i,
  /certificado de estado/i,
  /secretario de estado/i,
  /departamento de estado/i,
  /presentaci[oó]n/i,
  /sunbiz/i,
];

describe('business services landing copy', () => {
  it('stays outside government-document services in English and Spanish', () => {
    const blobs = [
      JSON.stringify(en.businessServices),
      JSON.stringify(es.businessServices),
      en.disclosure.notAffiliatedServices,
      es.disclosure.notAffiliatedServices,
    ];
    for (const blob of blobs) {
      for (const pattern of FORBIDDEN) {
        expect(blob, `${pattern} matched ${blob.slice(0, 80)}`).not.toMatch(pattern);
      }
    }
  });
});
