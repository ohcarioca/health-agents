import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

const testWhatsappSchema = z.object({
  phone_number_id: z.string().min(1),
  access_token: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = testWhatsappSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { phone_number_id, access_token } = parsed.data;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phone_number_id}`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: { valid: true } });
  } catch {
    return NextResponse.json(
      { error: "connection_failed" },
      { status: 500 },
    );
  }
}
