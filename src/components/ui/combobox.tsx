"use client";

import { useState, useRef, useEffect, type InputHTMLAttributes } from "react";

interface ComboboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label?: string;
  error?: string;
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
}

export function Combobox({
  label,
  error,
  suggestions,
  value,
  onChange,
  id,
  className = "",
  ...props
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) {
      setFiltered(suggestions);
    } else {
      const lower = value.toLowerCase();
      setFiltered(suggestions.filter((s) => s.toLowerCase().includes(lower)));
    }
  }, [value, suggestions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-[var(--accent-ring)] ${className}`}
        style={{
          backgroundColor: "var(--surface)",
          borderColor: error ? "var(--danger)" : "var(--border)",
          color: "var(--text-primary)",
        }}
        {...props}
      />

      {open && filtered.length > 0 && (
        <ul
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border py-1 shadow-lg"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          {filtered.map((item) => (
            <li key={item}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                style={{ color: "var(--text-primary)" }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(item);
                  setOpen(false);
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
