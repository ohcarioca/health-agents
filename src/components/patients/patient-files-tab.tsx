"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Image,
  Download,
  Trash2,
  File as FileIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface FileRow {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

interface PatientFilesTabProps {
  patientId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") {
    return <FileText className="size-8" strokeWidth={1} style={{ color: "var(--danger)" }} />;
  }
  if (mimeType.startsWith("image/")) {
    return <Image className="size-8" strokeWidth={1} style={{ color: "var(--accent)" }} />;
  }
  return <FileIcon className="size-8" strokeWidth={1} style={{ color: "var(--text-muted)" }} />;
}

export function PatientFilesTab({ patientId }: PatientFilesTabProps) {
  const t = useTranslations("patients.detail");
  const tc = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingFile, setDeletingFile] = useState<FileRow | null>(null);

  async function fetchFiles() {
    try {
      const res = await fetch(`/api/patients/${patientId}/files`);
      if (res.ok) {
        const json = await res.json();
        setFiles(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function handleFileUpload(file: File) {
    if (files.length >= 20) {
      toast.error(t("maxFilesReached"));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("fileTooLarge"));
      return;
    }

    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) {
      toast.error(t("fileTypeNotAllowed"));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/patients/${patientId}/files`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json();
        if (json.error === "max_files_reached") {
          toast.error(t("maxFilesReached"));
        } else if (json.error === "file_too_large") {
          toast.error(t("fileTooLarge"));
        } else if (json.error === "file_type_not_allowed") {
          toast.error(t("fileTypeNotAllowed"));
        } else {
          toast.error(t("uploadError"));
        }
        return;
      }

      toast.success(t("uploadSuccess"));
      fetchFiles();
    } catch {
      toast.error(t("uploadError"));
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
      e.target.value = "";
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  }

  async function handleDownload(file: FileRow) {
    const res = await fetch(`/api/patients/${patientId}/files/${file.id}`);
    if (res.ok) {
      const json = await res.json();
      window.open(json.data.url, "_blank");
    }
  }

  function handleDeleteClick(file: FileRow) {
    setDeletingFile(file);
    setConfirmOpen(true);
  }

  async function executeDelete() {
    if (!deletingFile) return;

    const res = await fetch(
      `/api/patients/${patientId}/files/${deletingFile.id}`,
      { method: "DELETE" },
    );

    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== deletingFile.id));
    } else {
      toast.error(t("deleteFileError"));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors hover:bg-[var(--nav-hover-bg)]"
        style={{ borderColor: "var(--border)" }}
      >
        {uploading ? (
          <Spinner />
        ) : (
          <>
            <Upload
              className="size-6"
              strokeWidth={1.5}
              style={{ color: "var(--text-muted)" }}
            />
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {t("uploadDragDrop")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("uploadAccepted")}
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* File count */}
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("filesCount", { count: files.length })}
      </p>

      {/* File list */}
      {files.length === 0 ? (
        <p
          className="py-4 text-center text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {t("noFiles")}
        </p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
              style={{ borderColor: "var(--border)" }}
            >
              <FileTypeIcon mimeType={file.mime_type} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {file.file_name}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatFileSize(file.file_size)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleDownload(file)}
                  className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                  style={{ color: "var(--text-muted)" }}
                  title={t("downloadFile")}
                >
                  <Download className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteClick(file)}
                  className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                  style={{ color: "var(--danger)" }}
                  title={t("deleteFile")}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("deleteFile")}
        description={t("deleteFileConfirm")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        variant="danger"
        onConfirm={executeDelete}
      />
    </div>
  );
}
