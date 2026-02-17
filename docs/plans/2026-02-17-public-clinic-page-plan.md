# Public Clinic Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give each clinic a public Linktree-style page at `/c/{slug}` with an admin editor featuring live preview.

**Architecture:** Path-based public route (`/c/[slug]`) excluded from auth proxy. New columns on `clinics` table (JSONB for social links, accent color, toggle). Admin editor at `/public-page` with split-screen form + preview. Public API using admin client to bypass RLS.

**Tech Stack:** Next.js App Router, Server Components (public page), Client Component (admin editor), Tailwind CSS v4, Zod validation, next-intl, lucide-react icons.

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/013_public_page.sql`

**Step 1: Write the migration**

```sql
-- Public clinic page configuration
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS public_page_enabled boolean DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#0EA5E9';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[]';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS show_prices boolean DEFAULT true;
```

**Step 2: Run migration against Supabase**

Run: `npx supabase db push` (or apply via Supabase dashboard)

**Step 3: Commit**

```bash
git add supabase/migrations/013_public_page.sql
git commit -m "feat: add public page columns to clinics table"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts` — add new columns to clinics Row/Insert/Update
- Modify: `src/types/index.ts` — add SocialLink type

**Step 1: Update `database.ts` clinics Row type**

Add these fields to `clinics.Row` (after `phone`):

```ts
public_page_enabled: boolean
accent_color: string
social_links: Json
show_prices: boolean
```

Add to `clinics.Insert` (all optional with defaults):

```ts
public_page_enabled?: boolean
accent_color?: string
social_links?: Json
show_prices?: boolean
```

Add to `clinics.Update` (all optional):

```ts
public_page_enabled?: boolean
accent_color?: string
social_links?: Json
show_prices?: boolean
```

Also add the missing `type` and `description` fields from migration 012 if not yet present:

```ts
// Row
type: string | null
description: string | null

// Insert
type?: string | null
description?: string | null

// Update
type?: string | null
description?: string | null
```

**Step 2: Add SocialLink type to `src/types/index.ts`**

```ts
export type SocialLinkType = 'instagram' | 'facebook' | 'website' | 'youtube' | 'tiktok' | 'linkedin' | 'google_maps' | 'other';

export interface SocialLink {
  type: SocialLinkType;
  url: string;
  label: string;
}
```

**Step 3: Commit**

```bash
git add src/types/database.ts src/types/index.ts
git commit -m "feat: add public page fields to clinics types"
```

---

### Task 3: Zod Validation Schema

**Files:**
- Modify: `src/lib/validations/settings.ts` — add public page schema

**Step 1: Read `src/lib/validations/settings.ts` to understand existing patterns**

**Step 2: Add public page validation schema**

Add to the file:

```ts
export const socialLinkSchema = z.object({
  type: z.enum(['instagram', 'facebook', 'website', 'youtube', 'tiktok', 'linkedin', 'google_maps', 'other']),
  url: z.string().url(),
  label: z.string().min(1).max(50),
});

export const publicPageSchema = z.object({
  public_page_enabled: z.boolean().optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  social_links: z.array(socialLinkSchema).max(20).optional(),
  show_prices: z.boolean().optional(),
});
```

**Step 3: Commit**

```bash
git add src/lib/validations/settings.ts
git commit -m "feat: add public page validation schema"
```

---

### Task 4: Update Proxy to Allow Public Routes

**Files:**
- Modify: `src/proxy.ts`

**Step 1: Update the matcher to exclude `/c` paths**

In `src/proxy.ts`, change the matcher from:

```ts
matcher: [
  "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
],
```

to:

```ts
matcher: [
  "/((?!api|c/|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
],
```

Note: use `c/` (with trailing slash) to only match the public page path pattern, not random routes starting with 'c'.

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: exclude /c/ public routes from auth proxy"
```

---

### Task 5: Public API Route

**Files:**
- Create: `src/app/api/public/clinics/[slug]/route.ts`

**Step 1: Create the GET route**

```ts
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

  // Fetch clinic with public page enabled
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

  // If show_prices is true, also fetch lowest professional prices
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
    whatsapp_phone: clinic.whatsapp_phone_number_id ? clinic.phone : null,
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
```

**Step 2: Commit**

```bash
git add src/app/api/public/clinics/[slug]/route.ts
git commit -m "feat: add public clinic API route"
```

---

### Task 6: Admin Settings API Route

**Files:**
- Create: `src/app/api/settings/public-page/route.ts`

**Step 1: Create GET and PUT routes**

Follow the exact pattern from `src/app/api/settings/clinic/route.ts` — use same `getClinicId()` auth helper pattern.

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicPageSchema } from "@/lib/validations/settings";

async function getClinicContext() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return { clinicId: membership.clinic_id, role: membership.role, userId: user.id };
}

export async function GET() {
  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: clinic, error } = await admin
    .from("clinics")
    .select("slug, public_page_enabled, accent_color, social_links, show_prices")
    .eq("id", ctx.clinicId)
    .single();

  if (error || !clinic) {
    return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  }

  return NextResponse.json({ data: clinic });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = publicPageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updateData[key] = value;
    }
  }

  const admin = createAdminClient();
  const { data: clinic, error } = await admin
    .from("clinics")
    .update(updateData)
    .eq("id", ctx.clinicId)
    .select("slug, public_page_enabled, accent_color, social_links, show_prices")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ data: clinic });
}
```

**Step 2: Commit**

```bash
git add src/app/api/settings/public-page/route.ts
git commit -m "feat: add public page settings API route"
```

---

### Task 7: Translation Keys

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add nav key to all 3 locale files**

In the `"nav"` section of each file, add:

pt-BR: `"publicPage": "Minha Página"`
en: `"publicPage": "My Page"`
es: `"publicPage": "Mi Página"`

**Step 2: Add `publicPage` namespace to all 3 locale files**

pt-BR:
```json
"publicPage": {
  "title": "Minha Página",
  "description": "Configure sua página pública de divulgação",
  "enabled": "Página ativa",
  "disabled": "Página inativa",
  "enableToggle": "Ativar página pública",
  "accentColor": "Cor de destaque",
  "showPrices": "Mostrar preços dos serviços",
  "links": "Links",
  "addLink": "Adicionar link",
  "removeLink": "Remover",
  "linkLabel": "Texto do link",
  "linkUrl": "URL",
  "linkType": "Tipo",
  "copyUrl": "Copiar link",
  "urlCopied": "Link copiado!",
  "preview": "Pré-visualização",
  "editInSettings": "Editar em Configurações",
  "noDescription": "Sem descrição",
  "pageUrl": "URL da página",
  "sections": {
    "hero": "Informações da Clínica",
    "whatsapp": "WhatsApp",
    "services": "Serviços",
    "contact": "Contato & Horários",
    "links": "Links",
    "appearance": "Aparência"
  },
  "linkTypes": {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "website": "Website",
    "youtube": "YouTube",
    "tiktok": "TikTok",
    "linkedin": "LinkedIn",
    "google_maps": "Google Maps",
    "other": "Outro"
  },
  "public": {
    "whatsappCta": "Falar no WhatsApp",
    "services": "Serviços",
    "contact": "Contato",
    "hours": "Horário de Funcionamento",
    "startingAt": "A partir de",
    "minutes": "min",
    "poweredBy": "Powered by",
    "notFound": "Página não encontrada",
    "notFoundDescription": "Esta clínica não possui uma página pública ativa."
  }
}
```

en:
```json
"publicPage": {
  "title": "My Page",
  "description": "Configure your public landing page",
  "enabled": "Page active",
  "disabled": "Page inactive",
  "enableToggle": "Enable public page",
  "accentColor": "Accent color",
  "showPrices": "Show service prices",
  "links": "Links",
  "addLink": "Add link",
  "removeLink": "Remove",
  "linkLabel": "Link text",
  "linkUrl": "URL",
  "linkType": "Type",
  "copyUrl": "Copy link",
  "urlCopied": "Link copied!",
  "preview": "Preview",
  "editInSettings": "Edit in Settings",
  "noDescription": "No description",
  "pageUrl": "Page URL",
  "sections": {
    "hero": "Clinic Information",
    "whatsapp": "WhatsApp",
    "services": "Services",
    "contact": "Contact & Hours",
    "links": "Links",
    "appearance": "Appearance"
  },
  "linkTypes": {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "website": "Website",
    "youtube": "YouTube",
    "tiktok": "TikTok",
    "linkedin": "LinkedIn",
    "google_maps": "Google Maps",
    "other": "Other"
  },
  "public": {
    "whatsappCta": "Chat on WhatsApp",
    "services": "Services",
    "contact": "Contact",
    "hours": "Business Hours",
    "startingAt": "Starting at",
    "minutes": "min",
    "poweredBy": "Powered by",
    "notFound": "Page not found",
    "notFoundDescription": "This clinic does not have an active public page."
  }
}
```

es:
```json
"publicPage": {
  "title": "Mi Página",
  "description": "Configure su página pública de divulgación",
  "enabled": "Página activa",
  "disabled": "Página inactiva",
  "enableToggle": "Activar página pública",
  "accentColor": "Color de destaque",
  "showPrices": "Mostrar precios de servicios",
  "links": "Enlaces",
  "addLink": "Agregar enlace",
  "removeLink": "Eliminar",
  "linkLabel": "Texto del enlace",
  "linkUrl": "URL",
  "linkType": "Tipo",
  "copyUrl": "Copiar enlace",
  "urlCopied": "¡Enlace copiado!",
  "preview": "Vista previa",
  "editInSettings": "Editar en Configuración",
  "noDescription": "Sin descripción",
  "pageUrl": "URL de la página",
  "sections": {
    "hero": "Información de la Clínica",
    "whatsapp": "WhatsApp",
    "services": "Servicios",
    "contact": "Contacto & Horarios",
    "links": "Enlaces",
    "appearance": "Apariencia"
  },
  "linkTypes": {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "website": "Website",
    "youtube": "YouTube",
    "tiktok": "TikTok",
    "linkedin": "LinkedIn",
    "google_maps": "Google Maps",
    "other": "Otro"
  },
  "public": {
    "whatsappCta": "Hablar por WhatsApp",
    "services": "Servicios",
    "contact": "Contacto",
    "hours": "Horario de Atención",
    "startingAt": "Desde",
    "minutes": "min",
    "poweredBy": "Powered by",
    "notFound": "Página no encontrada",
    "notFoundDescription": "Esta clínica no tiene una página pública activa."
  }
}
```

**Step 3: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add public page translation keys"
```

---

### Task 8: Sidebar Nav Item

**Files:**
- Modify: `src/components/layout/sidebar-nav.tsx`

**Step 1: Add Globe import and nav item**

Add `Globe` to the lucide-react import:

```ts
import {
  LayoutDashboard,
  MessageSquare,
  CalendarDays,
  UserRound,
  Blocks,
  BarChart3,
  Users,
  Settings,
  Globe,
} from "lucide-react";
```

Add the new item to `NAV_ITEMS` after reports and before team:

```ts
const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { href: "/inbox", icon: MessageSquare, labelKey: "nav.inbox" },
  { href: "/calendar", icon: CalendarDays, labelKey: "nav.calendar" },
  { href: "/patients", icon: UserRound, labelKey: "nav.patients" },
  { href: "/modules", icon: Blocks, labelKey: "nav.modules" },
  { href: "/reports", icon: BarChart3, labelKey: "nav.reports" },
  { href: "/public-page", icon: Globe, labelKey: "nav.publicPage" },
  { href: "/team", icon: Users, labelKey: "nav.team" },
  { href: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;
```

**Step 2: Commit**

```bash
git add src/components/layout/sidebar-nav.tsx
git commit -m "feat: add public page nav item to sidebar"
```

---

### Task 9: Public Page — Layout, Page, Not-Found

**Files:**
- Create: `src/app/(public)/c/[slug]/layout.tsx`
- Create: `src/app/(public)/c/[slug]/page.tsx`
- Create: `src/app/(public)/c/[slug]/not-found.tsx`

**Step 1: Create layout with SEO metadata**

`src/app/(public)/c/[slug]/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import "@/app/globals.css";

interface PublicPageLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PublicPageLayoutProps): Promise<Metadata> {
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

export default function PublicPageLayout({ children }: PublicPageLayoutProps) {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#f8fafc" }}
    >
      {children}
    </div>
  );
}
```

**Step 2: Create the page (Server Component)**

`src/app/(public)/c/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PublicClinicPage } from "@/components/public-page/public-clinic-page";
import type { SocialLink } from "@/types";

interface PageProps {
  params: Promise<{ slug: string }>;
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
        social_links: (clinic.social_links || []) as SocialLink[],
        show_prices: clinic.show_prices ?? true,
      }}
      services={servicesData}
    />
  );
}
```

**Step 3: Create not-found page**

`src/app/(public)/c/[slug]/not-found.tsx`:

```tsx
import Link from "next/link";

export default function PublicPageNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300">404</h1>
        <p className="mt-4 text-lg text-gray-500">
          Esta clínica não possui uma página pública ativa.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/app/(public)/
git commit -m "feat: add public clinic page route with SEO metadata"
```

---

### Task 10: Public Page Component

**Files:**
- Create: `src/components/public-page/public-clinic-page.tsx`

This is the main rendering component used by both the public route (Server Component) and the admin preview (Client Component). It receives all data as props so it can be reused in the live preview.

**Step 1: Create the component**

`src/components/public-page/public-clinic-page.tsx`:

```tsx
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import type { SocialLink } from "@/types";

// Social link icons — use simple text/emoji for each type to avoid importing heavy icon packs
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

interface PublicClinicPageProps {
  clinic: ClinicData;
  services: ServiceData[];
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatPhone(phone: string): string {
  // Format digits-only phone to readable format
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function getWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Add country code if not present
  const fullNumber = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${fullNumber}`;
}

interface DaySchedule {
  start: string;
  end: string;
}

const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo",
};

const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
  sunday: "Dom",
};

function parseOperatingHours(hours: unknown): Record<string, DaySchedule[]> | null {
  if (!hours || typeof hours !== "object") return null;
  return hours as Record<string, DaySchedule[]>;
}

export function PublicClinicPage({ clinic, services }: PublicClinicPageProps) {
  const operatingHours = parseOperatingHours(clinic.operating_hours);
  const fullAddress = [clinic.address, clinic.city, clinic.state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* Hero Section */}
      <div className="text-center">
        {clinic.logo_url ? (
          <img
            src={clinic.logo_url}
            alt={clinic.name}
            className="mx-auto size-24 rounded-full border-2 border-white object-cover shadow-md"
          />
        ) : (
          <div
            className="mx-auto flex size-24 items-center justify-center rounded-full text-3xl font-bold text-white shadow-md"
            style={{ backgroundColor: clinic.accent_color }}
          >
            {clinic.name.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 className="mt-4 text-2xl font-bold text-gray-900">{clinic.name}</h1>

        {clinic.type && (
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${clinic.accent_color}15`,
              color: clinic.accent_color,
            }}
          >
            {clinic.type}
          </span>
        )}

        {clinic.description && (
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            {clinic.description}
          </p>
        )}
      </div>

      {/* WhatsApp CTA */}
      {clinic.phone && (
        <a
          href={getWhatsAppUrl(clinic.phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ backgroundColor: "#25D366" }}
        >
          <MessageCircle className="size-5" />
          Falar no WhatsApp
        </a>
      )}

      {/* Services */}
      {services.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Serviços
          </h2>
          <div className="space-y-2">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">{service.name}</p>
                  <p className="text-xs text-gray-400">
                    <Clock className="mr-1 inline size-3" />
                    {service.duration_minutes} min
                  </p>
                </div>
                {service.price_cents !== null && (
                  <span
                    className="text-sm font-semibold"
                    style={{ color: clinic.accent_color }}
                  >
                    {formatCents(service.price_cents)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact & Hours */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Contato
        </h2>
        <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          {fullAddress && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 text-sm text-gray-600 hover:text-gray-900"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-gray-400" />
              <span>{fullAddress}</span>
            </a>
          )}

          {clinic.phone && (
            <a
              href={`tel:+55${clinic.phone.replace(/\D/g, "")}`}
              className="flex items-center gap-3 text-sm text-gray-600 hover:text-gray-900"
            >
              <Phone className="size-4 shrink-0 text-gray-400" />
              <span>{formatPhone(clinic.phone)}</span>
            </a>
          )}

          {clinic.email && (
            <a
              href={`mailto:${clinic.email}`}
              className="flex items-center gap-3 text-sm text-gray-600 hover:text-gray-900"
            >
              <Mail className="size-4 shrink-0 text-gray-400" />
              <span>{clinic.email}</span>
            </a>
          )}
        </div>
      </div>

      {/* Operating Hours */}
      {operatingHours && Object.keys(operatingHours).length > 0 && (
        <div className="mt-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Horário de Funcionamento
          </h2>
          <div className="space-y-1.5 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            {Object.entries(WEEKDAY_LABELS).map(([day, label]) => {
              const slots = operatingHours[day];
              const hasSlots = slots && slots.length > 0;
              return (
                <div key={day} className="flex items-center justify-between text-sm">
                  <span className={hasSlots ? "font-medium text-gray-700" : "text-gray-400"}>
                    {WEEKDAY_SHORT[day]}
                  </span>
                  <span className={hasSlots ? "text-gray-600" : "text-gray-300"}>
                    {hasSlots
                      ? slots.map((s) => `${s.start}–${s.end}`).join(", ")
                      : "Fechado"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Social Links */}
      {clinic.social_links.length > 0 && (
        <div className="mt-8 space-y-2">
          {clinic.social_links.map((link, index) => (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.01]"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{LINK_TYPE_ICONS[link.type] || "🔗"}</span>
                <span className="font-medium text-gray-900">{link.label}</span>
              </div>
              <ExternalLink className="size-4 text-gray-400" />
            </a>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pb-8 text-center">
        <p className="text-xs text-gray-300">
          Powered by{" "}
          <span className="font-semibold" style={{ color: clinic.accent_color }}>
            Órbita
          </span>
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Verify the build compiles**

Run: `npx next build` (or `npm run build`)

**Step 3: Commit**

```bash
git add src/components/public-page/public-clinic-page.tsx
git commit -m "feat: add public clinic page component with all sections"
```

---

### Task 11: Admin Editor Page

**Files:**
- Create: `src/app/(dashboard)/public-page/page.tsx`
- Create: `src/app/(dashboard)/public-page/loading.tsx`

This is the most complex component — split-screen editor with live preview.

**Step 1: Create loading state**

`src/app/(dashboard)/public-page/loading.tsx`:

```tsx
import { PageContainer } from "@/components/layout/page-container";
import { Spinner } from "@/components/ui/spinner";

export default function PublicPageLoading() {
  return (
    <PageContainer>
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    </PageContainer>
  );
}
```

**Step 2: Create the editor page**

`src/app/(dashboard)/public-page/page.tsx`:

```tsx
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

  // Fetch initial data
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
      <PageHeader title={t("title")} description={t("description")} />

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

            {config.slug && (
              <div className="mt-4 flex items-center gap-2">
                <div
                  className="flex-1 truncate rounded-lg px-3 py-2 text-xs font-mono"
                  style={{
                    backgroundColor: "var(--background)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {pageUrl}
                </div>
                <button
                  onClick={copyUrl}
                  className="rounded-lg p-2 transition-colors hover:bg-white/10"
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
                  className="rounded-lg p-2 transition-colors hover:bg-white/10"
                >
                  <ExternalLink className="size-4" style={{ color: "var(--text-secondary)" }} />
                </a>
              </div>
            )}
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
                      borderColor: "var(--border)",
                      border: "1px solid",
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

          {/* Clinic Info Reference */}
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
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {clinicInfo?.name || "—"} · {clinicInfo?.type || t("noDescription")}
            </p>
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
            {/* Phone frame */}
            <div
              className="mx-auto overflow-hidden rounded-[2rem] border-4 shadow-xl"
              style={{
                maxWidth: "375px",
                borderColor: "var(--border-strong)",
                backgroundColor: "#f8fafc",
              }}
            >
              {/* Notch */}
              <div className="flex justify-center py-2" style={{ backgroundColor: "#f8fafc" }}>
                <div className="h-5 w-28 rounded-full bg-gray-200" />
              </div>
              {/* Content */}
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
```

**Step 3: Verify the build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

**Step 4: Commit**

```bash
git add src/app/(dashboard)/public-page/
git commit -m "feat: add public page editor with live preview"
```

---

### Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add public page API routes to the Settings API Routes table**

Add row:
```
| `/api/settings/public-page` | GET, PUT | Public page config (accent color, links, toggle) |
```

**Step 2: Add public API routes section**

```markdown
### Public API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/public/clinics/[slug]` | GET | Public clinic data + services (no auth, admin client) |
```

**Step 3: Update DB Conventions section**

Add:
- `clinics.public_page_enabled` — toggle for public page visibility
- `clinics.accent_color` — hex color for public page branding
- `clinics.social_links` — JSONB array of `{ type, url, label }`
- `clinics.show_prices` — toggle for showing service prices on public page

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add public page routes and DB columns to CLAUDE.md"
```

---

### Task 13: Final Integration Test

**Step 1: Run the full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 2: Start dev server and test manually**

Run: `npm run dev`

Test checklist:
- [ ] Navigate to `/public-page` from sidebar — editor loads
- [ ] Toggle enable/disable works
- [ ] Color picker updates preview in real-time
- [ ] Add/remove links works
- [ ] Save persists changes (refresh page to verify)
- [ ] Navigate to `/c/{slug}` in incognito — public page renders (when enabled)
- [ ] Navigate to `/c/{slug}` when disabled — 404 page shows
- [ ] WhatsApp button links correctly
- [ ] Services display with/without prices
- [ ] Contact info and hours display correctly
- [ ] Social links open in new tab

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete public clinic page (Linktree-style)"
```
