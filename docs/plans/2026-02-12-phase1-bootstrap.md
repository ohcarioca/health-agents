# Phase 1: Project Bootstrap — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the Next.js 16 project with all foundational tooling so `npm run dev`, `npm run build`, and `npm run test` all pass, and the app deploys to Vercel.

**Architecture:** Next.js 16 App Router with `src/` directory, TypeScript strict, Tailwind v4 CSS-first config, Supabase clients (browser/server/admin), next-intl for i18n, Vitest for testing, and `proxy.ts` for auth/locale routing. Dark mode by default with light mode toggle.

**Tech Stack:** Next.js 16.1.6, React 19.2, TypeScript 5, Tailwind CSS 4.1, Supabase JS 2.95, next-intl 4.8, Vitest 4.0, Radix UI, Lucide React, Zod.

---

## Task 1: Initialize Project

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `.env.example`
- Modify: `.gitignore`

**Step 1: Create `package.json`**

```json
{
  "name": "health-agents",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

**Step 2: Install core dependencies**

```bash
npm install next@latest react@latest react-dom@latest
```

**Step 3: Install dev dependencies**

```bash
npm install -D typescript @types/react @types/react-dom @types/node
```

**Step 4: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

**Step 5: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 6: Create `.env.example`**

Document all env vars without secrets. Copy from existing `.env` and replace values with placeholders.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# LangChain / LLM
OPENAI_API_KEY=sk-proj-xxx
OPENAI_MODEL=gpt-5-mini

# Auth
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Gmail OAuth
GOOGLE_GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_GMAIL_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_GMAIL_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/callback
GOOGLE_PUBSUB_TOPIC=projects/your-project/topics/gmail-notifications
GMAIL_WEBHOOK_SECRET=xxx

# Google Calendar
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/integrations/google-calendar/callback

# Meta WhatsApp
META_APP_ID=xxx
NEXT_PUBLIC_META_APP_ID=xxx
META_APP_SECRET=xxx
META_CONFIG_ID=xxx
WHATSAPP_WEBHOOK_VERIFY_TOKEN=xxx
WHATSAPP_TOKEN=xxx
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

# Pagar.me
PAGARME_SECRET_KEY=sk_test_xxx
PAGARME_WEBHOOK_SECRET=xxx
PAGARME_WEBHOOK_USER=xxx
PAGARME_WEBHOOK_PASSWORD=xxx

# Cron
CRON_SECRET=xxx
```

**Step 7: Update `.gitignore`**

Add Next.js 16 specific entries to the existing `.gitignore`:

```gitignore
# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files
.env
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

**Step 8: Verify installation**

```bash
npx next --version
# Expected: Next.js 16.x.x
```

**Step 9: Commit**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json .env.example .gitignore
git commit -m "init next.js 16 project with typescript strict"
```

---

## Task 2: Create Folder Structure

**Files:**
- Create directories per CLAUDE.md conventions

**Step 1: Create all directories**

```bash
mkdir -p src/app
mkdir -p src/components/ui
mkdir -p src/components/layout
mkdir -p src/components/shared
mkdir -p src/lib/agents/registry
mkdir -p src/lib/validations
mkdir -p src/lib/supabase
mkdir -p src/services
mkdir -p src/types
mkdir -p src/contexts
mkdir -p src/i18n
mkdir -p src/__tests__
mkdir -p public
mkdir -p messages
```

**Step 2: Add `.gitkeep` to empty directories** (only the ones that won't have files yet)

```bash
touch src/services/.gitkeep
touch src/types/.gitkeep
touch src/contexts/.gitkeep
touch src/lib/agents/registry/.gitkeep
touch src/lib/validations/.gitkeep
touch src/__tests__/.gitkeep
```

**Step 3: Commit**

```bash
git add -A
git commit -m "add folder structure per claude.md conventions"
```

---

## Task 3: Tailwind v4 + Design Tokens

**Files:**
- Create: `src/app/globals.css`
- Install: `tailwindcss @tailwindcss/postcss postcss`

**Step 1: Install Tailwind v4**

```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

**Step 2: Create `postcss.config.mjs`**

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

**Step 3: Create `src/app/globals.css`**

This is the design system foundation. Every color, font, and spacing token lives here. Refer to `docs/plans/2026-02-12-orbita-ui-design.md` for the full design spec.

```css
@import "tailwindcss";

/* ============================================
   DESIGN TOKENS — Orbita Platform
   Dark mode default, light mode via .light class
   ============================================ */

@theme inline {
  --font-sans: "Geist Sans", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
}

/* --- Dark mode (default) --- */
:root {
  --background: #09090b;
  --surface: #18181b;
  --surface-elevated: #27272a;
  --border: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.12);

  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;

  --accent: #8b5cf6;
  --accent-hover: #7c3aed;
  --accent-muted: rgba(139, 92, 246, 0.15);
  --accent-ring: rgba(139, 92, 246, 0.40);

  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;

  color-scheme: dark;
}

/* --- Light mode --- */
.light {
  --background: #ffffff;
  --surface: #f4f4f5;
  --surface-elevated: #ffffff;
  --border: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.15);

  --text-primary: #09090b;
  --text-secondary: #52525b;
  --text-muted: #a1a1aa;

  --accent: #7c3aed;
  --accent-hover: #6d28d9;
  --accent-muted: rgba(124, 58, 237, 0.10);
  --accent-ring: rgba(124, 58, 237, 0.30);

  color-scheme: light;
}

/* --- Base styles --- */
body {
  background-color: var(--background);
  color: var(--text-primary);
  font-family: var(--font-sans);
}

/* --- Custom scrollbar --- */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}
```

**Step 4: Commit**

```bash
git add postcss.config.mjs src/app/globals.css package.json package-lock.json
git commit -m "add tailwind v4 with design tokens and custom scrollbar"
```

---

## Task 4: Geist Fonts + Root Layout

**Files:**
- Install: `geist`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

**Step 1: Install Geist fonts**

```bash
npm install geist
```

**Step 2: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Órbita",
  description: "Autonomous agent platform for healthcare",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

**Step 3: Create `src/app/page.tsx`**

Minimal placeholder page to verify the app renders.

```tsx
export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Órbita
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          Healthcare agent platform
        </p>
      </div>
    </div>
  );
}
```

**Step 4: Run dev server and verify**

```bash
npm run dev
# Open http://localhost:3000
# Expected: "Órbita" centered on dark background with Geist font
```

**Step 5: Run build to verify production**

```bash
npm run build
# Expected: Build succeeds with no errors
```

**Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx package.json package-lock.json
git commit -m "add geist fonts and root layout with dark theme"
```

---

## Task 5: Supabase Clients

**Files:**
- Install: `@supabase/supabase-js @supabase/ssr server-only`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`

**Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr server-only
```

**Step 2: Create `src/lib/supabase/client.ts`** (browser only)

```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

**Step 3: Create `src/lib/supabase/server.ts`** (SSR — reads cookies/session)

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if you have proxy refreshing sessions.
          }
        },
      },
    }
  );
}
```

**Step 4: Create `src/lib/supabase/admin.ts`** (service role — webhooks, cron)

```ts
import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
```

**Step 5: Run build to verify no import errors**

```bash
npm run build
# Expected: Build succeeds
```

**Step 6: Commit**

```bash
git add src/lib/supabase/ package.json package-lock.json
git commit -m "add supabase clients: browser, server, admin"
```

---

## Task 6: next-intl Setup

**Files:**
- Install: `next-intl`
- Create: `src/i18n/config.ts`
- Create: `src/i18n/request.ts`
- Create: `messages/pt-BR.json`
- Create: `messages/en.json`
- Create: `messages/es.json`
- Modify: `src/app/layout.tsx`

**Step 1: Install next-intl**

```bash
npm install next-intl
```

**Step 2: Create `src/i18n/config.ts`**

```ts
export const locales = ["pt-BR", "en", "es"] as const;
export const defaultLocale = "pt-BR" as const;

export type Locale = (typeof locales)[number];
```

**Step 3: Create `src/i18n/request.ts`**

```ts
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  // Priority: cookie > Accept-Language header > default
  const cookieLocale = cookieStore.get("locale")?.value as Locale | undefined;
  const acceptLanguage = headerStore.get("accept-language");

  let locale: Locale = defaultLocale;

  if (cookieLocale && locales.includes(cookieLocale)) {
    locale = cookieLocale;
  } else if (acceptLanguage) {
    const preferred = acceptLanguage.split(",")[0]?.split(";")[0]?.trim();
    if (preferred && locales.includes(preferred as Locale)) {
      locale = preferred as Locale;
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

**Step 4: Create `messages/pt-BR.json`**

```json
{
  "common": {
    "save": "Salvar",
    "cancel": "Cancelar",
    "delete": "Excluir",
    "edit": "Editar",
    "create": "Criar",
    "loading": "Carregando...",
    "error": "Algo deu errado",
    "success": "Sucesso",
    "back": "Voltar",
    "next": "Próximo",
    "search": "Buscar",
    "noResults": "Nenhum resultado encontrado"
  },
  "app": {
    "title": "Órbita",
    "description": "Plataforma de agentes autônomos para saúde"
  },
  "nav": {
    "dashboard": "Painel",
    "inbox": "Caixa de Entrada",
    "modules": "Módulos",
    "reports": "Relatórios",
    "team": "Equipe",
    "settings": "Configurações"
  },
  "home": {
    "title": "Órbita",
    "subtitle": "Plataforma de agentes para saúde"
  }
}
```

**Step 5: Create `messages/en.json`**

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "loading": "Loading...",
    "error": "Something went wrong",
    "success": "Success",
    "back": "Back",
    "next": "Next",
    "search": "Search",
    "noResults": "No results found"
  },
  "app": {
    "title": "Órbita",
    "description": "Autonomous agent platform for healthcare"
  },
  "nav": {
    "dashboard": "Dashboard",
    "inbox": "Inbox",
    "modules": "Modules",
    "reports": "Reports",
    "team": "Team",
    "settings": "Settings"
  },
  "home": {
    "title": "Órbita",
    "subtitle": "Healthcare agent platform"
  }
}
```

**Step 6: Create `messages/es.json`**

```json
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "edit": "Editar",
    "create": "Crear",
    "loading": "Cargando...",
    "error": "Algo salió mal",
    "success": "Éxito",
    "back": "Volver",
    "next": "Siguiente",
    "search": "Buscar",
    "noResults": "Sin resultados"
  },
  "app": {
    "title": "Órbita",
    "description": "Plataforma de agentes autónomos para salud"
  },
  "nav": {
    "dashboard": "Panel",
    "inbox": "Bandeja de Entrada",
    "modules": "Módulos",
    "reports": "Informes",
    "team": "Equipo",
    "settings": "Configuración"
  },
  "home": {
    "title": "Órbita",
    "subtitle": "Plataforma de agentes para salud"
  }
}
```

**Step 7: Update `next.config.ts`** with next-intl plugin

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

**Step 8: Update `src/app/layout.tsx`** to use NextIntlClientProvider

```tsx
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Órbita",
  description: "Autonomous agent platform for healthcare",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 9: Update `src/app/page.tsx`** to use translations

```tsx
import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {t("title")}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {t("subtitle")}
        </p>
      </div>
    </div>
  );
}
```

**Step 10: Verify dev server**

```bash
npm run dev
# Open http://localhost:3000
# Expected: "Órbita" + "Plataforma de agentes para saúde" (pt-BR default)
```

**Step 11: Verify build**

```bash
npm run build
# Expected: Build succeeds
```

**Step 12: Commit**

```bash
git add src/i18n/ messages/ next.config.ts src/app/layout.tsx src/app/page.tsx package.json package-lock.json
git commit -m "add next-intl with pt-BR, en, es locale support"
```

---

## Task 7: Proxy (Auth + Locale)

**Files:**
- Create: `src/proxy.ts`

**Step 1: Create `src/proxy.ts`**

This replaces `middleware.ts` in Next.js 16. Handles Supabase session refresh and locale cookie.

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  // Refresh Supabase auth session on every request
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh the session — this keeps the auth token alive
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
```

**Step 2: Verify dev server still works**

```bash
npm run dev
# Open http://localhost:3000
# Expected: Page renders normally, no errors in console
```

**Step 3: Verify build**

```bash
npm run build
# Expected: Build succeeds
```

**Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "add proxy.ts for supabase session refresh"
```

---

## Task 8: Install Remaining Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Zod**

```bash
npm install zod
```

**Step 2: Install Lucide React**

```bash
npm install lucide-react
```

**Step 3: Install Radix UI primitives**

```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover @radix-ui/react-tooltip
```

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "add zod, lucide-react, radix ui primitives"
```

---

## Task 9: Vitest Setup

**Files:**
- Install: `vitest @testing-library/react @testing-library/jest-dom jsdom`
- Create: `vitest.config.ts`
- Create: `src/__tests__/setup.ts`
- Create: `src/__tests__/app/home.test.tsx`

**Step 1: Install test dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
```

**Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**Step 3: Create `src/__tests__/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

**Step 4: Write the smoke test**

Create `src/__tests__/app/home.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      title: "Órbita",
      subtitle: "Healthcare agent platform",
    };
    return messages[key] ?? key;
  },
}));

describe("HomePage", () => {
  it("renders the title", () => {
    render(<HomePage />);
    expect(screen.getByText("Órbita")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<HomePage />);
    expect(screen.getByText("Healthcare agent platform")).toBeInTheDocument();
  });
});
```

**Step 5: Run test to verify it passes**

```bash
npm run test
# Expected: 2 tests pass
```

**Step 6: Commit**

```bash
git add vitest.config.ts src/__tests__/ package.json package-lock.json
git commit -m "add vitest with react testing library and smoke test"
```

---

## Task 10: ESLint Setup

**Files:**
- Install: `eslint @eslint/js @next/eslint-plugin-next typescript-eslint eslint-plugin-react-hooks`
- Create: `eslint.config.mjs`

Next.js 16 removed `next lint`. Use ESLint CLI directly with flat config.

**Step 1: Install ESLint**

```bash
npm install -D eslint @eslint/js @next/eslint-plugin-next typescript-eslint eslint-plugin-react-hooks
```

**Step 2: Create `eslint.config.mjs`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    ignores: [".next/", "node_modules/", "coverage/"],
  },
];
```

**Step 3: Run lint**

```bash
npm run lint
# Expected: No errors (or only minor warnings to fix)
```

Fix any lint errors that appear.

**Step 4: Commit**

```bash
git add eslint.config.mjs package.json package-lock.json
git commit -m "add eslint flat config with next.js and typescript rules"
```

---

## Task 11: Clean Up + Final Verification

**Files:**
- Remove: `src/services/.gitkeep`, `src/types/.gitkeep`, etc. (only if still empty after setup)
- Verify: all scripts work

**Step 1: Remove `.gitkeep` files from directories that now have content**

Check which `.gitkeep` files are no longer needed:

```bash
# Keep .gitkeep only in truly empty directories
# Remove from directories that now have files
```

**Step 2: Run all verification commands**

```bash
# Type checking
npm run typecheck
# Expected: No errors

# Linting
npm run lint
# Expected: No errors

# Tests
npm run test
# Expected: All tests pass

# Build
npm run build
# Expected: Build succeeds
```

**Step 3: Fix any errors from the verification step**

Address TypeScript errors, lint warnings, or test failures one at a time.

**Step 4: Run dev server final check**

```bash
npm run dev
# Open http://localhost:3000
# Verify:
# 1. Dark background with centered "Órbita" text
# 2. Geist font rendering
# 3. No console errors
# 4. Custom scrollbar visible on scrollable content
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "phase 1 complete: project bootstrap with all tooling"
```

---

## Summary

After completing all tasks, the project has:

| What | Status |
|------|--------|
| Next.js 16 with App Router | Configured |
| TypeScript strict mode | Enabled |
| Tailwind CSS v4 (CSS-first) | Design tokens in `globals.css` |
| Geist Sans + Mono fonts | Loaded via `next/font` |
| Supabase clients (3 files) | `client.ts`, `server.ts`, `admin.ts` |
| next-intl (3 locales) | `pt-BR`, `en`, `es` with messages |
| proxy.ts | Session refresh, route matching |
| Vitest + RTL | Configured with smoke test |
| ESLint flat config | Next.js + TypeScript rules |
| Zod | Installed (used in Phase 2+) |
| Lucide React | Installed (used in Phase 3+) |
| Radix UI | Dialog, Dropdown, Popover, Tooltip installed |
| Design tokens | Dark/light mode CSS variables |
| Custom scrollbar | 6px thin scrollbar |
| Folder structure | Per CLAUDE.md conventions |

**Next phase:** Phase 2 — Database Schema + Auth
