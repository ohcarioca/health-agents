# Cron Jobs — Vercel Pro Upgrade

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize all cron jobs to leverage Vercel Pro's per-minute scheduling precision and multiple daily runs, fix critical timing bugs, add message retry, and DRY shared code.

**Architecture:** Extract shared cron utilities (auth, conversation helpers) into `src/lib/cron/`. Increase cron frequencies where it directly impacts user experience. Add a new message-queue retry cron. Keep each route thin — delegate to shared helpers.

**Tech Stack:** Next.js API routes, Supabase admin client, Vercel cron scheduling

---

## Problem Analysis

### Current Limitations (Hobby Plan)
| Issue | Impact |
|-------|--------|
| **Confirmations run 1x/day at 8am** | 2h reminders for afternoon appointments are sent **next morning** — too late |
| **Billing runs 1x/day at 9am** | Was designed for 2x/day (9am + 2pm) but Hobby plan doesn't allow `0 9,14` |
| **NPS runs 1x/day at noon** | Appointments completed after noon don't get surveyed until next day |
| **Hourly precision (±59 min)** | 8am cron could actually fire at 8:47 — unpredictable for patients |
| **No message retry** | Failed WhatsApp sends in `message_queue` are never retried |
| **Duplicated code** | `isAuthorized()` copy-pasted in all 5 cron files (~20 lines each) |
| **`findOrCreateConversation` duplicated** | Same ~30 line function in 3 files |

### What Vercel Pro Enables
- **100 cron jobs** per project (we use 5 → plenty of room)
- **Once per minute** minimum interval
- **Per-minute** scheduling precision (no ±59 min drift)

---

## New Cron Schedule

| Route | Old Schedule | New Schedule | Why |
|-------|-------------|-------------|-----|
| `/api/cron/confirmations` | `0 8 * * *` (1x/day) | `*/15 8-19 * * 1-6` (every 15min, 8am-7pm Mon-Sat) | Catch 2h reminders on time |
| `/api/cron/billing` | `0 9 * * 1-6` (1x/day) | `0 9,14 * * 1-6` (2x/day, Mon-Sat) | Restore original design |
| `/api/cron/nps` | `0 12 * * *` (1x/day) | `0 12,16,19 * * *` (3x/day) | Catch afternoon/evening completions |
| `/api/cron/recall` | `0 10 * * 1-5` (1x/day) | `0 10 * * 1-5` (unchanged) | Daily enqueue is sufficient |
| `/api/cron/recall-send` | `30 10 * * 1-5` (1x/day) | `30 10,15 * * 1-5` (2x/day) | Catch newly enqueued entries faster |
| `/api/cron/message-retry` | — (new) | `*/30 8-20 * * 1-6` (every 30min, 8am-8pm Mon-Sat) | Retry failed WhatsApp sends |

---

## Tasks

### Task 1: Extract shared cron utilities

**Files:**
- Create: `src/lib/cron/auth.ts`
- Create: `src/lib/cron/conversations.ts`
- Create: `src/lib/cron/index.ts` (barrel export)

**Step 1: Create `src/lib/cron/auth.ts`**

```ts
import "server-only";
import crypto from "crypto";

export function isAuthorizedCron(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;

  const token = header.replace("Bearer ", "");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}
```

**Step 2: Create `src/lib/cron/conversations.ts`**

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function findOrCreateConversation(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  logPrefix: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .eq("channel", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: newConv, error: createError } = await supabase
    .from("conversations")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      channel: "whatsapp",
      status: "active",
    })
    .select("id")
    .single();

  if (createError || !newConv) {
    console.error(
      `[${logPrefix}] failed to create conversation:`,
      createError?.message
    );
    throw new Error("failed to create conversation");
  }

  return newConv.id;
}
```

**Step 3: Create `src/lib/cron/index.ts`**

```ts
export { isAuthorizedCron } from "./auth";
export { findOrCreateConversation } from "./conversations";
```

**Step 4: Commit**

```bash
git add src/lib/cron/
git commit -m "refactor: extract shared cron utilities (auth, conversations)"
```

---

### Task 2: Refactor confirmations cron to use shared utilities

**Files:**
- Modify: `src/app/api/cron/confirmations/route.ts`

**Step 1: Replace duplicated code**

Replace the local `isAuthorized` function and `findOrCreateConversation` with imports from `@/lib/cron`:

```ts
import { isAuthorizedCron, findOrCreateConversation } from "@/lib/cron";
```

Remove the local `isAuthorized` function (~15 lines) and `findOrCreateConversation` function (~30 lines).

Update the `GET` handler to use `isAuthorizedCron(request)` instead of `isAuthorized(request)`.

Update the `findOrCreateConversation` call to pass `"cron/confirmations"` as the logPrefix.

**Step 2: Verify the route still works**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/cron/confirmations/route.ts
git commit -m "refactor: use shared cron utilities in confirmations"
```

---

### Task 3: Refactor NPS cron to use shared utilities

**Files:**
- Modify: `src/app/api/cron/nps/route.ts`

**Step 1: Replace duplicated code**

Same pattern as Task 2 — import from `@/lib/cron`, remove local `isAuthorized` and `findOrCreateConversation`, pass `"cron/nps"` as logPrefix.

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/cron/nps/route.ts
git commit -m "refactor: use shared cron utilities in nps"
```

---

### Task 4: Refactor billing cron to use shared utilities

**Files:**
- Modify: `src/app/api/cron/billing/route.ts`

**Step 1: Replace duplicated code**

Import `isAuthorizedCron` from `@/lib/cron`. Remove local `isAuthorized`. Billing doesn't use `findOrCreateConversation` from the shared util (it has inline conversation logic) — leave the inline conversation create/find as-is since it also sets `current_module: "billing"` on insert.

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/cron/billing/route.ts
git commit -m "refactor: use shared cron auth in billing"
```

---

### Task 5: Refactor recall and recall-send crons to use shared utilities

**Files:**
- Modify: `src/app/api/cron/recall/route.ts`
- Modify: `src/app/api/cron/recall-send/route.ts`

**Step 1: Replace duplicated code in both files**

Import `isAuthorizedCron` from `@/lib/cron` in both. `recall-send` also uses `findOrCreateConversation` — import from `@/lib/cron` with logPrefix `"cron/recall-send"`.

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/cron/recall/route.ts src/app/api/cron/recall-send/route.ts
git commit -m "refactor: use shared cron utilities in recall routes"
```

---

### Task 6: Create message-retry cron route

This is the new cron that retries failed WhatsApp sends from `message_queue`.

**Files:**
- Create: `src/app/api/cron/message-retry/route.ts`

**Step 1: Create the route**

```ts
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { sendTextMessage, sendTemplateMessage } from "@/services/whatsapp";
import type { WhatsAppCredentials } from "@/services/whatsapp";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 50;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch failed messages that haven't exceeded max attempts
  const { data: failedMessages, error } = await supabase
    .from("message_queue")
    .select("id, clinic_id, patient_id, conversation_id, channel, content, attempts")
    .eq("status", "failed")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[cron/message-retry] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!failedMessages || failedMessages.length === 0) {
    return NextResponse.json({ data: { retried: 0, succeeded: 0, failed: 0 } });
  }

  let succeeded = 0;
  let failedCount = 0;

  for (const msg of failedMessages) {
    try {
      // Fetch clinic WhatsApp credentials
      const { data: clinic } = await supabase
        .from("clinics")
        .select("whatsapp_phone_number_id, whatsapp_access_token, is_active")
        .eq("id", msg.clinic_id)
        .single();

      if (!clinic?.is_active) {
        failedCount++;
        continue;
      }

      const credentials: WhatsAppCredentials = {
        phoneNumberId: (clinic.whatsapp_phone_number_id as string) ?? "",
        accessToken: (clinic.whatsapp_access_token as string) ?? "",
      };

      if (!credentials.phoneNumberId || !credentials.accessToken) {
        failedCount++;
        continue;
      }

      // Fetch patient phone
      const { data: patient } = await supabase
        .from("patients")
        .select("phone")
        .eq("id", msg.patient_id)
        .single();

      if (!patient?.phone) {
        failedCount++;
        continue;
      }

      // Mark as processing
      await supabase
        .from("message_queue")
        .update({ status: "processing", attempts: (msg.attempts ?? 0) + 1 })
        .eq("id", msg.id);

      // Retry send
      const result = await sendTextMessage(patient.phone, msg.content, credentials);

      if (result.success) {
        await supabase
          .from("message_queue")
          .update({ status: "sent" })
          .eq("id", msg.id);
        succeeded++;
      } else {
        const newStatus = (msg.attempts ?? 0) + 1 >= MAX_ATTEMPTS ? "failed" : "failed";
        await supabase
          .from("message_queue")
          .update({ status: newStatus })
          .eq("id", msg.id);
        failedCount++;
      }
    } catch (err) {
      console.error(`[cron/message-retry] error retrying message ${msg.id}:`, err);
      await supabase
        .from("message_queue")
        .update({
          status: "failed",
          attempts: (msg.attempts ?? 0) + 1,
        })
        .eq("id", msg.id)
        .catch(() => {});
      failedCount++;
    }
  }

  return NextResponse.json({
    data: { retried: failedMessages.length, succeeded, failed: failedCount },
  });
}
```

**Step 2: Verify**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/cron/message-retry/route.ts
git commit -m "feat: add message-retry cron for failed whatsapp sends"
```

---

### Task 7: Update vercel.json with new Pro-tier schedules

**Files:**
- Modify: `vercel.json`

**Step 1: Update the cron schedule**

```json
{
  "crons": [
    {
      "path": "/api/cron/confirmations",
      "schedule": "*/15 8-19 * * 1-6"
    },
    {
      "path": "/api/cron/nps",
      "schedule": "0 12,16,19 * * *"
    },
    {
      "path": "/api/cron/recall",
      "schedule": "0 10 * * 1-5"
    },
    {
      "path": "/api/cron/recall-send",
      "schedule": "30 10,15 * * 1-5"
    },
    {
      "path": "/api/cron/billing",
      "schedule": "0 9,14 * * 1-6"
    },
    {
      "path": "/api/cron/message-retry",
      "schedule": "*/30 8-20 * * 1-6"
    }
  ]
}
```

**Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat: update cron schedules for vercel pro (higher frequency)"
```

---

### Task 8: Update CLAUDE.md and MEMORY.md

**Files:**
- Modify: `CLAUDE.md` — update the cron routes table with new schedules and add message-retry
- Modify: `C:\Users\KABUM\.claude\projects\c--Users-KABUM-Documents-BALAM-SANDBOX-supermvp-health-agents\memory\MEMORY.md` — update cron section, remove Hobby plan limitation note

**Step 1: Update the cron table in CLAUDE.md**

Replace the cron routes table with:

```markdown
| Route | Schedule | Purpose |
|-------|----------|---------|
| `GET /api/cron/confirmations` | `*/15 8-19 * * 1-6` | Scans `confirmation_queue`, sends reminders (every 15min Mon-Sat) |
| `GET /api/cron/nps` | `0 12,16,19 * * *` | Surveys patients after completed appointments (3x/day) |
| `GET /api/cron/billing` | `0 9,14 * * 1-6` | Drip payment reminders (2x/day Mon-Sat) |
| `GET /api/cron/recall` | `0 10 * * 1-5` | Enqueue inactive patients (Mon-Fri) |
| `GET /api/cron/recall-send` | `30 10,15 * * 1-5` | Send recall messages from queue (2x/day Mon-Fri) |
| `GET /api/cron/message-retry` | `*/30 8-20 * * 1-6` | Retry failed WhatsApp sends (every 30min Mon-Sat) |
```

Also add to the project structure section:

```
- Shared cron utilities: `src/lib/cron/` (auth, conversation helpers)
```

**Step 2: Update MEMORY.md**

Update the Deployment section to note Vercel Pro instead of Hobby. Update cron routes section. Remove the lesson about "Vercel Hobby plan: crons max 1x/day".

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update cron schedules and add message-retry to CLAUDE.md"
```

---

## Summary of Changes

| Metric | Before | After |
|--------|--------|-------|
| Total cron routes | 5 | 6 |
| Confirmations frequency | 1x/day | Every 15 min (8am-7pm Mon-Sat) |
| Billing frequency | 1x/day | 2x/day (9am + 2pm Mon-Sat) |
| NPS frequency | 1x/day | 3x/day (noon, 4pm, 7pm) |
| Recall-send frequency | 1x/day | 2x/day (10:30am + 3:30pm Mon-Fri) |
| Failed message retry | None | Every 30min (8am-8pm Mon-Sat) |
| Duplicated `isAuthorized` | 5 copies | 1 shared helper |
| Duplicated `findOrCreateConversation` | 3 copies | 1 shared helper |

**Critical bug fixed:** 2h appointment reminders (e.g., for a 4pm appointment = ready at 2pm) were not sent until the **next morning** at 8am. Now processed within 15 minutes of becoming ready.
