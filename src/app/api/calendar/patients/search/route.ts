import { NextResponse } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneLookupVariants } from "@/lib/utils/phone";

export async function GET(request: Request) {
  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const admin = createAdminClient();

  // Search by name (ilike) or phone (starts with)
  const isPhoneSearch = /^\d+$/.test(q);

  let query = admin
    .from("patients")
    .select("id, name, phone")
    .eq("clinic_id", clinicId)
    .limit(10);

  if (isPhoneSearch) {
    const variants = phoneLookupVariants(q);
    query = query.or(variants.map((v) => `phone.like.${v}%`).join(","));
  } else {
    query = query.ilike("name", `%${q}%`);
  }

  const { data: patients, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: patients });
}
