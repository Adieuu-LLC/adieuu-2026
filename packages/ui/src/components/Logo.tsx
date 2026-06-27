import { LogoSvg } from './LogoSvg';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  primaryColor?: string;
  secondaryColor?: string;
  /** 'full' shows the complete wordmark; 'icon' shows only the chat-bubble mark */
  variant?: 'full' | 'icon';
}

const sizes = {
  sm: { height: 24 },
  md: { height: 32 },
  lg: { height: 48 },
};

export function Logo({ size = 'md', primaryColor, secondaryColor, variant = 'full' }: LogoProps) {
  const { height } = sizes[size];

  return (
    <div className="app-logo">
      <LogoSvg
        height={height}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        className="app-logo-img"
        variant={variant}
      />
    </div>
  );
}
