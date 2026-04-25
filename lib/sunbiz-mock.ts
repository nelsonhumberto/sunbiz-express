// Mock Sunbiz name availability service.
// Loads a seed list of ~400 fake FL entities and runs distinguishability checks.
// Mirrors the rules described in sunbiz_technical_analysis.md.

import { stripSuffix, normalizeBusinessName } from './florida';
import seedData from '@/data/sunbiz-seed.json';

export interface SunbizEntity {
  name: string;
  documentNumber: string;
  status: 'Active' | 'INACT' | 'NAME HS' | 'CROSS RF' | 'Withdrawn';
  filingDate: string;
  type: 'LLC' | 'CORP';
}

const ENTITIES: SunbizEntity[] = seedData as SunbizEntity[];

export interface NameCheckResult {
  query: string;
  available: boolean;
  status: 'available' | 'exact_conflict' | 'similar_conflict' | 'restricted';
  message: string;
  conflicts: SunbizEntity[];
  suggestions: string[];
}

/**
 * Check name availability against the local Sunbiz mirror.
 * Returns exact matches (taken), fuzzy matches (likely-taken-by-state), and suggestions.
 */
export async function checkNameAvailability(
  query: string,
  entityType: 'LLC' | 'CORP'
): Promise<NameCheckResult> {
  // Simulate network latency for realism (600-900ms)
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 300));

  const normalized = stripSuffix(query);
  if (!normalized || normalized.length < 2) {
    return {
      query,
      available: false,
      status: 'available',
      message: 'Enter at least 2 characters to check availability.',
      conflicts: [],
      suggestions: [],
    };
  }

  const exact: SunbizEntity[] = [];
  const similar: SunbizEntity[] = [];

  for (const entity of ENTITIES) {
    const eNorm = stripSuffix(entity.name);
    if (eNorm === normalized) {
      // Exact-stripped match — definitive conflict regardless of suffix
      if (entity.status === 'Active' || entity.status === 'INACT' || entity.status === 'NAME HS') {
        exact.push(entity);
      }
    } else if (eNorm.includes(normalized) || normalized.includes(eNorm)) {
      // Substring match — likely "not distinguishable on the record"
      if (entity.status === 'Active') {
        similar.push(entity);
      }
    } else {
      // Token-set fuzzy: at least 80% token overlap
      const queryTokens = new Set(normalized.split(/\s+/));
      const entityTokens = new Set(eNorm.split(/\s+/));
      let overlap = 0;
      for (const t of queryTokens) if (entityTokens.has(t)) overlap++;
      const ratio =
        overlap / Math.max(queryTokens.size, entityTokens.size, 1);
      if (ratio >= 0.85 && entity.status === 'Active' && queryTokens.size > 1) {
        similar.push(entity);
      }
    }
  }

  if (exact.length > 0) {
    return {
      query,
      available: false,
      status: 'exact_conflict',
      message: `An entity with this name already exists in Florida. Try a variation or distinct name.`,
      conflicts: exact.slice(0, 5),
      suggestions: generateSuggestions(query, entityType),
    };
  }

  if (similar.length > 0) {
    return {
      query,
      available: false,
      status: 'similar_conflict',
      message: `Florida requires names "distinguishable on the record." We found similar active entities — try a more distinct name.`,
      conflicts: similar.slice(0, 5),
      suggestions: generateSuggestions(query, entityType),
    };
  }

  return {
    query,
    available: true,
    status: 'available',
    message: 'This name appears to be available! We will perform a final state check at filing.',
    conflicts: [],
    suggestions: [],
  };
}

function generateSuggestions(query: string, entityType: 'LLC' | 'CORP'): string[] {
  const stripped = stripSuffix(query);
  const base = stripped
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const suffix = entityType === 'LLC' ? 'LLC' : 'Inc';
  const modifiers = [
    `${base} Group ${suffix}`,
    `${base} Holdings ${suffix}`,
    `${base} & Co ${suffix}`,
    `The ${base} ${suffix}`,
    `${base} Florida ${suffix}`,
    `${base} Ventures ${suffix}`,
  ];
  return modifiers.slice(0, 4);
}

export function getRecentFlorida(limit = 10): SunbizEntity[] {
  return [...ENTITIES]
    .filter((e) => e.status === 'Active')
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
    .slice(0, limit);
}
