"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { createCustomFieldSchema } from "@/lib/validations/custom-fields";
import type { CustomFieldDefinition } from "@/types";

export function CustomFieldsList() {
  const t = useTranslations("settings.customFields");
  const tc = useTranslations("common");

  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingField, setDeletingField] = useState<CustomFieldDefinition | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "select">("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchList() {
    try {
      const res = await fetch("/api/settings/custom-fields");
      if (res.ok) {
        const json = await res.json();
        setFields(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  function openAdd() {
    setEditing(undefined);
    setName("");
    setType("text");
    setRequired(false);
    setOptions([]);
    setNewOption("");
    setError("");
    setDialogOpen(true);
  }

  function openEdit(field: CustomFieldDefinition) {
    setEditing(field);
    setName(field.name);
    setType(field.type);
    setRequired(field.required);
    setOptions(field.options ?? []);
    setNewOption("");
    setError("");
    setDialogOpen(true);
  }

  function addOption() {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) return;
    setOptions((prev) => [...prev, trimmed]);
    setNewOption("");
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const data = {
      name,
      type,
      required,
      options: type === "select" ? options : [],
      display_order: editing?.display_order ?? fields.length,
    };

    const parsed = createCustomFieldSchema.safeParse(data);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const firstError =
        Object.values(flat.fieldErrors).flat()[0] ??
        flat.formErrors[0];
      setError(firstError ?? t("saveError"));
      return;
    }

    setSaving(true);
    try {
      const url = editing
        ? `/api/settings/custom-fields/${editing.id}`
        : "/api/settings/custom-fields";

      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const json = await res.json();
        if (json.error === "duplicate_name") {
          setError(t("duplicateName"));
          return;
        }
        setError(json.error ?? t("saveError"));
        return;
      }

      toast.success(tc("success"));
      setDialogOpen(false);
      setLoading(true);
      fetchList();
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(field: CustomFieldDefinition) {
    setDeletingField(field);
    setConfirmOpen(true);
  }

  async function executeDelete() {
    if (!deletingField) return;

    const res = await fetch(`/api/settings/custom-fields/${deletingField.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== deletingField.id));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openAdd} size="sm">
          <Plus className="size-4" strokeWidth={1.75} />
          {t("add")}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {fields.map((field) => (
            <Card key={field.id}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {field.name}
                    </p>
                    {field.required && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: "var(--accent-muted)",
                          color: "var(--accent)",
                        }}
                      >
                        {t("required")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {field.type === "text" ? t("typeText") : t("typeSelect")}
                    {field.type === "select" && field.options.length > 0
                      ? ` · ${field.options.join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(field)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <Pencil className="size-4" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => handleDelete(field)}
                    className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                    style={{ color: "var(--danger)" }}
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? t("edit") : t("add")}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="fieldName"
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div>
            <label
              htmlFor="fieldType"
              className="block text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {t("type")}
            </label>
            <select
              id="fieldType"
              value={type}
              onChange={(e) => setType(e.target.value as "text" | "select")}
              className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            >
              <option value="text">{t("typeText")}</option>
              <option value="select">{t("typeSelect")}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="fieldRequired"
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="size-4 rounded border accent-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
            <label
              htmlFor="fieldRequired"
              className="text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {t("required")}
            </label>
          </div>

          {type === "select" && (
            <div>
              <label
                className="block text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {t("options")}
              </label>

              {options.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {options.map((opt, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: "var(--surface-elevated)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {opt}
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="rounded-full p-0.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder={t("optionPlaceholder")}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  {t("addOption")}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={saving}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={tc("delete")}
        description={t("deleteConfirm")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        variant="danger"
        onConfirm={executeDelete}
      />
    </>
  );
}
