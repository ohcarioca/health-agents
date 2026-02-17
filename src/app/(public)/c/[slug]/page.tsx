import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicClinicPage } from "@/components/public-page/public-clinic-page";
import type { SocialLink, SocialLinkType } from "@/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const VALID_LINK_TYPES = new Set<string>([
  "instagram", "facebook", "website", "youtube",
  "tiktok", "linkedin", "google_maps", "other",
]);

function parseSocialLinks(raw: unknown): SocialLink[] {
  if (!Array.isArray(raw)) return [];
  const result: SocialLink[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      "type" in item && typeof item.type === "string" && VALID_LINK_TYPES.has(item.type) &&
      "url" in item && typeof item.url === "string" &&
      "label" in item && typeof item.label === "string"
    ) {
      result.push({
        type: item.type as SocialLinkType,
        url: item.url,
        label: item.label,
      });
    }
  }
  return result;
}

export default async function ClinicPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, name, slug, type, description, logo_url, phone, email, address, city, state, operating_hours, google_reviews_url, accent_color, social_links, show_prices, public_page_enabled")
    .eq("slug", slug)
    .eq("public_page_enabled", true)
    .single();

  if (!clinic) notFound();

  // Fetch services
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price_cents")
    .eq("clinic_id", clinic.id)
    .order("name");

  // Calculate lowest prices including professional overrides
  let servicesData = (services || []).map((s) => ({
    id: s.id,
    name: s.name,
    duration_minutes: s.duration_minutes,
    price_cents: clinic.show_prices ? s.price_cents : null,
  }));

  if (clinic.show_prices && services && services.length > 0) {
    const serviceIds = services.map((s) => s.id);
    const { data: profServices } = await supabase
      .from("professional_services")
      .select("service_id, price_cents")
      .in("service_id", serviceIds);

    if (profServices) {
      const lowestPrices = new Map<string, number>();
      for (const ps of profServices) {
        const current = lowestPrices.get(ps.service_id);
        if (current === undefined || ps.price_cents < current) {
          lowestPrices.set(ps.service_id, ps.price_cents);
        }
      }
      servicesData = servicesData.map((s) => {
        const profPrice = lowestPrices.get(s.id);
        const basePrice = s.price_cents;
        if (profPrice !== undefined && basePrice !== null) {
          return { ...s, price_cents: Math.min(basePrice, profPrice) };
        }
        return { ...s, price_cents: profPrice ?? basePrice };
      });
    }
  }

  return (
    <PublicClinicPage
      clinic={{
        name: clinic.name,
        type: clinic.type,
        description: clinic.description,
        logo_url: clinic.logo_url,
        phone: clinic.phone,
        email: clinic.email,
        address: clinic.address,
        city: clinic.city,
        state: clinic.state,
        operating_hours: clinic.operating_hours,
        google_reviews_url: clinic.google_reviews_url,
        accent_color: clinic.accent_color || "#0EA5E9",
        social_links: parseSocialLinks(clinic.social_links),
        show_prices: clinic.show_prices ?? true,
      }}
      services={servicesData}
    />
  );
}
