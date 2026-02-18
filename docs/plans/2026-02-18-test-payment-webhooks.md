# Test Payment Webhooks — Seed Data + Curl Commands

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create 3 invoices + payment_links for patient `809e2b13-b3ed-4257-b810-c0849cfddc07` (Pix, credit card, boleto) and provide curl commands to test all Asaas webhook events.

**Architecture:** Direct SQL inserts into `invoices` and `payment_links` tables with fake `asaas_payment_id` values. Webhook tests via curl against local dev server.

**Tech Stack:** SQL (Supabase), curl, Next.js dev server

---

### Task 1: Create SQL seed script for test payments

**Files:**
- Create: `scripts/seed-test-payments.sql`

**Step 1: Write the SQL script**

The script must:
1. Look up the patient's `clinic_id` from `patients` table
2. Create 3 invoices with different amounts and known UUIDs
3. Create 3 payment_links (one per method: `pix`, `credit_card`, `boleto`)
4. Use `gen_random_uuid()` for IDs but output them for webhook testing

```sql
-- Seed test payments for patient 809e2b13-b3ed-4257-b810-c0849cfddc07
-- Run against Supabase SQL Editor or psql

DO $$
DECLARE
  v_patient_id uuid := '809e2b13-b3ed-4257-b810-c0849cfddc07';
  v_clinic_id uuid;
  v_inv_pix uuid;
  v_inv_card uuid;
  v_inv_boleto uuid;
BEGIN
  -- Look up clinic
  SELECT clinic_id INTO v_clinic_id
  FROM patients WHERE id = v_patient_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found: %', v_patient_id;
  END IF;

  -- 1) Pix invoice — R$150.00
  INSERT INTO invoices (clinic_id, patient_id, amount_cents, status, due_date, notes)
  VALUES (v_clinic_id, v_patient_id, 15000, 'pending', CURRENT_DATE + 7, 'Test Pix payment')
  RETURNING id INTO v_inv_pix;

  INSERT INTO payment_links (clinic_id, invoice_id, asaas_payment_id, url, method, status)
  VALUES (v_clinic_id, v_inv_pix, 'pay_test_pix_001', 'https://sandbox.asaas.com/test-pix', 'pix', 'active');

  -- 2) Credit card invoice — R$200.00
  INSERT INTO invoices (clinic_id, patient_id, amount_cents, status, due_date, notes)
  VALUES (v_clinic_id, v_patient_id, 20000, 'pending', CURRENT_DATE + 7, 'Test credit card payment')
  RETURNING id INTO v_inv_card;

  INSERT INTO payment_links (clinic_id, invoice_id, asaas_payment_id, url, method, status)
  VALUES (v_clinic_id, v_inv_card, 'pay_test_card_001', 'https://sandbox.asaas.com/test-card', 'credit_card', 'active');

  -- 3) Boleto invoice — R$100.00
  INSERT INTO invoices (clinic_id, patient_id, amount_cents, status, due_date, notes)
  VALUES (v_clinic_id, v_patient_id, 10000, 'pending', CURRENT_DATE + 7, 'Test boleto payment')
  RETURNING id INTO v_inv_boleto;

  INSERT INTO payment_links (clinic_id, invoice_id, asaas_payment_id, url, method, status)
  VALUES (v_clinic_id, v_inv_boleto, 'pay_test_boleto_001', 'https://sandbox.asaas.com/test-boleto', 'boleto', 'active');

  -- Output created IDs for webhook testing
  RAISE NOTICE '=== TEST PAYMENT IDs ===';
  RAISE NOTICE 'Pix invoice:        %', v_inv_pix;
  RAISE NOTICE 'Credit card invoice: %', v_inv_card;
  RAISE NOTICE 'Boleto invoice:      %', v_inv_boleto;
  RAISE NOTICE '========================';
END $$;
```

**Step 2: Commit**

```bash
git add scripts/seed-test-payments.sql
git commit -m "chore: add test payment seed script for webhook testing"
```

---

### Task 2: Create webhook test script (curl commands)

**Files:**
- Create: `scripts/test-asaas-webhooks.sh`

**Step 1: Write the shell script**

The script takes invoice IDs from the SQL output and sends simulated webhook events. The user must:
1. Set `ASAAS_WEBHOOK_TOKEN` env var (or hardcode for local testing)
2. Replace `<INVOICE_ID_*>` placeholders with actual UUIDs from Task 1
3. Run with dev server on `localhost:3000`

```bash
#!/bin/bash
# Test Asaas webhook events against local dev server
# Usage: Replace <INVOICE_ID_PIX>, <INVOICE_ID_CARD>, <INVOICE_ID_BOLETO> with actual UUIDs
# Then run: bash scripts/test-asaas-webhooks.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${ASAAS_WEBHOOK_TOKEN:-your_webhook_token_here}"

echo "=== Testing Asaas Webhooks ==="
echo "Target: $BASE_URL/api/webhooks/asaas"
echo ""

# --- PIX: PAYMENT_RECEIVED ---
echo "1. PIX → PAYMENT_RECEIVED"
curl -s -X POST "$BASE_URL/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: $TOKEN" \
  -d '{
    "event": "PAYMENT_RECEIVED",
    "payment": {
      "id": "pay_test_pix_001",
      "externalReference": "<INVOICE_ID_PIX>",
      "value": 150.00,
      "billingType": "PIX",
      "status": "RECEIVED",
      "paymentDate": "2026-02-18"
    }
  }' | jq .
echo ""

# --- CREDIT CARD: PAYMENT_CONFIRMED ---
echo "2. CREDIT CARD → PAYMENT_CONFIRMED"
curl -s -X POST "$BASE_URL/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: $TOKEN" \
  -d '{
    "event": "PAYMENT_CONFIRMED",
    "payment": {
      "id": "pay_test_card_001",
      "externalReference": "<INVOICE_ID_CARD>",
      "value": 200.00,
      "billingType": "CREDIT_CARD",
      "status": "CONFIRMED",
      "paymentDate": "2026-02-18"
    }
  }' | jq .
echo ""

# --- BOLETO: PAYMENT_OVERDUE ---
echo "3. BOLETO → PAYMENT_OVERDUE"
curl -s -X POST "$BASE_URL/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: $TOKEN" \
  -d '{
    "event": "PAYMENT_OVERDUE",
    "payment": {
      "id": "pay_test_boleto_001",
      "externalReference": "<INVOICE_ID_BOLETO>",
      "value": 100.00,
      "billingType": "BOLETO",
      "status": "OVERDUE",
      "paymentDate": null
    }
  }' | jq .
echo ""

# --- BOLETO: Then pay it (PAYMENT_RECEIVED) ---
echo "4. BOLETO → PAYMENT_RECEIVED (after overdue)"
curl -s -X POST "$BASE_URL/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: $TOKEN" \
  -d '{
    "event": "PAYMENT_RECEIVED",
    "payment": {
      "id": "pay_test_boleto_001",
      "externalReference": "<INVOICE_ID_BOLETO>",
      "value": 100.00,
      "billingType": "BOLETO",
      "status": "RECEIVED",
      "paymentDate": "2026-02-18"
    }
  }' | jq .
echo ""

# --- PIX: PAYMENT_REFUNDED (test refund flow) ---
echo "5. PIX → PAYMENT_REFUNDED (after paid)"
curl -s -X POST "$BASE_URL/api/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: $TOKEN" \
  -d '{
    "event": "PAYMENT_REFUNDED",
    "payment": {
      "id": "pay_test_pix_001",
      "externalReference": "<INVOICE_ID_PIX>",
      "value": 150.00,
      "billingType": "PIX",
      "status": "REFUNDED",
      "paymentDate": null
    }
  }' | jq .
echo ""

echo "=== Done ==="
```

**Step 2: Commit**

```bash
git add scripts/test-asaas-webhooks.sh
git commit -m "chore: add asaas webhook test script with curl commands"
```

---

### Task 3: Run the SQL and test

**Step 1: Run the SQL seed script**

Run `scripts/seed-test-payments.sql` in Supabase SQL Editor. Copy the 3 invoice UUIDs from the NOTICE output.

**Step 2: Update the webhook test script**

Replace the `<INVOICE_ID_*>` placeholders with actual UUIDs.

**Step 3: Start dev server and run webhook tests**

```bash
npm run dev
# In another terminal:
bash scripts/test-asaas-webhooks.sh
```

**Expected Results:**

| # | Event | Invoice | Expected DB State |
|---|-------|---------|-------------------|
| 1 | PAYMENT_RECEIVED | Pix | invoice.status=`paid`, payment_link.status=`paid` |
| 2 | PAYMENT_CONFIRMED | Card | invoice.status=`paid`, payment_link.status=`paid` |
| 3 | PAYMENT_OVERDUE | Boleto | invoice.status=`overdue` |
| 4 | PAYMENT_RECEIVED | Boleto | invoice.status=`paid` (overdue→paid) |
| 5 | PAYMENT_REFUNDED | Pix | invoice.status=`pending`, payment_link.status=`active` |

**Step 4: Verify in Supabase**

Check `invoices` and `payment_links` tables for the patient to confirm all status transitions.
