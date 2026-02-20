import { NextResponse, type NextRequest } from "next/server";
import { getClinicId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: file } = await admin
    .from("patient_files")
    .select("storage_path")
    .eq("id", fileId)
    .eq("patient_id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: signedUrl, error } = await admin.storage
    .from("patient-files")
    .createSignedUrl(file.storage_path, 300); // 5 min expiry

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { url: signedUrl.signedUrl } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;

  const clinicId = await getClinicId();
  if (!clinicId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: file } = await admin
    .from("patient_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("patient_id", id)
    .eq("clinic_id", clinicId)
    .single();

  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete from storage
  await admin.storage.from("patient-files").remove([file.storage_path]);

  // Delete metadata
  const { error } = await admin
    .from("patient_files")
    .delete()
    .eq("id", fileId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id: fileId } });
}
