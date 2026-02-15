import { useRef, useState, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react';

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  autoFocus = true,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Split value into array of characters
  const valueArray = value.split('').slice(0, length);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const focusInput = useCallback((index: number) => {
    if (index >= 0 && index < length && inputRefs.current[index]) {
      inputRefs.current[index]?.focus();
    }
  }, [length]);

  const handleChange = useCallback(
    (index: number, digit: string) => {
      if (!/^\d?$/.test(digit)) return;

      const newValueArray = [...valueArray];
      // Pad with empty strings if necessary
      while (newValueArray.length < length) {
        newValueArray.push('');
      }
      newValueArray[index] = digit;

      const newValue = newValueArray.join('');
      onChange(newValue);

      // Move to next input if digit entered
      if (digit && index < length - 1) {
        focusInput(index + 1);
      }

      // Check if complete
      if (digit && newValue.length === length && !newValue.includes('')) {
        onComplete?.(newValue);
      }
    },
    [valueArray, length, onChange, onComplete, focusInput]
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (valueArray[index]) {
          // Clear current input
          handleChange(index, '');
        } else if (index > 0) {
          // Move to previous input and clear it
          focusInput(index - 1);
          handleChange(index - 1, '');
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        focusInput(index - 1);
      } else if (e.key === 'ArrowRight' && index < length - 1) {
        e.preventDefault();
        focusInput(index + 1);
      }
    },
    [valueArray, length, handleChange, focusInput]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      
      if (pastedData) {
        onChange(pastedData);
        const nextIndex = Math.min(pastedData.length, length - 1);
        focusInput(nextIndex);

        if (pastedData.length === length) {
          onComplete?.(pastedData);
        }
      }
    },
    [length, onChange, onComplete, focusInput]
  );

  return (
    <div className="otp-input-container">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={valueArray[index] ?? ''}
          onChange={(e) => handleChange(index, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => setFocusedIndex(index)}
          onBlur={() => setFocusedIndex(-1)}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          className={`otp-input ${valueArray[index] ? 'filled' : ''} ${error ? 'input-error' : ''}`}
          style={{
            borderColor: error ? 'var(--color-error)' : undefined,
          }}
        />
      ))}
    </div>
  );
}
