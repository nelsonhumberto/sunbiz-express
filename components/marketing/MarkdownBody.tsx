import ReactMarkdown from 'react-markdown';
import { localizedHref } from '@/lib/locale-paths';

/** Renders translated long-form copy. Parent pages supply the prose styles. */
export function MarkdownBody({
  markdown,
  locale = 'en',
}: {
  markdown: string;
  locale?: string;
}) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => {
          const next = href ? localizedHref(href, locale) : href;
          const external = Boolean(next?.startsWith('http'));
          return (
            <a href={next} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {children}
            </a>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
