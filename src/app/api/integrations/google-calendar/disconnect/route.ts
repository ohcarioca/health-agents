import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const disconnectSchema = z.union([
  z.object({ professional_id: z.string().uuid() }),
  z.object({ target: z.literal("clinic") }),
]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = disconnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if ("target" in parsed.data && parsed.data.target === "clinic") {
    const { error } = await admin
      .from("clinics")
      .update({ google_calendar_id: null, google_refresh_token: null })
      .eq("id", membership.clinic_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: { disconnected: true } });
  }

  const { professional_id } = parsed.data as { professional_id: string };

  const { data: professional } = await admin
    .from("professionals")
    .select("id")
    .eq("id", professional_id)
    .eq("clinic_id", membership.clinic_id)
    .limit(1)
    .single();

  if (!professional) {
    return NextResponse.json(
      { error: "Professional not found" },
      { status: 404 }
    );
  }

  const { error } = await admin
    .from("professionals")
    .update({
      google_refresh_token: null,
      google_calendar_id: null,
    })
    .eq("id", professional_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { disconnected: true } });
}
