import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'glow';
}

export function Card({
  children,
  variant = 'default',
  className = '',
  ...props
}: CardProps) {
  const variantClass = variant !== 'default' ? `card-${variant}` : '';

  return (
    <div className={`card ${variantClass} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
