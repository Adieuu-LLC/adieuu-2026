export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClass = size !== 'md' ? `spinner-${size}` : '';

  return (
    <span
      className={`spinner ${sizeClass} ${className}`.trim()}
      role="status"
      aria-label="Loading"
    />
  );
}
