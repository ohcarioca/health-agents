import { NextResponse, type NextRequest } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify patient belongs to clinic
  const { data: patient } = await admin
    .from("patients")
    .select("id")
    .eq("id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (!patient) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: invoices, error } = await admin
    .from("invoices")
    .select("id, status, amount_cents, due_date, paid_at, created_at")
    .eq("patient_id", id)
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: invoices });
}
