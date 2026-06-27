/**
 * Shimmering text effect — a gradient highlight sweeps across the text.
 *
 * Inspired by react-bits (MIT + Commons Clause)
 * @see https://reactbits.dev/text-animations/shiny-text
 *
 * Pure CSS implementation — no motion library required.
 */

export interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  /** Animation duration in seconds */
  speed?: number;
  className?: string;
  /** Base text colour */
  color?: string;
  /** Highlight / shine colour */
  shineColor?: string;
  /** Gradient angle in degrees */
  spread?: number;
}

export function ShinyText({
  text,
  disabled = false,
  speed = 3,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
}: ShinyTextProps) {
  return (
    <span
      className={`shiny-text${disabled ? ' shiny-text--disabled' : ''} ${className}`}
      style={{
        '--shiny-speed': `${speed}s`,
        '--shiny-spread': `${spread}deg`,
        '--shiny-color': color,
        '--shiny-shine': shineColor,
      } as React.CSSProperties}
    >
      {text}
    </span>
  );
}
