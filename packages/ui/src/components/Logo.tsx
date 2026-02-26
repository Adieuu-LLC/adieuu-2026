import { LogoSvg } from './LogoSvg';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  primaryColor?: string;
  secondaryColor?: string;
}

const sizes = {
  sm: { height: 24 },
  md: { height: 32 },
  lg: { height: 48 },
};

export function Logo({ size = 'md', primaryColor, secondaryColor }: LogoProps) {
  const { height } = sizes[size];

  return (
    <div className="app-logo">
      <LogoSvg
        height={height}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        className="app-logo-img"
      />
    </div>
  );
}
