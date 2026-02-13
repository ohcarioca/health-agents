import { useTranslations } from "next-intl";
import { FileSpreadsheet } from "lucide-react";

export function PatientsPlaceholder() {
  const t = useTranslations("settings.patients");

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: "rgba(139,92,246,0.15)" }}
      >
        <FileSpreadsheet
          className="size-6"
          strokeWidth={1.75}
          style={{ color: "var(--accent)" }}
        />
      </div>
      <p
        className="text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {t("comingSoon")}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {t("csvHint")}
      </p>
    </div>
  );
}
