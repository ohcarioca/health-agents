import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONFIGURABLE_MODULE_TYPES,
  parseModuleUpdate,
  type ConfigurableModuleType,
} from "@/lib/validations/modules";

async function getClinicContext() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return null;
  return { clinicId: membership.clinic_id, userId: user.id };
}

function isConfigurableType(type: string): type is ConfigurableModuleType {
  return (CONFIGURABLE_MODULE_TYPES as readonly string[]).includes(type);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!isConfigurableType(type)) {
    return NextResponse.json(
      { error: "Unsupported module type" },
      { status: 400 }
    );
  }

  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("module_configs")
    .select("enabled, settings")
    .eq("clinic_id", ctx.clinicId)
    .eq("module_type", type)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Module config not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: {
      enabled: data.enabled,
      settings: (data.settings ?? {}) as Record<string, unknown>,
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!isConfigurableType(type)) {
    return NextResponse.json(
      { error: "Unsupported module type" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseModuleUpdate(type, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const ctx = await getClinicContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Read current record to merge settings safely
  const { data: current } = await admin
    .from("module_configs")
    .select("enabled, settings")
    .eq("clinic_id", ctx.clinicId)
    .eq("module_type", type)
    .single();

  const currentSettings = (current?.settings ?? {}) as Record<string, unknown>;

  // Separate enabled flag from settings fields
  const { enabled, ...settingsFields } = parsed.data;

  const updates: Record<string, unknown> = {};

  if (typeof enabled === "boolean") {
    updates.enabled = enabled;
  }

  if (Object.keys(settingsFields).length > 0) {
    updates.settings = { ...currentSettings, ...settingsFields };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ data: current });
  }

  const { data, error } = await admin
    .from("module_configs")
    .update(updates)
    .eq("clinic_id", ctx.clinicId)
    .eq("module_type", type)
    .select("enabled, settings")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
