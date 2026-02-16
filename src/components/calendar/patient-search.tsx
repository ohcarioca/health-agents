"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

interface PatientResult {
  id: string;
  name: string;
  phone: string;
}

interface PatientSearchProps {
  value: PatientResult | null;
  onChange: (patient: PatientResult | null) => void;
}

export function PatientSearch({ value, onChange }: PatientSearchProps) {
  const t = useTranslations("calendar");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/calendar/patients/search?q=${encodeURIComponent(query)}`
        );
        const json = await res.json();
        setResults(json.data ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (value) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--surface)",
        }}
      >
        <span style={{ color: "var(--text-primary)" }}>{value.name}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {value.phone}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="ml-auto text-xs hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t("searchPatient")}
          className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--surface)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {open && results.length > 0 && (
        <div
          className="absolute z-10 mt-1 w-full rounded-lg border shadow-lg"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderColor: "var(--border)",
          }}
        >
          {results.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => {
                onChange(patient);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            >
              <span style={{ color: "var(--text-primary)" }}>
                {patient.name}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {patient.phone}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div
          className="absolute z-10 mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          style={{
            backgroundColor: "var(--surface-elevated)",
            borderColor: "var(--border)",
            color: "var(--text-muted)",
          }}
        >
          {t("noAppointments")}
        </div>
      )}
    </div>
  );
}
