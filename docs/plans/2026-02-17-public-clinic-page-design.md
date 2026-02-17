# Public Clinic Page (Linktree-style)

## Summary

Each clinic gets a public page at `/c/{slug}` displaying clinic info, services, WhatsApp CTA, contact details, and custom links. An admin editor at `/public-page` provides split-screen editing with live preview.

## Decisions

- **URL pattern:** Path-based (`/c/[slug]`), not subdomain
- **Storage:** New columns on `clinics` table (JSONB for social links)
- **Customization:** Accent color only (no theme/fonts/layout options)
- **Links:** Dynamic list (type + url + label), Linktree-style
- **Editor:** Split-screen with live preview, no duplication of existing Settings fields

## Database — Migration 013

New columns on `clinics`:

```sql
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS public_page_enabled boolean DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#0EA5E9';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[]';
```

`social_links` schema (validated with Zod):
```ts
interface SocialLink {
  type: 'instagram' | 'facebook' | 'website' | 'youtube' | 'tiktok' | 'linkedin' | 'google_maps' | 'other';
  url: string;
  label: string;
}
```

Existing columns reused: `name`, `slug`, `type`, `description`, `logo_url`, `phone`, `email`, `address`, `city`, `state`, `operating_hours`, `google_reviews_url`.

Services come from `services` table (name, duration, price_cents).

## Routes

### Public (no auth)

| Route | Type | Purpose |
|-------|------|---------|
| `(public)/c/[slug]/page.tsx` | Server Component | Renders public clinic page |
| `(public)/c/[slug]/layout.tsx` | Layout | Clean layout, SEO metadata |
| `(public)/c/[slug]/not-found.tsx` | Error page | Custom 404 |
| `GET /api/public/clinics/[slug]` | API | Returns clinic data + services (admin client, bypasses RLS) |

### Admin (authenticated)

| Route | Type | Purpose |
|-------|------|---------|
| `(dashboard)/public-page/page.tsx` | Client Component | Editor with live preview |
| `GET/PUT /api/settings/public-page` | API | Read/update public page config |

### Proxy Change

Exclude `/c` from auth matcher in `src/proxy.ts`:
```ts
"/((?!api|c|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
```

## Public Page Layout (top to bottom)

1. **Hero Section**
   - Logo (circular, centered)
   - Clinic name (h1)
   - Type badge (e.g., "Clinica Odontologica")
   - Description paragraph

2. **WhatsApp CTA**
   - Large button with accent_color, WhatsApp icon
   - Links to `https://wa.me/{phone}`

3. **Services**
   - Cards: service name, duration, price ("A partir de R$ X" — lowest across base + professionals)
   - No price shown if none set

4. **Contact & Hours**
   - Address (Google Maps link)
   - Phone (clickable tel:)
   - Email (clickable mailto:)
   - Operating hours grid (compact)

5. **Links (Linktree-style)**
   - Vertical list of buttons/cards
   - Icon per type (instagram, facebook, etc.)
   - Opens in new tab
   - Order from JSONB array

6. **Footer**
   - "Powered by Orbita" with subtle branding

Design: light background, centered card (max-width ~480px), mobile-first, accent_color on buttons and highlights.

## Admin Editor (`/public-page`)

Split-screen layout:

**Left (~50%) — Form:**
- Toggle: enable/disable public page
- URL display with copy button (when enabled)
- Color picker: accent_color
- Links section: add/remove/reorder (type dropdown + URL + label)
- "Mostrar precos" toggle for services section
- Link to Settings for editing clinic info and services

**Right (~50%) — Live Preview:**
- Renders the public page component with current form state
- Updates in real-time as user edits
- Mobile frame for context

## Sidebar

New nav item in `NAV_ITEMS`:
- Label: "Minha Pagina" (`nav.publicPage`)
- Icon: `Globe` (lucide-react)
- Route: `/public-page`
- Position: after "Relatorios", before "Equipe"

## Translation Keys

New namespace `publicPage` in all 3 locale files:
- Page title, section headers, form labels, CTA text
- Link type labels (Instagram, Facebook, etc.)
- Footer text

## SEO

Dynamic metadata on `(public)/c/[slug]/layout.tsx`:
- `og:title` = clinic name
- `og:description` = clinic description
- `og:image` = clinic logo_url (or default Orbita OG image)
- Canonical URL

## Security

- Public API uses `createAdminClient()` — bypasses RLS safely
- Returns 404 if `public_page_enabled = false` (not 403, to avoid leaking existence)
- No sensitive data exposed (no access_token, no patient data)
- social_links validated with Zod on write
