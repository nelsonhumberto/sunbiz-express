/**
 * "Skip to main content" link required by WCAG 2.2 (2.4.1 Bypass Blocks).
 * Invisible until it receives keyboard focus, at which point it becomes a
 * high-contrast pill anchored to the top-left of the viewport. Pointing at
 * `#main-content` lets keyboard / screen-reader users jump past the
 * navbar on every page.
 *
 * Pair with a `<main id="main-content" tabIndex={-1}>` element in each
 * layout. The `tabIndex={-1}` makes the main region a valid programmatic
 * focus target without inserting it into the natural tab order.
 */
export function SkipLink({
  href = '#main-content',
  label = 'Skip to main content',
}: {
  href?: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:inline-flex focus:items-center focus:gap-1.5 focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-white focus:font-semibold focus:shadow-card focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
    >
      {label}
    </a>
  );
}
