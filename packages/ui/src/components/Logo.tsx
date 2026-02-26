export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { height: 24 },
  md: { height: 32 },
  lg: { height: 48 },
};

export function Logo({ size = 'md' }: LogoProps) {
  const { height } = sizes[size];

  return (
    <div className="app-logo">
      <img
        src="/img/logo/chat.svg"
        alt="adieuu"
        height={height}
        className="app-logo-img"
      />
    </div>
  );
}
