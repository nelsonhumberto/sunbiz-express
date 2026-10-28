/** The sitewide form sits under the ad landing page. Tag that submit apart from the hero form. */
export function checklistFormSource(pathname: string): string | undefined {
  const path = (pathname.split('?')[0] ?? pathname).split('#')[0] || '/';
  if (path === '/lp/florida-llc' || path === '/es/lp/llc-florida') return 'lp-florida-llc-bottom';
  return undefined;
}
