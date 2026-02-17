"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Globe,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  GripVertical,
  Link as LinkIcon,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Spinner } from "@/components/ui/spinner";
import { PublicClinicPage } from "@/components/public-page/public-clinic-page";
import type { SocialLink, SocialLinkType } from "@/types";

interface PublicPageConfig {
  slug: string;
  public_page_enabled: boolean;
  accent_color: string;
  social_links: SocialLink[];
  show_prices: boolean;
}

interface ClinicInfo {
  name: string;
  type: string | null;
  description: string | null;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  operating_hours: unknown;
  google_reviews_url: string | null;
}

interface ServiceInfo {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
}

const LINK_TYPES: { value: SocialLinkType; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Website" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "google_maps", label: "Google Maps" },
  { value: "other", label: "Outro" },
];

const DEFAULT_ACCENT = "#0EA5E9";

export default function PublicPageEditor() {
  const t = useTranslations("publicPage");
  const tCommon = useTranslations("common");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<PublicPageConfig>({
    slug: "",
    public_page_enabled: false,
    accent_color: DEFAULT_ACCENT,
    social_links: [],
    show_prices: true,
  });
  const [clinicInfo, setClinicInfo] = useState<ClinicInfo | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [hasLogoChange, setHasLogoChange] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [pageRes, clinicRes, servicesRes] = await Promise.all([
          fetch("/api/settings/public-page"),
          fetch("/api/settings/clinic"),
          fetch("/api/settings/services"),
        ]);

        if (pageRes.ok) {
          const pageJson = await pageRes.json();
          if (pageJson.data) {
            setConfig({
              slug: pageJson.data.slug || "",
              public_page_enabled: pageJson.data.public_page_enabled ?? false,
              accent_color: pageJson.data.accent_color || DEFAULT_ACCENT,
              social_links: (pageJson.data.social_links || []) as SocialLink[],
              show_prices: pageJson.data.show_prices ?? true,
            });
          }
        }

        if (clinicRes.ok) {
          const clinicJson = await clinicRes.json();
          if (clinicJson.data) {
            setClinicInfo({
              name: clinicJson.data.name,
              type: clinicJson.data.type,
              description: clinicJson.data.description,
              logo_url: clinicJson.data.logo_url,
              phone: clinicJson.data.phone,
              email: clinicJson.data.email,
              address: clinicJson.data.address,
              city: clinicJson.data.city,
              state: clinicJson.data.state,
              operating_hours: clinicJson.data.operating_hours,
              google_reviews_url: clinicJson.data.google_reviews_url,
            });
            setLogoUrl(clinicJson.data.logo_url || "");
          }
        }

        if (servicesRes.ok) {
          const servicesJson = await servicesRes.json();
          if (servicesJson.data) {
            setServices(servicesJson.data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch public page data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const updateConfig = useCallback(
    (partial: Partial<PublicPageConfig>) => {
      setConfig((prev) => ({ ...prev, ...partial }));
      setHasChanges(true);
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/public-page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_page_enabled: config.public_page_enabled,
          accent_color: config.accent_color,
          social_links: config.social_links,
          show_prices: config.show_prices,
        }),
      });
      if (res.ok) {
        setHasChanges(false);
      }
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLogo = async () => {
    try {
      const res = await fetch("/api/settings/clinic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: logoUrl || null }),
      });
      if (res.ok) {
        setHasLogoChange(false);
        setClinicInfo((prev) => prev ? { ...prev, logo_url: logoUrl || null } : prev);
      }
    } catch (err) {
      console.error("Failed to save logo:", err);
    }
  };

  const addLink = () => {
    updateConfig({
      social_links: [
        ...config.social_links,
        { type: "website" as SocialLinkType, url: "", label: "" },
      ],
    });
  };

  const removeLink = (index: number) => {
    updateConfig({
      social_links: config.social_links.filter((_, i) => i !== index),
    });
  };

  const updateLink = (index: number, field: keyof SocialLink, value: string) => {
    const updated = [...config.social_links];
    updated[index] = { ...updated[index], [field]: value };
    updateConfig({ social_links: updated });
  };

  const copyUrl = async () => {
    const url = `${window.location.origin}/c/${config.slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </PageContainer>
    );
  }

  const pageUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/c/${config.slug}`;

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("description")}
        actions={
          config.slug ? (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                }}
              >
                <Globe className="size-4" style={{ color: config.public_page_enabled ? config.accent_color : "var(--text-muted)" }} />
                <span
                  className="max-w-[240px] truncate font-mono text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  /c/{config.slug}
                </span>
                <button
                  onClick={copyUrl}
                  className="rounded p-1 transition-colors hover:bg-white/10"
                  title={t("copyUrl")}
                >
                  {copied ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" style={{ color: "var(--text-secondary)" }} />
                  )}
                </button>
                <a
                  href={pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 transition-colors hover:bg-white/10"
                >
                  <ExternalLink className="size-4" style={{ color: "var(--text-secondary)" }} />
                </a>
              </div>
            </div>
          ) : undefined
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Editor Form */}
        <div className="space-y-6">
          {/* Enable Toggle + URL */}
          <div
            className="rounded-xl border p-5"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="size-5" style={{ color: "var(--text-secondary)" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t("enableToggle")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {config.public_page_enabled ? t("enabled") : t("disabled")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.public_page_enabled}
                onClick={() => updateConfig({ public_page_enabled: !config.public_page_enabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                  config.public_page_enabled ? "" : "bg-gray-600"
                }`}
                style={config.public_page_enabled ? { backgroundColor: config.accent_color } : undefined}
              >
                <span
                  className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                    config.public_page_enabled ? "translate-x-5" : "translate-x-0.5"
                  } mt-0.5`}
                />
              </button>
            </div>

          </div>

          {/* Appearance */}
          <div
            className="rounded-xl border p-5"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <h3 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("sections.appearance")}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  {t("accentColor")}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={config.accent_color}
                    onChange={(e) => updateConfig({ accent_color: e.target.value })}
                    className="size-10 cursor-pointer rounded-lg border-0 p-0"
                  />
                  <input
                    type="text"
                    value={config.accent_color}
                    onChange={(e) => {
                      if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) {
                        updateConfig({ accent_color: e.target.value });
                      }
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-mono uppercase"
                    style={{
                      backgroundColor: "var(--background)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                    maxLength={7}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  {t("showPrices")}
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.show_prices}
                  onClick={() => updateConfig({ show_prices: !config.show_prices })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                    config.show_prices ? "" : "bg-gray-600"
                  }`}
                  style={config.show_prices ? { backgroundColor: config.accent_color } : undefined}
                >
                  <span
                    className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                      config.show_prices ? "translate-x-5" : "translate-x-0.5"
                    } mt-0.5`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Clinic Info + Logo */}
          <div
            className="rounded-xl border p-5"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("sections.hero")}
              </h3>
              <a
                href="/settings?tab=clinic"
                className="text-xs font-medium hover:underline"
                style={{ color: config.accent_color }}
              >
                {t("editInSettings")} →
              </a>
            </div>

            <div className="mt-3 flex items-center gap-3">
              {clinicInfo?.logo_url ? (
                <img
                  src={clinicInfo.logo_url}
                  alt=""
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex size-10 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: config.accent_color }}
                >
                  {(clinicInfo?.name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {clinicInfo?.name || "—"}
                </p>
                <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                  {clinicInfo?.type || t("noDescription")}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Logo URL
              </label>
              <input
                type="url"
                placeholder="https://exemplo.com/logo.png"
                value={logoUrl}
                onChange={(e) => {
                  setLogoUrl(e.target.value);
                  setHasLogoChange(true);
                }}
                className="w-full rounded-lg px-3 py-2 text-xs"
                style={{
                  backgroundColor: "var(--background)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
              {hasLogoChange && (
                <button
                  onClick={handleSaveLogo}
                  className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: config.accent_color }}
                >
                  {tCommon("save")} logo
                </button>
              )}
            </div>
          </div>

          {/* Links */}
          <div
            className="rounded-xl border p-5"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("links")}
              </h3>
              <button
                onClick={addLink}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
                style={{ backgroundColor: config.accent_color }}
              >
                <Plus className="size-3.5" />
                {t("addLink")}
              </button>
            </div>

            {config.social_links.length === 0 ? (
              <div className="py-6 text-center">
                <LinkIcon className="mx-auto size-8" style={{ color: "var(--text-muted)" }} />
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {t("addLink")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {config.social_links.map((link, index) => (
                  <div
                    key={index}
                    className="flex gap-2 rounded-lg p-3"
                    style={{ backgroundColor: "var(--background)" }}
                  >
                    <div className="mt-2">
                      <GripVertical className="size-4" style={{ color: "var(--text-muted)" }} />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={link.type}
                          onChange={(e) => updateLink(index, "type", e.target.value)}
                          className="rounded-lg px-2 py-1.5 text-xs"
                          style={{
                            backgroundColor: "var(--surface)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {LINK_TYPES.map((lt) => (
                            <option key={lt.value} value={lt.value}>
                              {lt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder={t("linkLabel")}
                          value={link.label}
                          onChange={(e) => updateLink(index, "label", e.target.value)}
                          className="flex-1 rounded-lg px-2 py-1.5 text-xs"
                          style={{
                            backgroundColor: "var(--surface)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                          }}
                        />
                      </div>
                      <input
                        type="url"
                        placeholder={t("linkUrl")}
                        value={link.url}
                        onChange={(e) => updateLink(index, "url", e.target.value)}
                        className="w-full rounded-lg px-2 py-1.5 text-xs"
                        style={{
                          backgroundColor: "var(--surface)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                        }}
                      />
                    </div>
                    <button
                      onClick={() => removeLink(index)}
                      className="mt-2 rounded-lg p-1 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: config.accent_color }}
          >
            {saving ? tCommon("loading") : tCommon("save")}
          </button>
        </div>

        {/* Right: Live Preview */}
        <div className="hidden lg:block">
          <div className="sticky top-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {t("preview")}
            </h3>
            <div
              className="mx-auto overflow-hidden rounded-[2rem] border-4 shadow-xl"
              style={{
                maxWidth: "375px",
                borderColor: "var(--border-strong)",
                backgroundColor: "#f8fafc",
              }}
            >
              <div className="flex justify-center py-2" style={{ backgroundColor: "#f8fafc" }}>
                <div className="h-5 w-28 rounded-full bg-gray-200" />
              </div>
              <div className="h-[600px] overflow-y-auto">
                {clinicInfo && (
                  <PublicClinicPage
                    clinic={{
                      ...clinicInfo,
                      accent_color: config.accent_color,
                      social_links: config.social_links,
                      show_prices: config.show_prices,
                    }}
                    services={
                      config.show_prices
                        ? services
                        : services.map((s) => ({ ...s, price_cents: null }))
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
