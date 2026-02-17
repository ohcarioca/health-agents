# UI Redesign — Clean & Minimal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the entire UI from dark glassmorphism to a clean, minimal design with solid cards, soft shadows, a new top header bar, and page-by-page layout updates.

**Architecture:** Rewrite CSS tokens first (globals.css), then UI primitives (button, card, input, badge, dialog, skeleton), then layout shell (sidebar + new top bar + dashboard layout), then every page individually. Each task is self-contained and results in a working intermediate state.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (CSS-first config), next-intl, Recharts, Radix UI (Dialog, Tooltip), Lucide icons.

**Design doc:** `docs/plans/2026-02-17-ui-redesign-design.md`

---

## Task 1: Rewrite globals.css — Design Tokens

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Replace the entire globals.css**

The new file replaces the dark-first glassmorphism tokens with a clean minimal system. Light mode is `:root` default visual base (but dark is still the `:root` CSS-wise for theme toggle compatibility). Glass tokens, atmosphere gradients, and glow utilities are removed. Shadow tokens are added.

```css
@import "tailwindcss";

@theme inline {
  --font-sans: "Geist Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
}

/* Dark mode (default) */
:root {
  --background: #0f1117;
  --surface: #1a1d27;
  --surface-elevated: #252836;
  --border: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.14);
  --text-primary: #f0f0f5;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --accent: #8b5cf6;
  --accent-hover: #7c3aed;
  --accent-muted: rgba(139,92,246,0.15);
  --accent-ring: rgba(139,92,246,0.40);
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;
  --sidebar-bg: #141720;
  --topbar-bg: #1a1d27;
  --nav-active-bg: rgba(139,92,246,0.12);
  --nav-active-text: #a78bfa;
  --nav-hover-bg: rgba(255,255,255,0.05);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.5), 0 4px 6px -4px rgba(0,0,0,0.3);
}

/* Light mode */
.light {
  --background: #f8f9fb;
  --surface: #ffffff;
  --surface-elevated: #ffffff;
  --border: rgba(0,0,0,0.06);
  --border-strong: rgba(0,0,0,0.12);
  --text-primary: #1a1a2e;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --accent: #7c3aed;
  --accent-hover: #6d28d9;
  --accent-muted: rgba(124,58,237,0.10);
  --accent-ring: rgba(124,58,237,0.30);
  --sidebar-bg: #ffffff;
  --topbar-bg: #ffffff;
  --nav-active-bg: rgba(124,58,237,0.08);
  --nav-active-text: #7c3aed;
  --nav-hover-bg: rgba(0,0,0,0.04);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04);
}

/* Base styles */
*,
*::before,
*::after {
  border-color: var(--border);
}

body {
  background-color: var(--background);
  color: var(--text-primary);
  font-family: var(--font-sans);
}

/* Custom scrollbar */
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
```

**Key changes from current:**
- Removed: `--glass-*` (6 tokens), `--glass-border-hover`, `--glass-blur`, `--glass-shadow`, `--glass-shadow-lg`, `--glow-accent`, `--glow-accent-strong`, `--atmosphere-primary`, `--atmosphere-dashboard`
- Removed: `.glass`, `.glass-elevated`, `.glow-accent` utility classes
- Added: `--sidebar-bg`, `--topbar-bg`, `--shadow-sm/md/lg`, `--nav-active-text`
- Changed: `--background` (dark) from `#09090b` to `#0f1117` (blued dark)
- Changed: `--surface` (dark) from `#18181b` to `#1a1d27` (blued dark)
- Changed: `--background` (light) from `#ffffff` to `#f8f9fb` (off-white)
- Changed: `--surface` (light) from `#f4f4f5` to `#ffffff` (white cards on off-white)

**Step 2: Verify the app still builds**

Run: `npx next build 2>&1 | head -20`

Expected: Build may show warnings about removed `.glass`/`.glass-elevated` classes in components (these will be fixed in subsequent tasks), but should not crash.

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "refactor: replace glassmorphism tokens with clean minimal design system"
```

---

## Task 2: Restyle UI Primitives — Button, Card, Input, Badge

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/badge.tsx`

**Step 1: Rewrite button.tsx**

Changes:
- Remove `glow-accent` from primary variant
- Make secondary/ghost hover colors theme-aware (remove hardcoded `rgba(255,255,255,...)`)
- Add `h-9`/`h-10`/`h-11` fixed heights to sizes

```tsx
import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm",
  secondary:
    "bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--accent-muted)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
  danger:
    "bg-[rgba(239,68,68,0.1)] text-[var(--danger)] hover:bg-[rgba(239,68,68,0.2)]",
  outline:
    "bg-transparent border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--nav-hover-bg)] hover:border-[var(--text-muted)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
```

**Step 2: Rewrite card.tsx**

Drop `variant` prop (no more glass). One style: surface bg + border + shadow.

```tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}

export function Card({ children, className = "", interactive = false }: CardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${interactive ? "transition-shadow cursor-pointer hover:shadow-md" : ""} ${className}`}
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </div>
  );
}
```

**Step 3: Rewrite input.tsx**

Taller input (`py-2.5`), cleaner focus state.

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
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
          className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] ${className}`}
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
```

**Step 4: Rewrite badge.tsx**

Softer background fills, keep rounded-full.

```tsx
type BadgeVariant = "success" | "warning" | "danger" | "accent" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-[rgba(34,197,94,0.1)] text-[var(--success)]",
  warning: "bg-[rgba(245,158,11,0.1)] text-[var(--warning)]",
  danger: "bg-[rgba(239,68,68,0.1)] text-[var(--danger)]",
  accent: "bg-[var(--accent-muted)] text-[var(--accent)]",
  neutral: "bg-[var(--nav-hover-bg)] text-[var(--text-muted)]",
};

export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
```

**Step 5: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/input.tsx src/components/ui/badge.tsx
git commit -m "refactor: restyle button, card, input, badge primitives for clean minimal design"
```

---

## Task 3: Restyle Dialog and Skeleton

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/skeleton.tsx`

**Step 1: Rewrite dialog.tsx**

Drop `glass-elevated`, use solid surface + shadow-lg. Rounder (`rounded-2xl`). Remove backdrop blur.

```tsx
"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg" | "xl";
}

const sizeClasses = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  size = "md",
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content
          className={`fixed left-1/2 top-1/2 z-50 w-full ${sizeClasses[size]} -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 max-h-[85vh] overflow-y-auto`}
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <RadixDialog.Title
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close
              className="rounded-lg p-1 transition-colors hover:bg-[var(--nav-hover-bg)]"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="size-5" strokeWidth={1.75} />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
```

**Step 2: Update skeleton.tsx**

No structural changes needed — just ensure it uses the token correctly.

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

**Step 3: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/skeleton.tsx
git commit -m "refactor: restyle dialog and skeleton for clean minimal design"
```

---

## Task 4: Create Top Bar Component

**Files:**
- Create: `src/components/layout/top-bar.tsx`

**Step 1: Create the top-bar.tsx component**

This is a new client component with search, notification bell, user menu dropdown (with locale switcher and theme toggle inside).

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, Bell, LogOut, Settings, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface TopBarProps {
  userName: string;
  userEmail: string;
  collapsed: boolean;
}

export function TopBar({ userName, userEmail, collapsed }: TopBarProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header
      className="fixed top-0 right-0 z-40 flex h-16 items-center border-b px-6 transition-all duration-200"
      style={{
        left: collapsed ? "64px" : "240px",
        backgroundColor: "var(--topbar-bg)",
        borderColor: "var(--border)",
      }}
    >
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
          strokeWidth={1.75}
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder="Search..."
          className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <LocaleSwitcher />

        {/* Notification bell */}
        <button
          className="relative rounded-lg p-2 transition-colors hover:bg-[var(--nav-hover-bg)]"
          style={{ color: "var(--text-secondary)" }}
        >
          <Bell className="size-5" strokeWidth={1.75} />
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
          >
            <Avatar name={userName} size="sm" />
            <span
              className="hidden text-sm font-medium md:block"
              style={{ color: "var(--text-primary)" }}
            >
              {userName}
            </span>
            <ChevronDown
              className="hidden size-4 md:block"
              strokeWidth={1.75}
              style={{ color: "var(--text-muted)" }}
            />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-xl border p-1"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {userName}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {userEmail}
                </p>
              </div>
              <button
                onClick={() => { router.push("/settings"); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                style={{ color: "var(--text-secondary)" }}
              >
                <Settings className="size-4" strokeWidth={1.75} />
                Settings
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                style={{ color: "var(--danger)" }}
              >
                <LogOut className="size-4" strokeWidth={1.75} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/layout/top-bar.tsx
git commit -m "feat: add top header bar component with search, notifications, and user menu"
```

---

## Task 5: Restyle Sidebar

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/sidebar-nav.tsx`
- Delete: `src/components/layout/sidebar-user-menu.tsx` (moved to top bar)

**Step 1: Rewrite sidebar.tsx**

Remove bottom section (user menu, locale, theme). Solid background, no blur. Width 240px/64px.

```tsx
"use client";

import { useState, useEffect } from "react";
import { PanelLeftClose, PanelLeft, Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";

interface SidebarProps {
  clinicName: string;
  userName: string;
  userEmail: string;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function Sidebar({ clinicName, onCollapseChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
    onCollapseChange?.(next);
  };

  return (
    <>
      {/* Mobile hamburger */}
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
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } w-[280px] lg:translate-x-0 ${collapsed ? "lg:w-16" : "lg:w-[240px]"}`}
        style={{
          backgroundColor: "var(--sidebar-bg)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex h-16 items-center justify-between border-b px-4"
          style={{ borderColor: "var(--border)" }}
        >
          {!collapsed && (
            <span
              className="truncate text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {clinicName}
            </span>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 lg:hidden"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
          <button
            onClick={toggleCollapse}
            className="hidden rounded-lg p-1 transition-colors hover:bg-[var(--nav-hover-bg)] lg:block"
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
        <nav className="flex-1 overflow-y-auto py-4">
          <SidebarNav collapsed={collapsed} />
        </nav>
      </aside>
    </>
  );
}
```

**Step 2: Update sidebar-nav.tsx**

Update active state classes to use `--nav-active-bg` and `--nav-active-text` tokens. No structural changes — just class updates.

Replace active link classes:
- Old: `bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]`
- New: Same tokens, but they now point to violet tint. Keep the same classes — the CSS variables have changed values.

The nav component itself stays the same since it already references the correct CSS variables. **No changes needed** if the variable values are already updated in globals.css.

**Step 3: Delete sidebar-user-menu.tsx**

This component is no longer imported — its functionality moved to the top bar.

```bash
rm src/components/layout/sidebar-user-menu.tsx
```

**Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/sidebar-nav.tsx
git rm src/components/layout/sidebar-user-menu.tsx
git commit -m "refactor: restyle sidebar, remove user menu (moved to top bar)"
```

---

## Task 6: Update Dashboard Layout

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/layout/page-container.tsx`

**Step 1: Rewrite dashboard layout.tsx**

Add `TopBar`, remove atmosphere overlay, make sidebar width responsive to collapse state. Pass collapse state from sidebar to layout via a client wrapper.

Since the layout is a server component (does auth), we need a client wrapper for the sidebar+topbar state. Create a minimal client shell.

First, create `src/components/layout/dashboard-shell.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface DashboardShellProps {
  clinicName: string;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}

export function DashboardShell({
  clinicName,
  userName,
  userEmail,
  children,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  return (
    <>
      <Sidebar
        clinicName={clinicName}
        userName={userName}
        userEmail={userEmail}
        onCollapseChange={setCollapsed}
      />
      <TopBar userName={userName} userEmail={userEmail} collapsed={collapsed} />
      <main
        className="min-h-screen pt-16 transition-all duration-200"
        style={{
          paddingLeft: collapsed ? "64px" : "240px",
          backgroundColor: "var(--background)",
        }}
      >
        {children}
      </main>
    </>
  );
}
```

Then update `src/app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: clinicUser } = await admin
    .from("clinic_users")
    .select("clinic_id, clinics(name, phone)")
    .eq("user_id", user.id)
    .single();

  if (!clinicUser) redirect("/login");

  const clinic = clinicUser.clinics as { name: string; phone: string | null } | null;
  if (!clinic?.phone) redirect("/setup");

  const userName =
    user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>
      <DashboardShell
        clinicName={clinic.name}
        userName={userName}
        userEmail={user.email || ""}
      >
        {children}
      </DashboardShell>
    </div>
  );
}
```

**Step 2: Update page-container.tsx**

Adjust padding to `px-6 py-6`:

```tsx
interface PageContainerProps {
  children: React.ReactNode;
}

export function PageContainer({ children }: PageContainerProps) {
  return (
    <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/layout/dashboard-shell.tsx src/app/"(dashboard)"/layout.tsx src/components/layout/page-container.tsx
git commit -m "refactor: add dashboard shell with top bar, remove atmosphere overlay"
```

---

## Task 7: Redesign Dashboard Page

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `src/components/dashboard/kpi-card.tsx`
- Modify: `src/components/dashboard/alerts-list.tsx`
- Create: `src/components/dashboard/upcoming-appointments.tsx`
- Add i18n keys to `messages/en.json`, `messages/pt-BR.json`, `messages/es.json`

**Step 1: Add new i18n keys**

Add to `dashboard` section in all 3 locale files:

```json
"upcomingAppointments": "Upcoming Appointments",
"addNew": "Add New",
"service": "Service",
"patient": "Patient",
"dateTime": "Date & Time",
"status": "Status",
"noAppointments": "No appointments for this date",
"secondaryStats": {
  "confirmations": "Confirmations sent",
  "noShows": "No-shows today",
  "escalated": "Escalated"
}
```

**Step 2: Rewrite kpi-card.tsx**

New design: horizontal layout with icon circle left, metric info right, optional delta badge.

```tsx
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  iconBg: string;
  iconColor: string;
}

export function KpiCard({ icon: Icon, label, value, subtitle, iconBg, iconColor }: KpiCardProps) {
  return (
    <div
      className="flex items-center gap-4 rounded-xl border p-5"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="size-6" strokeWidth={1.75} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {label}
        </p>
        <p className="text-2xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Create upcoming-appointments.tsx**

A client component that fetches today's appointments and renders them in a table inside a card.

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

interface Appointment {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  patients: { name: string } | null;
  services: { name: string } | null;
  professionals: { name: string } | null;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "accent"> = {
  scheduled: "accent",
  confirmed: "success",
  completed: "success",
  cancelled: "danger",
  no_show: "warning",
};

export function UpcomingAppointments() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAppointments = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(`/api/calendar/appointments?start=${today}&end=${today}`);
    if (res.ok) {
      const json = await res.json();
      setAppointments(json.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  return (
    <div
      className="rounded-xl border"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-5 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Calendar className="size-5" strokeWidth={1.75} style={{ color: "var(--accent)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {t("upcomingAppointments")}
          </h3>
        </div>
        <Button size="sm" onClick={() => router.push("/calendar")}>
          <Plus className="size-4" strokeWidth={2} />
          {t("addNew")}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : appointments.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {t("noAppointments")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="px-5 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {t("service")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {t("patient")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {t("dateTime")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  {t("status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {appointments.slice(0, 8).map((apt) => (
                <tr
                  key={apt.id}
                  className="border-b transition-colors hover:bg-[var(--nav-hover-bg)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-5 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                    {apt.services?.name || "—"}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>
                    {apt.patients?.name || "—"}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>
                    {apt.start_time}–{apt.end_time}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[apt.status] || "neutral"}>
                      {apt.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Rewrite alerts-list.tsx**

Same data fetching, restyled card wrapper.

Replace `Card variant="glass"` with the new card styling (surface bg + border + shadow). Remove the `variant="glass"` prop (Card no longer supports it). Apply inline card styles directly on a `div`.

Find and replace:
- `<Card variant="glass">` → `<div className="rounded-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-sm)" }}>`
- Closing `</Card>` → `</div>`
- Also add `p-5` class to the outer div for padding

**Step 5: Rewrite dashboard page.tsx**

New layout: 3 KPI cards in a row, then 2/3 + 1/3 grid (appointments + alerts), then secondary stats row.

```tsx
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertsList } from "@/components/dashboard/alerts-list";
import { UpcomingAppointments } from "@/components/dashboard/upcoming-appointments";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicId } from "@/lib/auth";
import { calculateNPS, formatCents } from "@/lib/analytics/kpis";
import {
  Calendar,
  Star,
  DollarSign,
  CheckCircle2,
  UserX,
  MessageSquare,
} from "lucide-react";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const clinicId = await getClinicId();
  const supabase = createAdminClient();

  const today = new Date().toISOString().split("T")[0];

  const [
    { count: appointmentsCount },
    { count: noShowCount },
    { count: confirmationsCount },
    { data: npsData },
    { data: overdueData },
    { count: escalatedCount },
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("date", today),
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("date", today)
      .eq("status", "no_show"),
    supabase
      .from("confirmation_queue")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "sent"),
    supabase
      .from("nps_responses")
      .select("score")
      .eq("clinic_id", clinicId)
      .gte("created_at", `${today}T00:00:00`),
    supabase
      .from("invoices")
      .select("amount_cents")
      .eq("clinic_id", clinicId)
      .eq("status", "overdue"),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "escalated"),
  ]);

  const npsScores = (npsData || []).map((r) => r.score);
  const npsValue = npsScores.length > 0 ? calculateNPS(npsScores) : "—";
  const npsSubtitle =
    npsScores.length > 0
      ? `${npsScores.length} ${t("kpi.responses") || "responses"}`
      : undefined;

  const overdueTotal = (overdueData || []).reduce(
    (sum, inv) => sum + (inv.amount_cents || 0),
    0
  );
  const revenueValue = overdueTotal > 0 ? formatCents(overdueTotal) : "R$ 0";

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      {/* Row 1 — KPI Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={Calendar}
          label={t("kpi.appointments")}
          value={appointmentsCount ?? 0}
          iconBg="rgba(139,92,246,0.12)"
          iconColor="var(--accent)"
        />
        <KpiCard
          icon={Star}
          label={t("kpi.nps")}
          value={npsValue}
          subtitle={npsSubtitle}
          iconBg="rgba(59,130,246,0.12)"
          iconColor="var(--info)"
        />
        <KpiCard
          icon={DollarSign}
          label={t("kpi.revenue")}
          value={revenueValue}
          subtitle={overdueTotal > 0 ? "overdue" : undefined}
          iconBg="rgba(239,68,68,0.12)"
          iconColor="var(--danger)"
        />
      </div>

      {/* Row 2 — Appointments + Alerts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UpcomingAppointments />
        </div>
        <div>
          <AlertsList />
        </div>
      </div>

      {/* Row 3 — Secondary Stats */}
      <div className="mt-6 flex flex-wrap gap-4">
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2"
          style={{ backgroundColor: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
        >
          <CheckCircle2 className="size-4" style={{ color: "var(--success)" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("kpi.confirmations")}:
          </span>
          <span className="text-sm font-semibold font-mono" style={{ color: "var(--text-primary)" }}>
            {confirmationsCount ?? 0}
          </span>
        </div>
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2"
          style={{ backgroundColor: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
        >
          <UserX className="size-4" style={{ color: "var(--warning)" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("kpi.noShows")}:
          </span>
          <span className="text-sm font-semibold font-mono" style={{ color: "var(--text-primary)" }}>
            {noShowCount ?? 0}
          </span>
        </div>
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2"
          style={{ backgroundColor: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
        >
          <MessageSquare className="size-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("kpi.escalated")}:
          </span>
          <span className="text-sm font-semibold font-mono" style={{ color: "var(--text-primary)" }}>
            {escalatedCount ?? 0}
          </span>
        </div>
      </div>
    </PageContainer>
  );
}
```

**Step 6: Commit**

```bash
git add src/app/"(dashboard)"/page.tsx src/components/dashboard/kpi-card.tsx src/components/dashboard/alerts-list.tsx src/components/dashboard/upcoming-appointments.tsx messages/en.json messages/pt-BR.json messages/es.json
git commit -m "feat: redesign dashboard with KPI cards, appointments table, and alerts panel"
```

---

## Task 8: Restyle Calendar Components

**Files:**
- Modify: `src/components/calendar/calendar-view.tsx`
- Modify: `src/components/calendar/appointment-card.tsx`
- Modify: `src/components/calendar/appointment-modal.tsx`
- Modify: `src/components/calendar/week-view.tsx`
- Modify: `src/components/calendar/day-view.tsx`
- Modify: `src/components/calendar/month-view.tsx`

**Step 1: calendar-view.tsx**

Update the view toggle from border-based to a segmented control with pill buttons. Update the calendar body wrapper. Key changes:

- View toggle: wrap in `rounded-lg bg-[var(--background)] p-1`, each button gets `rounded-md px-3 py-1.5 text-xs font-medium`, active = `bg-[var(--accent)] text-white`, inactive = `text-[var(--text-secondary)] hover:text-[var(--text-primary)]`
- Calendar body wrapper: change from `rounded-xl border` to add `shadow-sm` and use `var(--surface)` bg
- Professional filter select: keep styles, just ensure token references are correct

**Step 2: appointment-card.tsx**

Add `rounded-lg` (was `rounded-md`), cleaner shadow on hover. No structural changes — token-driven.

**Step 3: appointment-modal.tsx**

The Dialog component handles the restyling. Just ensure form controls inside use updated input styles (same border/bg tokens). No major structural changes.

**Step 4: week-view.tsx, day-view.tsx, month-view.tsx**

Replace hover states:
- Old: `hover:bg-[rgba(255,255,255,0.02)]`
- New: `hover:bg-[var(--nav-hover-bg)]`

This makes hover states theme-aware (works in both light and dark modes).

**Step 5: Commit**

```bash
git add src/components/calendar/
git commit -m "refactor: restyle calendar components with clean minimal design"
```

---

## Task 9: Restyle Patients Components

**Files:**
- Modify: `src/components/patients/patients-view.tsx`
- Modify: `src/components/patients/patient-form-dialog.tsx`
- Modify: `src/components/patients/patient-import-dialog.tsx`

**Step 1: patients-view.tsx**

Wrap the entire table in a card. Move search + actions into the card header.

Key changes:
- Wrap table section in `div.rounded-xl.border` with `bg: var(--surface)`, `border: var(--border)`, `shadow: var(--shadow-sm)`
- Move search input and action buttons into a card header row with `border-b px-5 py-4`
- Table row hover: change `hover:bg-[rgba(255,255,255,0.02)]` to `hover:bg-[var(--nav-hover-bg)]`
- Action button hover: change `hover:bg-[rgba(255,255,255,0.06)]` to `hover:bg-[var(--nav-hover-bg)]`
- Pagination: style Previous/Next as `rounded-lg` buttons

**Step 2: patient-form-dialog.tsx**

Dialog handles restyling. Textarea needs updated styles:
- `hover:bg-[rgba(255,255,255,0.02)]` → no change needed (remove if not present)
- Ensure textarea uses `bg: var(--surface)`, `border: var(--border)`, `color: var(--text-primary)` (already does)

**Step 3: patient-import-dialog.tsx**

- Upload zone: change `hover:bg-[rgba(255,255,255,0.02)]` to `hover:bg-[var(--nav-hover-bg)]`
- Preview table: same hover token update

**Step 4: Commit**

```bash
git add src/components/patients/
git commit -m "refactor: restyle patients components with card wrapper and clean table design"
```

---

## Task 10: Restyle Inbox Components

**Files:**
- Modify: `src/components/inbox/conversation-list.tsx`
- Modify: `src/components/inbox/conversation-detail.tsx`
- Modify: `src/components/inbox/message-bubble.tsx`

**Step 1: conversation-list.tsx**

- Replace `Card variant="glass" interactive` with a simple `div` using `rounded-lg border p-3 cursor-pointer transition-colors hover:bg-[var(--nav-hover-bg)]` + `bg: var(--surface)`, `border: var(--border)`
- Selected state: replace `ring-2 ring-[var(--accent-ring)]` with a left border accent: `border-l-2 border-l-[var(--accent)]`
- Filter badges: already use Badge component (auto-restyled from Task 2)

**Step 2: conversation-detail.tsx**

- Replace `Card variant="glass"` wrapper with `div` using `rounded-xl border bg-[var(--surface)] shadow-sm`
- Header actions: remove blur references if any
- Input border already uses tokens correctly

**Step 3: message-bubble.tsx**

- User bubble: replace `bg: rgba(255,255,255,0.06), backdropFilter: blur(12px)` with `bg: var(--nav-hover-bg)` (no blur)
- Assistant bubble: keep `bg: var(--accent), color: #ffffff` — no change needed
- System message: replace `bg: rgba(255,255,255,0.06)` with `bg: var(--nav-hover-bg)`
- isHuman badge: replace `bg: rgba(255,255,255,0.15)` with `bg: var(--accent-muted)`

**Step 4: Commit**

```bash
git add src/components/inbox/
git commit -m "refactor: restyle inbox components with clean card and bubble design"
```

---

## Task 11: Restyle Settings Page

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/components/settings/clinic-form.tsx`
- Modify: `src/components/settings/professionals-list.tsx`
- Modify: `src/components/settings/services-list.tsx`
- Modify: `src/components/settings/insurance-plans-list.tsx`

**Step 1: settings/page.tsx — Tab bar**

Replace the underline tab bar with rounded pill tabs:

- Outer: `div.flex.flex-wrap.gap-1.rounded-lg.p-1` with `bg: var(--background)` (creates a recessed strip)
- Each tab: `rounded-lg px-4 py-2 text-sm font-medium transition-colors`
- Active: `bg-[var(--surface)] shadow-sm text-[var(--accent)]`
- Inactive: `text-[var(--text-muted)] hover:text-[var(--text-primary)]`

Remove the `border-b` styling.

**Step 2: professionals-list.tsx, services-list.tsx**

Replace `Card variant="glass"` with the plain Card component (no variant prop). Card is already restyled from Task 2.

- Remove: `variant="glass"` from all `<Card>` usages
- Action button hover: replace `hover:bg-[rgba(255,255,255,0.06)]` with `hover:bg-[var(--nav-hover-bg)]`
- Delete button hover: replace `hover:bg-[rgba(239,68,68,0.1)]` with `hover:bg-[rgba(239,68,68,0.08)]`

**Step 3: insurance-plans-list.tsx**

Chip styling already uses `var(--accent-muted)` — no changes needed beyond removing any glass references.

**Step 4: clinic-form.tsx**

Select dropdowns already use proper tokens. Ensure they use `bg: var(--surface)`, `border: var(--border)`.

**Step 5: Commit**

```bash
git add src/app/"(dashboard)"/settings/page.tsx src/components/settings/
git commit -m "refactor: restyle settings page with pill tabs and clean card design"
```

---

## Task 12: Restyle Reports Components

**Files:**
- Modify: `src/components/reports/appointment-chart.tsx`
- Modify: `src/components/reports/nps-chart.tsx`
- Modify: `src/components/reports/revenue-chart.tsx`
- Modify: `src/components/reports/period-selector.tsx`

**Step 1: All chart components**

Replace `Card variant="glass"` with plain `Card` (no variant prop).

In each file, find: `<Card variant="glass">` and replace with `<Card>`

**Step 2: period-selector.tsx**

Already uses Badge component — auto-restyled. No changes needed.

**Step 3: Commit**

```bash
git add src/components/reports/
git commit -m "refactor: restyle report chart wrappers with clean card design"
```

---

## Task 13: Restyle Modules, Team, Auth, and Onboarding Pages

**Files:**
- Modify: `src/app/(dashboard)/modules/page.tsx`
- Modify: `src/components/team/team-content.tsx`
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`
- Modify: `src/app/(onboarding)/layout.tsx`
- Modify: `src/app/(onboarding)/setup/page.tsx`

**Step 1: modules/page.tsx**

Replace `Card interactive variant="glass"` with `Card interactive`.

**Step 2: team-content.tsx**

Replace `Card variant="glass"` with `Card`.
Replace action hover: `hover:bg-[rgba(255,255,255,0.06)]` → `hover:bg-[var(--nav-hover-bg)]`
Replace danger hover: `hover:bg-[rgba(239,68,68,0.1)]` → `hover:bg-[rgba(239,68,68,0.08)]`

**Step 3: auth/layout.tsx**

Replace the glass card wrapper. Remove atmosphere overlay.

```tsx
import { Zap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-8"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          className="mx-auto mb-6 flex size-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Zap className="size-6 text-white" strokeWidth={2} />
        </div>
        {children}
      </div>
    </div>
  );
}
```

**Step 4: login/page.tsx and signup/page.tsx**

Already use inline styles with correct tokens. Key change:
- Input backgrounds: ensure `bg: var(--surface)` → change to `bg: var(--background)` inside the auth card (since the card is already `var(--surface)`, inputs need a recessed look). Actually, keep `var(--surface)` — in light mode card=white, input=white, border provides distinction. This is fine.
- No structural changes needed — the auth layout handles the card wrapper.

**Step 5: onboarding/layout.tsx**

Remove atmosphere overlay:

```tsx
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
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

**Step 6: onboarding/setup/page.tsx**

Replace `Card variant="glass"` with `Card`. Replace hover on option buttons:
- Old: `hover:border-[var(--accent)]` + `bg: var(--surface)`, `border: var(--border)`
- Keep as-is — these already use tokens correctly.

**Step 7: Commit**

```bash
git add src/app/"(dashboard)"/modules/page.tsx src/components/team/team-content.tsx src/app/"(auth)"/layout.tsx src/app/"(auth)"/login/page.tsx src/app/"(auth)"/signup/page.tsx src/app/"(onboarding)"/layout.tsx src/app/"(onboarding)"/setup/page.tsx
git commit -m "refactor: restyle modules, team, auth, and onboarding pages"
```

---

## Task 14: Update Shared Components and Clean Up

**Files:**
- Modify: `src/components/shared/theme-toggle.tsx`
- Modify: `src/components/shared/locale-switcher.tsx`
- Modify: `src/components/layout/page-header.tsx`

**Step 1: theme-toggle.tsx**

Replace hover from `hover:bg-[rgba(255,255,255,0.04)]` to `hover:bg-[var(--nav-hover-bg)]` — theme-aware.

**Step 2: locale-switcher.tsx**

No structural changes — already uses tokens. Ensure select uses `bg: var(--surface)`, `border: var(--border)`.

**Step 3: page-header.tsx**

No changes needed — already uses tokens directly.

**Step 4: Global search for leftover glass/glow references**

Run: `grep -r "glass" src/components/ src/app/ --include="*.tsx" --include="*.ts" -l`

Fix any remaining references:
- `variant="glass"` → remove the `variant` prop
- `.glass` class name → remove
- `.glass-elevated` class name → remove
- `.glow-accent` class name → remove
- `--glass-*` tokens → replace with equivalent
- `backdrop-filter: blur` → remove
- `--atmosphere-*` → remove

Also search for `rgba(255,255,255,0.0` patterns in hover states — replace with `var(--nav-hover-bg)` for theme awareness:

Run: `grep -rn "rgba(255,255,255,0.0" src/components/ --include="*.tsx" -l`

Fix each occurrence.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: clean up remaining glass/glow references and theme-unaware hover states"
```

---

## Task 15: Mobile Responsiveness Pass

**Files:**
- Modify: `src/components/layout/dashboard-shell.tsx`
- Modify: `src/components/layout/top-bar.tsx`

**Step 1: TopBar mobile responsiveness**

On mobile (`lg:hidden`), the top bar should span the full width (no sidebar offset):

```tsx
// In TopBar, update the left style:
style={{
  left: "0", // mobile default
  // Desktop sidebar offset applied via className
}}
className="... lg:transition-all lg:duration-200"
// Add a media query approach: on mobile left=0, on desktop left=sidebarWidth
```

Better approach: use CSS classes for the left offset:

```tsx
<header
  className={`fixed top-0 right-0 left-0 z-40 flex h-16 items-center border-b px-6 transition-all duration-200 ${
    collapsed ? "lg:left-16" : "lg:left-[240px]"
  }`}
  style={{
    backgroundColor: "var(--topbar-bg)",
    borderColor: "var(--border)",
  }}
>
```

**Step 2: DashboardShell mobile**

On mobile, main content should have no left padding:

```tsx
<main
  className={`min-h-screen pt-16 transition-all duration-200 ${
    collapsed ? "lg:pl-16" : "lg:pl-[240px]"
  }`}
  style={{ backgroundColor: "var(--background)" }}
>
```

**Step 3: Commit**

```bash
git add src/components/layout/dashboard-shell.tsx src/components/layout/top-bar.tsx
git commit -m "fix: ensure mobile responsiveness for top bar and main content"
```

---

## Task 16: Visual QA and Build Verification

**Step 1: Build the project**

Run: `npx next build`

Expected: Clean build with no errors. Warnings about unused imports are acceptable for now.

**Step 2: Fix any build errors**

If TypeScript errors exist (e.g., Card no longer accepts `variant` prop), fix them.

Common fixes:
- Remove `variant="glass"` or `variant="solid"` props from Card usages
- Remove references to deleted `sidebar-user-menu.tsx`
- Fix any import paths for new components

**Step 3: Start dev server and test**

Run: `npx next dev`

Visually verify:
1. Dashboard page: 3 KPI cards + appointments table + alerts
2. Sidebar: clean, no glass, collapsible
3. Top bar: search, bell, user menu
4. Light/dark theme toggle works
5. All pages load without errors

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors from UI redesign"
```

---

## Summary

| Task | Scope | Files |
|------|-------|-------|
| 1 | Design tokens (globals.css) | 1 |
| 2 | Button, Card, Input, Badge | 4 |
| 3 | Dialog, Skeleton | 2 |
| 4 | Top Bar (new) | 1 |
| 5 | Sidebar restyle | 3 |
| 6 | Dashboard layout + shell | 3 |
| 7 | Dashboard page redesign | 4+ i18n |
| 8 | Calendar restyle | 6 |
| 9 | Patients restyle | 3 |
| 10 | Inbox restyle | 3 |
| 11 | Settings restyle | 5 |
| 12 | Reports restyle | 4 |
| 13 | Modules, Team, Auth, Onboarding | 7 |
| 14 | Shared components + cleanup | 3+ |
| 15 | Mobile responsiveness | 2 |
| 16 | Build verification + QA | — |

**Total: ~46 files touched across 16 tasks.**
