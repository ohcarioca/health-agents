"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createProfessionalSchema } from "@/lib/validations/settings";

interface ProfessionalFormProps {
  professional?: {
    id: string;
    name: string;
    specialty: string | null;
    appointment_duration_minutes: number;
  };
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProfessionalForm({
  professional,
  onSuccess,
  onCancel,
}: ProfessionalFormProps) {
  const t = useTranslations("settings.professionals");
  const isEditing = !!professional;

  const [name, setName] = useState(professional?.name ?? "");
  const [specialty, setSpecialty] = useState(professional?.specialty ?? "");
  const [duration, setDuration] = useState(
    professional?.appointment_duration_minutes ?? 30,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const data = {
      name,
      specialty,
      appointment_duration_minutes: duration,
    };

    const parsed = createProfessionalSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstError = Object.values(flat.fieldErrors).flat()[0];
      setError(firstError ?? t("saveError"));
      return;
    }

    setLoading(true);
    try {
      const url = isEditing
        ? `/api/settings/professionals/${professional.id}`
        : "/api/settings/professionals";

      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? t("saveError"));
        return;
      }

      onSuccess();
    } catch {
      setError(t("saveError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="profName"
        label={t("name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Input
        id="specialty"
        label={t("specialty")}
        value={specialty}
        onChange={(e) => setSpecialty(e.target.value)}
      />
      <Input
        id="duration"
        label={t("duration")}
        type="number"
        value={String(duration)}
        onChange={(e) => setDuration(Number(e.target.value))}
        min={5}
        max={480}
      />

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("name") === "Nome" ? "Cancelar" : "Cancel"}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "..."
            : isEditing
              ? t("edit")
              : t("add")}
        </Button>
      </div>
    </form>
  );
}
