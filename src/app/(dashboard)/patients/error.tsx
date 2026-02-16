"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function PatientsError({ reset }: { reset: () => void }) {
  const t = useTranslations("common");

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4">
      <p style={{ color: "var(--text-secondary)" }}>{t("error")}</p>
      <Button variant="secondary" size="sm" onClick={reset}>
        {t("tryAgain")}
      </Button>
    </div>
  );
}
