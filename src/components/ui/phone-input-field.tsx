"use client";

import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

interface PhoneInputFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (digits: string) => void;
  error?: string;
  placeholder?: string;
}

export function PhoneInputField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder = "(11) 98765-4321",
}: PhoneInputFieldProps) {
  const e164Value = value ? (value.startsWith("+") ? value : `+${value}`) : undefined;

  function handleChange(val: string | undefined) {
    const digits = (val ?? "").replace(/\D/g, "");
    onChange(digits);
  }

  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </label>
      )}
      <PhoneInput
        id={id}
        defaultCountry="BR"
        value={e164Value}
        onChange={handleChange}
        placeholder={placeholder}
        className={error ? "phone-input-field phone-input-field--error" : "phone-input-field"}
      />
      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
