/**
 * Redirect table for next.config.js (CommonJS). Keep in lockstep with
 * `retiredStateDestination` in retired-state-redirects.ts. The unit test
 * compares this list to the TypeScript export.
 */
const FLORIDA_STATE = '/states/florida';
const FLORIDA_LLC_GUIDE = '/guides/how-to-form-an-llc-in-florida';

const RETIRED_STATE_REDIRECTS = [
  { source: '/delaware', destination: FLORIDA_STATE, statusCode: 308 },
  { source: '/delaware/:path*', destination: FLORIDA_STATE, statusCode: 308 },
  { source: '/wyoming', destination: FLORIDA_STATE, statusCode: 308 },
  { source: '/wyoming/:path*', destination: FLORIDA_STATE, statusCode: 308 },
  { source: '/states/delaware', destination: FLORIDA_STATE, statusCode: 308 },
  { source: '/states/delaware/:path*', destination: FLORIDA_STATE, statusCode: 308 },
  { source: '/states/wyoming', destination: FLORIDA_STATE, statusCode: 308 },
  { source: '/states/wyoming/:path*', destination: FLORIDA_STATE, statusCode: 308 },
  { source: '/es/delaware', destination: `/es${FLORIDA_STATE}`, statusCode: 308 },
  { source: '/es/delaware/:path*', destination: `/es${FLORIDA_STATE}`, statusCode: 308 },
  { source: '/es/wyoming', destination: `/es${FLORIDA_STATE}`, statusCode: 308 },
  { source: '/es/wyoming/:path*', destination: `/es${FLORIDA_STATE}`, statusCode: 308 },
  { source: '/es/states/delaware', destination: `/es${FLORIDA_STATE}`, statusCode: 308 },
  { source: '/es/states/delaware/:path*', destination: `/es${FLORIDA_STATE}`, statusCode: 308 },
  { source: '/es/states/wyoming', destination: `/es${FLORIDA_STATE}`, statusCode: 308 },
  { source: '/es/states/wyoming/:path*', destination: `/es${FLORIDA_STATE}`, statusCode: 308 },
  {
    source: '/guides/:slug([^/]*delaware[^/]*)',
    destination: FLORIDA_LLC_GUIDE,
    statusCode: 308,
  },
  {
    source: '/guides/:slug([^/]*wyoming[^/]*)',
    destination: FLORIDA_LLC_GUIDE,
    statusCode: 308,
  },
  {
    source: '/es/guides/:slug([^/]*delaware[^/]*)',
    destination: `/es${FLORIDA_LLC_GUIDE}`,
    statusCode: 308,
  },
  {
    source: '/es/guides/:slug([^/]*wyoming[^/]*)',
    destination: `/es${FLORIDA_LLC_GUIDE}`,
    statusCode: 308,
  },
];

module.exports = { RETIRED_STATE_REDIRECTS };
