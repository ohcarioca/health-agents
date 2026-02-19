// eval/fixtures/teardown.ts
// Delete all test data in FK-safe order.
import type { EvalSupabaseClient } from "../supabase";
import type { TestContext } from "../types";

export async function teardownFixtures(
  supabase: EvalSupabaseClient,
  ctx: TestContext
): Promise<void> {
  await supabase
    .from("confirmation_queue")
    .delete()
    .eq("clinic_id", ctx.clinicId);

  await supabase
    .from("message_queue")
    .delete()
    .eq("clinic_id", ctx.clinicId);

  await supabase.from("nps_responses").delete().eq("clinic_id", ctx.clinicId);

  await supabase
    .from("payment_links")
    .delete()
    .in("invoice_id", [ctx.invoiceId]);

  await supabase.from("invoices").delete().eq("clinic_id", ctx.clinicId);

  await supabase.from("appointments").delete().eq("clinic_id", ctx.clinicId);

  // Delete messages first (FK to conversations)
  const { data: convs } = await supabase
    .from("conversations")
    .select("id")
    .eq("clinic_id", ctx.clinicId);

  if (convs && convs.length > 0) {
    await supabase
      .from("messages")
      .delete()
      .in(
        "conversation_id",
        convs.map((c) => c.id as string)
      );
  }

  await supabase.from("conversations").delete().eq("clinic_id", ctx.clinicId);

  await supabase.from("patients").delete().eq("id", ctx.patientId);

  await supabase
    .from("professional_services")
    .delete()
    .eq("professional_id", ctx.professionalId);

  await supabase.from("professionals").delete().eq("id", ctx.professionalId);

  await supabase.from("services").delete().eq("id", ctx.serviceId);

  await supabase.from("module_configs").delete().eq("clinic_id", ctx.clinicId);

  await supabase.from("agents").delete().eq("clinic_id", ctx.clinicId);

  await supabase.from("clinics").delete().eq("id", ctx.clinicId);

  console.log("  ✓ All test fixtures deleted");
}
