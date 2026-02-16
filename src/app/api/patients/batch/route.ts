import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPatientSchema } from "@/lib/validations/patients";

async function getClinicId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

const batchRequestSchema = z.object({
  patients: z.array(z.unknown()).min(1).max(500),
});

interface BatchError {
  row: number;
  reason: string;
}

interface BatchSkipped {
  phone: string;
  reason: "duplicate" | "duplicate_in_batch";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const outerParsed = batchRequestSchema.safeParse(body);
  if (!outerParsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: outerParsed.error.flatten() },
      { status: 400 },
    );
  }

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawPatients = outerParsed.data.patients;
  const validRows: Array<z.infer<typeof createPatientSchema>> = [];
  const errors: BatchError[] = [];

  for (let i = 0; i < rawPatients.length; i++) {
    const parsed = createPatientSchema.safeParse(rawPatients[i]);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const details = Object.entries(fieldErrors)
        .map(([field, msgs]) => `${field}: ${(msgs ?? []).join(", ")}`)
        .join("; ");
      errors.push({ row: i + 1, reason: details });
    } else {
      validRows.push(parsed.data);
    }
  }

  if (validRows.length === 0) {
    return NextResponse.json({
      data: { imported: 0, skipped: [], errors },
    });
  }

  // Check existing phones in the clinic
  const phones = validRows.map((r) => r.phone);
  const admin = createAdminClient();
  const { data: existingRows, error: fetchError } = await admin
    .from("patients")
    .select("phone")
    .eq("clinic_id", clinicId)
    .in("phone", phones);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const existingPhones = new Set(
    (existingRows ?? []).map((r) => r.phone as string),
  );
  const seenPhones = new Set<string>();
  const skipped: BatchSkipped[] = [];
  const toInsert: Array<{
    clinic_id: string;
    name: string;
    phone: string;
    email: string | null;
    date_of_birth: string | null;
    cpf: string | null;
    notes: string | null;
  }> = [];

  for (const row of validRows) {
    if (existingPhones.has(row.phone)) {
      skipped.push({ phone: row.phone, reason: "duplicate" });
      continue;
    }
    if (seenPhones.has(row.phone)) {
      skipped.push({ phone: row.phone, reason: "duplicate_in_batch" });
      continue;
    }
    seenPhones.add(row.phone);
    toInsert.push({
      clinic_id: clinicId,
      name: row.name,
      phone: row.phone,
      email: row.email || null,
      date_of_birth: row.date_of_birth || null,
      cpf: row.cpf || null,
      notes: row.notes || null,
    });
  }

  let imported = 0;

  if (toInsert.length > 0) {
    const { error: insertError, count } = await admin
      .from("patients")
      .insert(toInsert, { count: "exact" });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    imported = count ?? toInsert.length;
  }

  return NextResponse.json({
    data: { imported, skipped, errors },
  });
}
