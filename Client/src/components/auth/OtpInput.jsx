import { useRef, useEffect } from "react";
import { cn } from "../../lib/cn.js";

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {number} [props.length]
 * @param {boolean} [props.disabled]
 * @param {string} [props.error]
 * @param {string} [props.id]
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  error,
  id = "otp-input",
}) {
  const inputsRef = useRef([]);

  const digits = value.padEnd(length, " ").slice(0, length).split("");

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const updateValue = (nextDigits) => {
    onChange(nextDigits.join("").replace(/\s/g, "").slice(0, length));
  };

  const handleChange = (index, char) => {
    const digit = char.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit || " ";
    updateValue(next);
    if (digit && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (digits[index]?.trim()) {
        const next = [...digits];
        next[index] = " ";
        updateValue(next);
      } else if (index > 0) {
        inputsRef.current[index - 1]?.focus();
        const next = [...digits];
        next[index - 1] = " ";
        updateValue(next);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, length - 1);
    inputsRef.current[focusIndex]?.focus();
  };

  return (
    <div>
      <div
        id={id}
        className="flex justify-center gap-2 sm:gap-3"
        role="group"
        aria-label="6-digit verification code"
        onPaste={handlePaste}
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={digit.trim()}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(
              "h-12 w-10 rounded-lg border text-center text-lg font-semibold text-navy sm:h-14 sm:w-12",
              "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
              error ? "border-red-400" : "border-slate-200",
              disabled && "bg-slate-50 opacity-60"
            )}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
          />
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
