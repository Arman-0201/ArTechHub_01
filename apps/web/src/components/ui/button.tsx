import { forwardRef, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-text-on-primary shadow-subtle hover:bg-primary-hover active:bg-primary-active',
  secondary:
    'bg-surface-sunken text-text-primary border border-border hover:border-border-strong hover:bg-surface',
  outline:
    'border border-border-strong bg-transparent text-text-primary hover:border-primary hover:text-primary',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
  danger: 'bg-danger text-white hover:opacity-90',
  link: 'bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2.5',
  icon: 'h-10 w-10 p-0',
};

const BASE_CLASSES = [
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold',
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
  // `disabled:` covers the real attribute; `aria-disabled` covers links, which
  // cannot be disabled but must still read and look inert.
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
  'active:translate-y-px',
].join(' ');

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Renders an anchor styled as a button. */
  href?: string;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', isLoading, href, fullWidth, children, disabled, ...props },
  ref,
) {
  const classes = cn(
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    variant === 'link' ? '' : SIZE_CLASSES[size],
    fullWidth && 'w-full',
    className,
  );

  if (href) {
    const isExternal = /^https?:\/\//i.test(href);
    if (isExternal) {
      return (
        <a
          href={href}
          className={classes}
          target="_blank"
          // `noopener` denies the opened page access to `window.opener`.
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} aria-disabled={disabled || undefined}>
        {children}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || isLoading}
      // Screen readers are told the control is busy, not just that it looks different.
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
