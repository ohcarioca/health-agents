# Move Team Page into Settings Tab — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the standalone `/team` page into the Settings page as a 7th tab ("Equipe"), removing it from the sidebar nav.

**Architecture:** The Team page is currently a Server Component at `src/app/(dashboard)/team/page.tsx` that fetches data server-side and passes it to the `TeamContent` client component. Since Settings is a Client Component with tab-based navigation, we need to: (1) create a `GET /api/team` endpoint so team data can be fetched client-side, (2) adapt `TeamContent` to self-fetch data and render without `PageContainer`/`PageHeader` wrappers, (3) add it as a new tab in settings, (4) clean up the old route and nav entry.

**Tech Stack:** Next.js App Router, React 19, next-intl, Supabase (admin client for enriching auth metadata)

---

### Task 1: Create `GET /api/team` endpoint

**Files:**
- Create: `src/app/api/team/route.ts`

**Step 1: Write the API route**

This endpoint mirrors the data-fetching logic currently in the team page Server Component. It uses the server Supabase client to get the current user, then the admin client to list + enrich team members.

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClinicRole } from "@/types";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get caller's membership
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic membership" }, { status: 404 });
  }

  // Get all clinic members
  const { data: rows } = await admin
    .from("clinic_users")
    .select("id, user_id, clinic_id, role, created_at")
    .eq("clinic_id", membership.clinic_id)
    .order("created_at", { ascending: true });

  // Enrich with auth metadata
  const members = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      return {
        id: row.id,
        user_id: row.user_id,
        clinic_id: row.clinic_id,
        role: row.role as ClinicRole,
        created_at: row.created_at,
        email: data.user?.email ?? "",
        name: data.user?.user_metadata?.full_name ?? "",
      };
    }),
  );

  return NextResponse.json({
    data: {
      members,
      currentUserId: user.id,
      currentRole: membership.role as ClinicRole,
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/app/api/team/route.ts
git commit -m "feat: add GET /api/team endpoint for client-side team data fetching"
```

---

### Task 2: Adapt `TeamContent` to be embeddable as a settings tab

**Files:**
- Modify: `src/components/team/team-content.tsx`

The component currently receives data via props from a Server Component and wraps itself in `PageContainer` + `PageHeader`. We need to:
1. Remove the `PageContainer` and `PageHeader` wrappers (the settings page provides those)
2. Add client-side data fetching via the new `GET /api/team` endpoint
3. Keep the invite button as a standalone action (not in PageHeader)
4. Keep all existing functionality (role change, remove, invite)

**Step 1: Rewrite TeamContent to self-fetch**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InviteDialog } from "./invite-dialog";
import type { TeamMember, ClinicRole } from "@/types";

export function TeamContent() {
  const t = useTranslations("team");

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState<ClinicRole>("reception");
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const isOwner = currentRole === "owner";

  useEffect(() => {
    async function fetchTeam() {
      try {
        const res = await fetch("/api/team");
        if (!res.ok) {
          console.error("[team] failed to fetch:", res.status);
          return;
        }
        const json = await res.json();
        if (json.data) {
          setMembers(json.data.members);
          setCurrentUserId(json.data.currentUserId);
          setCurrentRole(json.data.currentRole);
        }
      } catch (err) {
        console.error("[team] fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTeam();
  }, []);

  async function handleRoleChange(member: TeamMember, newRole: ClinicRole) {
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)),
    );

    const res = await fetch(`/api/team/${member.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, role: member.role } : m,
        ),
      );
    }
  }

  async function handleRemove(member: TeamMember) {
    if (!window.confirm(t("removeConfirm"))) return;

    const res = await fetch(`/api/team/${member.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    }
  }

  async function handleInviteSuccess() {
    // Re-fetch team data instead of full page reload
    const res = await fetch("/api/team");
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        setMembers(json.data.members);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with invite button */}
      {isOwner && (
        <div className="flex justify-end">
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="size-4" strokeWidth={1.75} />
            {t("invite")}
          </Button>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-3">
        {members.length === 0 ? (
          <p
            className="py-8 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {t("empty")}
          </p>
        ) : (
          members.map((member) => {
            const isSelf = member.user_id === currentUserId;

            return (
              <Card key={member.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name || member.email} size="sm" />
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {member.name || member.email}
                      </p>
                      <p
                        className="text-xs truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner && !isSelf ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(
                            member,
                            e.target.value as ClinicRole,
                          )
                        }
                        className="rounded-lg border px-2 py-1 text-xs outline-none transition-colors"
                        style={{
                          backgroundColor: "var(--surface)",
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="owner">{t("roles.owner")}</option>
                        <option value="reception">
                          {t("roles.reception")}
                        </option>
                      </select>
                    ) : (
                      <Badge
                        variant={
                          member.role === "owner" ? "accent" : "neutral"
                        }
                      >
                        {t(`roles.${member.role}`)}
                      </Badge>
                    )}

                    {isOwner && !isSelf && (
                      <button
                        onClick={() => handleRemove(member)}
                        className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                        style={{ color: "var(--danger)" }}
                      >
                        <Trash2 className="size-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {isOwner && (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onSuccess={handleInviteSuccess}
        />
      )}
    </div>
  );
}
```

Key changes from original:
- Removed `PageContainer` and `PageHeader` (settings page provides the page wrapper)
- Removed props (`initialMembers`, `currentUserId`, `currentRole`) — now self-fetches from `GET /api/team`
- Loading state shows `Spinner` instead of nothing
- Invite button placed in a flex row at the top of the content area
- `handleInviteSuccess` re-fetches via API instead of `window.location.reload()`

**Step 2: Commit**

```bash
git add src/components/team/team-content.tsx
git commit -m "refactor: make TeamContent self-fetching for settings tab embedding"
```

---

### Task 3: Add "Equipe" tab to Settings page

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Add team tab**

Add `TeamContent` import and a 7th tab entry. The team tab doesn't depend on the `clinic` data, so it renders independently.

Changes to the settings page:

1. Add import:
```ts
import { TeamContent } from "@/components/team/team-content";
```

2. Add to `TAB_KEYS` array:
```ts
const TAB_KEYS = [
  "tabs.clinic",
  "tabs.professionals",
  "tabs.services",
  "tabs.insurancePlans",
  "tabs.integrations",
  "tabs.whatsapp",
  "tabs.team",       // NEW
] as const;
```

3. Add to `TAB_PARAM_MAP`:
```ts
const TAB_PARAM_MAP: Record<string, number> = {
  clinic: 0,
  professionals: 1,
  services: 2,
  "insurance-plans": 3,
  integrations: 4,
  whatsapp: 5,
  team: 6,           // NEW
};
```

4. Add tab content rendering (after `activeTab === 5`):
```tsx
{activeTab === 6 && <TeamContent />}
```

Note: The `TeamContent` renders outside the `loading` guard since it fetches its own data independently from the clinic fetch.

**Step 2: Commit**

```bash
git add src/app/(dashboard)/settings/page.tsx
git commit -m "feat: add team tab to settings page"
```

---

### Task 4: Update i18n messages (all 3 locales)

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add settings tab key for all locales**

In each locale file, add `"team"` to `settings.tabs`:

**pt-BR.json:**
```json
"tabs": {
  "clinic": "Clínica",
  "professionals": "Profissionais",
  "services": "Serviços",
  "insurancePlans": "Convênios",
  "integrations": "Integrações",
  "whatsapp": "WhatsApp",
  "team": "Equipe"
}
```

**en.json:**
```json
"tabs": {
  "clinic": "Clinic",
  "professionals": "Professionals",
  "services": "Services",
  "insurancePlans": "Insurance Plans",
  "integrations": "Integrations",
  "whatsapp": "WhatsApp",
  "team": "Team"
}
```

**es.json:**
```json
"tabs": {
  "clinic": "Clínica",
  "professionals": "Profesionales",
  "services": "Servicios",
  "insurancePlans": "Convenios",
  "integrations": "Integraciones",
  "whatsapp": "WhatsApp",
  "team": "Equipo"
}
```

**Step 2: Remove `nav.team` from all locales**

Remove the `"team": "..."` line from the `nav` object in all 3 locale files. The team is no longer a top-level nav item.

**Step 3: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add team tab i18n key, remove nav.team from all locales"
```

---

### Task 5: Remove `/team` from sidebar nav

**Files:**
- Modify: `src/components/layout/sidebar-nav.tsx`

**Step 1: Remove team nav item and unused import**

Remove this line from `NAV_ITEMS`:
```ts
{ href: "/team", icon: Users, labelKey: "nav.team" },
```

Remove `Users` from the lucide-react import since it's no longer used:
```ts
import {
  LayoutDashboard,
  MessageSquare,
  CalendarDays,
  UserRound,
  CreditCard,
  Blocks,
  BarChart3,
  Globe,
  // Users removed
  Settings,
} from "lucide-react";
```

**Step 2: Commit**

```bash
git add src/components/layout/sidebar-nav.tsx
git commit -m "refactor: remove team from sidebar nav (moved to settings tab)"
```

---

### Task 6: Delete the standalone team page route

**Files:**
- Delete: `src/app/(dashboard)/team/page.tsx`

**Step 1: Delete the file**

```bash
rm src/app/(dashboard)/team/page.tsx
```

The `src/app/(dashboard)/team/` directory should be removed if empty after deletion.

**Step 2: Commit**

```bash
git add -A src/app/(dashboard)/team/
git commit -m "refactor: delete standalone team page (now a settings tab)"
```

---

### Task 7: Verify build passes

**Step 1: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors. Check for:
- No broken imports (the `TeamContent` import moved from page.tsx to settings page)
- No unused translation keys warnings
- No missing translation keys

**Step 2: If build fails, fix issues and commit**

---

### Summary of all changes

| Action | File | What changes |
|--------|------|-------------|
| Create | `src/app/api/team/route.ts` | New `GET` endpoint for team members list |
| Modify | `src/components/team/team-content.tsx` | Self-fetching, remove page wrappers |
| Modify | `src/app/(dashboard)/settings/page.tsx` | Add 7th "Equipe" tab |
| Modify | `messages/pt-BR.json` | Add `settings.tabs.team`, remove `nav.team` |
| Modify | `messages/en.json` | Add `settings.tabs.team`, remove `nav.team` |
| Modify | `messages/es.json` | Add `settings.tabs.team`, remove `nav.team` |
| Modify | `src/components/layout/sidebar-nav.tsx` | Remove `/team` nav item |
| Delete | `src/app/(dashboard)/team/page.tsx` | Old standalone route |

API routes remain unchanged: `POST /api/team/invite`, `PUT /api/team/[id]`, `DELETE /api/team/[id]`.
