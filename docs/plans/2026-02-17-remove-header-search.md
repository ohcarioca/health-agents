# Remove Header Search Field — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the non-functional search input from the TopBar header and clean up all related references.

**Architecture:** The search field lives in `src/components/layout/top-bar.tsx` (lines 57-74). It's a static placeholder with no event handlers or state. Removing it requires deleting the JSX block, removing the unused `Search` icon import, and deleting the `searchPlaceholder` translation key from all 3 locale files.

**Tech Stack:** React, next-intl, lucide-react, Tailwind CSS v4

---

### Task 1: Remove search field JSX and unused import from TopBar

**Files:**
- Modify: `src/components/layout/top-bar.tsx:6,57-74`

**Step 1: Remove the `Search` icon from the lucide-react import**

Change line 6 from:
```tsx
import { Search, Bell, ChevronDown, Settings, LogOut } from "lucide-react";
```
to:
```tsx
import { Bell, ChevronDown, Settings, LogOut } from "lucide-react";
```

**Step 2: Remove the search field JSX block (lines 57-74)**

Delete this entire block inside the `<header>`:
```tsx
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
          strokeWidth={1.75}
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          className="h-9 w-full rounded-lg border pl-9 pr-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-ring)]"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>
```

Replace with an empty spacer so the right section stays right-aligned:
```tsx
      <div />
```

**Step 3: Verify the build compiles**

Run: `npx next build --no-lint 2>&1 | head -20` (or `npm run build`)
Expected: No TypeScript errors related to `Search` or `searchPlaceholder`.

**Step 4: Commit**

```bash
git add src/components/layout/top-bar.tsx
git commit -m "remove: non-functional search field from header"
```

---

### Task 2: Remove `searchPlaceholder` translation key from all locales

**Files:**
- Modify: `messages/pt-BR.json:33`
- Modify: `messages/en.json:33`
- Modify: `messages/es.json:33`

**Step 1: Remove `searchPlaceholder` from pt-BR.json**

In the `"topBar"` object, delete this line:
```json
    "searchPlaceholder": "Buscar...",
```

Result should be:
```json
  "topBar": {
    "notifications": "Notificações",
    "profile": "Perfil",
    "settings": "Configurações",
    "signOut": "Sair"
  },
```

**Step 2: Remove `searchPlaceholder` from en.json**

In the `"topBar"` object, delete this line:
```json
    "searchPlaceholder": "Search...",
```

Result should be:
```json
  "topBar": {
    "notifications": "Notifications",
    "profile": "Profile",
    "settings": "Settings",
    "signOut": "Sign out"
  },
```

**Step 3: Remove `searchPlaceholder` from es.json**

In the `"topBar"` object, delete this line:
```json
    "searchPlaceholder": "Buscar...",
```

Result should be:
```json
  "topBar": {
    "notifications": "Notificaciones",
    "profile": "Perfil",
    "settings": "Configuración",
    "signOut": "Cerrar sesión"
  },
```

**Step 4: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "remove: searchPlaceholder translation key from all locales"
```

---

### Scope Notes

**NOT touched** (these are separate, functional search features):
- `src/components/calendar/patient-search.tsx` — patient search in appointment modal
- `src/components/patients/patients-view.tsx` — patient table search
- `common.search` translation key — used by other components
- `calendar.searchPatient` translation key — used by patient search component
- `patients.searchPlaceholder` translation key — used by patients table
