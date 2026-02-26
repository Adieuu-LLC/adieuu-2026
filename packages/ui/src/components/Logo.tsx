export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const sizes = {
  sm: { text: '1.25rem' },
  md: { text: '1.875rem' },
  lg: { text: '2.25rem' },
};

export function Logo({ size = 'md', showText = true }: LogoProps) {
  const { text } = sizes[size];

  if (!showText) {
    return null;
  }

  return (
    <div className="auth-logo">
      <span className="auth-logo-text" style={{ fontSize: text }}>
        adieuu
      </span>
    </div>
  );
}
