import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("plans")
    .select("id, name, slug, price_cents, max_professionals, max_messages_month, description, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[plans] Failed to fetch plans:", error.message);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
