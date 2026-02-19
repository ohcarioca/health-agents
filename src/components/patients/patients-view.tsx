"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Search,
  Plus,
  Upload,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { PatientImportDialog } from "@/components/patients/patient-import-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface PatientRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  cpf: string | null;
  date_of_birth: string | null;
  notes: string | null;
  last_visit_at: string | null;
  created_at: string;
}

interface PatientsViewProps {
  initialPatients: PatientRow[];
  initialCount: number;
}

const PER_PAGE = 25;

function formatPhone(digits: string): string {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function maskCpf(cpf: string): string {
  if (cpf.length === 11)
    return `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
  return cpf;
}

export function PatientsView({
  initialPatients,
  initialCount,
}: PatientsViewProps) {
  const t = useTranslations("patients");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [patients, setPatients] = useState<PatientRow[]>(initialPatients);
  const [count, setCount] = useState(initialCount);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRow | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingPatient, setDeletingPatient] = useState<PatientRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalPages = Math.ceil(count / PER_PAGE);

  const fetchPatients = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q.trim().length >= 2) params.set("q", q.trim());
      const res = await fetch(`/api/patients?${params}`);
      if (res.ok) {
        const json = await res.json();
        setPatients(json.data ?? []);
        setCount(json.count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search — resets to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchPatients(1, search);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Page change (not triggered by search reset)
  useEffect(() => {
    if (page > 1) {
      fetchPatients(page, search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleAdd() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function handleEdit(patient: PatientRow) {
    setEditing(patient);
    setFormOpen(true);
  }

  function handleDelete(patient: PatientRow) {
    setDeletingPatient(patient);
    setConfirmOpen(true);
  }

  async function executeDelete() {
    if (!deletingPatient) return;
    setDeleteError(null);

    try {
      const res = await fetch(`/api/patients/${deletingPatient.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        if (res.status === 409 && json.count !== undefined) {
          setDeleteError(t("deleteBlocked", { count: json.count }));
          return;
        }
        setDeleteError(t("deleteError"));
        return;
      }

      fetchPatients(page, search);
    } catch {
      setDeleteError(t("deleteError"));
    }
  }

  function handleFormSuccess() {
    setFormOpen(false);
    fetchPatients(page, search);
  }

  function handleImportSuccess() {
    setImportOpen(false);
    setPage(1);
    fetchPatients(1, search);
  }

  return (
    <div className="space-y-4">
      {/* Table or Empty state */}
      {count === 0 && search.trim().length < 2 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Users
            className="size-12"
            strokeWidth={1}
            style={{ color: "var(--text-muted)" }}
          />
          <h2
            className="text-lg font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("empty")}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("emptyHint")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="size-4" />
              {t("import")}
            </Button>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="size-4" />
              {t("add")}
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl border"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {/* Card header: search + actions */}
          <div
            className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Search */}
            <div className="relative w-full max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("count", { count })}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="size-4" />
                {t("import")}
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Plus className="size-4" />
                {t("add")}
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className={`relative ${loading ? "opacity-50" : ""}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("name")}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("phone")}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("email")}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("cpf")}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("lastVisit")}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b transition-colors hover:bg-[var(--nav-hover-bg)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td
                        className="px-4 py-3 font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {patient.name}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {formatPhone(patient.phone)}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {patient.email || "\u2014"}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {patient.cpf ? maskCpf(patient.cpf) : "\u2014"}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {patient.last_visit_at
                          ? new Date(patient.last_visit_at).toLocaleDateString(locale)
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(patient)}
                            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                            style={{ color: "var(--text-muted)" }}
                            title={t("edit")}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(patient)}
                            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                            style={{ color: "var(--text-muted)" }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.color = "var(--danger)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.color = "var(--text-muted)")
                            }
                            title={t("deleteConfirm")}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {t("page", { page, total: totalPages })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" />
                    {t("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("nextPage")}
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patient={editing}
        onSuccess={handleFormSuccess}
      />
      <PatientImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={handleImportSuccess}
      />

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
      <Dialog
        open={deleteError !== null}
        onOpenChange={() => setDeleteError(null)}
        title={tc("attention")}
        description={deleteError ?? ""}
      >
        <div className="flex justify-end pt-4">
          <Button size="sm" variant="outline" onClick={() => setDeleteError(null)}>
            OK
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
