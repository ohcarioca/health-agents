import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch clinic with public page enabled only
  const { data: clinic, error } = await supabase
    .from("clinics")
    .select("id, name, slug, type, description, logo_url, phone, email, address, city, state, operating_hours, google_reviews_url, accent_color, social_links, show_prices, public_page_enabled, whatsapp_phone_number_id")
    .eq("slug", slug)
    .eq("public_page_enabled", true)
    .single();

  if (error || !clinic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch services for this clinic
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price_cents")
    .eq("clinic_id", clinic.id)
    .order("name");

  // Calculate lowest prices including professional overrides
  let servicesWithPrices = (services || []).map((s) => ({
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
      servicesWithPrices = servicesWithPrices.map((s) => {
        const profPrice = lowestPrices.get(s.id);
        const basePrice = s.price_cents;
        if (profPrice !== undefined && basePrice !== null) {
          return { ...s, price_cents: Math.min(basePrice, profPrice) };
        }
        return { ...s, price_cents: profPrice ?? basePrice };
      });
    }
  }

  // Strip sensitive fields before returning
  const publicData = {
    name: clinic.name,
    slug: clinic.slug,
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
    accent_color: clinic.accent_color,
    social_links: clinic.social_links,
    show_prices: clinic.show_prices,
    has_whatsapp: !!clinic.whatsapp_phone_number_id,
    services: servicesWithPrices,
  };

  return NextResponse.json(
    { data: publicData },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
