import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'glow';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, variant = 'default', className = '', ...props },
  ref,
) {
  const variantClass = variant !== 'default' ? `card-${variant}` : '';

  return (
    <div ref={ref} className={`card ${variantClass} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
});
