# Auto-Billing Onboarding Integration

**Date:** 2026-02-18
**Status:** Approved

## Problem

Billing module is always active after signup. Clinics have no way to opt-in/out of automatic payment collection. Invoices are not linked to appointments automatically, and the confirmation flow has no awareness of pending payments.

## Decisions

| Decision | Choice |
|----------|--------|
| When to create invoice | At booking (scheduling agent) |
| Confirmation with pending payment | Remind + include payment link |
| Wizard step | New step 4 after Services |
| Effect of disabling | Only stops auto-creation (dashboard still works) |
| Invoice amount | `professional_services.price_cents` (fallback: service base price) |
| Due date | Appointment date |
| Payment link | Same message as booking confirmation |
| Collect CPF + email | Before booking when missing (new tool) |
| Config storage | `module_configs.settings.auto_billing` |

## Approach

**Side-effect in `handleBookAppointment`** — invoice + payment link created automatically inside the scheduling agent's booking handler. No LLM decision needed; this is a deterministic business rule.

## Data Model

### Configuration: `module_configs.settings`

For `module_type = 'billing'`, the `settings` JSONB field gains:

```json
{ "auto_billing": true }
```

- `true` → invoice auto-created on booking + payment reminder in confirmations
- `false` (or absent) → no automation, manual billing via dashboard still works
- Signup creates with `{ "auto_billing": false }` (opt-in during onboarding)

### No schema migration needed

- `module_configs.settings` already exists as `jsonb DEFAULT '{}'`
- `patients.email` already exists in migration 001
- `invoices.appointment_id` already exists as nullable FK

### Helper function

```ts
async function isAutoBillingEnabled(supabase, clinicId: string): Promise<boolean> {
  const { data } = await supabase
    .from("module_configs")
    .select("settings")
    .eq("clinic_id", clinicId)
    .eq("module_type", "billing")
    .single();
  return data?.settings?.auto_billing === true;
}
```

## Onboarding Wizard

### New step 4: "Cobrança automática"

Wizard grows from 5 to 6 steps:

| Step | Content |
|------|---------|
| 1 | Clinic info |
| 2 | Operating hours |
| 3 | Professional + Services |
| **4** | **Auto-billing toggle** |
| 5 | WhatsApp credentials |
| 6 | Google Calendar |

**UX:** Simple toggle with explanation text. Saves via API that updates `module_configs.settings` for billing module.

## Scheduling Agent Changes

### New tool: `save_patient_billing_info`

```ts
save_patient_billing_info({
  cpf: string,   // 11 digits
  email: string  // valid email
})
```

- Validates CPF format (11 numeric digits) and email format
- Saves to `patients.cpf` and `patients.email`
- Only available when `auto_billing = true`
- LLM asks only for missing fields (if patient already has CPF, only asks email, etc.)

### Modified `handleBookAppointment`

After creating appointment + enqueuing confirmations:

1. Check `isAutoBillingEnabled(clinicId)`
2. If `false` → current flow (return booking confirmation)
3. If `true`:
   a. Fetch `price_cents` from `professional_services` (fallback: `services.base_price_cents`)
   b. If no price found → log warning, return booking confirmation only
   c. Insert invoice: `{ clinic_id, patient_id, appointment_id, amount_cents, due_date: appointment_date, status: 'pending' }`
   d. Call `ensureAsaasCustomer()` + `createCharge()` with method `'link'` (universal)
   e. Insert `payment_links` row
   f. Return `appendToResponse` with payment URL, amount, due date

### System prompt additions

When `auto_billing = true`:
- "Before booking, verify the patient has CPF and email. If either is missing, ask politely before proceeding."
- "After booking, a payment link will be generated automatically. Do not fabricate payment URLs."

### Conversation flow

```
Patient: "I want to book with Dr. João tomorrow at 10am"
LLM: [check_availability] → available
LLM: "To confirm your appointment, I need your CPF and email for billing."
Patient: "123.456.789-00, maria@email.com"
LLM: [save_patient_billing_info] → saved
LLM: [book_appointment] → booked + invoice + link
Response: "Appointment booked! ✅ ...
🔗 Payment link: https://asaas.com/...
Amount: R$ 150.00
Due: 2026-02-20"
```

## Confirmation Agent Changes

### Modified `handleConfirmAttendance`

After confirming attendance (current flow):

1. Check `isAutoBillingEnabled(clinicId)`
2. If `false` → normal confirmation
3. If `true`:
   a. Query invoice WHERE `appointment_id = X` AND `status IN ('pending', 'overdue')`
   b. If no pending invoice → normal confirmation
   c. If pending invoice exists:
      - Fetch active `payment_links` for this invoice
      - If link exists → `appendToResponse` with reminder + URL
      - If no link → create one (ensureAsaasCustomer + createCharge)
      - Append: "Payment reminder: R$ X pending. 🔗 Pay here: ..."

### System prompt additions

When `auto_billing = true`:
- "After confirming attendance, check if there is a pending payment. If so, include a polite reminder with the payment link."

## Cancel/Reschedule Impact

### Cancel appointment

When cancelling an appointment that has a linked invoice:
- Invoice `pending` → set `status: 'cancelled'`
- Invoice `paid` → no change (refund is manual)
- Invoice `overdue` → set `status: 'cancelled'`

### Reschedule (via confirmation agent)

- Existing invoice is **cancelled**
- New invoice created on the new booking (if auto_billing active)

## Unchanged Components

- **Billing cron** — already finds pending/overdue invoices; auto-created ones appear naturally
- **Billing agent** — continues handling conversation when patient replies about billing
- **Asaas webhook** — already handles PAYMENT_RECEIVED/CONFIRMED/OVERDUE
- **Dashboard payments view** — auto-created invoices appear in existing listing
- **Activation requirements** — no new requirement added (billing is optional)

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│                    ONBOARDING                         │
│  Step 4: "Cobrança automática" toggle                │
│  → module_configs.settings.auto_billing = true/false │
└──────────────────┬───────────────────────────────────┘
                   │
     ┌─────────────▼─────────────┐
     │  isAutoBillingEnabled()   │  ← shared helper
     └─────┬──────────┬──────────┘
           │          │
    ┌──────▼───┐  ┌───▼──────────────┐
    │SCHEDULING│  │  CONFIRMATION    │
    │  Agent   │  │    Agent         │
    ├──────────┤  ├──────────────────┤
    │ Ask CPF  │  │ Confirm attend.  │
    │ + email  │  │ + payment remind │
    │ if miss. │  │ if invoice pend. │
    │          │  │                  │
    │ Create:  │  │ appendToResponse │
    │ - appt   │  │ with payment URL │
    │ - invoice│  │                  │
    │ - link   │  │                  │
    └──────┬───┘  └──────────────────┘
           │
    ┌──────▼───────────┐
    │ Cancel/Reschedule│
    │ → cancel invoice │
    └──────────────────┘
```
