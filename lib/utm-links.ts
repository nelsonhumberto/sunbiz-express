const ORIGIN = 'https://launchforma.com';

export function isBusinessServicesPath(path: string): boolean {
  return (
    path === '/business-services' ||
    path.startsWith('/business-services/') ||
    path.includes('/business-services')
  );
}

/** Tracked ad URL. Business-services paths omit state and package. A path that already starts with /es does not also add lang=es. */
export function buildTrackedUrl(opts: {
  path: string;
  state: string;
  tier: string;
  lang: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
}): string {
  const params: string[] = [];
  const spanishPath = opts.path === '/es' || opts.path.startsWith('/es/');
  const servicesPath = isBusinessServicesPath(opts.path);
  if (opts.lang === 'es' && !spanishPath) params.push('lang=es');
  if (opts.state && !servicesPath) params.push(`state=${opts.state}`);
  const tierApplies = opts.path === '/offer' || opts.path === '/start';
  if (opts.tier && tierApplies) params.push(`tier=${opts.tier}`);
  params.push(`utm_source=${opts.source}`);
  params.push(`utm_medium=${opts.medium}`);
  if (opts.campaign) params.push(`utm_campaign=${opts.campaign.trim()}`);
  if (opts.content) params.push(`utm_content=${opts.content.trim()}`);
  if (opts.term) params.push(`utm_term=${opts.term.trim()}`);
  return `${ORIGIN}${opts.path}${params.length ? `?${params.join('&')}` : ''}`;
}
