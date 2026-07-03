import type { HTMLAttributes, ReactNode } from 'react';

export interface UpgradePromptProps extends HTMLAttributes<HTMLDivElement> {
  /** Primary message shown to the user (e.g. "Upgrade to view messages older than 14 days"). */
  message: string;
  /** Optional secondary description for additional context. */
  description?: string;
  /** Override the default CTA button text. */
  ctaLabel?: string;
  /** Callback fired when the user clicks the upgrade button. */
  onUpgrade?: () => void;
  /** Optional icon to display alongside the message. */
  icon?: ReactNode;
  /** Visual variant. */
  variant?: 'inline' | 'banner';
}

/**
 * Reusable upgrade prompt displayed when a free-tier user encounters a
 * feature that requires a paid subscription.
 */
export function UpgradePrompt({
  message,
  description,
  ctaLabel = 'Upgrade',
  onUpgrade,
  icon,
  variant = 'inline',
  className = '',
  ...props
}: UpgradePromptProps) {
  return (
    <div
      className={`upgrade-prompt upgrade-prompt--${variant} ${className}`.trim()}
      role="status"
      {...props}
    >
      <div className="upgrade-prompt__content">
        {icon && <span className="upgrade-prompt__icon">{icon}</span>}
        <div className="upgrade-prompt__text">
          <p className="upgrade-prompt__message">{message}</p>
          {description && (
            <p className="upgrade-prompt__description">{description}</p>
          )}
        </div>
      </div>
      {onUpgrade && (
        <button
          type="button"
          className="upgrade-prompt__cta"
          onClick={onUpgrade}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
