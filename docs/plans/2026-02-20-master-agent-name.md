# Master Agent Name Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow clinics to define a single "assistant name" (e.g., "Sofia") that all 6 agent modules use consistently, so patients always see one unified identity regardless of which module is handling the conversation.

**Architecture:** Add `clinics.assistant_name` (nullable text) column to the database. When set, it overrides the per-agent `agents.name` in the system prompt. The priority chain is: `clinics.assistant_name` > `agents.name` > module type fallback. This is a simple column addition with reads in `process-message.ts` — no new tables, no schema redesign.

**Tech Stack:** Supabase (migration), Zod (validation), Next.js API routes, React form component, next-intl (i18n)

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/018_clinic_assistant_name.sql`

**Step 1: Write the migration**

```sql
-- 018_clinic_assistant_name.sql
-- Add assistant_name to clinics for unified agent identity across all modules

alter table clinics
  add column assistant_name text;

comment on column clinics.assistant_name is
  'Optional unified name for the AI assistant. When set, all modules use this name instead of individual agent names.';
```

**Step 2: Run the migration against Supabase**

Run: `npx supabase db push` (or apply via Supabase dashboard)
Expected: Migration applies successfully, `clinics.assistant_name` column exists.

**Step 3: Commit**

```bash
git add supabase/migrations/018_clinic_assistant_name.sql
git commit -m "feat: add clinics.assistant_name column for unified agent identity"
```

---

### Task 2: Update Supabase Generated Types

**Files:**
- Modify: `src/types/database.ts` (clinics Row, Insert, Update sections)

**Step 1: Add `assistant_name` to the clinics Row type**

In `src/types/database.ts`, find the `clinics` → `Row` block (around line 206) and add:

```typescript
assistant_name: string | null
```

Add it alphabetically, right after `address`.

**Step 2: Add `assistant_name` to the clinics Insert type**

In the `Insert` block, add:

```typescript
assistant_name?: string | null
```

**Step 3: Add `assistant_name` to the clinics Update type**

In the `Update` block, add:

```typescript
assistant_name?: string | null
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add assistant_name to Supabase clinics types"
```

---

### Task 3: Update Zod Validation Schema

**Files:**
- Modify: `src/lib/validations/settings.ts:26-43` (clinicSettingsSchema)

**Step 1: Add `assistant_name` to `clinicSettingsSchema`**

In `src/lib/validations/settings.ts`, add this field to the `clinicSettingsSchema` object (after `name`):

```typescript
assistant_name: z.string().min(2).max(50).optional().or(z.literal("")),
```

Min 2 chars (a real name), max 50 chars. Optional — the clinic can leave it blank to keep per-agent names.

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/lib/validations/settings.ts
git commit -m "feat: add assistant_name to clinic settings validation schema"
```

---

### Task 4: Update Settings API Route

**Files:**
- Modify: `src/app/api/settings/clinic/route.ts:35-36` (GET select) — add `assistant_name` to the select string
- No changes needed to PUT — it already dynamically updates any field in `parsed.data`

**Step 1: Add `assistant_name` to the GET select string**

In `src/app/api/settings/clinic/route.ts`, find the `.select(...)` call in GET (line 35-36). Add `assistant_name` to the comma-separated list of fields. Insert it right after `name`:

```typescript
.select(
  "id, name, assistant_name, slug, phone, email, address, city, state, zip_code, logo_url, timezone, operating_hours, created_at, updated_at, google_reviews_url, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, is_active, type, description, public_page_enabled, accent_color, social_links, show_prices, google_calendar_id",
)
```

**Step 2: Verify the API works**

Run the dev server and hit `GET /api/settings/clinic` — verify `assistant_name` appears in response (will be `null` for existing clinics).

**Step 3: Commit**

```bash
git add src/app/api/settings/clinic/route.ts
git commit -m "feat: include assistant_name in clinic settings GET response"
```

---

### Task 5: Update i18n Messages (All 3 Locales)

**Files:**
- Modify: `messages/pt-BR.json` (settings.clinic section)
- Modify: `messages/en.json` (settings.clinic section)
- Modify: `messages/es.json` (settings.clinic section)

**Step 1: Add pt-BR translations**

In `messages/pt-BR.json`, inside the `"settings" > "clinic"` block, add after `"name"`:

```json
"assistantName": "Nome do assistente",
"assistantNamePlaceholder": "Ex: Sofia, Ana, Lia...",
"assistantNameHelp": "Nome único usado em todas as conversas. Se vazio, cada módulo usa seu próprio nome."
```

**Step 2: Add en translations**

In `messages/en.json`, inside the `"settings" > "clinic"` block, add after `"name"`:

```json
"assistantName": "Assistant name",
"assistantNamePlaceholder": "e.g., Sofia, Ana, Lia...",
"assistantNameHelp": "Single name used across all conversations. If empty, each module uses its own name."
```

**Step 3: Add es translations**

In `messages/es.json`, inside the `"settings" > "clinic"` block, add after `"name"`:

```json
"assistantName": "Nombre del asistente",
"assistantNamePlaceholder": "Ej: Sofía, Ana, Lía...",
"assistantNameHelp": "Nombre único usado en todas las conversaciones. Si vacío, cada módulo usa su propio nombre."
```

**Step 4: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add assistant_name i18n translations for all 3 locales"
```

---

### Task 6: Update Clinic Settings Form (UI)

**Files:**
- Modify: `src/components/settings/clinic-form.tsx`

**Step 1: Add `assistantName` state**

After the existing `name` state (line 32), add:

```typescript
const [assistantName, setAssistantName] = useState(clinic.assistant_name ?? "");
```

**Step 2: Include `assistant_name` in the form data object**

In the `handleSubmit` function, add `assistant_name: assistantName` to the `data` object (after `name`):

```typescript
const data = {
  name,
  assistant_name: assistantName,
  phone,
  // ... rest unchanged
};
```

**Step 3: Add the input field in the form JSX**

After the clinic name `<Input>` (around line 115-122), add:

```tsx
<div className="md:col-span-2">
  <Input
    id="assistantName"
    label={t("assistantName")}
    placeholder={t("assistantNamePlaceholder")}
    value={assistantName}
    onChange={(e) => setAssistantName(e.target.value)}
    error={fieldErrors.assistant_name}
  />
  <p
    className="mt-1 text-xs"
    style={{ color: "var(--text-muted)" }}
  >
    {t("assistantNameHelp")}
  </p>
</div>
```

Using `md:col-span-2` to make the field span full width — it's a prominent setting, visually distinct.

**Step 4: Verify the form renders**

Run the dev server, go to Settings > Clínica. Verify the new field appears after clinic name with placeholder and help text.

**Step 5: Verify save works**

Enter a name (e.g., "Sofia"), save, refresh the page. The name should persist.

**Step 6: Commit**

```bash
git add src/components/settings/clinic-form.tsx
git commit -m "feat: add assistant name input to clinic settings form"
```

---

### Task 7: Wire Master Name into Agent System (Core Logic)

**Files:**
- Modify: `src/lib/agents/process-message.ts:255-264, 314-318, 371-372`

This is the critical change. When building the system prompt, use `clinic.assistant_name` if set.

**Step 1: Add `assistant_name` to the clinic select query**

In `process-message.ts`, find the clinic select query (around line 314-318):

```typescript
const { data: clinic } = await supabase
  .from("clinics")
  .select("name, phone, address, timezone, whatsapp_phone_number_id, whatsapp_access_token")
  .eq("id", clinicId)
  .single();
```

Add `assistant_name` to the select:

```typescript
const { data: clinic } = await supabase
  .from("clinics")
  .select("name, assistant_name, phone, address, timezone, whatsapp_phone_number_id, whatsapp_access_token")
  .eq("id", clinicId)
  .single();
```

**Step 2: Update the `agentName` resolution logic**

Find line 263 where the agent name is resolved:

```typescript
const agentName = agentRow?.name ?? moduleType;
```

Change it to use the master name with fallback chain:

```typescript
// Priority: clinic.assistant_name > agentRow.name > moduleType
// (clinic fetched below — we'll move this line after the clinic query)
```

Actually, the clinic query happens at line 314 (after line 263). We need to either move the agentName resolution after the clinic query, or query clinic.assistant_name separately earlier.

**Best approach**: Keep the agentRow query where it is, but defer the final `agentName` resolution until after the clinic query. Replace line 263 with:

```typescript
const perAgentName = agentRow?.name ?? moduleType;
```

Then after the clinic query (around line 318), add:

```typescript
const agentName = (clinic?.assistant_name as string | null) ?? perAgentName;
```

**Step 3: Verify the full flow**

1. Set `assistant_name = "Sofia"` on a test clinic
2. Send a WhatsApp message to the test clinic
3. Check the system prompt includes `Your name is "Sofia".`
4. Clear `assistant_name` (set to null/empty)
5. Send another message — should fall back to per-agent name

**Step 4: Commit**

```bash
git add src/lib/agents/process-message.ts
git commit -m "feat: use clinic.assistant_name as master agent name across all modules"
```

---

### Task 8: Update Onboarding Wizard (Optional but Recommended)

**Files:**
- Modify: `src/components/onboarding/step-clinic.tsx`
- Modify: `src/components/onboarding/setup-wizard.tsx` (parent that manages state and save)

**Step 1: Add assistantName prop to StepClinic**

In `src/components/onboarding/step-clinic.tsx`, add to the props interface:

```typescript
assistantName: string;
onAssistantNameChange: (value: string) => void;
```

**Step 2: Add the input field to StepClinic JSX**

After the clinic name `<Input>`, add:

```tsx
<Input
  id="assistantName"
  label={t("step1.assistantName")}
  placeholder={t("step1.assistantNamePlaceholder")}
  value={assistantName}
  onChange={(e) => onAssistantNameChange(e.target.value)}
/>
<p
  className="text-xs"
  style={{ color: "var(--text-muted)" }}
>
  {t("step1.assistantNameHelp")}
</p>
```

**Step 3: Add state in setup-wizard.tsx**

In the parent wizard component, add the `assistantName` state and pass it down. Also include `assistant_name` in the payload sent to the API when saving the clinic step.

Read `setup-wizard.tsx` first to understand the save mechanism, then wire in accordingly.

**Step 4: Add onboarding i18n keys**

In all 3 locale files, inside `"onboarding" > "step1"`, add:

```json
"assistantName": "Nome do assistente virtual",
"assistantNamePlaceholder": "Ex: Sofia, Ana, Lia...",
"assistantNameHelp": "Dê um nome ao seu assistente — será usado em todas as conversas com pacientes."
```

(Translate appropriately for `en` and `es`.)

**Step 5: Commit**

```bash
git add src/components/onboarding/step-clinic.tsx src/components/onboarding/setup-wizard.tsx messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add assistant name to onboarding wizard step 1"
```

---

### Task 9: Update CLAUDE.md and Memory

**Files:**
- Modify: `CLAUDE.md` (Database section)

**Step 1: Add documentation for the new column**

In the `## Database` section of `CLAUDE.md`, add a new bullet:

```markdown
- `clinics.assistant_name` (text, nullable): unified AI assistant name across all modules. When set, overrides per-agent `agents.name` in system prompts. Priority: `clinic.assistant_name` > `agent.name` > module type fallback.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document clinics.assistant_name in CLAUDE.md"
```

---

### Task 10: Final Verification

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Manual test flow**

1. Go to Settings > Clínica → set assistant name to "Sofia" → save
2. Send a WhatsApp message → verify the AI responds as "Sofia"
3. Clear the assistant name → save → send another message → verify it falls back to per-module name (e.g., "Suporte")
4. Verify the name is consistent across module transitions (e.g., support → scheduling should both use "Sofia")

**Step 4: Final commit (if needed)**

```bash
git add -A
git commit -m "feat: master agent name — unified assistant identity across all modules"
```

---

## Summary of Changes

| Layer | File | Change |
|-------|------|--------|
| **DB** | `018_clinic_assistant_name.sql` | Add `assistant_name TEXT` to clinics |
| **Types** | `src/types/database.ts` | Add field to Row/Insert/Update |
| **Validation** | `src/lib/validations/settings.ts` | Add to `clinicSettingsSchema` |
| **API** | `src/app/api/settings/clinic/route.ts` | Include in GET select |
| **i18n** | `messages/{pt-BR,en,es}.json` | Add 3 translation keys per locale |
| **UI** | `src/components/settings/clinic-form.tsx` | Add input + help text |
| **Core** | `src/lib/agents/process-message.ts` | Priority chain: clinic.assistant_name > agent.name > moduleType |
| **Onboarding** | `step-clinic.tsx` + `setup-wizard.tsx` | Add field to onboarding wizard |
| **Docs** | `CLAUDE.md` | Document the new column |
