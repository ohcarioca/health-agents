# Payments Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-management payments page at `/payments` where clinic owners can view KPIs, filter/search invoices, create new invoices, generate Asaas payment links, mark invoices as paid, and see invoice details in a slide-over panel.

**Architecture:** Server Component page fetches initial data and passes to a `PaymentsView` client component (mirrors `PatientsView` pattern). API routes are enhanced/created for filtering, detail, update, and payment link generation. Slide-over panel replaces navigation for detail view.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase (admin client for API, server client for auth), Asaas API (via existing `src/services/asaas.ts`), next-intl, Tailwind v4, lucide-react icons, existing UI components (Badge, Button, Dialog, KpiCard).

---

## Task 1: Add i18n translations for payments

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Step 1: Add `nav.payments` and `payments` namespace to all 3 locale files**

In `messages/pt-BR.json`, add inside the `"nav"` object:
```json
"payments": "Pagamentos"
```

Then add a new top-level `"payments"` section:
```json
"payments": {
  "title": "Pagamentos",
  "subtitle": "Gerencie faturas e cobranças",
  "count": "{count} faturas",
  "add": "Nova Fatura",
  "searchPlaceholder": "Buscar por paciente...",
  "filterAll": "Todos",
  "filterPending": "Pendente",
  "filterOverdue": "Vencido",
  "filterPaid": "Pago",
  "filterCancelled": "Cancelado",
  "periodThisMonth": "Este mês",
  "periodLast30": "Últimos 30 dias",
  "periodLast90": "Últimos 90 dias",
  "periodAll": "Todo período",
  "patient": "Paciente",
  "amount": "Valor",
  "dueDate": "Vencimento",
  "status": "Status",
  "method": "Método",
  "actions": "Ações",
  "view": "Ver detalhes",
  "sendLink": "Enviar link",
  "markPaid": "Marcar como pago",
  "cancelInvoice": "Cancelar fatura",
  "cancelConfirm": "Tem certeza que deseja cancelar esta fatura?",
  "markPaidConfirm": "Confirmar recebimento manual desta fatura?",
  "page": "Página {page} de {total}",
  "previous": "Anterior",
  "nextPage": "Próxima",
  "empty": "Nenhuma fatura cadastrada",
  "emptyHint": "Crie uma fatura para começar a cobrar seus pacientes",
  "noResults": "Nenhuma fatura encontrada",
  "kpiPending": "Pendente",
  "kpiOverdue": "Vencido",
  "kpiPaid": "Recebido",
  "kpiConversion": "Taxa de conversão",
  "kpiThisMonth": "este mês",
  "detail": {
    "title": "Detalhes da Fatura",
    "patient": "Paciente",
    "phone": "Telefone",
    "amount": "Valor",
    "dueDate": "Vencimento",
    "status": "Status",
    "notes": "Observações",
    "noNotes": "Sem observações",
    "paymentLinks": "Links de Pagamento",
    "noLinks": "Nenhum link gerado",
    "generatePix": "Gerar Pix",
    "generateBoleto": "Gerar Boleto",
    "generateCard": "Gerar Cartão",
    "copyLink": "Copiar link",
    "copied": "Copiado!",
    "linkActive": "Ativo",
    "linkPaid": "Pago",
    "linkExpired": "Expirado",
    "timeline": "Histórico",
    "createdAt": "Fatura criada",
    "paidAt": "Pagamento recebido"
  },
  "form": {
    "title": "Nova Fatura",
    "patient": "Paciente",
    "patientPlaceholder": "Buscar paciente...",
    "amount": "Valor (R$)",
    "amountPlaceholder": "0,00",
    "dueDate": "Data de vencimento",
    "notes": "Observações",
    "notesPlaceholder": "Observações opcionais...",
    "submit": "Criar Fatura",
    "creating": "Criando...",
    "success": "Fatura criada com sucesso",
    "error": "Erro ao criar fatura"
  },
  "errors": {
    "loadError": "Erro ao carregar faturas",
    "updateError": "Erro ao atualizar fatura",
    "linkError": "Erro ao gerar link de pagamento",
    "patientNoCpf": "Paciente não possui CPF cadastrado (necessário para cobrança)"
  }
}
```

Do the same for `en.json` (English translations) and `es.json` (Spanish translations).

**Step 2: Commit**

```bash
git add messages/pt-BR.json messages/en.json messages/es.json
git commit -m "feat: add payments page i18n translations"
```

---

## Task 2: Add sidebar navigation item

**Files:**
- Modify: `src/components/layout/sidebar-nav.tsx`

**Step 1: Add CreditCard import and nav item**

In `sidebar-nav.tsx`, add `CreditCard` to the lucide-react import:
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
  Users,
  Settings,
} from "lucide-react";
```

In the `NAV_ITEMS` array, insert between patients and modules (after `{ href: "/patients", ... }`):
```ts
{ href: "/payments", icon: CreditCard, labelKey: "nav.payments" },
```

**Step 2: Commit**

```bash
git add src/components/layout/sidebar-nav.tsx
git commit -m "feat: add payments to sidebar navigation"
```

---

## Task 3: Enhance GET /api/invoices with filtering, search, and pagination

**Files:**
- Modify: `src/app/api/invoices/route.ts`

**Step 1: Rewrite the GET handler**

Replace the existing GET function with enhanced version that supports:
- `status` filter (existing)
- `search` param: joins `patients` table, filters by `patients.name` ilike
- `period` param: `this-month`, `30d`, `90d` (date range on `due_date`)
- `page` param: offset pagination (25 per page)
- Returns `{ data, count }` with patient info and payment_links joined

```ts
export async function GET(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const period = searchParams.get("period");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = 25;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const admin = createAdminClient();

  let query = admin
    .from("invoices")
    .select("*, patients!inner(id, name, phone, cpf, email, asaas_customer_id), payment_links(*)", { count: "exact" })
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search && search.trim().length >= 2) {
    query = query.ilike("patients.name", `%${search.trim()}%`);
  }

  if (period) {
    const now = new Date();
    let startDate: string | undefined;
    if (period === "this-month") {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    } else if (period === "30d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString().split("T")[0];
    } else if (period === "90d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      startDate = d.toISOString().split("T")[0];
    }
    if (startDate) {
      query = query.gte("due_date", startDate);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count });
}
```

The POST handler stays unchanged.

**Step 2: Commit**

```bash
git add src/app/api/invoices/route.ts
git commit -m "feat: enhance invoices GET with search, period, pagination"
```

---

## Task 4: Create GET/PUT /api/invoices/[id] route

**Files:**
- Create: `src/app/api/invoices/[id]/route.ts`

**Step 1: Implement the route**

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateInvoiceSchema } from "@/lib/validations/billing";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return membership.clinic_id as string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("invoices")
    .select("*, patients!inner(id, name, phone, cpf, email, asaas_customer_id), payment_links(*)")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // If marking as paid, set paid_at automatically
  const updateData = { ...parsed.data } as Record<string, unknown>;
  if (parsed.data.status === "paid" && !parsed.data.paid_at) {
    updateData.paid_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("invoices")
    .update(updateData)
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
```

**Step 2: Commit**

```bash
git add src/app/api/invoices/[id]/route.ts
git commit -m "feat: add invoice detail GET and update PUT routes"
```

---

## Task 5: Create POST /api/invoices/[id]/payment-link route

**Files:**
- Create: `src/app/api/invoices/[id]/payment-link/route.ts`
- Modify: `src/lib/validations/billing.ts` (add schema)

**Step 1: Add validation schema**

In `src/lib/validations/billing.ts`, add:
```ts
export const createPaymentLinkSchema = z.object({
  method: z.enum(["pix", "boleto", "credit_card"]),
});
```

**Step 2: Implement the route**

Create `src/app/api/invoices/[id]/payment-link/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentLinkSchema } from "@/lib/validations/billing";
import {
  createCustomer,
  createCharge,
  getPixQrCode,
  getBoletoIdentificationField,
} from "@/services/asaas";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return membership.clinic_id as string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createPaymentLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Fetch invoice with patient
  const { data: invoice, error: invError } = await admin
    .from("invoices")
    .select("*, patients!inner(id, name, phone, email, cpf, asaas_customer_id)")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (invError || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const patient = invoice.patients as {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    cpf: string | null;
    asaas_customer_id: string | null;
  };

  // Ensure Asaas customer exists
  let asaasCustomerId = patient.asaas_customer_id;
  if (!asaasCustomerId) {
    if (!patient.cpf) {
      return NextResponse.json(
        { error: "Patient has no CPF registered (required for billing)" },
        { status: 422 }
      );
    }

    const customerResult = await createCustomer({
      name: patient.name,
      cpfCnpj: patient.cpf,
      phone: patient.phone,
      email: patient.email ?? undefined,
      externalReference: patient.id,
    });

    if (!customerResult.success || !customerResult.customerId) {
      return NextResponse.json(
        { error: customerResult.error ?? "Failed to create Asaas customer" },
        { status: 500 }
      );
    }

    asaasCustomerId = customerResult.customerId;

    // Store customer ID for future use
    await admin
      .from("patients")
      .update({ asaas_customer_id: asaasCustomerId })
      .eq("id", patient.id);
  }

  // Map method to Asaas billingType
  const billingTypeMap = {
    pix: "PIX" as const,
    boleto: "BOLETO" as const,
    credit_card: "CREDIT_CARD" as const,
  };

  const chargeResult = await createCharge({
    customerId: asaasCustomerId,
    billingType: billingTypeMap[parsed.data.method],
    valueCents: invoice.amount_cents,
    dueDate: invoice.due_date,
    description: `Invoice ${invoice.id}`,
    externalReference: invoice.id,
  });

  if (!chargeResult.success || !chargeResult.chargeId) {
    return NextResponse.json(
      { error: chargeResult.error ?? "Failed to create charge" },
      { status: 500 }
    );
  }

  // Get additional info based on method
  let pixPayload: string | null = null;
  let boletoField: string | null = null;

  if (parsed.data.method === "pix") {
    const pixResult = await getPixQrCode(chargeResult.chargeId);
    if (pixResult.success) pixPayload = pixResult.payload ?? null;
  } else if (parsed.data.method === "boleto") {
    const boletoResult = await getBoletoIdentificationField(chargeResult.chargeId);
    if (boletoResult.success) boletoField = boletoResult.identificationField ?? null;
  }

  // Insert payment_links row
  const { data: link, error: linkError } = await admin
    .from("payment_links")
    .insert({
      clinic_id: clinicId,
      invoice_id: invoice.id,
      asaas_payment_id: chargeResult.chargeId,
      url: chargeResult.invoiceUrl ?? "",
      invoice_url: chargeResult.invoiceUrl ?? null,
      method: parsed.data.method,
      status: "active",
      pix_payload: pixPayload,
      boleto_identification_field: boletoField,
    })
    .select()
    .single();

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ data: link }, { status: 201 });
}
```

**Step 3: Commit**

```bash
git add src/lib/validations/billing.ts src/app/api/invoices/[id]/payment-link/route.ts
git commit -m "feat: add payment link generation route"
```

---

## Task 6: Create the Server Component page

**Files:**
- Create: `src/app/(dashboard)/payments/page.tsx`

**Step 1: Implement the page**

Follows the exact pattern from `src/app/(dashboard)/patients/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PaymentsView } from "@/components/payments/payments-view";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

const PER_PAGE = 25;

export default async function PaymentsPage() {
  const t = await getTranslations("payments");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/login");
  const clinicId = membership.clinic_id as string;

  // Fetch initial invoices with patients + payment_links
  const { data: invoices, count } = await admin
    .from("invoices")
    .select("*, patients!inner(id, name, phone, cpf, email, asaas_customer_id), payment_links(*)", {
      count: "exact",
    })
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .range(0, PER_PAGE - 1);

  // Fetch all invoices for KPI calculation (lightweight: only amount_cents + status)
  const { data: allInvoices } = await admin
    .from("invoices")
    .select("amount_cents, status")
    .eq("clinic_id", clinicId);

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mt-6">
        <PaymentsView
          initialInvoices={invoices ?? []}
          initialCount={count ?? 0}
          initialKpiInvoices={allInvoices ?? []}
        />
      </div>
    </PageContainer>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/(dashboard)/payments/page.tsx
git commit -m "feat: add payments server component page"
```

---

## Task 7: Create invoice status badge component

**Files:**
- Create: `src/components/payments/invoice-status-badge.tsx`

**Step 1: Implement the component**

```tsx
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

interface InvoiceStatusBadgeProps {
  status: string;
}

const STATUS_VARIANT: Record<string, "warning" | "danger" | "success" | "neutral"> = {
  pending: "warning",
  partial: "warning",
  overdue: "danger",
  paid: "success",
  cancelled: "neutral",
};

const STATUS_KEY: Record<string, string> = {
  pending: "filterPending",
  partial: "filterPending",
  overdue: "filterOverdue",
  paid: "filterPaid",
  cancelled: "filterCancelled",
};

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const t = useTranslations("payments");
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>
      {t(STATUS_KEY[status] ?? "filterPending")}
    </Badge>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/payments/invoice-status-badge.tsx
git commit -m "feat: add invoice status badge component"
```

---

## Task 8: Create payment method icon component

**Files:**
- Create: `src/components/payments/payment-method-icon.tsx`

**Step 1: Implement the component**

```tsx
import { QrCode, FileText, CreditCard } from "lucide-react";

interface PaymentMethodIconProps {
  method: string;
  className?: string;
}

export function PaymentMethodIcon({ method, className = "size-4" }: PaymentMethodIconProps) {
  switch (method) {
    case "pix":
      return <QrCode className={className} style={{ color: "var(--success)" }} />;
    case "boleto":
      return <FileText className={className} style={{ color: "var(--warning)" }} />;
    case "credit_card":
      return <CreditCard className={className} style={{ color: "var(--accent)" }} />;
    default:
      return null;
  }
}
```

**Step 2: Commit**

```bash
git add src/components/payments/payment-method-icon.tsx
git commit -m "feat: add payment method icon component"
```

---

## Task 9: Create the create invoice dialog

**Files:**
- Create: `src/components/payments/create-invoice-dialog.tsx`

**Step 1: Implement the dialog**

Uses the existing `Dialog` component. Patient search uses `/api/calendar/patients/search`. Amount input converts display BRL to cents for submission. Posts to `POST /api/invoices`.

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PatientOption {
  id: string;
  name: string;
  phone: string;
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateInvoiceDialog({ open, onOpenChange, onSuccess }: CreateInvoiceDialogProps) {
  const t = useTranslations("payments.form");

  const [patientSearch, setPatientSearch] = useState("");
  const [patientOptions, setPatientOptions] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Search patients with debounce
  const searchPatients = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setPatientOptions([]);
      return;
    }
    try {
      const res = await fetch(`/api/calendar/patients/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const json = await res.json();
        setPatientOptions(json.data ?? []);
        setShowDropdown(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchPatients(patientSearch), 300);
    return () => clearTimeout(timer);
  }, [patientSearch, searchPatients]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setPatientSearch("");
      setSelectedPatient(null);
      setPatientOptions([]);
      setAmount("");
      setDueDate("");
      setNotes("");
      setError("");
    }
  }, [open]);

  function selectPatient(p: PatientOption) {
    setSelectedPatient(p);
    setPatientSearch(p.name);
    setShowDropdown(false);
  }

  function parseCentsFromInput(value: string): number {
    // Accept "150", "150.00", "150,00" → 15000 cents
    const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) return 0;
    return Math.round(num * 100);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;

    const amountCents = parseCentsFromInput(amount);
    if (amountCents <= 0) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          amount_cents: amountCents,
          due_date: dueDate,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? t("error"));
        return;
      }

      onSuccess();
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("title")} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient search */}
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("patient")}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => {
                setPatientSearch(e.target.value);
                setSelectedPatient(null);
              }}
              placeholder={t("patientPlaceholder")}
              className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
            {showDropdown && patientOptions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                {patientOptions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPatient(p)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>{p.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("amount")}
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t("amountPlaceholder")}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* Due date */}
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("dueDate")}
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {t("notes")}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] resize-none"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("cancel", { ns: "common" })}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!selectedPatient || !amount || !dueDate || submitting}
          >
            {submitting ? t("creating") : t("submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

Note: The cancel button uses a direct text since the Dialog already has an X close button. The `t("cancel", { ns: "common" })` call won't work with `useTranslations("payments.form")` — instead use a separate `const tc = useTranslations("common")` or just hardcode. Let me fix: use `useTranslations()` at the root level, then call `t("common.cancel")` and `t("payments.form.title")`, etc. OR simpler: just use two `useTranslations` calls. We'll use:

```ts
const t = useTranslations("payments.form");
const tc = useTranslations("common");
```

And the cancel button uses `tc("cancel")`.

**Step 2: Commit**

```bash
git add src/components/payments/create-invoice-dialog.tsx
git commit -m "feat: add create invoice dialog component"
```

---

## Task 10: Create the invoice detail slide-over panel

**Files:**
- Create: `src/components/payments/invoice-detail-panel.tsx`

**Step 1: Implement the panel**

A right-side slide-over panel that shows invoice details, payment links, and action buttons. Uses fixed positioning with a backdrop overlay, similar pattern to the Dialog but slides from the right.

```tsx
"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  X,
  Copy,
  Check,
  QrCode,
  FileText,
  CreditCard,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { PaymentMethodIcon } from "./payment-method-icon";
import { formatCents } from "@/lib/analytics/kpis";

interface PaymentLink {
  id: string;
  method: string;
  status: string;
  url: string;
  invoice_url: string | null;
  pix_payload: string | null;
  boleto_identification_field: string | null;
  created_at: string;
}

interface InvoicePatient {
  id: string;
  name: string;
  phone: string;
  cpf: string | null;
  email: string | null;
  asaas_customer_id: string | null;
}

interface InvoiceRow {
  id: string;
  amount_cents: number;
  due_date: string;
  status: string;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  patients: InvoicePatient;
  payment_links: PaymentLink[];
}

interface InvoiceDetailPanelProps {
  invoice: InvoiceRow | null;
  onClose: () => void;
  onUpdate: () => void;
}

function formatPhone(digits: string): string {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

const LINK_STATUS_VARIANT: Record<string, "success" | "warning" | "neutral"> = {
  active: "warning",
  paid: "success",
  expired: "neutral",
};

export function InvoiceDetailPanel({ invoice, onClose, onUpdate }: InvoiceDetailPanelProps) {
  const t = useTranslations("payments");
  const td = useTranslations("payments.detail");
  const locale = useLocale();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generatingMethod, setGeneratingMethod] = useState<string | null>(null);

  if (!invoice) return null;

  const patient = invoice.patients;
  const isOverdue = invoice.status !== "paid" && invoice.status !== "cancelled" && new Date(invoice.due_date) < new Date();

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function generatePaymentLink(method: "pix" | "boleto" | "credit_card") {
    setGeneratingMethod(method);
    try {
      const res = await fetch(`/api/invoices/${invoice!.id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });

      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? t("errors.linkError"));
        return;
      }

      onUpdate();
    } catch {
      alert(t("errors.linkError"));
    } finally {
      setGeneratingMethod(null);
    }
  }

  async function handleMarkPaid() {
    if (!window.confirm(t("markPaidConfirm"))) return;
    try {
      const res = await fetch(`/api/invoices/${invoice!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      if (res.ok) onUpdate();
      else alert(t("errors.updateError"));
    } catch {
      alert(t("errors.updateError"));
    }
  }

  async function handleCancel() {
    if (!window.confirm(t("cancelConfirm"))) return;
    try {
      const res = await fetch(`/api/invoices/${invoice!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) onUpdate();
      else alert(t("errors.updateError"));
    } catch {
      alert(t("errors.updateError"));
    }
  }

  const canGenerateLinks = invoice.status === "pending" || invoice.status === "overdue";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {td("title")}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 transition-colors hover:bg-[var(--nav-hover-bg)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Invoice Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("patient")}</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{patient.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("phone")}</span>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{formatPhone(patient.phone)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("amount")}</span>
              <span className="text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>
                {formatCents(invoice.amount_cents)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("dueDate")}</span>
              <span
                className="text-sm font-medium"
                style={{ color: isOverdue ? "var(--danger)" : "var(--text-primary)" }}
              >
                {new Date(invoice.due_date + "T12:00:00").toLocaleDateString(locale)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("status")}</span>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            {invoice.notes && (
              <div>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>{td("notes")}</span>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{invoice.notes}</p>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t" style={{ borderColor: "var(--border)" }} />

          {/* Payment Links */}
          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {td("paymentLinks")}
            </h3>
            {invoice.payment_links.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{td("noLinks")}</p>
            ) : (
              <div className="space-y-2">
                {invoice.payment_links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-2">
                      <PaymentMethodIcon method={link.method} />
                      <span className="text-sm capitalize" style={{ color: "var(--text-primary)" }}>
                        {link.method === "credit_card" ? "Cartão" : link.method.charAt(0).toUpperCase() + link.method.slice(1)}
                      </span>
                      <Badge variant={LINK_STATUS_VARIANT[link.status] ?? "neutral"}>
                        {td(`link${link.status.charAt(0).toUpperCase() + link.status.slice(1)}` as "linkActive" | "linkPaid" | "linkExpired")}
                      </Badge>
                    </div>
                    {(link.invoice_url || link.url) && (
                      <button
                        onClick={() => copyToClipboard(link.invoice_url || link.url, link.id)}
                        className="rounded p-1 transition-colors hover:bg-[var(--nav-hover-bg)]"
                        style={{ color: "var(--text-muted)" }}
                        title={td("copyLink")}
                      >
                        {copiedId === link.id ? (
                          <Check className="size-4" style={{ color: "var(--success)" }} />
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {canGenerateLinks && (
            <>
              <div className="border-t" style={{ borderColor: "var(--border)" }} />
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => generatePaymentLink("pix")}
                  disabled={generatingMethod !== null}
                >
                  {generatingMethod === "pix" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <QrCode className="size-4" style={{ color: "var(--success)" }} />
                  )}
                  {td("generatePix")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => generatePaymentLink("boleto")}
                  disabled={generatingMethod !== null}
                >
                  {generatingMethod === "boleto" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileText className="size-4" style={{ color: "var(--warning)" }} />
                  )}
                  {td("generateBoleto")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => generatePaymentLink("credit_card")}
                  disabled={generatingMethod !== null}
                >
                  {generatingMethod === "credit_card" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CreditCard className="size-4" style={{ color: "var(--accent)" }} />
                  )}
                  {td("generateCard")}
                </Button>

                <div className="border-t pt-2" style={{ borderColor: "var(--border)" }} />

                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={handleMarkPaid}
                >
                  {t("markPaid")}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full"
                  onClick={handleCancel}
                >
                  {t("cancelInvoice")}
                </Button>
              </div>
            </>
          )}

          {/* Timeline */}
          <div className="border-t pt-4" style={{ borderColor: "var(--border)" }} />
          <div>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {td("timeline")}
            </h3>
            <div className="space-y-2">
              {invoice.paid_at && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="size-2 rounded-full" style={{ backgroundColor: "var(--success)" }} />
                  <span style={{ color: "var(--text-secondary)" }}>
                    {td("paidAt")} — {new Date(invoice.paid_at).toLocaleDateString(locale)}
                  </span>
                </div>
              )}
              {invoice.payment_links.map((link) => (
                <div key={link.id} className="flex items-center gap-2 text-sm">
                  <div className="size-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                  <span style={{ color: "var(--text-secondary)" }}>
                    {link.method === "credit_card" ? "Cartão" : link.method.charAt(0).toUpperCase() + link.method.slice(1)} — {new Date(link.created_at).toLocaleDateString(locale)}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-sm">
                <div className="size-2 rounded-full" style={{ backgroundColor: "var(--text-muted)" }} />
                <span style={{ color: "var(--text-secondary)" }}>
                  {td("createdAt")} — {new Date(invoice.created_at).toLocaleDateString(locale)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/payments/invoice-detail-panel.tsx
git commit -m "feat: add invoice detail slide-over panel"
```

---

## Task 11: Create the main PaymentsView client component

**Files:**
- Create: `src/components/payments/payments-view.tsx`

**Step 1: Implement the component**

This is the largest component. It renders KPI cards, filter bar, invoice table, pagination, and orchestrates the dialog and slide-over panel. Follows the `PatientsView` pattern exactly.

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Search,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Ban,
  CircleCheck,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { InvoiceStatusBadge } from "@/components/payments/invoice-status-badge";
import { PaymentMethodIcon } from "@/components/payments/payment-method-icon";
import { CreateInvoiceDialog } from "@/components/payments/create-invoice-dialog";
import { InvoiceDetailPanel } from "@/components/payments/invoice-detail-panel";
import {
  formatCents,
  calculateRevenueMetrics,
  type InvoiceForMetrics,
} from "@/lib/analytics/kpis";

interface PaymentLink {
  id: string;
  method: string;
  status: string;
  url: string;
  invoice_url: string | null;
  pix_payload: string | null;
  boleto_identification_field: string | null;
  created_at: string;
}

interface InvoicePatient {
  id: string;
  name: string;
  phone: string;
  cpf: string | null;
  email: string | null;
  asaas_customer_id: string | null;
}

interface InvoiceRow {
  id: string;
  amount_cents: number;
  due_date: string;
  status: string;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  patients: InvoicePatient;
  payment_links: PaymentLink[];
}

interface PaymentsViewProps {
  initialInvoices: InvoiceRow[];
  initialCount: number;
  initialKpiInvoices: InvoiceForMetrics[];
}

const PER_PAGE = 25;

function formatPhone(digits: string): string {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

export function PaymentsView({
  initialInvoices,
  initialCount,
  initialKpiInvoices,
}: PaymentsViewProps) {
  const t = useTranslations("payments");
  const locale = useLocale();

  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [count, setCount] = useState(initialCount);
  const [kpiInvoices, setKpiInvoices] = useState<InvoiceForMetrics[]>(initialKpiInvoices);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const totalPages = Math.ceil(count / PER_PAGE);
  const metrics = calculateRevenueMetrics(kpiInvoices);

  const fetchInvoices = useCallback(
    async (p: number, q: string, status: string, period: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (q.trim().length >= 2) params.set("search", q.trim());
        if (status !== "all") params.set("status", status);
        if (period !== "all") params.set("period", period);

        const res = await fetch(`/api/invoices?${params}`);
        if (res.ok) {
          const json = await res.json();
          setInvoices(json.data ?? []);
          setCount(json.count ?? 0);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchKpis = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices?page=1&per_page=10000");
      // We need a lightweight KPI endpoint. For now, use the same invoices API
      // but just pull amount_cents and status. The server already returns patients etc.
      // We'll just read what we need client-side.
      if (res.ok) {
        const json = await res.json();
        const allInvoices = (json.data ?? []).map((inv: { amount_cents: number; status: string }) => ({
          amount_cents: inv.amount_cents,
          status: inv.status,
        }));
        setKpiInvoices(allInvoices);
      }
    } catch {
      // ignore
    }
  }, []);

  // Debounced search — resets to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchInvoices(1, search, statusFilter, periodFilter);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Filter changes — reset to page 1
  useEffect(() => {
    setPage(1);
    fetchInvoices(1, search, statusFilter, periodFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, periodFilter]);

  // Page change
  useEffect(() => {
    if (page > 1) {
      fetchInvoices(page, search, statusFilter, periodFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleCreateSuccess() {
    setCreateOpen(false);
    fetchInvoices(1, search, statusFilter, periodFilter);
    fetchKpis();
    setPage(1);
  }

  function handleDetailUpdate() {
    fetchInvoices(page, search, statusFilter, periodFilter);
    fetchKpis();
    // Refresh the selected invoice
    if (selectedInvoice) {
      fetch(`/api/invoices/${selectedInvoice.id}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.data) setSelectedInvoice(json.data);
        })
        .catch(() => {});
    }
  }

  async function handleQuickMarkPaid(inv: InvoiceRow) {
    if (!window.confirm(t("markPaidConfirm"))) return;
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      if (res.ok) {
        fetchInvoices(page, search, statusFilter, periodFilter);
        fetchKpis();
      }
    } catch {
      alert(t("errors.updateError"));
    }
    setOpenMenuId(null);
  }

  async function handleQuickCancel(inv: InvoiceRow) {
    if (!window.confirm(t("cancelConfirm"))) return;
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        fetchInvoices(page, search, statusFilter, periodFilter);
        fetchKpis();
      }
    } catch {
      alert(t("errors.updateError"));
    }
    setOpenMenuId(null);
  }

  // Compute overdue cents for KPI
  const overdueCents = kpiInvoices
    .filter((inv) => inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.amount_cents, 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Clock}
          label={t("kpiPending")}
          value={formatCents(metrics.pendingCents)}
          iconBg="rgba(139,92,246,0.1)"
          iconColor="var(--accent)"
        />
        <KpiCard
          icon={AlertTriangle}
          label={t("kpiOverdue")}
          value={formatCents(overdueCents)}
          subtitle={`${metrics.overdueCount} ${metrics.overdueCount === 1 ? "fatura" : "faturas"}`}
          iconBg="rgba(239,68,68,0.1)"
          iconColor="var(--danger)"
        />
        <KpiCard
          icon={CheckCircle}
          label={t("kpiPaid")}
          value={formatCents(metrics.paidCents)}
          subtitle={t("kpiThisMonth")}
          iconBg="rgba(34,197,94,0.1)"
          iconColor="var(--success)"
        />
        <KpiCard
          icon={TrendingUp}
          label={t("kpiConversion")}
          value={`${metrics.conversionRate}%`}
          iconBg="rgba(139,92,246,0.1)"
          iconColor="var(--accent)"
        />
      </div>

      {/* Table card */}
      {count === 0 && search.trim().length < 2 && statusFilter === "all" && periodFilter === "all" ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Receipt
            className="size-12"
            strokeWidth={1}
            style={{ color: "var(--text-muted)" }}
          />
          <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            {t("empty")}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("emptyHint")}
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </div>
      ) : (
        <div
          className="rounded-xl border"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {/* Header: search + filters + actions */}
          <div
            className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex flex-1 items-center gap-3">
              {/* Search */}
              <div className="relative w-full max-w-sm">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="all">{t("filterAll")}</option>
                <option value="pending">{t("filterPending")}</option>
                <option value="overdue">{t("filterOverdue")}</option>
                <option value="paid">{t("filterPaid")}</option>
                <option value="cancelled">{t("filterCancelled")}</option>
              </select>

              {/* Period filter */}
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="all">{t("periodAll")}</option>
                <option value="this-month">{t("periodThisMonth")}</option>
                <option value="30d">{t("periodLast30")}</option>
                <option value="90d">{t("periodLast90")}</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("count", { count })}
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                {t("add")}
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className={`relative ${loading ? "opacity-50" : ""}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("patient")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("amount")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("dueDate")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("status")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("method")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      {t("actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const isOverdue =
                      inv.status !== "paid" &&
                      inv.status !== "cancelled" &&
                      new Date(inv.due_date) < new Date();
                    const latestLink = inv.payment_links.length > 0
                      ? inv.payment_links[inv.payment_links.length - 1]
                      : null;

                    return (
                      <tr
                        key={inv.id}
                        className="cursor-pointer border-b transition-colors hover:bg-[var(--nav-hover-bg)]"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => setSelectedInvoice(inv)}
                      >
                        <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                          <div className="font-medium">{inv.patients.name}</div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatPhone(inv.patients.phone)}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium" style={{ color: "var(--text-primary)" }}>
                          {formatCents(inv.amount_cents)}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: isOverdue ? "var(--danger)" : "var(--text-secondary)" }}
                        >
                          {new Date(inv.due_date + "T12:00:00").toLocaleDateString(locale)}
                        </td>
                        <td className="px-4 py-3">
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                        <td className="px-4 py-3">
                          {latestLink ? (
                            <PaymentMethodIcon method={latestLink.method} />
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === inv.id ? null : inv.id);
                              }}
                              className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>

                            {openMenuId === inv.id && (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border py-1"
                                style={{
                                  backgroundColor: "var(--surface)",
                                  borderColor: "var(--border)",
                                  boxShadow: "var(--shadow-lg)",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedInvoice(inv);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  <Eye className="size-4" />
                                  {t("view")}
                                </button>
                                {(inv.status === "pending" || inv.status === "overdue") && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickMarkPaid(inv);
                                      }}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                                      style={{ color: "var(--success)" }}
                                    >
                                      <CircleCheck className="size-4" />
                                      {t("markPaid")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickCancel(inv);
                                      }}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                                      style={{ color: "var(--danger)" }}
                                    >
                                      <Ban className="size-4" />
                                      {t("cancelInvoice")}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* No results */}
            {invoices.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {t("noResults")}
                </p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between border-t px-5 py-4"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {t("page", { page, total: totalPages })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" />
                    {t("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("nextPage")}
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Close dropdown on outside click */}
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Create dialog */}
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />

      {/* Detail panel */}
      <InvoiceDetailPanel
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onUpdate={handleDetailUpdate}
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/payments/payments-view.tsx
git commit -m "feat: add PaymentsView client component with KPIs, table, filters"
```

---

## Task 12: Build and verify

**Step 1: Run the dev build to check for TypeScript errors**

```bash
npx next build
```

Expected: Build succeeds with no type errors.

**Step 2: Fix any issues found during build**

Address any TypeScript errors, missing imports, or incorrect type references.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues for payments page"
```

---

## Task 13: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add payments route to the API routes section and update navigation**

Add to the Settings/Calendar API routes table section:

```markdown
### Payments API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/invoices` | GET | List invoices (paginated, filterable by status/period/search) |
| `/api/invoices` | POST | Create invoice |
| `/api/invoices/[id]` | GET | Invoice detail with payment links |
| `/api/invoices/[id]` | PUT | Update invoice (status, amount, notes) |
| `/api/invoices/[id]/payment-link` | POST | Generate Asaas payment link (Pix/boleto/card) |
```

Add `/payments` to the Dashboard URL Structure list.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add payments routes to CLAUDE.md"
```
