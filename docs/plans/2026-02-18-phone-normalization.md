# Phone Number Normalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix phone number normalization across the system so that (1) clinic phones are stored digits-only (no `+`), (2) Brazilian 9th-digit variants match the same patient.

**Architecture:** Create a shared phone utility module with normalization and variant-matching functions. Update all write paths to store digits-only in canonical format. Update all lookup paths to query both 9th-digit variants. No DB migration needed — fix at application layer.

**Tech Stack:** TypeScript, Zod, Supabase PostgREST, Vitest

---

## Context

### Problem 1: Clinic phone stored with `+`

The clinic settings form saves phone as-entered (e.g., `+5511988280512`). The WhatsApp webhook strips non-digits from `display_phone_number` and queries `clinics.phone` with `.eq("phone", "5511988280512")`. The `+` in the stored value causes a mismatch → clinic not found → messages silently dropped.

### Problem 2: Brazilian 9th digit

Brazilian mobile numbers migrated from 8 to 9 digits by prepending `9` after the area code (DDD). Old WhatsApp numbers may still come without it:

- Old format: `55` + `51` + `81208117` (12 digits)
- New format: `55` + `51` + `981208117` (13 digits)

These are the same person but the system does exact `.eq("phone", ...)` lookups, so they're treated as different patients.

### Current Phone Handling

| Entry Point | Normalizes? | Stores as | Lookup method |
|-------------|-------------|-----------|---------------|
| Clinic settings form | No (raw input) | `+5511...` (with `+`) | — |
| Patient form (manual) | Yes (Zod strips non-digits) | 10-11 digits (no country code) | — |
| Patient batch import | Yes (Zod strips non-digits) | 10-11 digits (no country code) | `.in("phone", phones)` |
| WhatsApp auto-create | Yes (`.replace(/\D/g, "")`) | 12-13 digits (with `55`) | `.eq("phone", normalized)` |
| Webhook clinic lookup | Yes (strips non-digits) | — | `.eq("phone", displayPhone)` |
| Patient search API | No (raw query) | — | `.like("phone", q+"%")` |

### Key Files

| File | Line(s) | Role |
|------|---------|------|
| `src/services/whatsapp.ts` | 141-143 | `normalizePhone()` — only strips non-digits |
| `src/app/api/webhooks/whatsapp/route.ts` | 65, 94 | Clinic lookup by phone |
| `src/lib/agents/process-message.ts` | 54-60, 64-84 | Patient lookup + auto-create |
| `src/lib/validations/settings.ts` | 30 | Clinic phone schema (no normalization) |
| `src/lib/validations/patients.ts` | 23-26 | Patient phone schema (strips non-digits, min 10 max 11) |
| `src/app/api/settings/clinic/route.ts` | 73-89 | Clinic settings PUT (no phone normalization) |
| `src/app/api/patients/route.ts` | 50-56 | Patient list search |
| `src/app/api/patients/batch/route.ts` | 85-121 | Batch import dedup |
| `src/app/api/calendar/patients/search/route.ts` | 40-52 | Patient autocomplete search |
| `src/components/settings/clinic-form.tsx` | 31-32 | Clinic phone state |

---

## Task 1: Create phone normalization utility + tests

**Files:**
- Create: `src/lib/utils/phone.ts`
- Create: `src/__tests__/lib/utils/phone.test.ts`

### Step 1: Write the failing tests

```typescript
// src/__tests__/lib/utils/phone.test.ts
import { describe, it, expect } from "vitest";
import {
  stripNonDigits,
  normalizeBRPhone,
  phoneLookupVariants,
} from "@/lib/utils/phone";

describe("stripNonDigits", () => {
  it("removes +, spaces, dashes, parentheses", () => {
    expect(stripNonDigits("+55 (51) 98120-8117")).toBe("5551981208117");
  });

  it("returns empty string for empty input", () => {
    expect(stripNonDigits("")).toBe("");
  });

  it("leaves digits-only input unchanged", () => {
    expect(stripNonDigits("5551981208117")).toBe("5551981208117");
  });
});

describe("normalizeBRPhone", () => {
  it("strips non-digits", () => {
    expect(normalizeBRPhone("+55 51 98120-8117")).toBe("5551981208117");
  });

  it("adds 9th digit to 12-digit number with country code", () => {
    expect(normalizeBRPhone("555181208117")).toBe("5551981208117");
  });

  it("does NOT add 9th digit to landline (3rd local digit is 2-5)", () => {
    expect(normalizeBRPhone("555132218117")).toBe("555132218117");
  });

  it("keeps 13-digit number with country code unchanged", () => {
    expect(normalizeBRPhone("5551981208117")).toBe("5551981208117");
  });

  it("adds 9th digit to 10-digit number without country code", () => {
    expect(normalizeBRPhone("5181208117")).toBe("51981208117");
  });

  it("does NOT add 9th digit to 10-digit landline without country code", () => {
    expect(normalizeBRPhone("5132218117")).toBe("5132218117");
  });

  it("keeps 11-digit number without country code unchanged", () => {
    expect(normalizeBRPhone("51981208117")).toBe("51981208117");
  });

  it("handles number with + prefix", () => {
    expect(normalizeBRPhone("+555181208117")).toBe("5551981208117");
  });
});

describe("phoneLookupVariants", () => {
  it("returns both variants for 13-digit mobile with country code", () => {
    const variants = phoneLookupVariants("5551981208117");
    expect(variants).toContain("5551981208117");
    expect(variants).toContain("555181208117");
  });

  it("returns both variants for 12-digit mobile with country code", () => {
    const variants = phoneLookupVariants("555181208117");
    expect(variants).toContain("555181208117");
    expect(variants).toContain("5551981208117");
  });

  it("returns both variants for 11-digit mobile without country code", () => {
    const variants = phoneLookupVariants("51981208117");
    expect(variants).toContain("51981208117");
    expect(variants).toContain("5181208117");
  });

  it("returns both variants for 10-digit mobile without country code", () => {
    const variants = phoneLookupVariants("5181208117");
    expect(variants).toContain("5181208117");
    expect(variants).toContain("51981208117");
  });

  it("returns single variant for landline (no 9th digit logic)", () => {
    const variants = phoneLookupVariants("555132218117");
    expect(variants).toHaveLength(1);
    expect(variants).toContain("555132218117");
  });

  it("strips non-digits before generating variants", () => {
    const variants = phoneLookupVariants("+55 51 98120-8117");
    expect(variants).toContain("5551981208117");
    expect(variants).toContain("555181208117");
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npx vitest run src/__tests__/lib/utils/phone.test.ts`
Expected: FAIL — module not found

### Step 3: Write minimal implementation

```typescript
// src/lib/utils/phone.ts

/**
 * Strip all non-digit characters from a phone string.
 */
export function stripNonDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Check if a local number (after DDD) looks like a mobile number.
 * Brazilian mobile numbers start with 6, 7, 8, or 9.
 * Landlines start with 2, 3, 4, or 5.
 */
function isMobileNumber(firstDigitAfterDDD: string): boolean {
  return /^[6-9]/.test(firstDigitAfterDDD);
}

/**
 * Normalize a Brazilian phone number to canonical format:
 * - Strips all non-digit characters
 * - Adds the 9th digit for mobile numbers missing it
 *
 * Does NOT add/remove country code — preserves whatever format was given.
 *
 * Examples:
 *   "+55 (51) 8120-8117" → "5551981208117" (added 9th digit)
 *   "5551981208117"      → "5551981208117" (already canonical)
 *   "5181208117"          → "51981208117"   (added 9th digit, no country code)
 *   "555132218117"        → "555132218117"  (landline, unchanged)
 */
export function normalizeBRPhone(phone: string): string {
  const digits = stripNonDigits(phone);

  // With country code 55
  if (digits.startsWith("55") && digits.length === 12) {
    const numberAfterDDD = digits.slice(4);
    if (isMobileNumber(numberAfterDDD)) {
      return digits.slice(0, 4) + "9" + numberAfterDDD;
    }
  }

  // Without country code
  if (!digits.startsWith("55") && digits.length === 10) {
    const numberAfterDDD = digits.slice(2);
    if (isMobileNumber(numberAfterDDD)) {
      return digits.slice(0, 2) + "9" + numberAfterDDD;
    }
  }

  return digits;
}

/**
 * Generate all phone variants for database lookup.
 * Returns both with and without the 9th digit for mobile numbers,
 * so a query can match either format stored in the database.
 *
 * Example: "5551981208117" → ["5551981208117", "555181208117"]
 * Example: "555132218117"  → ["555132218117"] (landline, no variant)
 */
export function phoneLookupVariants(phone: string): string[] {
  const digits = stripNonDigits(phone);
  const variants = new Set<string>([digits]);

  // With country code 55
  if (digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const localNumber = digits.slice(4);

    if (localNumber.length === 9 && localNumber.startsWith("9") && isMobileNumber(localNumber.slice(1))) {
      // Has 9th digit → add variant without it
      variants.add("55" + ddd + localNumber.slice(1));
    } else if (localNumber.length === 8 && isMobileNumber(localNumber)) {
      // Missing 9th digit → add variant with it
      variants.add("55" + ddd + "9" + localNumber);
    }
    return Array.from(variants);
  }

  // Without country code
  if (digits.length >= 10 && digits.length <= 11) {
    const ddd = digits.slice(0, 2);
    const localNumber = digits.slice(2);

    if (localNumber.length === 9 && localNumber.startsWith("9") && isMobileNumber(localNumber.slice(1))) {
      // Has 9th digit → add variant without it
      variants.add(ddd + localNumber.slice(1));
    } else if (localNumber.length === 8 && isMobileNumber(localNumber)) {
      // Missing 9th digit → add variant with it
      variants.add(ddd + "9" + localNumber);
    }
  }

  return Array.from(variants);
}
```

### Step 4: Run tests to verify they pass

Run: `npx vitest run src/__tests__/lib/utils/phone.test.ts`
Expected: All PASS

### Step 5: Commit

```bash
git add src/lib/utils/phone.ts src/__tests__/lib/utils/phone.test.ts
git commit -m "feat: add brazilian phone normalization utility with 9th digit handling"
```

---

## Task 2: Normalize clinic phone on save

**Files:**
- Modify: `src/lib/validations/settings.ts:30` (clinic phone schema)
- Modify: `src/components/settings/clinic-form.tsx:31-32` (form state init)

### Step 1: Update clinic phone validation schema

In `src/lib/validations/settings.ts`, change the `phone` field to strip non-digits via transform:

```typescript
// OLD (line 30):
phone: z.string().max(20).optional().or(z.literal("")),

// NEW:
phone: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().max(20)).optional().or(z.literal("")),
```

This ensures that whenever clinic settings are saved through the API, the phone is stored digits-only. The `+` is stripped, spaces removed, etc.

### Step 2: Verify form still works

The clinic form sends raw input → Zod transforms it → API stores digits-only. No form-side changes needed since the schema handles normalization. The form already reads `clinic.phone` from the DB (which will now be digits-only for new saves).

### Step 3: Commit

```bash
git add src/lib/validations/settings.ts
git commit -m "fix: normalize clinic phone to digits-only on save"
```

---

## Task 3: Update patient lookup to handle 9th digit variants

**Files:**
- Modify: `src/lib/agents/process-message.ts:54-60, 71, 83`

This is the critical path — when a WhatsApp message arrives and we look up the patient.

### Step 1: Update patient lookup to use variants

Replace the exact `.eq("phone", normalizedPhone)` with `.in("phone", variants)`:

```typescript
// src/lib/agents/process-message.ts

// Add import at top:
import { stripNonDigits, normalizeBRPhone, phoneLookupVariants } from "@/lib/utils/phone";

// Line 54 — replace:
//   const normalizedPhone = phone.replace(/\D/g, "");
// with:
const normalizedPhone = normalizeBRPhone(phone);
const phoneVariants = phoneLookupVariants(normalizedPhone);

// Lines 55-60 — replace:
//   .eq("phone", normalizedPhone)
// with:
//   .in("phone", phoneVariants)
let { data: patient } = await supabase
  .from("patients")
  .select("id, name, phone, notes, custom_fields")
  .eq("clinic_id", clinicId)
  .in("phone", phoneVariants)
  .maybeSingle();

// Line 71 — patient auto-creation keeps using normalizedPhone (canonical form):
phone: normalizedPhone,

// Lines 79-84 — race condition re-query also uses variants:
.in("phone", phoneVariants)
```

### Step 2: Verify no regressions

Run: `npx vitest run src/__tests__/lib/agents/process-message.test.ts` (if exists)

### Step 3: Commit

```bash
git add src/lib/agents/process-message.ts
git commit -m "fix: patient lookup handles 9th digit variants for brazilian mobile numbers"
```

---

## Task 4: Update patient creation schema to accept phones with country code

**Files:**
- Modify: `src/lib/validations/patients.ts:23-26`

Currently the patient phone schema allows 10-11 digits only. WhatsApp phones come as 12-13 digits (with `55` prefix). This needs to accept both formats and normalize.

### Step 1: Update schema

```typescript
// OLD (lines 23-26):
phone: z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().min(10).max(11)),

// NEW:
phone: z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().min(10).max(13)),
```

Explanation: Accept 10 digits (local without 9th digit) through 13 digits (country code + DDD + 9 + 8 digits). The normalization to canonical form happens at the application layer (process-message.ts, forms), not in the schema — the schema just validates the range.

### Step 2: Run existing patient tests

Run: `npx vitest run src/__tests__/ --grep patient`
Expected: All PASS

### Step 3: Commit

```bash
git add src/lib/validations/patients.ts
git commit -m "fix: accept phone numbers with country code (10-13 digits)"
```

---

## Task 5: Update patient search APIs to handle 9th digit variants

**Files:**
- Modify: `src/app/api/patients/route.ts:50-56`
- Modify: `src/app/api/calendar/patients/search/route.ts:40-52`

### Step 1: Update patient list search

In `src/app/api/patients/route.ts`, when searching by phone digits, expand to include both 9th-digit variants:

```typescript
// Add import:
import { phoneLookupVariants } from "@/lib/utils/phone";

// Replace lines 50-56:
if (q.length >= 2) {
  const isDigits = /^\d+$/.test(q);
  if (isDigits) {
    const variants = phoneLookupVariants(q);
    query = query.or(variants.map((v) => `phone.like.${v}%`).join(","));
  } else {
    query = query.ilike("name", "%" + q + "%");
  }
}
```

### Step 2: Update calendar patient search

In `src/app/api/calendar/patients/search/route.ts`, same pattern:

```typescript
// Add import:
import { phoneLookupVariants } from "@/lib/utils/phone";

// Replace lines 48-52:
if (isPhoneSearch) {
  const variants = phoneLookupVariants(q);
  query = query.or(variants.map((v) => `phone.like.${v}%`).join(","));
} else {
  query = query.ilike("name", `%${q}%`);
}
```

### Step 3: Commit

```bash
git add src/app/api/patients/route.ts src/app/api/calendar/patients/search/route.ts
git commit -m "fix: patient search handles 9th digit phone variants"
```

---

## Task 6: Update batch import deduplication

**Files:**
- Modify: `src/app/api/patients/batch/route.ts:85-121`

### Step 1: Normalize phones and check variants in batch dedup

The batch import needs to check if a patient already exists with either phone variant. Update the dedup logic:

```typescript
// Add import:
import { normalizeBRPhone, phoneLookupVariants } from "@/lib/utils/phone";

// After Zod validation (around line 80), normalize each phone to canonical form:
const normalizedRows = validRows.map((row) => ({
  ...row,
  phone: normalizeBRPhone(row.phone),
}));

// For existing phone check (line 85-91), expand to include all variants:
const allVariants: string[] = [];
for (const row of normalizedRows) {
  allVariants.push(...phoneLookupVariants(row.phone));
}
const uniqueVariants = [...new Set(allVariants)];

const { data: existingRows, error: fetchError } = await admin
  .from("patients")
  .select("phone")
  .eq("clinic_id", clinicId)
  .in("phone", uniqueVariants);

// Build existing phone set including all variants of each existing phone:
const existingPhones = new Set<string>();
for (const row of existingRows ?? []) {
  for (const v of phoneLookupVariants(row.phone as string)) {
    existingPhones.add(v);
  }
}

// In the dedup loop, check canonical form against expanded set:
const seenPhones = new Set<string>();
for (const row of normalizedRows) {
  const canonical = row.phone;
  const variants = phoneLookupVariants(canonical);
  const isDuplicate = variants.some((v) => existingPhones.has(v));
  const isSeenInBatch = variants.some((v) => seenPhones.has(v));

  if (isDuplicate) {
    skipped.push({ phone: row.phone, reason: "duplicate" });
    continue;
  }
  if (isSeenInBatch) {
    skipped.push({ phone: row.phone, reason: "duplicate_in_batch" });
    continue;
  }
  for (const v of variants) seenPhones.add(v);
  toInsert.push(row);
}
```

### Step 2: Commit

```bash
git add src/app/api/patients/batch/route.ts
git commit -m "fix: batch import dedup handles 9th digit phone variants"
```

---

## Task 7: Replace scattered `normalizePhone` with shared utility

**Files:**
- Modify: `src/services/whatsapp.ts:141-143` (keep for backward compat, re-export from shared)
- Modify: `src/app/api/webhooks/whatsapp/route.ts:65` (use shared utility)

### Step 1: Update whatsapp.ts to re-export from shared utility

```typescript
// src/services/whatsapp.ts — replace lines 141-143:

// OLD:
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// NEW:
export { stripNonDigits as normalizePhone } from "@/lib/utils/phone";
```

### Step 2: Update webhook route to use normalizeBRPhone for clinic lookup

In `src/app/api/webhooks/whatsapp/route.ts`, line 65:

```typescript
// Add import:
import { normalizeBRPhone } from "@/lib/utils/phone";

// Replace line 65:
//   const displayPhone = value.metadata.display_phone_number.replace(/\D/g, "");
// with:
const displayPhone = normalizeBRPhone(value.metadata.display_phone_number);
```

This ensures the webhook also normalizes the 9th digit when looking up clinics (edge case but good for consistency).

### Step 3: Commit

```bash
git add src/services/whatsapp.ts src/app/api/webhooks/whatsapp/route.ts
git commit -m "refactor: consolidate phone normalization to shared utility"
```

---

## Task 8: Run full test suite + manual verification

### Step 1: Run all tests

Run: `npx vitest run`
Expected: All PASS

### Step 2: Manual verification checklist

- [ ] Go to Settings → Clínica, enter phone with `+` prefix (e.g., `+5511988280512`), save → DB should store `5511988280512`
- [ ] Send WhatsApp message to the clinic number → webhook should find the clinic
- [ ] Send message from an old WhatsApp number (without 9th digit) → should match existing patient or create with canonical phone
- [ ] Search patients by old-format phone → should find the patient
- [ ] Import patients via CSV with mixed phone formats → dedup should catch variants

### Step 3: Final commit

```bash
git add -A
git commit -m "test: verify phone normalization across all entry points"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/utils/phone.ts` | NEW — shared phone utilities |
| `src/__tests__/lib/utils/phone.test.ts` | NEW — unit tests |
| `src/lib/validations/settings.ts` | Normalize clinic phone via Zod transform |
| `src/lib/validations/patients.ts` | Accept 10-13 digit phones |
| `src/lib/agents/process-message.ts` | Patient lookup with 9th digit variants |
| `src/app/api/webhooks/whatsapp/route.ts` | Use `normalizeBRPhone` for clinic lookup |
| `src/app/api/patients/route.ts` | Search with phone variants |
| `src/app/api/calendar/patients/search/route.ts` | Search with phone variants |
| `src/app/api/patients/batch/route.ts` | Batch dedup with phone variants |
| `src/services/whatsapp.ts` | Re-export from shared utility |
