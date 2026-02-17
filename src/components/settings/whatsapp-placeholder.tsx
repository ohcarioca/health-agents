"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function maskToken(token: string): string {
  if (token.length <= 8) return token;
  return `${token.slice(0, 4)}${"*".repeat(token.length - 8)}${token.slice(-4)}`;
}

export function WhatsAppConfig() {
  const t = useTranslations("settings.whatsapp");

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    async function fetchClinic() {
      try {
        const res = await fetch("/api/settings/clinic");
        if (!res.ok) return;
        const json = await res.json();
        if (json.data) {
          setClinicName(json.data.name || "");
          setPhoneNumberId(json.data.whatsapp_phone_number_id || "");
          setWabaId(json.data.whatsapp_waba_id || "");
          const token = json.data.whatsapp_access_token || "";
          if (token) {
            setSavedToken(token);
            setIsConnected(true);
          }
        }
      } catch (err) {
        console.error("[whatsapp-config] fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchClinic();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSuccessMessage(false);

    try {
      // Get current clinic data to include required name field
      const getRes = await fetch("/api/settings/clinic");
      if (!getRes.ok) {
        console.error("[whatsapp-config] failed to get clinic data");
        return;
      }
      const getJson = await getRes.json();
      const name = getJson.data?.name || clinicName;

      const res = await fetch("/api/settings/clinic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          whatsapp_phone_number_id: phoneNumberId,
          whatsapp_waba_id: wabaId,
          whatsapp_access_token: accessToken || savedToken,
        }),
      });

      if (!res.ok) {
        console.error("[whatsapp-config] save error:", res.status);
        return;
      }

      const json = await res.json();
      if (json.data) {
        const token = json.data.whatsapp_access_token || "";
        if (token) {
          setSavedToken(token);
          setAccessToken("");
          setIsConnected(true);
        }
        setSuccessMessage(true);
        setTimeout(() => setSuccessMessage(false), 3000);
      }
    } catch (err) {
      console.error("[whatsapp-config] save error:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
          >
            <MessageCircle
              className="size-5"
              strokeWidth={1.75}
              style={{ color: "var(--success)" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {t("title")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("description")}
            </p>
          </div>
          <Badge variant={isConnected ? "success" : "neutral"}>
            {isConnected ? t("connected") : t("notConnected")}
          </Badge>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <Input
            id="whatsapp-phone-number-id"
            label={t("phoneNumberId")}
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="123456789012345"
          />

          <Input
            id="whatsapp-waba-id"
            label={t("wabaId")}
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="123456789012345"
          />

          <div>
            <Input
              id="whatsapp-access-token"
              label={t("accessToken")}
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={savedToken ? "********" : "EAAx..."}
            />
            {savedToken && !accessToken && (
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {t("currentToken")}: {maskToken(savedToken)}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Spinner size="sm" />}
            {t("save")}
          </Button>

          {successMessage && (
            <p
              className="text-xs font-medium"
              style={{ color: "var(--success)" }}
            >
              {t("savedSuccess")}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
