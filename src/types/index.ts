export type { Database } from "./database";

// Convenience row types
import type { Database } from "./database";

type Tables = Database["public"]["Tables"];

export type Clinic = Tables["clinics"]["Row"];
export type ClinicInsert = Tables["clinics"]["Insert"];
export type ClinicUpdate = Tables["clinics"]["Update"];

export type ClinicUser = Tables["clinic_users"]["Row"];
export type Professional = Tables["professionals"]["Row"];
export type Patient = Tables["patients"]["Row"];
export type Appointment = Tables["appointments"]["Row"];
export type ConfirmationQueueItem = Tables["confirmation_queue"]["Row"];
export type NpsResponse = Tables["nps_responses"]["Row"];
export type Invoice = Tables["invoices"]["Row"];
export type PaymentLink = Tables["payment_links"]["Row"];
export type RecallQueueItem = Tables["recall_queue"]["Row"];
export type Agent = Tables["agents"]["Row"];
export type Conversation = Tables["conversations"]["Row"];
export type Message = Tables["messages"]["Row"];
export type MessageQueueItem = Tables["message_queue"]["Row"];
export type ModuleConfig = Tables["module_configs"]["Row"];

export type InsurancePlan = Tables["insurance_plans"]["Row"];
export type Service = Tables["services"]["Row"];

// Role type
export type ClinicRole = "owner" | "reception";

// Module type
export type ModuleType = "support" | "scheduling" | "confirmation" | "nps" | "billing" | "recall";

// Appointment status
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

// Conversation status
export type ConversationStatus = "active" | "escalated" | "resolved";
