# Phase 3: Web Platform Shell + Onboarding — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete web experience shell — sidebar, all 6 screens with functional skeletons, onboarding wizard, theme toggle, and locale switcher. After this phase, the platform looks and feels like a real product.

**Architecture:** `(dashboard)` route group with shared sidebar layout. UI primitive components in `src/components/ui/`. Layout components in `src/components/layout/`. Theme/locale state via React Context. Onboarding as `(onboarding)` route group with progress bar layout.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 CSS variables, Radix UI (Dialog, Dropdown, Tooltip), Lucide icons, next-intl.

---

## Task 1: UI Primitive Components (Button, Input, Card, Badge, Avatar, Spinner, Skeleton)

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/avatar.tsx`
- Create: `src/components/ui/spinner.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Delete: `src/components/ui/.gitkeep`

These are pure presentational components used across all screens. All use CSS variables from `globals.css`.

**Step 1: Create `src/components/ui/button.tsx`**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]",
  secondary:
    "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.10)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]",
  danger:
    "bg-[rgba(239,68,68,0.15)] text-[var(--danger)] hover:bg-[rgba(239,68,68,0.25)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:opacity-70 disabled:pointer-events-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, type ButtonProps };
```

**Step 2: Create `src/components/ui/input.tsx`**

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = "", ...props }, ref) => {
    return (
      <div>
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] ${className}`}
          style={{
            backgroundColor: "var(--surface)",
            borderColor: error ? "var(--danger)" : "var(--border)",
            color: "var(--text-primary)",
          }}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input, type InputProps };
```

**Step 3: Create `src/components/ui/card.tsx`**

```tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}

export function Card({ children, className = "", interactive = false }: CardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${interactive ? "hover:border-[var(--border-strong)] transition-colors cursor-pointer" : ""} ${className}`}
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {children}
    </div>
  );
}
```

**Step 4: Create `src/components/ui/badge.tsx`**

```tsx
type BadgeVariant = "success" | "warning" | "danger" | "accent" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-[rgba(34,197,94,0.15)] text-[var(--success)]",
  warning: "bg-[rgba(245,158,11,0.15)] text-[var(--warning)]",
  danger: "bg-[rgba(239,68,68,0.15)] text-[var(--danger)]",
  accent: "bg-[rgba(139,92,246,0.15)] text-[var(--accent)]",
  neutral: "bg-[rgba(255,255,255,0.06)] text-[var(--text-muted)]",
};

export function Badge({ children, variant = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
```

**Step 5: Create `src/components/ui/avatar.tsx`**

```tsx
type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: AvatarSize;
}

const sizeStyles: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Avatar({ src, name, size = "md" }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover ${sizeStyles[size]}`}
      />
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full font-medium ${sizeStyles[size]}`}
      style={{
        backgroundColor: "var(--accent-muted)",
        color: "var(--accent)",
      }}
    >
      {getInitials(name)}
    </div>
  );
}
```

**Step 6: Create `src/components/ui/spinner.tsx`**

```tsx
type SpinnerSize = "sm" | "md" | "lg";

interface SpinnerProps {
  size?: SpinnerSize;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-8",
};

export function Spinner({ size = "md" }: SpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full border-2 ${sizeStyles[size]}`}
      style={{
        borderColor: "var(--border)",
        borderTopColor: "var(--accent)",
      }}
    />
  );
}
```

**Step 7: Create `src/components/ui/skeleton.tsx`**

```tsx
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md ${className}`}
      style={{ backgroundColor: "var(--surface-elevated)" }}
    />
  );
}
```

**Step 8: Delete `src/components/ui/.gitkeep`**

**Step 9: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 10: Commit**

```bash
git add src/components/ui/
git commit -m "add ui primitive components (button, input, card, badge, avatar, spinner, skeleton)"
```

---

## Task 2: Theme Provider + Theme Toggle

**Files:**
- Create: `src/contexts/theme-provider.tsx`
- Create: `src/components/shared/theme-toggle.tsx`
- Delete: `src/contexts/.gitkeep`

**Step 1: Create `src/contexts/theme-provider.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored) {
      setTheme(stored);
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <ThemeContext value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
```

**Step 2: Create `src/components/shared/theme-toggle.tsx`**

```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
      style={{ color: "var(--text-secondary)" }}
    >
      {theme === "dark" ? (
        <Sun className="size-5" strokeWidth={1.75} />
      ) : (
        <Moon className="size-5" strokeWidth={1.75} />
      )}
    </button>
  );
}
```

**Step 3: Delete `src/contexts/.gitkeep`**

**Step 4: Update root layout to include ThemeProvider**

In `src/app/layout.tsx`, wrap children with `ThemeProvider`:

```tsx
import { ThemeProvider } from "@/contexts/theme-provider";
// ... existing imports

export default async function RootLayout({ children }: ...) {
  // ... existing code
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 5: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 6: Commit**

```bash
git add src/contexts/ src/components/shared/ src/app/layout.tsx
git commit -m "add theme provider and toggle (dark/light mode)"
```

---

## Task 3: Locale Switcher

**Files:**
- Create: `src/components/shared/locale-switcher.tsx`
- Delete: `src/components/shared/.gitkeep`

**Step 1: Create `src/components/shared/locale-switcher.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { type Locale, locales } from "@/i18n/config";

const localeLabels: Record<Locale, { flag: string; code: string }> = {
  "pt-BR": { flag: "🇧🇷", code: "BR" },
  en: { flag: "🇺🇸", code: "EN" },
  es: { flag: "🇪🇸", code: "ES" },
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  function handleChange(newLocale: string) {
    startTransition(() => {
      document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
      window.location.reload();
    });
  }

  const current = localeLabels[locale as Locale] || localeLabels["pt-BR"];

  return (
    <div className="relative">
      <select
        value={locale}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="appearance-none rounded-lg border px-3 py-1.5 text-xs font-medium outline-none transition-colors cursor-pointer"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        {locales.map((loc) => {
          const label = localeLabels[loc];
          return (
            <option key={loc} value={loc}>
              {label.flag} {label.code}
            </option>
          );
        })}
      </select>
    </div>
  );
}
```

**Step 2: Delete `src/components/shared/.gitkeep` (if it still exists after Task 2)**

**Step 3: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 4: Commit**

```bash
git add src/components/shared/
git commit -m "add locale switcher component"
```

---

## Task 4: Sidebar + Dashboard Layout

**Files:**
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/sidebar-nav.tsx`
- Create: `src/components/layout/sidebar-user-menu.tsx`
- Create: `src/components/layout/page-header.tsx`
- Create: `src/components/layout/page-container.tsx`
- Create: `src/app/(dashboard)/layout.tsx`
- Delete: `src/components/layout/.gitkeep`

This is the core shell layout. The sidebar has 3 modes: expanded, collapsed, mobile overlay.

**Step 1: Create `src/components/layout/sidebar-nav.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  Blocks,
  BarChart3,
  Users,
  Settings,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { href: "/inbox", icon: MessageSquare, labelKey: "nav.inbox" },
  { href: "/modules", icon: Blocks, labelKey: "nav.modules" },
  { href: "/reports", icon: BarChart3, labelKey: "nav.reports" },
  { href: "/team", icon: Users, labelKey: "nav.team" },
  { href: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;

interface SidebarNavProps {
  collapsed: boolean;
}

export function SidebarNav({ collapsed }: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <Tooltip.Provider delayDuration={0}>
      <nav className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const label = t(item.labelKey);

          const linkContent = (
            <Link
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--accent-muted)] text-[var(--accent)] border-l-[3px] border-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon className="size-5 shrink-0" strokeWidth={1.75} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip.Root key={item.href}>
                <Tooltip.Trigger asChild>{linkContent}</Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="right"
                    sideOffset={8}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{
                      backgroundColor: "var(--surface-elevated)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {label}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}
      </nav>
    </Tooltip.Provider>
  );
}
```

**Step 2: Create `src/components/layout/sidebar-user-menu.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";

interface SidebarUserMenuProps {
  collapsed: boolean;
  userName: string;
  userEmail: string;
}

export function SidebarUserMenu({ collapsed, userName, userEmail }: SidebarUserMenuProps) {
  const router = useRouter();
  const t = useTranslations("common");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
      <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
        <Avatar name={userName} size="sm" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {userName}
            </p>
            <p
              className="truncate text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {userEmail}
            </p>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={handleLogout}
            className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            style={{ color: "var(--text-muted)" }}
            title={t("logout")}
          >
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Create `src/components/layout/sidebar.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { PanelLeftClose, PanelLeft, Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { SidebarUserMenu } from "./sidebar-user-menu";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";

interface SidebarProps {
  clinicName: string;
  userName: string;
  userEmail: string;
}

export function Sidebar({ clinicName, userName, userEmail }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg p-2 lg:hidden"
        style={{ color: "var(--text-primary)" }}
      >
        <Menu className="size-5" strokeWidth={1.75} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-200 ${
          mobileOpen
            ? "translate-x-0 w-[280px]"
            : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-16" : "lg:w-[260px]"}`}
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header: clinic name + collapse toggle */}
        <div className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
          {!collapsed && (
            <span
              className="truncate text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {clinicName}
            </span>
          )}
          {/* Close button (mobile) */}
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 lg:hidden"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
          {/* Collapse toggle (desktop) */}
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-1 transition-colors hover:bg-[rgba(255,255,255,0.04)] lg:block"
            style={{ color: "var(--text-muted)" }}
          >
            {collapsed ? (
              <PanelLeft className="size-5" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="size-5" strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav collapsed={collapsed} />
        </div>

        {/* Bottom section: locale + theme + user */}
        <div className="space-y-2">
          {!collapsed && (
            <div className="flex items-center justify-between px-4">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          )}
          <SidebarUserMenu
            collapsed={collapsed}
            userName={userName}
            userEmail={userEmail}
          />
        </div>
      </aside>
    </>
  );
}
```

**Step 4: Create `src/components/layout/page-header.tsx`**

```tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

**Step 5: Create `src/components/layout/page-container.tsx`**

```tsx
interface PageContainerProps {
  children: React.ReactNode;
}

export function PageContainer({ children }: PageContainerProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
```

**Step 6: Create `src/app/(dashboard)/layout.tsx`**

This layout wraps all protected screens. It fetches the user session and clinic data from Supabase.

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch clinic info using admin client (bypasses RLS)
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role, clinics(name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const clinicName = (membership?.clinics as { name: string } | null)?.name || "My Clinic";
  const userName = user.user_metadata?.full_name || user.email || "User";
  const userEmail = user.email || "";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>
      <Sidebar
        clinicName={clinicName}
        userName={userName}
        userEmail={userEmail}
      />
      <main
        className="lg:pl-[260px] transition-all duration-200 min-h-screen pt-14 lg:pt-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 0% 0%, rgba(139, 92, 246, 0.04) 0%, transparent 50%)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
```

**Step 7: Delete `src/components/layout/.gitkeep`**

**Step 8: Add `logout` key to translation files**

In all 3 messages files, add `"logout"` to `common`:
- pt-BR: `"logout": "Sair"`
- en: `"logout": "Logout"`
- es: `"logout": "Cerrar sesión"`

**Step 9: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 10: Commit**

```bash
git add src/components/layout/ src/app/(dashboard)/ messages/
git commit -m "add sidebar, layout components, and dashboard shell"
```

---

## Task 5: Error Boundary Files (loading, error, not-found)

**Files:**
- Create: `src/app/(dashboard)/loading.tsx`
- Create: `src/app/(dashboard)/error.tsx`
- Create: `src/app/(dashboard)/not-found.tsx`

**Step 1: Create `src/app/(dashboard)/loading.tsx`**

```tsx
import { Spinner } from "@/components/ui/spinner";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
```

**Step 2: Create `src/app/(dashboard)/error.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  return (
    <PageContainer>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          {t("error")}
        </p>
        <Button variant="secondary" onClick={reset}>
          {t("tryAgain")}
        </Button>
      </div>
    </PageContainer>
  );
}
```

**Step 3: Create `src/app/(dashboard)/not-found.tsx`**

```tsx
import { PageContainer } from "@/components/layout/page-container";

export default function DashboardNotFound() {
  return (
    <PageContainer>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
          404
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Page not found
        </p>
      </div>
    </PageContainer>
  );
}
```

**Step 4: Add `tryAgain` key to translation files**

- pt-BR: `"tryAgain": "Tentar novamente"`
- en: `"tryAgain": "Try again"`
- es: `"tryAgain": "Intentar de nuevo"`

**Step 5: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 6: Commit**

```bash
git add src/app/(dashboard)/ messages/
git commit -m "add loading, error, and not-found pages for dashboard"
```

---

## Task 6: Dashboard Screen (Shell)

**Files:**
- Create: `src/app/(dashboard)/page.tsx`
- Modify: `src/app/page.tsx` (move or redirect — this becomes the dashboard)

The root `/` is now the dashboard. The old `src/app/page.tsx` should be replaced.

**Step 1: Replace `src/app/page.tsx` with a redirect**

Since the `(dashboard)` route group handles `/`, we need to move the page there.

Delete the old `src/app/page.tsx` and create `src/app/(dashboard)/page.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <div className="mt-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["kpi.appointments", "kpi.confirmations", "kpi.noShows", "kpi.nps"].map(
            (key) => (
              <Card key={key}>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {t(key)}
                </p>
                <p
                  className="mt-2 text-3xl font-bold font-mono"
                  style={{ color: "var(--text-primary)" }}
                >
                  —
                </p>
                <Skeleton className="mt-3 h-10 w-full" />
              </Card>
            )
          )}
        </div>

        {/* Visual Funnel Placeholder */}
        <Card>
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("funnel")}
          </p>
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>

        {/* Alerts List Placeholder */}
        <Card>
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("alerts")}
          </p>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
```

**Step 2: Update translations**

Add `dashboard` keys to all 3 locale files:

pt-BR:
```json
"dashboard": {
  "title": "Painel",
  "kpi.appointments": "Consultas hoje",
  "kpi.confirmations": "Confirmações pendentes",
  "kpi.noShows": "Faltas",
  "kpi.nps": "NPS médio",
  "funnel": "Funil de conversão",
  "alerts": "Alertas recentes"
}
```

en:
```json
"dashboard": {
  "title": "Dashboard",
  "kpi.appointments": "Appointments today",
  "kpi.confirmations": "Pending confirmations",
  "kpi.noShows": "No-shows",
  "kpi.nps": "Average NPS",
  "funnel": "Conversion funnel",
  "alerts": "Recent alerts"
}
```

es:
```json
"dashboard": {
  "title": "Panel",
  "kpi.appointments": "Consultas hoy",
  "kpi.confirmations": "Confirmaciones pendientes",
  "kpi.noShows": "Ausencias",
  "kpi.nps": "NPS promedio",
  "funnel": "Embudo de conversión",
  "alerts": "Alertas recientes"
}
```

**Step 3: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 4: Commit**

```bash
git add src/app/ messages/
git commit -m "add dashboard shell with kpi cards, funnel, and alerts placeholders"
```

---

## Task 7: Remaining 5 Screen Shells (Inbox, Modules, Reports, Team, Settings)

**Files:**
- Create: `src/app/(dashboard)/inbox/page.tsx`
- Create: `src/app/(dashboard)/modules/page.tsx`
- Create: `src/app/(dashboard)/reports/page.tsx`
- Create: `src/app/(dashboard)/team/page.tsx`
- Create: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Create `src/app/(dashboard)/inbox/page.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function InboxPage() {
  const t = useTranslations("inbox");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Conversation list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="accent">{t("filters.all")}</Badge>
            <Badge variant="neutral">{t("filters.escalated")}</Badge>
            <Badge variant="neutral">{t("filters.resolved")}</Badge>
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} interactive>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </Card>
            ))}
          </div>
        </div>

        {/* Conversation detail */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex min-h-[400px] items-center justify-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("selectConversation")}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
```

**Step 2: Create `src/app/(dashboard)/modules/page.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  Star,
  CreditCard,
  RotateCcw,
} from "lucide-react";

const MODULES = [
  { key: "support", icon: MessageSquare },
  { key: "scheduling", icon: Calendar },
  { key: "confirmation", icon: CheckCircle2 },
  { key: "nps", icon: Star },
  { key: "billing", icon: CreditCard },
  { key: "recall", icon: RotateCcw },
] as const;

export default function ModulesPage() {
  const t = useTranslations("modules");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map(({ key, icon: Icon }) => (
          <Card key={key} interactive>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="rounded-lg p-2"
                  style={{ backgroundColor: "var(--accent-muted)" }}
                >
                  <Icon
                    className="size-5"
                    strokeWidth={1.75}
                    style={{ color: "var(--accent)" }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t(`${key}.name`)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t(`${key}.description`)}
                  </p>
                </div>
              </div>
              <Badge variant="success">{t("active")}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
```

**Step 3: Create `src/app/(dashboard)/reports/page.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  const t = useTranslations("reports");

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        actions={
          <Button variant="secondary" disabled>
            {t("exportPdf")}
          </Button>
        }
      />

      <div className="mt-6 space-y-6">
        {/* Period selector placeholder */}
        <div className="flex items-center gap-2">
          <Badge variant="accent">{t("period.7d")}</Badge>
          <Badge variant="neutral">{t("period.30d")}</Badge>
          <Badge variant="neutral">{t("period.90d")}</Badge>
        </div>

        {/* Chart placeholders */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("chart.appointments")}
            </p>
            <Skeleton className="mt-4 h-48 w-full" />
          </Card>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("chart.nps")}
            </p>
            <Skeleton className="mt-4 h-48 w-full" />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
```

**Step 4: Create `src/app/(dashboard)/team/page.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function TeamPage() {
  const t = useTranslations("team");

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        actions={
          <Button variant="primary" disabled>
            {t("invite")}
          </Button>
        }
      />

      <div className="mt-6">
        <Card>
          <div className="space-y-4">
            {/* Placeholder member row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name="Owner User" size="sm" />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {t("placeholder.ownerName")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("placeholder.ownerEmail")}
                  </p>
                </div>
              </div>
              <Badge variant="accent">{t("roles.owner")}</Badge>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
```

**Step 5: Create `src/app/(dashboard)/settings/page.tsx`**

```tsx
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = [
  "tabs.clinic",
  "tabs.professionals",
  "tabs.patients",
  "tabs.integrations",
  "tabs.whatsapp",
] as const;

export default function SettingsPage() {
  const t = useTranslations("settings");

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <div className="mt-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                i === 0
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>

        {/* Content placeholder */}
        <Card>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
```

**Step 6: Update translations for all 5 screens**

Add comprehensive translation keys for inbox, modules, reports, team, settings to all 3 locale files. The translations should include all `t()` keys used in the screens above.

pt-BR additions:
```json
"inbox": {
  "title": "Caixa de Entrada",
  "selectConversation": "Selecione uma conversa",
  "filters.all": "Todas",
  "filters.escalated": "Escaladas",
  "filters.resolved": "Resolvidas"
},
"modules": {
  "title": "Módulos",
  "active": "Ativo",
  "support.name": "Suporte",
  "support.description": "Atendimento e FAQ via WhatsApp",
  "scheduling.name": "Agendamento",
  "scheduling.description": "Marcação de consultas automatizada",
  "confirmation.name": "Confirmação",
  "confirmation.description": "Confirmação de presença pré-consulta",
  "nps.name": "NPS",
  "nps.description": "Pesquisa de satisfação pós-consulta",
  "billing.name": "Cobrança",
  "billing.description": "Envio de links de pagamento",
  "recall.name": "Recall",
  "recall.description": "Reativação de pacientes inativos"
},
"reports": {
  "title": "Relatórios",
  "exportPdf": "Exportar PDF",
  "period.7d": "7 dias",
  "period.30d": "30 dias",
  "period.90d": "90 dias",
  "chart.appointments": "Consultas",
  "chart.nps": "NPS"
},
"team": {
  "title": "Equipe",
  "invite": "Convidar",
  "roles.owner": "Proprietário",
  "roles.reception": "Recepção",
  "placeholder.ownerName": "Usuário proprietário",
  "placeholder.ownerEmail": "owner@clinica.com"
},
"settings": {
  "title": "Configurações",
  "tabs.clinic": "Clínica",
  "tabs.professionals": "Profissionais",
  "tabs.patients": "Pacientes",
  "tabs.integrations": "Integrações",
  "tabs.whatsapp": "WhatsApp"
}
```

Equivalent keys in en.json and es.json (translated appropriately).

**Step 7: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 8: Commit**

```bash
git add src/app/(dashboard)/ messages/
git commit -m "add screen shells for inbox, modules, reports, team, settings"
```

---

## Task 8: Onboarding Wizard

**Files:**
- Create: `src/app/(onboarding)/layout.tsx`
- Create: `src/app/(onboarding)/setup/page.tsx`
- Create: `src/lib/validations/onboarding.ts`

The onboarding wizard is a 5-step flow shown after signup. It uses a multi-step form with client-side state, persisting to Supabase at each step.

**Step 1: Create `src/app/(onboarding)/layout.tsx`**

```tsx
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
```

**Step 2: Create Zod validation schemas in `src/lib/validations/onboarding.ts`**

```ts
import { z } from "zod";

export const clinicDataSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(10).max(15).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(2).optional().or(z.literal("")),
});

export const professionalSchema = z.object({
  name: z.string().min(2).max(100),
  specialty: z.string().max(100).optional().or(z.literal("")),
  durationMinutes: z.number().int().min(5).max(480).default(30),
});

export type ClinicDataInput = z.infer<typeof clinicDataSchema>;
export type ProfessionalInput = z.infer<typeof professionalSchema>;
```

**Step 3: Create `src/app/(onboarding)/setup/page.tsx`**

This is a multi-step client-side wizard. Each step is a section in a single page component with step navigation.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const TOTAL_STEPS = 5;

export default function SetupPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Clinic data
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Step 2: Professionals
  const [profName, setProfName] = useState("");
  const [specialty, setSpecialty] = useState("");

  function nextStep() {
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function prevStep() {
    if (step > 1) setStep(step - 1);
  }

  async function handleComplete() {
    setLoading(true);
    // Save clinic data via Supabase client
    const supabase = createClient();

    // Update clinic if we have data
    if (clinicName) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from("clinic_users")
          .select("clinic_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (membership) {
          await supabase
            .from("clinics")
            .update({ name: clinicName, phone, address })
            .eq("id", membership.clinic_id);

          // Add professional if entered
          if (profName) {
            await supabase.from("professionals").insert({
              clinic_id: membership.clinic_id,
              name: profName,
              specialty: specialty || null,
            });
          }
        }
      }
    }

    router.push("/");
    router.refresh();
  }

  const stepTitles = [
    t("step1.title"),
    t("step2.title"),
    t("step3.title"),
    t("step4.title"),
    t("step5.title"),
  ];

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {stepTitles[step - 1]}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {step}/{TOTAL_STEPS}
          </span>
        </div>
        <div className="h-1.5 rounded-full" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <div
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: "var(--accent)",
              width: `${(step / TOTAL_STEPS) * 100}%`,
            }}
          />
        </div>
      </div>

      <Card>
        {/* Step 1: Clinic Data */}
        {step === 1 && (
          <div className="space-y-4">
            <Input
              id="clinicName"
              label={t("step1.clinicName")}
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              required
            />
            <Input
              id="phone"
              label={t("step1.phone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              id="address"
              label={t("step1.address")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}

        {/* Step 2: Professionals */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step2.description")}
            </p>
            <Input
              id="profName"
              label={t("step2.name")}
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
            />
            <Input
              id="specialty"
              label={t("step2.specialty")}
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            />
          </div>
        )}

        {/* Step 3: Patients */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step3.description")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step3.skipHint")}
            </p>
          </div>
        )}

        {/* Step 4: WhatsApp */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step4.description")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step4.comingSoon")}
            </p>
          </div>
        )}

        {/* Step 5: Modules */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("step5.description")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t("step5.allEnabled")}
            </p>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={prevStep}
            disabled={step === 1}
          >
            {t("back")}
          </Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={nextStep}>{t("next")}</Button>
          ) : (
            <Button onClick={handleComplete} disabled={loading}>
              {loading ? t("finishing") : t("finish")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
```

**Step 4: Add onboarding translations to all 3 locale files**

pt-BR:
```json
"onboarding": {
  "step1.title": "Dados da Clínica",
  "step1.clinicName": "Nome da Clínica",
  "step1.phone": "Telefone",
  "step1.address": "Endereço",
  "step2.title": "Profissionais",
  "step2.description": "Adicione o primeiro profissional da clínica.",
  "step2.name": "Nome",
  "step2.specialty": "Especialidade",
  "step3.title": "Pacientes",
  "step3.description": "Você pode adicionar pacientes manualmente depois.",
  "step3.skipHint": "Importação CSV disponível nas configurações.",
  "step4.title": "WhatsApp",
  "step4.description": "Conecte o WhatsApp Business para ativar os agentes.",
  "step4.comingSoon": "A integração será configurada nas Configurações.",
  "step5.title": "Módulos",
  "step5.description": "Todos os módulos estão ativados por padrão.",
  "step5.allEnabled": "Você pode desativar módulos específicos a qualquer momento.",
  "back": "Voltar",
  "next": "Próximo",
  "finish": "Concluir",
  "finishing": "Concluindo..."
}
```

Equivalent in en.json and es.json.

**Step 5: Add `/setup` to PUBLIC_ROUTES in proxy.ts**

Update `src/proxy.ts`:
```ts
const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback", "/setup"];
```

**Step 6: Verify build**

```bash
npm run typecheck
npm run build
```

**Step 7: Commit**

```bash
git add src/app/(onboarding)/ src/lib/validations/ src/proxy.ts messages/
git commit -m "add onboarding wizard with 5-step setup flow"
```

---

## Task 9: Update Tests + Final Verification

**Files:**
- Modify: `src/__tests__/app/home.test.tsx` (update to test dashboard page)
- Create: `src/__tests__/lib/validations/onboarding.test.ts`

**Step 1: Update home test**

The old home page is now the dashboard. Update the test to reference the correct translations or create a new dashboard test.

Replace `src/__tests__/app/home.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/layout/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

import DashboardPage from "@/app/(dashboard)/page";

describe("DashboardPage", () => {
  it("renders dashboard title", () => {
    render(<DashboardPage />);
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("renders kpi cards", () => {
    render(<DashboardPage />);
    expect(screen.getByText("kpi.appointments")).toBeInTheDocument();
    expect(screen.getByText("kpi.confirmations")).toBeInTheDocument();
    expect(screen.getByText("kpi.noShows")).toBeInTheDocument();
    expect(screen.getByText("kpi.nps")).toBeInTheDocument();
  });
});
```

**Step 2: Create onboarding validation test**

Create `src/__tests__/lib/validations/onboarding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clinicDataSchema, professionalSchema } from "@/lib/validations/onboarding";

describe("clinicDataSchema", () => {
  it("accepts valid clinic data", () => {
    const result = clinicDataSchema.safeParse({
      name: "Clínica Teste",
      phone: "11999999999",
      address: "Rua Teste, 123",
      city: "São Paulo",
      state: "SP",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = clinicDataSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts minimal data (name only)", () => {
    const result = clinicDataSchema.safeParse({
      name: "My Clinic",
    });
    expect(result.success).toBe(true);
  });
});

describe("professionalSchema", () => {
  it("accepts valid professional", () => {
    const result = professionalSchema.safeParse({
      name: "Dr. João",
      specialty: "Clínico Geral",
      durationMinutes: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = professionalSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 3: Run full verification**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

ALL must pass. Fix any issues before committing.

**Step 4: Commit**

```bash
git add src/__tests__/
git commit -m "update tests for dashboard and add onboarding validation tests"
```

---

## Summary

After completing all tasks:

| What | Status |
|------|--------|
| UI primitives (7 components) | Button, Input, Card, Badge, Avatar, Spinner, Skeleton |
| Theme provider + toggle | Dark/light mode with localStorage persistence |
| Locale switcher | 3 locales (BR/EN/ES) with cookie persistence |
| Sidebar (3 modes) | Expanded, collapsed, mobile overlay |
| Dashboard layout | Sidebar + main content with violet glow |
| Error handling | loading.tsx, error.tsx, not-found.tsx |
| Dashboard shell | KPI cards, funnel placeholder, alerts placeholder |
| 5 screen shells | Inbox, Modules, Reports, Team, Settings |
| Onboarding wizard | 5-step setup flow |
| Validation schemas | Clinic data, professional data (Zod) |
| i18n | All strings in 3 locales |
| Tests | Dashboard test, onboarding validation test |

**Next phase:** Phase 4 — Settings + Team (Real CRUD)
