import type { InputHTMLAttributes, ReactNode } from 'react';
import { forwardRef, useId } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Visually hide the label while keeping it accessible to screen readers. */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  inputSize?: 'sm' | 'md' | 'lg';
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hideLabel,
      hint,
      error,
      inputSize = 'md',
      leftIcon,
      rightIcon,
      className = '',
      id,
      'aria-describedby': externalDescribedBy,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;
    const sizeClass = inputSize !== 'md' ? `input-${inputSize}` : '';
    const errorClass = error ? 'input-error' : '';

    const describedByParts: string[] = [];
    if (externalDescribedBy) describedByParts.push(externalDescribedBy);
    if (error) describedByParts.push(errorId);
    else if (hint) describedByParts.push(hintId);
    const describedBy = describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

    return (
      <div className="input-wrapper">
        {label && (
          <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'input-label'}>
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          {leftIcon && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`input ${sizeClass} ${errorClass} ${className}`.trim()}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            style={{
              paddingLeft: leftIcon ? '2.5rem' : undefined,
              paddingRight: rightIcon ? '2.5rem' : undefined,
            }}
            {...props}
          />
          {rightIcon && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {rightIcon}
            </span>
          )}
        </div>
        {hint && !error && (
          <span id={hintId} className="input-hint">
            {hint}
          </span>
        )}
        {error && (
          <span id={errorId} className="input-error-message" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
