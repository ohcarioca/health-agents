import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import "@/app/globals.css";

interface MetadataProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, description, logo_url, type")
    .eq("slug", slug)
    .eq("public_page_enabled", true)
    .single();

  if (!clinic) {
    return { title: "Not Found" };
  }

  const title = clinic.type ? `${clinic.name} — ${clinic.type}` : clinic.name;

  return {
    title,
    description: clinic.description || `${clinic.name} — Agende sua consulta`,
    openGraph: {
      title,
      description: clinic.description || undefined,
      images: clinic.logo_url ? [{ url: clinic.logo_url }] : undefined,
      type: "website",
    },
  };
}

export default function PublicPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#f8fafc" }}
    >
      {children}
    </div>
  );
}
