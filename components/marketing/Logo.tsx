'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  href?: string;
  asLink?: boolean;
  /** dark — white wordmark for dark/navy backgrounds */
  variant?: 'light' | 'dark';
}

/** Inline SVG recreation of the LaunchForma brand mark.
 *  No PNG = no white-box artifact on any background. */
function BrandMark({ size, variant }: { size: number; variant: 'light' | 'dark' }) {
  const isDark = variant === 'dark';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Gradient definitions */}
      <defs>
        <linearGradient id={`lf-grad-${variant}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4CAF50" />
          <stop offset="100%" stopColor="#1565FF" />
        </linearGradient>
      </defs>

      {/* Outer swoosh / orbit ring (blue) */}
      <ellipse
        cx="48" cy="68" rx="38" ry="11"
        stroke={isDark ? '#60A5FA' : '#1565FF'}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Bar 1 (tallest, left) */}
      <rect x="22" y="28" width="13" height="36" rx="3"
        fill={`url(#lf-grad-${variant})`} />

      {/* Bar 2 (medium, center) */}
      <rect x="39" y="38" width="13" height="26" rx="3"
        fill={`url(#lf-grad-${variant})`} />

      {/* Upward arrow / swoosh (green, right) */}
      <path
        d="M60 72 Q72 60 68 30 L74 38 M68 30 L76 36"
        stroke="#4CAF50"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Green underswoop */}
      <path
        d="M18 76 Q40 88 78 74"
        stroke="#4CAF50"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
    </svg>
  );
}

export function Logo({
  className,
  size = 'default',
  href = '/',
  asLink = true,
  variant = 'light',
}: LogoProps) {
  const Wrapper: React.ElementType = asLink ? Link : 'div';
  const wrapperProps = asLink ? { href } : {};

  const iconSize = size === 'sm' ? 28 : size === 'lg' ? 44 : 36;
  const textClass =
    size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';

  const isDark = variant === 'dark';

  return (
    <Wrapper
      {...wrapperProps}
      className={cn('inline-flex items-center gap-2 group shrink-0', className)}
    >
      <BrandMark size={iconSize} variant={variant} />
      <span className={cn('font-bold leading-none tracking-tight select-none', textClass)}>
        <span className={isDark ? 'text-white' : 'text-primary'}>Launch</span>
        <span className="text-accent">Forma</span>
      </span>
    </Wrapper>
  );
}
