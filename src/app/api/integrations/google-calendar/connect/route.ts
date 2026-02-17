import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConsentUrl } from "@/services/google-calendar";

const connectSchema = z.object({
  professional_id: z.string().uuid(),
  return_to: z.string().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { professional_id, return_to } = parsed.data;

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

  const state = return_to
    ? `${professional_id}::${return_to}`
    : professional_id;
  const url = getConsentUrl(state);

  return NextResponse.json({ data: { url } });
}
