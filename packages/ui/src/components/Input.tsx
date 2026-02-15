import type { InputHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
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
      hint,
      error,
      inputSize = 'md',
      leftIcon,
      rightIcon,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id ?? `input-${Math.random().toString(36).slice(2, 9)}`;
    const sizeClass = inputSize !== 'md' ? `input-${inputSize}` : '';
    const errorClass = error ? 'input-error' : '';

    return (
      <div className="input-wrapper">
        {label && (
          <label htmlFor={inputId} className="input-label">
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          {leftIcon && (
            <span
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
            style={{
              paddingLeft: leftIcon ? '2.5rem' : undefined,
              paddingRight: rightIcon ? '2.5rem' : undefined,
            }}
            {...props}
          />
          {rightIcon && (
            <span
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
        {hint && !error && <span className="input-hint">{hint}</span>}
        {error && <span className="input-error-message">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
