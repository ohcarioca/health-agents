"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface StepWhatsappProps {
  phoneNumberId: string;
  onPhoneNumberIdChange: (value: string) => void;
  wabaId: string;
  onWabaIdChange: (value: string) => void;
  accessToken: string;
  onAccessTokenChange: (value: string) => void;
  testResult: "success" | "failed" | null;
  testing: boolean;
  onTest: () => void;
}

export function StepWhatsapp({
  phoneNumberId,
  onPhoneNumberIdChange,
  wabaId,
  onWabaIdChange,
  accessToken,
  onAccessTokenChange,
  testResult,
  testing,
  onTest,
}: StepWhatsappProps) {
  const t = useTranslations("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("step3.description")}
      </p>
      <Input
        id="whatsappPhoneNumberId"
        label={t("step3.phoneNumberId")}
        value={phoneNumberId}
        onChange={(e) => onPhoneNumberIdChange(e.target.value)}
        required
      />
      <Input
        id="whatsappWabaId"
        label={t("step3.wabaId")}
        value={wabaId}
        onChange={(e) => onWabaIdChange(e.target.value)}
        required
      />
      <Input
        id="whatsappAccessToken"
        label={t("step3.accessToken")}
        type="password"
        value={accessToken}
        onChange={(e) => onAccessTokenChange(e.target.value)}
        required
      />

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={testing || !phoneNumberId.trim() || !accessToken.trim()}
        >
          {testing ? t("step3.testLoading") : t("step3.testConnection")}
        </Button>
        {testResult === "success" && (
          <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
            {t("step3.testSuccess")}
          </span>
        )}
        {testResult === "failed" && (
          <span className="text-xs font-medium" style={{ color: "var(--danger)" }}>
            {t("step3.testFailed")}
          </span>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {t("step3.helpText")}
      </p>
    </div>
  );
}
