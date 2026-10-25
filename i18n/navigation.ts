import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware Link, redirect, and router. `localePrefix: 'as-needed'`
 * keeps English unprefixed and puts Spanish under `/es`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
