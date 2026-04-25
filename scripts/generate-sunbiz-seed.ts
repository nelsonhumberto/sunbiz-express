// Generates a realistic Florida entity seed dataset for the mock Sunbiz service.
// Run: npx tsx scripts/generate-sunbiz-seed.ts
import { writeFileSync } from 'fs';
import { resolve } from 'path';

interface Entity {
  name: string;
  documentNumber: string;
  status: 'Active' | 'INACT' | 'NAME HS' | 'CROSS RF' | 'Withdrawn';
  filingDate: string;
  type: 'LLC' | 'CORP';
}

const PREFIXES = [
  'Sunshine', 'Florida', 'Atlantic', 'Coastal', 'Tropical', 'Palm', 'Ocean',
  'Bay', 'Gulf', 'Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Sarasota',
  'Key West', 'Naples', 'Boca', 'Pensacola', 'Sun Coast', 'Sand Dollar',
  'Mangrove', 'Coral', 'Heron', 'Manatee', 'Pelican', 'Magnolia', 'Cypress',
  'Hibiscus', 'Citrus', 'Orange Blossom', 'Sawgrass', 'Everglade',
  'Apex', 'Pioneer', 'Vanguard', 'Catalyst', 'Beacon', 'Phoenix', 'Lighthouse',
  'Summit', 'Pinnacle', 'Bedrock', 'Cornerstone', 'Crossroads', 'Highland',
  'Liberty', 'Patriot', 'Heritage', 'Legacy', 'Pioneer', 'Frontier',
  'Quantum', 'Stellar', 'Nimbus', 'Velocity', 'Momentum', 'Trajectory',
];

const MIDDLE = [
  'Holdings', 'Group', 'Partners', 'Capital', 'Ventures', 'Investments',
  'Properties', 'Realty', 'Development', 'Construction', 'Builders',
  'Consulting', 'Solutions', 'Technologies', 'Services', 'Enterprises',
  'Industries', 'Manufacturing', 'Logistics', 'Distribution', 'Trading',
  'Wellness', 'Health', 'Medical', 'Dental', 'Pharmacy', 'Therapy',
  'Hospitality', 'Restaurant', 'Catering', 'Bakery', 'Coffee', 'Cafe',
  'Apparel', 'Fashion', 'Boutique', 'Studio', 'Salon', 'Spa',
  'Marketing', 'Media', 'Productions', 'Studios', 'Records', 'Publishing',
  'Software', 'Digital', 'Cloud', 'Analytics', 'Data', 'AI',
  'Logistics', 'Transport', 'Shipping', 'Marine', 'Aviation',
  'Education', 'Tutoring', 'Academy', 'Institute', 'Training',
  'Landscape', 'Pool', 'Roofing', 'Plumbing', 'Electric',
  'Pet', 'Animal', 'Veterinary', 'Boarding', 'Grooming',
  'Auto', 'Motors', 'Bicycle', 'Surf', 'Marine',
];

// Famous entities to seed for the demo (per disney_sample.html)
const FAMOUS: Entity[] = [
  { name: 'DISNEY', documentNumber: '924613', status: 'Active', filingDate: '1981-04-23', type: 'CORP' },
  { name: 'DISNEY 4 VILLAS LLC', documentNumber: 'L08000001508', status: 'INACT', filingDate: '2008-01-04', type: 'LLC' },
  { name: 'DISNEY ENTERPRISES, INC.', documentNumber: 'F96000001234', status: 'Active', filingDate: '1996-08-15', type: 'CORP' },
  { name: 'DISNEY VACATION CLUB MANAGEMENT, LLC', documentNumber: 'L01000045678', status: 'Active', filingDate: '2001-03-12', type: 'LLC' },
  { name: 'WALT DISNEY PARKS AND RESORTS U.S., INC.', documentNumber: 'F02000098765', status: 'Active', filingDate: '2002-06-30', type: 'CORP' },
  { name: 'APPLE INC.', documentNumber: 'F84000234567', status: 'Active', filingDate: '1984-09-07', type: 'CORP' },
  { name: 'APPLE BLOSSOM LLC', documentNumber: 'L19000345678', status: 'Active', filingDate: '2019-05-22', type: 'LLC' },
  { name: 'APPLE TREE PROPERTIES LLC', documentNumber: 'L21000456789', status: 'Active', filingDate: '2021-11-08', type: 'LLC' },
  { name: 'GOOGLE LLC', documentNumber: 'F18000567890', status: 'Active', filingDate: '2018-04-12', type: 'LLC' },
  { name: 'AMAZON.COM SERVICES LLC', documentNumber: 'F20000678901', status: 'Active', filingDate: '2020-08-19', type: 'LLC' },
  { name: 'TESLA, INC.', documentNumber: 'F19000789012', status: 'Active', filingDate: '2019-03-04', type: 'CORP' },
  { name: 'NIKE RETAIL SERVICES INC', documentNumber: 'F95000890123', status: 'Active', filingDate: '1995-10-15', type: 'CORP' },
  { name: 'PUBLIX SUPER MARKETS, INC.', documentNumber: 'F30000123456', status: 'Active', filingDate: '1930-09-06', type: 'CORP' },
];

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function genLLC(idx: number, year: number): string {
  return `L${year}${pad(idx, 8)}`;
}

function genCorp(idx: number): string {
  return pad(900_000 + idx, 7);
}

const pickRand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function randomDate(): string {
  const start = new Date(2018, 0, 1).getTime();
  const end = Date.now();
  const t = start + Math.random() * (end - start);
  const d = new Date(t);
  return d.toISOString().slice(0, 10);
}

function pickStatus(): Entity['status'] {
  const r = Math.random();
  if (r < 0.85) return 'Active';
  if (r < 0.92) return 'INACT';
  if (r < 0.96) return 'NAME HS';
  if (r < 0.99) return 'CROSS RF';
  return 'Withdrawn';
}

const entities: Entity[] = [...FAMOUS];

let llcIdx = 1000;
let corpIdx = 1;

for (let i = 0; i < 380; i++) {
  const isLLC = Math.random() > 0.4;
  const prefix = pickRand(PREFIXES);
  const middle = pickRand(MIDDLE);
  const useMiddle = Math.random() > 0.3;
  const baseName = useMiddle ? `${prefix} ${middle}` : prefix;
  const status = pickStatus();
  const date = randomDate();
  const year = parseInt(date.slice(0, 4));

  if (isLLC) {
    const suffix = Math.random() > 0.5 ? 'LLC' : 'L.L.C.';
    entities.push({
      name: `${baseName.toUpperCase()} ${suffix}`,
      documentNumber: genLLC(llcIdx++, year),
      status,
      filingDate: date,
      type: 'LLC',
    });
  } else {
    const suffix = pickRand(['INC', 'INC.', 'CORP', 'CORPORATION', 'CO']);
    entities.push({
      name: `${baseName.toUpperCase()} ${suffix}`,
      documentNumber: genCorp(corpIdx++),
      status,
      filingDate: date,
      type: 'CORP',
    });
  }
}

// Sort by filing date descending
entities.sort((a, b) => b.filingDate.localeCompare(a.filingDate));

const out = resolve(process.cwd(), 'data', 'sunbiz-seed.json');
writeFileSync(out, JSON.stringify(entities, null, 2));
console.log(`Wrote ${entities.length} entities to ${out}`);
