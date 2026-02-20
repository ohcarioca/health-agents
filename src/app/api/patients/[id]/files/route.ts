import { NextResponse, type NextRequest } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_PATIENT = 20;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

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

  const { data: files, error } = await admin
    .from("patient_files")
    .select("id, file_name, file_size, mime_type, created_at")
    .eq("patient_id", id)
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: files });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(clinicId);
  if (limited) return limited;

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

  // Check file count limit
  const { count } = await admin
    .from("patient_files")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", id);

  if (count !== null && count >= MAX_FILES_PER_PATIENT) {
    return NextResponse.json(
      { error: "max_files_reached" },
      { status: 400 },
    );
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "file_type_not_allowed" },
      { status: 400 },
    );
  }

  // Get current user for uploaded_by
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Generate storage path
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const fileId = crypto.randomUUID();
  const storagePath = `${clinicId}/${id}/${fileId}.${ext}`;

  // Upload to Supabase Storage
  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("patient-files")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[patient-files] upload error:", uploadError);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }

  // Insert metadata
  const { data: fileRecord, error: insertError } = await admin
    .from("patient_files")
    .insert({
      clinic_id: clinicId,
      patient_id: id,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
      uploaded_by: user?.id ?? null,
    })
    .select("id, file_name, file_size, mime_type, created_at")
    .single();

  if (insertError) {
    // Cleanup uploaded file on DB error
    await admin.storage.from("patient-files").remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ data: fileRecord }, { status: 201 });
}
