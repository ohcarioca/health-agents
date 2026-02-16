"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, AlertTriangle, XCircle, Download } from "lucide-react";

interface PatientImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportResults {
  imported: number;
  skipped: { phone: string; reason: string }[];
  errors: { row: number; reason: string }[];
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const FIELD_PATTERNS: Record<string, RegExp> = {
  name: /^(nome|name|paciente|patient)$/i,
  phone: /^(telefone|phone|celular|mobile|whatsapp|fone)$/i,
  email: /^(email|e-mail)$/i,
  date_of_birth: /^(nascimento|birth|data.?nascimento|date.?of.?birth|dob)$/i,
  cpf: /^(cpf|documento|document)$/i,
  notes: /^(notas|notes|observ)$/i,
};

const PATIENT_FIELDS = [
  { key: "name", required: true },
  { key: "phone", required: true },
  { key: "email", required: false },
  { key: "date_of_birth", required: false },
  { key: "cpf", required: false },
  { key: "notes", required: false },
] as const;

function autoDetectMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    for (const [field, pattern] of Object.entries(FIELD_PATTERNS)) {
      if (pattern.test(header.trim())) {
        map[header] = field;
        break;
      }
    }
  }
  return map;
}

function getFieldLabel(key: string, t: (key: string) => string): string {
  switch (key) {
    case "name":
      return `${t("name")}*`;
    case "phone":
      return `${t("phone")}*`;
    case "email":
      return t("email");
    case "date_of_birth":
      return t("dateOfBirth");
    case "cpf":
      return t("cpf");
    case "notes":
      return t("notes");
    default:
      return key;
  }
}

export function PatientImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: PatientImportDialogProps) {
  const t = useTranslations("patients");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setHeaders([]);
      setRows([]);
      setColumnMap({});
      setImporting(false);
      setResults(null);
      setFileError("");
    }
  }, [open]);

  const processFile = useCallback((file: File) => {
    setFileError("");

    if (file.size > MAX_FILE_SIZE) {
      setFileError(t("importMaxSize"));
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "xlsx") {
      setFileError(t("importMaxSize"));
      return;
    }

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (parseResults) => {
          const parsedHeaders = parseResults.meta.fields ?? [];
          const parsedRows = parseResults.data as Record<string, string>[];
          setHeaders(parsedHeaders);
          setRows(parsedRows);
          setColumnMap(autoDetectMapping(parsedHeaders));
          setStep(2);
        },
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result;
        if (!buffer) return;

        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) return;

        const sheet = workbook.Sheets[firstSheetName];
        if (!sheet) return;

        const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
        if (rawData.length < 2) {
          setFileError(t("importMaxSize"));
          return;
        }

        const parsedHeaders = rawData[0].map((h) => String(h ?? ""));
        const parsedRows = rawData.slice(1).map((row) => {
          const record: Record<string, string> = {};
          parsedHeaders.forEach((header, i) => {
            record[header] = String(row[i] ?? "");
          });
          return record;
        });

        setHeaders(parsedHeaders);
        setRows(parsedRows);
        setColumnMap(autoDetectMapping(parsedHeaders));
        setStep(2);
      };
      reader.readAsArrayBuffer(file);
    }
  }, [t]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  function handleDropZoneClick() {
    fileInputRef.current?.click();
  }

  function handleColumnMapChange(header: string, value: string) {
    setColumnMap((prev) => ({ ...prev, [header]: value }));
  }

  const isMappingComplete =
    Object.values(columnMap).includes("name") &&
    Object.values(columnMap).includes("phone");

  async function handleImport() {
    setImporting(true);

    const transformedRows = rows.map((row) => {
      const patient: Record<string, string> = {};
      for (const [header, field] of Object.entries(columnMap)) {
        if (field && row[header] !== undefined) {
          patient[field] = row[header];
        }
      }
      return patient;
    });

    try {
      const res = await fetch("/api/patients/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patients: transformedRows }),
      });

      if (!res.ok) {
        const json = await res.json();
        setResults({
          imported: 0,
          skipped: [],
          errors: [{ row: 0, reason: json.error ?? "Unknown error" }],
        });
      } else {
        const json = await res.json();
        setResults(json.data);
      }

      setStep(3);
    } catch {
      setResults({
        imported: 0,
        skipped: [],
        errors: [{ row: 0, reason: "Network error" }],
      });
      setStep(3);
    } finally {
      setImporting(false);
    }
  }

  function handleDownloadErrors() {
    if (!results) return;

    const csvRows = [["row", "phone", "reason"]];
    for (const err of results.errors) {
      csvRows.push([String(err.row), "", err.reason]);
    }
    for (const skip of results.skipped) {
      csvRows.push(["", skip.phone, skip.reason]);
    }

    const csvContent = csvRows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "import-errors.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDone() {
    onSuccess();
    onOpenChange(false);
  }

  const dialogTitle =
    step === 1
      ? t("importTitle")
      : step === 2
        ? t("importMapping")
        : t("importResults");

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={dialogTitle}
      size="xl"
    >
      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-4">
          <div
            onClick={handleDropZoneClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors hover:bg-[rgba(255,255,255,0.02)]"
            style={{ borderColor: "var(--border)" }}
          >
            <Upload
              className="size-10"
              strokeWidth={1.5}
              style={{ color: "var(--text-muted)" }}
            />
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {t("importUpload")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("importBrowse")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("importMaxSize")}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileChange}
            className="hidden"
          />

          {fileError && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {fileError}
            </p>
          )}
        </div>
      )}

      {/* Step 2: Preview & Map */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Column mapping */}
          <div className="space-y-3">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-3">
                <span
                  className="w-40 shrink-0 truncate text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                  title={header}
                >
                  {header}
                </span>
                <select
                  value={columnMap[header] ?? ""}
                  onChange={(e) => handleColumnMapChange(header, e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">{t("importIgnore")}</option>
                  {PATIENT_FIELDS.map((field) => (
                    <option key={field.key} value={field.key}>
                      {getFieldLabel(field.key, t)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!isMappingComplete && (
            <p className="text-xs" style={{ color: "var(--warning, #f59e0b)" }}>
              {t("importRequired")}
            </p>
          )}

          {/* Preview table */}
          <div>
            <p
              className="mb-2 text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {t("importPreview")}
            </p>
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {headers.map((header) => (
                      <th
                        key={header}
                        className="whitespace-nowrap border-b px-3 py-2 text-left font-medium"
                        style={{
                          borderColor: "var(--border)",
                          color: "var(--text-muted)",
                          backgroundColor: "var(--surface)",
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {headers.map((header) => (
                        <td
                          key={header}
                          className="whitespace-nowrap border-b px-3 py-1.5"
                          style={{
                            borderColor: "var(--border)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {row[header] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
            >
              {t("previous") ?? "Back"}
            </Button>
            <Button
              type="button"
              disabled={!isMappingComplete || importing}
              onClick={handleImport}
            >
              {importing ? t("importImporting") : t("importButton")}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && results && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle
                className="size-5 shrink-0"
                style={{ color: "var(--success, #22c55e)" }}
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {t("importImported", { count: results.imported })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <AlertTriangle
                className="size-5 shrink-0"
                style={{ color: "var(--warning, #f59e0b)" }}
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {t("importSkipped", { count: results.skipped.length })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <XCircle
                className="size-5 shrink-0"
                style={{ color: "var(--danger, #ef4444)" }}
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {t("importErrors", { count: results.errors.length })}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {results.skipped.length + results.errors.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadErrors}
              >
                <Download className="size-4" />
                {t("importDownloadErrors")}
              </Button>
            )}
            <Button type="button" onClick={handleDone}>
              {t("importDone")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
