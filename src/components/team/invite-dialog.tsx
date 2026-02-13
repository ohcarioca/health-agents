"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { inviteMemberSchema } from "@/lib/validations/team";
import type { ClinicRole } from "@/types";

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function InviteDialog({
  open,
  onOpenChange,
  onSuccess,
}: InviteDialogProps) {
  const t = useTranslations("team.inviteDialog");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClinicRole>("reception");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = inviteMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstError = Object.values(flat.fieldErrors).flat()[0];
      setError(firstError ?? t("error"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        if (res.status === 409) {
          setError(t("alreadyMember"));
        } else {
          setError(json.error ?? t("error"));
        }
        return;
      }

      setEmail("");
      setRole("reception");
      onSuccess();
      onOpenChange(false);
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("title")}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="inviteEmail"
          label={t("email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div>
          <label
            htmlFor="inviteRole"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("role")}
          </label>
          <select
            id="inviteRole"
            value={role}
            onChange={(e) => setRole(e.target.value as ClinicRole)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            <option value="reception">Reception</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? t("sending") : t("submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
