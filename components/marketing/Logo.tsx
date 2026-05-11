import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  href?: string;
  asLink?: boolean;
  /** dark — white wordmark for dark/navy backgrounds */
  variant?: 'light' | 'dark';
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
      <Image
        src={isDark ? '/images/logo-icon-dark.png' : '/images/logo-icon.png'}
        alt="LaunchForma"
        width={iconSize}
        height={iconSize}
        className="shrink-0 object-contain"
        priority
      />
      <span
        className={cn(
          'font-bold leading-none tracking-tight select-none',
          textClass
        )}
      >
        <span className={isDark ? 'text-white' : 'text-primary'}>Launch</span>
        <span className="text-accent">Forma</span>
      </span>
    </Wrapper>
  );
}
