// eval/fixtures/appointments.ts
import type { EvalSupabaseClient } from "../supabase";

export interface AppointmentFixtures {
  appointmentFutureId: string;
  appointmentCompletedId: string;
  appointmentOldId: string;
  invoiceId: string;
}

export async function createTestAppointments(
  supabase: EvalSupabaseClient,
  clinicId: string,
  patientId: string,
  professionalId: string,
  serviceId: string
): Promise<AppointmentFixtures> {
  const now = new Date();

  // Future appointment (48h from now) — for confirmation tests
  const future = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const { data: apptFuture, error: e1 } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: professionalId,
      service_id: serviceId,
      starts_at: future.toISOString(),
      ends_at: new Date(future.getTime() + 60 * 60 * 1000).toISOString(),
      status: "scheduled",
    })
    .select("id")
    .single();

  if (e1 || !apptFuture) throw new Error(`Future appointment: ${e1?.message}`);

  // Enqueue confirmation reminders (stage = "48h", "24h")
  await supabase.from("confirmation_queue").insert([
    {
      clinic_id: clinicId,
      appointment_id: apptFuture.id as string,
      stage: "48h",
      scheduled_at: new Date(
        future.getTime() - 48 * 60 * 60 * 1000
      ).toISOString(),
      status: "pending",
    },
    {
      clinic_id: clinicId,
      appointment_id: apptFuture.id as string,
      stage: "24h",
      scheduled_at: new Date(
        future.getTime() - 24 * 60 * 60 * 1000
      ).toISOString(),
      status: "pending",
    },
  ]);

  // Completed appointment (yesterday) — for NPS tests
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { data: apptCompleted, error: e2 } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: professionalId,
      service_id: serviceId,
      starts_at: yesterday.toISOString(),
      ends_at: new Date(yesterday.getTime() + 60 * 60 * 1000).toISOString(),
      status: "completed",
    })
    .select("id")
    .single();

  if (e2 || !apptCompleted)
    throw new Error(`Completed appointment: ${e2?.message}`);

  // Old appointment (91 days ago) — for recall tests
  const oldDate = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
  const { data: apptOld, error: e3 } = await supabase
    .from("appointments")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      professional_id: professionalId,
      service_id: serviceId,
      starts_at: oldDate.toISOString(),
      ends_at: new Date(oldDate.getTime() + 60 * 60 * 1000).toISOString(),
      status: "completed",
    })
    .select("id")
    .single();

  if (e3 || !apptOld) throw new Error(`Old appointment: ${e3?.message}`);

  // Invoice pending — for billing tests (linked to completed appointment)
  const { data: invoice, error: e4 } = await supabase
    .from("invoices")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: apptCompleted.id as string,
      amount_cents: 20000,
      status: "pending",
      due_date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
    })
    .select("id")
    .single();

  if (e4 || !invoice) throw new Error(`Invoice: ${e4?.message}`);

  console.log(`  ✓ Appointments created: future, completed, old`);
  console.log(`  ✓ Invoice created: R$200 pending`);

  return {
    appointmentFutureId: apptFuture.id as string,
    appointmentCompletedId: apptCompleted.id as string,
    appointmentOldId: apptOld.id as string,
    invoiceId: invoice.id as string,
  };
}
