import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateInvoiceSchema } from "@/lib/validations/billing";
import { maskCPF } from "@/lib/utils/mask";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("invoices")
    .select(
      "*, patients!inner(id, name, phone, cpf, email), payment_links(*)",
    )
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const sanitized = {
    ...data,
    patients: data.patients
      ? {
          ...(data.patients as Record<string, unknown>),
          cpf: maskCPF((data.patients as Record<string, unknown>).cpf as string),
        }
      : null,
  };

  return NextResponse.json({ data: sanitized });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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
      { status: 400 },
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

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
