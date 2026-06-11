import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent,
  type ChangeEvent,
} from 'react';

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

/** Strip non-digits and cap to OTP length (used by paste/autofill paths). */
export function normalizeOtpDigits(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, length);
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

  const applyDigits = useCallback(
    (raw: string) => {
      const digits = normalizeOtpDigits(raw, length);
      if (!digits) return;

      onChange(digits);
      focusInput(Math.min(digits.length, length - 1));

      if (digits.length === length) {
        onComplete?.(digits);
      }
    },
    [length, onChange, onComplete, focusInput]
  );

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

      // Check if complete - when all slots are filled, newValue.length will equal length
      if (digit && newValue.length === length) {
        onComplete?.(newValue);
      }
    },
    [valueArray, length, onChange, onComplete, focusInput]
  );

  const handleInputChange = useCallback(
    (index: number, e: ChangeEvent<HTMLInputElement>) => {
      const digits = normalizeOtpDigits(e.target.value, length);
      if (digits.length > 1) {
        applyDigits(e.target.value);
        return;
      }
      handleChange(index, digits.slice(-1));
    },
    [length, applyDigits, handleChange]
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
      applyDigits(e.clipboardData.getData('text'));
    },
    [applyDigits]
  );

  const handleBeforeInput = useCallback(
    (e: FormEvent<HTMLInputElement>) => {
      const nativeEvent = e.nativeEvent as InputEvent;
      if (
        nativeEvent.inputType !== 'insertFromPaste' &&
        nativeEvent.inputType !== 'insertReplacementText'
      ) {
        return;
      }

      const data = nativeEvent.data ?? '';
      const digits = normalizeOtpDigits(data, length);
      if (digits.length > 1) {
        e.preventDefault();
        applyDigits(data);
      }
    },
    [length, applyDigits]
  );

  return (
    <div className="otp-input-container" data-skip-app-plain-context>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          value={valueArray[index] ?? ''}
          onChange={(e) => handleInputChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onBeforeInput={handleBeforeInput}
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
