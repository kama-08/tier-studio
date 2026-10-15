import type { ButtonHTMLAttributes } from 'react';
import { tv } from 'tailwind-variants';

export const buttonStyles = tv({
  base: 'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-olive',
  variants: {
    variant: {
      primary: 'bg-action text-on-action hover:bg-action-hover',
      secondary: 'border border-line bg-surface text-ink hover:bg-muted',
      ghost: 'text-secondary hover:bg-muted hover:text-ink',
      danger: 'text-danger hover:bg-danger-soft',
    },
    size: { default: 'h-10 px-4', sm: 'h-8 px-3 text-xs', icon: 'size-9 p-0' },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
});

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'default' | 'sm' | 'icon';
}) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}
