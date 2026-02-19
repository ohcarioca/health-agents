"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  return (
    <PageContainer>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          {t("error")}
        </p>
        <Button variant="secondary" onClick={reset}>
          {t("tryAgain")}
        </Button>
      </div>
    </PageContainer>
  );
}
