import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signupSchema } from "@/lib/validations/auth";

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) +
    "-" +
    Date.now().toString(36)
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, password, clinicName } = parsed.data;
  const supabase = createAdminClient();

  // 1. Create auth user
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const userId = authData.user.id;

  // 2. Create clinic
  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .insert({ name: clinicName, slug: generateSlug(clinicName) })
    .select("id")
    .single();

  if (clinicError) {
    // Rollback: delete the auth user
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: clinicError.message }, { status: 500 });
  }

  // 3. Create clinic_user (owner)
  const { error: memberError } = await supabase
    .from("clinic_users")
    .insert({ clinic_id: clinic.id, user_id: userId, role: "owner" });

  if (memberError) {
    // Rollback: delete clinic and auth user
    await supabase.from("clinics").delete().eq("id", clinic.id);
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // 4. Create default module configs (all enabled)
  const moduleTypes = [
    "support",
    "scheduling",
    "confirmation",
    "nps",
    "billing",
    "recall",
  ] as const;
  const moduleInserts = moduleTypes.map((type) => ({
    clinic_id: clinic.id,
    module_type: type,
    enabled: true,
    settings: type === "billing" ? { auto_billing: false } : {},
  }));

  await supabase.from("module_configs").insert(moduleInserts);

  // 5. Create default agents (all active)
  const agentDefaults: Array<{ type: string; name: string }> = [
    { type: "support", name: "Suporte" },
    { type: "scheduling", name: "Agendamento" },
    { type: "confirmation", name: "Confirmação" },
    { type: "nps", name: "Pesquisa NPS" },
    { type: "billing", name: "Financeiro" },
    { type: "recall", name: "Reativação" },
  ];

  const agentInserts = agentDefaults.map((a) => ({
    clinic_id: clinic.id,
    type: a.type,
    name: a.name,
    active: true,
    config: {},
  }));

  await supabase.from("agents").insert(agentInserts);

  // 6. Create trial subscription
  await supabase.from("subscriptions").insert({
    clinic_id: clinic.id,
    status: "trialing",
    trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  return NextResponse.json(
    { data: { userId, clinicId: clinic.id } },
    { status: 201 }
  );
}
