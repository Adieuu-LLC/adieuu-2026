export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const sizes = {
  sm: { icon: 24, text: '1.25rem' },
  md: { icon: 48, text: '1.875rem' },
  lg: { icon: 64, text: '2.25rem' },
};

export function Logo({ size = 'md', showText = true }: LogoProps) {
  const { icon, text } = sizes[size];

  return (
    <div className="auth-logo">
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="auth-logo-icon"
        aria-hidden="true"
      >
        {/* Shield base */}
        <path
          d="M24 4L6 12V22C6 33.05 13.68 43.22 24 46C34.32 43.22 42 33.05 42 22V12L24 4Z"
          fill="url(#shield-gradient)"
          stroke="url(#shield-stroke)"
          strokeWidth="2"
        />
        {/* Lock icon inside */}
        <rect
          x="16"
          y="22"
          width="16"
          height="12"
          rx="2"
          fill="var(--color-bg-primary, #0d1117)"
        />
        <path
          d="M19 22V18C19 15.24 21.24 13 24 13C26.76 13 29 15.24 29 18V22"
          stroke="var(--color-bg-primary, #0d1117)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        {/* Keyhole */}
        <circle cx="24" cy="27" r="2" fill="url(#keyhole-gradient)" />
        <path d="M24 29V32" stroke="url(#keyhole-gradient)" strokeWidth="2" strokeLinecap="round" />
        <defs>
          <linearGradient id="shield-gradient" x1="6" y1="4" x2="42" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22d3ee" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
          <linearGradient id="shield-stroke" x1="6" y1="4" x2="42" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#06b6d4" />
            <stop offset="1" stopColor="#0ea5e9" />
          </linearGradient>
          <linearGradient id="keyhole-gradient" x1="22" y1="25" x2="26" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22d3ee" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
      </svg>
      {showText && (
        <span className="auth-logo-text" style={{ fontSize: text }}>
          Chadder
        </span>
      )}
    </div>
  );
}
