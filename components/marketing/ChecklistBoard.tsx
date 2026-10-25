'use client';

import type { ChecklistSection } from '@/lib/drip-copy';

export function ChecklistBoard({ sections }: { sections: readonly ChecklistSection[] }) {
  return (
    <div className="mt-8 space-y-8 md:mt-10">
      {sections.map((section, index) => (
        <section key={section.title} aria-labelledby={`checklist-section-${index + 1}`}>
          <h2
            id={`checklist-section-${index + 1}`}
            className="font-display text-xl font-medium leading-tight md:text-2xl"
          >
            {index + 1}. {section.title}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {section.items.map((item) => (
              <li key={item}>
                <label className="flex min-w-0 items-start gap-3 text-sm leading-relaxed text-ink md:text-base">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                  <span className="min-w-0 break-words">{item}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
