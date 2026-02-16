"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CompactScheduleGrid } from "./compact-schedule-grid";
import { clinicSettingsSchema } from "@/lib/validations/settings";
import type { ScheduleGrid } from "@/lib/validations/settings";
import type { Clinic } from "@/types";

interface ClinicFormProps {
  clinic: Clinic;
}

const TIMEZONE_OPTIONS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
];

export function ClinicForm({ clinic }: ClinicFormProps) {
  const t = useTranslations("settings.clinic");

  const [name, setName] = useState(clinic.name);
  const [phone, setPhone] = useState(clinic.phone ?? "");
  const [email, setEmail] = useState(clinic.email ?? "");
  const [address, setAddress] = useState(clinic.address ?? "");
  const [city, setCity] = useState(clinic.city ?? "");
  const [state, setState] = useState(clinic.state ?? "");
  const [zipCode, setZipCode] = useState(clinic.zip_code ?? "");
  const [timezone, setTimezone] = useState(
    clinic.timezone ?? "America/Sao_Paulo",
  );
  const [operatingHours, setOperatingHours] = useState<ScheduleGrid>(
    (clinic.operating_hours as ScheduleGrid | undefined) ?? {
      monday: [], tuesday: [], wednesday: [], thursday: [],
      friday: [], saturday: [], sunday: [],
    },
  );

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setFieldErrors({});

    const data = {
      name,
      phone,
      email,
      address,
      city,
      state,
      zip_code: zipCode,
      timezone,
      operating_hours: operatingHours,
    };

    const parsed = clinicSettingsSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const errors: Record<string, string> = {};
      for (const [key, messages] of Object.entries(flat.fieldErrors)) {
        if (messages && messages.length > 0) {
          errors[key] = messages[0];
        }
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/settings/clinic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        setFeedback({ type: "error", message: json.error ?? t("saveError") });
        return;
      }

      setFeedback({ type: "success", message: t("saveSuccess") });
    } catch {
      setFeedback({ type: "error", message: t("saveError") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          id="name"
          label={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          required
        />
        <Input
          id="phone"
          label={t("phone")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldErrors.phone}
        />
        <Input
          id="email"
          label={t("email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <Input
          id="address"
          label={t("address")}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={fieldErrors.address}
        />
        <Input
          id="city"
          label={t("city")}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          error={fieldErrors.city}
        />
        <Input
          id="state"
          label={t("state")}
          value={state}
          onChange={(e) => setState(e.target.value)}
          error={fieldErrors.state}
          maxLength={2}
        />
        <Input
          id="zipCode"
          label={t("zipCode")}
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
          error={fieldErrors.zip_code}
        />
        <div>
          <label
            htmlFor="timezone"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("timezone")}
          </label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("America/", "").replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Operating Hours */}
      <div className="space-y-2">
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {t("operatingHours")}
        </h3>
        <CompactScheduleGrid value={operatingHours} onChange={setOperatingHours} />
      </div>

      {feedback && (
        <p
          className="text-sm"
          style={{
            color:
              feedback.type === "success" ? "var(--success)" : "var(--danger)",
          }}
        >
          {feedback.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
