import Link from 'next/link';

/**
 * Short block on an English page that has a real Spanish counterpart.
 * The heading stays in Spanish ("En español" or "Guías en español").
 */
export function EnEspanolLinks({
  heading,
  links,
}: {
  heading: string;
  links: readonly { href: string; label: string }[];
}) {
  if (links.length === 0) return null;
  return (
    <aside
      aria-label={heading}
      className="not-prose my-6 rounded-xl border border-border bg-surface px-4 py-3"
    >
      <p className="text-sm font-semibold text-ink">{heading}</p>
      <ul className="mt-2 space-y-1.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              hrefLang="es"
              className="text-sm font-medium text-primary hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
