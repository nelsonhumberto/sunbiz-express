#!/usr/bin/env tsx
// End-to-end smoke test for lib/sunbiz.ts. Reads SUNBIZDAILY_API_KEY (and
// optionally SUNBIZ_SCRAPER_PROXY) from the environment and runs a sample
// availability check.
//
// Usage:
//   npx tsx --env-file=.env scripts/sunbiz-smoke.ts "Disney" LLC
//   npx tsx --env-file=.env scripts/sunbiz-smoke.ts "MyBrand New Idea" CORP

import { checkNameAvailability, searchSunbiz, SunbizError } from '../lib/sunbiz';

async function main() {
  const [, , queryArg, typeArg] = process.argv;
  const query = queryArg ?? 'Disney';
  const type = (typeArg?.toUpperCase() === 'CORP' ? 'CORP' : 'LLC') as 'LLC' | 'CORP';

  console.log(`\nQuery: "${query}"  type=${type}\n`);

  try {
    const search = await searchSunbiz(query);
    console.log(`Source: ${search.source}`);
    console.log(`Hits:   ${search.entities.length}`);
    for (const e of search.entities.slice(0, 8)) {
      console.log(`  - [${e.status.padEnd(8)}] ${e.documentNumber.padEnd(14)} ${e.name}`);
    }
  } catch (err) {
    if (err instanceof SunbizError) {
      console.error(`\n[searchSunbiz] error code=${err.code}: ${err.message}`);
    } else {
      console.error('\n[searchSunbiz] unexpected:', err);
    }
    process.exit(1);
  }

  try {
    const result = await checkNameAvailability(query, type);
    console.log(`\nVerdict: ${result.status} (available=${result.available})`);
    console.log(`Message: ${result.message}`);
    if (result.conflicts.length) {
      console.log(`Conflicts (${result.conflicts.length}):`);
      for (const c of result.conflicts) {
        console.log(`  - [${c.status}] ${c.documentNumber} ${c.name}`);
      }
    }
    if (result.suggestions.length) {
      console.log(`Suggestions: ${result.suggestions.join(' · ')}`);
    }
  } catch (err) {
    if (err instanceof SunbizError) {
      console.error(`\n[checkNameAvailability] error code=${err.code}: ${err.message}`);
    } else {
      console.error('\n[checkNameAvailability] unexpected:', err);
    }
    process.exit(1);
  }
}

main();
