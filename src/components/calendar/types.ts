export interface CalendarAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cancellation_reason: string | null;
  google_event_id: string | null;
  insurance_plan_id: string | null;
  patients: { id: string; name: string; phone: string };
  professionals: { id: string; name: string } | null;
  services: { id: string; name: string; duration_minutes: number } | null;
  insurance_plans: { id: string; name: string } | null;
}

export interface AppointmentFormData {
  patient_id: string;
  professional_id: string;
  service_id?: string;
  starts_at: string;
  ends_at: string;
  insurance_plan_id?: string;
}

export interface ProfessionalOption {
  id: string;
  name: string;
  color: string;
}
