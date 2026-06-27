export interface ProgressBarProps {
  percent: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ percent, label, className = '' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className={`progress-bar ${className}`.trim()}>
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {label && <span className="progress-bar-label">{label}</span>}
    </div>
  );
}
