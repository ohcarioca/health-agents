# WhatsApp Per-Clinic + Agents Active by Default — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store WhatsApp credentials per clinic (not global env vars) and auto-create 6 agents on signup so clinics work immediately.

**Architecture:** Add 3 columns to `clinics` table. Refactor `whatsapp.ts` service to accept credentials as parameters. Update all callers (process-message, outbound, 4 cron routes). Replace WhatsApp placeholder UI with config form. Create 6 agent rows on signup.

**Tech Stack:** Supabase migration, TypeScript, Next.js API routes, React client component, Zod validation, Vitest.

**Design doc:** `docs/plans/2026-02-16-whatsapp-per-clinic-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/008_whatsapp_per_clinic.sql`

**Step 1: Write the migration**

```sql
-- 008_whatsapp_per_clinic.sql
-- Add WhatsApp credentials per clinic (multi-tenant support)

alter table clinics add column whatsapp_phone_number_id text;
alter table clinics add column whatsapp_waba_id text;
alter table clinics add column whatsapp_access_token text;
```

**Step 2: Run migration in Supabase dashboard**

Apply the migration via Supabase SQL editor or CLI.

**Step 3: Commit**

```bash
git add supabase/migrations/008_whatsapp_per_clinic.sql
git commit -m "feat: add whatsapp credentials columns to clinics table"
```

---

## Task 2: WhatsApp Service — Accept Credentials as Parameter

**Files:**
- Modify: `src/services/whatsapp.ts`
- Test: `src/__tests__/services/whatsapp.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/services/whatsapp.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// Must mock before importing
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  sendTextMessage,
  sendTemplateMessage,
  type WhatsAppCredentials,
} from "@/services/whatsapp";

describe("whatsapp service", () => {
  const credentials: WhatsAppCredentials = {
    phoneNumberId: "123456",
    accessToken: "EAAtoken123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendTextMessage", () => {
    it("sends text using provided credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: "wamid.123" }] }),
      });

      const result = await sendTextMessage("5511999990000", "Hello", credentials);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("wamid.123");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/123456/messages"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer EAAtoken123",
          }),
        })
      );
    });

    it("returns error when credentials are missing", async () => {
      const result = await sendTextMessage("5511999990000", "Hello", {
        phoneNumberId: "",
        accessToken: "",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("missing WhatsApp configuration");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns error on HTTP failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const result = await sendTextMessage("5511999990000", "Hello", credentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 401");
    });
  });

  describe("sendTemplateMessage", () => {
    it("sends template using provided credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: "wamid.456" }] }),
      });

      const result = await sendTemplateMessage(
        "5511999990000",
        "lembrete_consulta",
        "pt_BR",
        ["Maria", "Dr. Silva"],
        credentials
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("wamid.456");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/123456/messages"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer EAAtoken123",
          }),
        })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/whatsapp.test.ts`
Expected: FAIL — `WhatsAppCredentials` type doesn't exist yet, function signatures don't match.

**Step 3: Update whatsapp service**

Replace `src/services/whatsapp.ts` with credentials-based API. Key changes:
- Export `WhatsAppCredentials` interface
- `sendTextMessage(to, text, credentials)` — credentials parameter instead of env vars
- `sendTemplateMessage(to, templateName, language, params, credentials)` — same
- `verifySignature` stays unchanged (uses global `META_APP_SECRET`)
- Check `credentials.phoneNumberId && credentials.accessToken` instead of env vars

```typescript
import "server-only";
import crypto from "crypto";

const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendTextMessage(
  to: string,
  text: string,
  credentials: WhatsAppCredentials
): Promise<SendMessageResult> {
  if (!credentials.phoneNumberId || !credentials.accessToken) {
    return { success: false, error: "missing WhatsApp configuration" };
  }

  try {
    const response = await fetch(
      `${BASE_URL}/${credentials.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[whatsapp] send failed:", response.status, errorBody);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { messages?: Array<{ id: string }> };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    console.error("[whatsapp] send error:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  language: string,
  params: string[],
  credentials: WhatsAppCredentials
): Promise<SendMessageResult> {
  if (!credentials.phoneNumberId || !credentials.accessToken) {
    return { success: false, error: "missing WhatsApp configuration" };
  }

  try {
    const response = await fetch(
      `${BASE_URL}/${credentials.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: params.map((p) => ({
                  type: "text",
                  text: p,
                })),
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[whatsapp] template send failed:", response.status, errorBody);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { messages?: Array<{ id: string }> };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    console.error("[whatsapp] template send error:", err);
    return { success: false, error: String(err) };
  }
}

// verifySignature stays unchanged — signature is per-app, not per-number
export function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("[whatsapp] META_APP_SECRET not configured");
    return false;
  }

  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/whatsapp.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/whatsapp.ts src/__tests__/services/whatsapp.test.ts
git commit -m "feat: whatsapp service accepts per-clinic credentials"
```

---

## Task 3: Outbound Messaging — Accept Credentials

**Files:**
- Modify: `src/lib/agents/outbound.ts`
- Modify: `src/__tests__/lib/agents/outbound.test.ts`

**Step 1: Update outbound interfaces and functions**

Add `credentials: WhatsAppCredentials` to both `SendOutboundMessageOptions` and `SendOutboundTemplateOptions`. Pass credentials to `sendTextMessage` / `sendTemplateMessage` calls.

Changes in `outbound.ts`:
- Import `WhatsAppCredentials` from `@/services/whatsapp`
- Add `credentials: WhatsAppCredentials` to `SendOutboundMessageOptions`
- Add `credentials: WhatsAppCredentials` to `SendOutboundTemplateOptions`
- Pass `options.credentials` to `sendTextMessage(patientPhone, text, options.credentials)` (line 143)
- Pass `options.credentials` to `sendTemplateMessage(patientPhone, templateName, templateLanguage, templateParams, options.credentials)` (line 205-209)

**Step 2: Update outbound tests**

In `src/__tests__/lib/agents/outbound.test.ts`, add `credentials: { phoneNumberId: "pn-123", accessToken: "token-123" }` to all test calls of `sendOutboundMessage` and `sendOutboundTemplate`.

**Step 3: Run tests**

Run: `npx vitest run src/__tests__/lib/agents/outbound.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/agents/outbound.ts src/__tests__/lib/agents/outbound.test.ts
git commit -m "feat: outbound messaging accepts whatsapp credentials"
```

---

## Task 4: process-message.ts — Fetch and Pass Credentials

**Files:**
- Modify: `src/lib/agents/process-message.ts`

**Step 1: Update process-message**

Three changes:

1. Import `WhatsAppCredentials` from `@/services/whatsapp`

2. In the clinic select query (line 199), add WhatsApp columns:
```typescript
const { data: clinic } = await supabase
  .from("clinics")
  .select("name, phone, address, timezone, whatsapp_phone_number_id, whatsapp_access_token")
  .eq("id", clinicId)
  .single();
```

3. Build credentials object after clinic fetch:
```typescript
const whatsappCredentials: WhatsAppCredentials = {
  phoneNumberId: (clinic?.whatsapp_phone_number_id as string) ?? "",
  accessToken: (clinic?.whatsapp_access_token as string) ?? "",
};
```

4. Pass credentials to `sendTextMessage` (line 315):
```typescript
const sendResult = await sendTextMessage(normalizedPhone, finalResponse, whatsappCredentials);
```

**Step 2: Commit**

```bash
git add src/lib/agents/process-message.ts
git commit -m "feat: process-message uses per-clinic whatsapp credentials"
```

---

## Task 5: Cron — Confirmations Route

**Files:**
- Modify: `src/app/api/cron/confirmations/route.ts`

**Step 1: Update confirmations cron**

1. Import `WhatsAppCredentials` from `@/services/whatsapp`

2. In the clinic fetch (line 157-161), add WhatsApp columns:
```typescript
const { data: clinic, error: clinicError } = await supabase
  .from("clinics")
  .select("timezone, whatsapp_phone_number_id, whatsapp_access_token")
  .eq("id", entry.clinic_id)
  .single();
```

3. Build credentials:
```typescript
const credentials: WhatsAppCredentials = {
  phoneNumberId: (clinic.whatsapp_phone_number_id as string) ?? "",
  accessToken: (clinic.whatsapp_access_token as string) ?? "",
};
```

4. Skip if no credentials:
```typescript
if (!credentials.phoneNumberId || !credentials.accessToken) {
  console.log(`[cron/confirmations] skipping entry ${entry.id}: clinic has no WhatsApp credentials`);
  continue;
}
```

5. Add `credentials` to `sendOutboundTemplate` call (line 204-220):
```typescript
const sendResult = await sendOutboundTemplate(supabase, {
  clinicId: entry.clinic_id,
  patientId: patient.id,
  patientPhone: patient.phone,
  templateName: TEMPLATE_NAME,
  templateLanguage: TEMPLATE_LANGUAGE,
  templateParams: [patientFirstName, professionalName, dateFormatted, timeFormatted],
  localBody,
  timezone,
  conversationId,
  skipBusinessHoursCheck: true,
  credentials,
});
```

**Step 2: Commit**

```bash
git add src/app/api/cron/confirmations/route.ts
git commit -m "feat: confirmations cron uses per-clinic whatsapp credentials"
```

---

## Task 6: Cron — NPS Route

**Files:**
- Modify: `src/app/api/cron/nps/route.ts`

**Step 1: Update NPS cron**

Same pattern as confirmations:

1. Import `WhatsAppCredentials`
2. Add WhatsApp columns to clinic select (line 123):
```typescript
.select("timezone, whatsapp_phone_number_id, whatsapp_access_token")
```
3. Build credentials + skip if missing
4. Add `credentials` to `sendOutboundMessage` call (line 186-194)

**Step 2: Commit**

```bash
git add src/app/api/cron/nps/route.ts
git commit -m "feat: nps cron uses per-clinic whatsapp credentials"
```

---

## Task 7: Cron — Billing Route

**Files:**
- Modify: `src/app/api/cron/billing/route.ts`

**Step 1: Update billing cron**

Same pattern:

1. Import `WhatsAppCredentials`
2. Add WhatsApp columns to clinic select (line 88-92):
```typescript
.select("timezone, whatsapp_phone_number_id, whatsapp_access_token")
```
3. Build credentials + skip if missing
4. Add `credentials` to `sendOutboundMessage` call (line 190-198)

**Step 2: Commit**

```bash
git add src/app/api/cron/billing/route.ts
git commit -m "feat: billing cron uses per-clinic whatsapp credentials"
```

---

## Task 8: Cron — Recall-Send Route

**Files:**
- Modify: `src/app/api/cron/recall-send/route.ts`

**Step 1: Update recall-send cron**

Same pattern:

1. Import `WhatsAppCredentials`
2. Add WhatsApp columns to clinic select (line 97-101):
```typescript
.select("timezone, name, whatsapp_phone_number_id, whatsapp_access_token")
```
3. Build credentials + skip if missing
4. Add `credentials` to `sendOutboundTemplate` call (line 139-150)

**Step 2: Commit**

```bash
git add src/app/api/cron/recall-send/route.ts
git commit -m "feat: recall-send cron uses per-clinic whatsapp credentials"
```

---

## Task 9: Settings Validation — Add WhatsApp Fields

**Files:**
- Modify: `src/lib/validations/settings.ts`

**Step 1: Add WhatsApp fields to clinicSettingsSchema**

Add 3 optional string fields to `clinicSettingsSchema`:

```typescript
export const clinicSettingsSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().max(15).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(2).optional().or(z.literal("")),
  zip_code: z.string().max(10).optional().or(z.literal("")),
  timezone: z.string().max(50).optional().or(z.literal("")),
  whatsapp_phone_number_id: z.string().max(50).optional().or(z.literal("")),
  whatsapp_waba_id: z.string().max(50).optional().or(z.literal("")),
  whatsapp_access_token: z.string().max(500).optional().or(z.literal("")),
});
```

**Step 2: Update clinic settings PUT handler**

In `src/app/api/settings/clinic/route.ts`, add the 3 new fields to the destructure (line 73) and update object (line 79-88):

```typescript
const {
  name, phone, email, address, city, state, zip_code, timezone,
  whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token,
} = parsed.data;

const { data: clinic, error: updateError } = await admin
  .from("clinics")
  .update({
    name,
    phone: phone || null,
    email: email || null,
    address: address || null,
    city: city || null,
    state: state || null,
    zip_code: zip_code || null,
    timezone: timezone || undefined,
    whatsapp_phone_number_id: whatsapp_phone_number_id || null,
    whatsapp_waba_id: whatsapp_waba_id || null,
    whatsapp_access_token: whatsapp_access_token || null,
  })
  .eq("id", ctx.clinicId)
  .select()
  .single();
```

**Step 3: Commit**

```bash
git add src/lib/validations/settings.ts src/app/api/settings/clinic/route.ts
git commit -m "feat: settings validation and api accept whatsapp credentials"
```

---

## Task 10: WhatsApp Config UI Component

**Files:**
- Modify: `src/components/settings/whatsapp-placeholder.tsx` (rename + rewrite)
- Modify: `src/app/(dashboard)/settings/page.tsx` (update import)

**Step 1: Replace WhatsAppPlaceholder with WhatsAppConfig**

Rewrite `src/components/settings/whatsapp-placeholder.tsx` as a client component:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface WhatsAppFields {
  whatsapp_phone_number_id: string;
  whatsapp_waba_id: string;
  whatsapp_access_token: string;
}

function maskToken(token: string): string {
  if (token.length <= 8) return token;
  return token.slice(0, 4) + "..." + token.slice(-4);
}

export function WhatsAppConfig() {
  const t = useTranslations("settings.whatsapp");
  const [fields, setFields] = useState<WhatsAppFields>({
    whatsapp_phone_number_id: "",
    whatsapp_waba_id: "",
    whatsapp_access_token: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const isConnected = Boolean(fields.whatsapp_phone_number_id && fields.whatsapp_access_token);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings/clinic");
        if (!res.ok) return;
        const json = await res.json();
        if (json.data) {
          setFields({
            whatsapp_phone_number_id: json.data.whatsapp_phone_number_id ?? "",
            whatsapp_waba_id: json.data.whatsapp_waba_id ?? "",
            whatsapp_access_token: json.data.whatsapp_access_token ?? "",
          });
        }
      } catch (err) {
        console.error("[whatsapp-config] load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      // First fetch current clinic data to include required name field
      const getRes = await fetch("/api/settings/clinic");
      if (!getRes.ok) return;
      const current = await getRes.json();

      const res = await fetch("/api/settings/clinic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: current.data.name,
          ...fields,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error("[whatsapp-config] save error:", err);
    } finally {
      setSaving(false);
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
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
        >
          <MessageCircle
            className="size-5"
            strokeWidth={1.75}
            style={{ color: "var(--success)" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {t("title")}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("description")}
          </p>
        </div>
        <Badge variant={isConnected ? "success" : "neutral"}>
          {isConnected ? t("connected") : t("notConnected")}
        </Badge>
      </div>

      <Card variant="glass">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("phoneNumberId")}
            </label>
            <Input
              value={fields.whatsapp_phone_number_id}
              onChange={(e) => setFields((f) => ({ ...f, whatsapp_phone_number_id: e.target.value }))}
              placeholder="123456789012345"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("wabaId")}
            </label>
            <Input
              value={fields.whatsapp_waba_id}
              onChange={(e) => setFields((f) => ({ ...f, whatsapp_waba_id: e.target.value }))}
              placeholder="123456789012345"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("accessToken")}
            </label>
            <Input
              type="password"
              value={fields.whatsapp_access_token}
              onChange={(e) => setFields((f) => ({ ...f, whatsapp_access_token: e.target.value }))}
              placeholder="EAAxxxxxxx..."
            />
            {isConnected && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("currentToken")}: {maskToken(fields.whatsapp_access_token)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? <Spinner size="sm" /> : t("save")}
            </Button>
            {saved && (
              <p className="text-xs" style={{ color: "var(--success)" }}>
                {t("savedSuccess")}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
```

**Step 2: Update settings page import**

In `src/app/(dashboard)/settings/page.tsx`, change:
```typescript
// Before
import { WhatsAppPlaceholder } from "@/components/settings/whatsapp-placeholder";
// After
import { WhatsAppConfig } from "@/components/settings/whatsapp-placeholder";
```

And update render (line 98):
```typescript
// Before
{activeTab === 4 && <WhatsAppPlaceholder />}
// After
{activeTab === 4 && <WhatsAppConfig />}
```

**Step 3: Update i18n strings**

Add new keys to `settings.whatsapp` in all 3 locale files:

**pt-BR.json:**
```json
"whatsapp": {
  "title": "WhatsApp Business",
  "description": "Configure as credenciais da API do WhatsApp Business",
  "connected": "Conectado",
  "notConnected": "Não conectado",
  "phoneNumberId": "Phone Number ID",
  "wabaId": "WABA ID",
  "accessToken": "Access Token",
  "currentToken": "Token atual",
  "save": "Salvar",
  "savedSuccess": "Credenciais salvas com sucesso"
}
```

**en.json:**
```json
"whatsapp": {
  "title": "WhatsApp Business",
  "description": "Configure your WhatsApp Business API credentials",
  "connected": "Connected",
  "notConnected": "Not connected",
  "phoneNumberId": "Phone Number ID",
  "wabaId": "WABA ID",
  "accessToken": "Access Token",
  "currentToken": "Current token",
  "save": "Save",
  "savedSuccess": "Credentials saved successfully"
}
```

**es.json:**
```json
"whatsapp": {
  "title": "WhatsApp Business",
  "description": "Configure las credenciales de la API de WhatsApp Business",
  "connected": "Conectado",
  "notConnected": "No conectado",
  "phoneNumberId": "Phone Number ID",
  "wabaId": "WABA ID",
  "accessToken": "Access Token",
  "currentToken": "Token actual",
  "save": "Guardar",
  "savedSuccess": "Credenciales guardadas exitosamente"
}
```

**Step 4: Commit**

```bash
git add src/components/settings/whatsapp-placeholder.tsx src/app/\(dashboard\)/settings/page.tsx messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: whatsapp config ui replaces placeholder in settings"
```

---

## Task 11: Signup — Create 6 Agent Rows

**Files:**
- Modify: `src/app/api/auth/signup/route.ts`

**Step 1: Add agent creation after module_configs**

After the `module_configs` insert (line 92), add:

```typescript
// 5. Create default agents (all active)
const agentDefaults: Array<{ type: string; name: string }> = [
  { type: "support", name: "Suporte" },
  { type: "scheduling", name: "Agendamento" },
  { type: "confirmation", name: "Confirmação" },
  { type: "nps", name: "Pesquisa NPS" },
  { type: "billing", name: "Financeiro" },
  { type: "recall", name: "Reativação" },
];

const agentInserts = agentDefaults.map((a) => ({
  clinic_id: clinic.id,
  type: a.type,
  name: a.name,
  active: true,
  config: {},
}));

await supabase.from("agents").insert(agentInserts);
```

**Step 2: Commit**

```bash
git add src/app/api/auth/signup/route.ts
git commit -m "feat: signup creates 6 active agents by default"
```

---

## Task 12: Update Existing Agent Tests

**Files:**
- Modify: `src/__tests__/lib/agents/basic-support.test.ts`
- Modify: `src/__tests__/lib/agents/scheduling.test.ts`
- Modify: `src/__tests__/lib/agents/confirmation.test.ts`
- Modify: `src/__tests__/lib/agents/nps.test.ts`
- Modify: `src/__tests__/lib/agents/billing.test.ts`
- Modify: `src/__tests__/lib/agents/recall.test.ts`

**Step 1: Fix any broken imports**

If any agent test file imports `sendTextMessage` or `sendTemplateMessage` from `@/services/whatsapp`, the mock needs updating to include the `credentials` parameter. Check each test file and update the mock signatures.

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit (only if changes needed)**

```bash
git add src/__tests__/
git commit -m "fix: update agent tests for whatsapp credentials parameter"
```

---

## Task 13: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update documentation**

1. Add `whatsapp_phone_number_id`, `whatsapp_waba_id`, `whatsapp_access_token` to DB conventions section
2. Remove `WHATSAPP_TOKEN` and `TEST_WHATSAPP_PHONE_NUMBER_ID` from env vars section (no longer used)
3. Note that WhatsApp credentials are now per-clinic in `clinics` table
4. Add migration 008 reference
5. Note that signup creates 6 agents + 6 module_configs

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for whatsapp per-clinic and agents on signup"
```

---

## Task 14: Final Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Run lint**

Run: `npx eslint .`
Expected: No lint errors

**Step 4: Run build**

Run: `npx next build`
Expected: Build succeeds

---

## Summary of Changes

| # | Task | Files | Type |
|---|------|-------|------|
| 1 | Migration 008 | 1 new | DB |
| 2 | WhatsApp service + test | 2 files | Service |
| 3 | Outbound messaging | 2 files | Lib |
| 4 | process-message | 1 file | Lib |
| 5 | Cron: confirmations | 1 file | API |
| 6 | Cron: NPS | 1 file | API |
| 7 | Cron: billing | 1 file | API |
| 8 | Cron: recall-send | 1 file | API |
| 9 | Settings validation + API | 2 files | Validation |
| 10 | WhatsApp config UI + i18n | 5 files | UI |
| 11 | Signup agents | 1 file | API |
| 12 | Fix existing tests | up to 6 files | Tests |
| 13 | CLAUDE.md | 1 file | Docs |
| 14 | Final verification | 0 files | QA |
