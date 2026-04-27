import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  href?: string;
  asLink?: boolean;
}

export function Logo({ className, size = 'default', href = '/', asLink = true }: LogoProps) {
  const Wrapper: React.ElementType = asLink ? Link : 'div';
  const wrapperProps = asLink ? { href } : {};

  return (
    <Wrapper {...wrapperProps} className={cn('inline-flex items-center gap-2.5 group', className)}>
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center rounded-lg overflow-hidden shadow-sm',
          size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary-hover to-primary-700" />
        <svg
          viewBox="0 0 32 32"
          className="relative h-full w-full text-white"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="16" cy="11" r="6" fill="currentColor" opacity="0.95" />
          <path
            d="M4 26 Q 10 18 16 22 T 28 26 V 30 H 4 Z"
            fill="currentColor"
            opacity="0.85"
          />
        </svg>
      </div>
      <span
        className={cn(
          'font-display font-semibold tracking-tight text-ink',
          size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg'
        )}
      >
        Inc<span className="text-primary">·</span>Services
      </span>
    </Wrapper>
  );
}
