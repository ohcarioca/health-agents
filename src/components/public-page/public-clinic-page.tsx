import { MapPin, Phone, Mail, Clock, ExternalLink, MessageCircle } from "lucide-react";
import type { SocialLink } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceData {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number | null;
}

interface ClinicData {
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
  accent_color: string;
  social_links: SocialLink[];
  show_prices: boolean;
}

export interface PublicClinicPageProps {
  clinic: ClinicData;
  services: ServiceData[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINK_TYPE_ICONS: Record<string, string> = {
  instagram: "📷",
  facebook: "📘",
  website: "🌐",
  youtube: "▶️",
  tiktok: "🎵",
  linkedin: "💼",
  google_maps: "📍",
  other: "🔗",
};

const WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
  sunday: "Dom",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Handle with country code (55)
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone;
}

function getWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

interface TimeSlot {
  start: string;
  end: string;
}

function parseOperatingHours(
  hours: unknown
): Record<string, TimeSlot[]> | null {
  if (!hours || typeof hours !== "object") return null;
  const record = hours as Record<string, unknown>;
  const result: Record<string, TimeSlot[]> = {};

  for (const day of WEEKDAY_ORDER) {
    const slots = record[day];
    if (Array.isArray(slots) && slots.length > 0) {
      const validSlots: TimeSlot[] = [];
      for (const slot of slots) {
        if (
          slot &&
          typeof slot === "object" &&
          "start" in slot &&
          "end" in slot &&
          typeof slot.start === "string" &&
          typeof slot.end === "string"
        ) {
          validSlots.push({ start: slot.start, end: slot.end });
        }
      }
      if (validSlots.length > 0) {
        result[day] = validSlots;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function buildGoogleMapsUrl(address: string, city: string | null, state: string | null): string {
  const parts = [address, city, state].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PublicClinicPage({ clinic, services }: PublicClinicPageProps) {
  const operatingHours = parseOperatingHours(clinic.operating_hours);
  const hasContact = clinic.address || clinic.phone || clinic.email;
  const hasServices = services.length > 0;
  const hasSocialLinks = clinic.social_links.length > 0;

  return (
    <div className="mx-auto max-w-[480px] px-4 py-8 sm:py-12">
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="text-center">
        <div className="mb-4 flex justify-center">
          {clinic.logo_url ? (
            <img
              src={clinic.logo_url}
              alt={clinic.name}
              className="size-24 rounded-full border-2 border-white object-cover shadow-md"
            />
          ) : (
            <div
              className="flex size-24 items-center justify-center rounded-full text-3xl font-bold text-white shadow-md"
              style={{ backgroundColor: clinic.accent_color }}
            >
              {clinic.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900">{clinic.name}</h1>

        {clinic.type && (
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${clinic.accent_color}14`,
              color: clinic.accent_color,
            }}
          >
            {clinic.type}
          </span>
        )}

        {clinic.description && (
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            {clinic.description}
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* WhatsApp CTA                                                     */}
      {/* ---------------------------------------------------------------- */}
      {clinic.phone && (
        <section className="mt-6">
          <a
            href={getWhatsAppUrl(clinic.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#25D366" }}
          >
            <MessageCircle className="size-5" />
            Agendar pelo WhatsApp
          </a>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Social Links                                                     */}
      {/* ---------------------------------------------------------------- */}
      {hasSocialLinks && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Links
          </h2>
          <div className="space-y-2">
            {clinic.social_links.map((link, i) => (
              <a
                key={`${link.type}-${i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50"
              >
                <span className="text-lg leading-none">
                  {LINK_TYPE_ICONS[link.type] || LINK_TYPE_ICONS.other}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-700">
                  {link.label}
                </span>
                <ExternalLink className="size-4 text-gray-300" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Services                                                         */}
      {/* ---------------------------------------------------------------- */}
      {hasServices && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Serviços
          </h2>
          <div className="space-y-2">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {service.name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="size-3" />
                    <span>{service.duration_minutes} min</span>
                  </div>
                </div>
                {service.price_cents !== null && (
                  <span
                    className="ml-3 shrink-0 text-sm font-semibold"
                    style={{ color: clinic.accent_color }}
                  >
                    {formatCents(service.price_cents)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Contact                                                          */}
      {/* ---------------------------------------------------------------- */}
      {hasContact && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Contato
          </h2>
          <div className="space-y-1 rounded-xl border border-gray-100 bg-white shadow-sm">
            {clinic.address && (
              <a
                href={buildGoogleMapsUrl(clinic.address, clinic.city, clinic.state)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <MapPin
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: clinic.accent_color }}
                />
                <div className="min-w-0 text-sm text-gray-600">
                  <p>{clinic.address}</p>
                  {(clinic.city || clinic.state) && (
                    <p className="text-gray-400">
                      {[clinic.city, clinic.state].filter(Boolean).join(" — ")}
                    </p>
                  )}
                </div>
              </a>
            )}

            {clinic.phone && (
              <a
                href={`tel:+55${clinic.phone.replace(/\D/g, "")}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <Phone
                  className="size-4 shrink-0"
                  style={{ color: clinic.accent_color }}
                />
                <span className="text-sm text-gray-600">
                  {formatPhone(clinic.phone)}
                </span>
              </a>
            )}

            {clinic.email && (
              <a
                href={`mailto:${clinic.email}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <Mail
                  className="size-4 shrink-0"
                  style={{ color: clinic.accent_color }}
                />
                <span className="truncate text-sm text-gray-600">
                  {clinic.email}
                </span>
              </a>
            )}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Operating Hours                                                  */}
      {/* ---------------------------------------------------------------- */}
      {operatingHours && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Horário de Funcionamento
          </h2>
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
            {WEEKDAY_ORDER.map((day) => {
              const slots = operatingHours[day];
              return (
                <div
                  key={day}
                  className="flex items-center justify-between border-b border-gray-50 px-4 py-2.5 last:border-b-0"
                >
                  <span className="text-sm font-medium text-gray-600">
                    {WEEKDAY_SHORT[day]}
                  </span>
                  {slots ? (
                    <span className="text-sm text-gray-500">
                      {slots
                        .map((s) => `${s.start} - ${s.end}`)
                        .join(", ")}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-300">Fechado</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Footer                                                           */}
      {/* ---------------------------------------------------------------- */}
      <footer className="mt-12 pb-6 text-center">
        <p className="text-xs text-gray-300">
          Powered by{" "}
          <span className="font-semibold" style={{ color: clinic.accent_color }}>
            Órbita
          </span>
        </p>
      </footer>
    </div>
  );
}
