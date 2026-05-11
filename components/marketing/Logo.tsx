import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  href?: string;
  asLink?: boolean;
  /** Use the monochrome (navy) variant — for dark backgrounds */
  mono?: boolean;
}

export function Logo({
  className,
  size = 'default',
  href = '/',
  asLink = true,
  mono = false,
}: LogoProps) {
  const Wrapper: React.ElementType = asLink ? Link : 'div';
  const wrapperProps = asLink ? { href } : {};

  const iconSize = size === 'sm' ? 28 : size === 'lg' ? 44 : 36;
  const textClass =
    size === 'sm'
      ? 'text-base'
      : size === 'lg'
        ? 'text-2xl'
        : 'text-xl';

  return (
    <Wrapper
      {...wrapperProps}
      className={cn('inline-flex items-center gap-2 group shrink-0', className)}
    >
      <Image
        src={mono ? '/images/logo-mono.png' : '/images/logo-icon.png'}
        alt="LaunchForma icon"
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
        <span className="text-primary">Launch</span>
        <span className="text-accent">Forma</span>
      </span>
    </Wrapper>
  );
}
