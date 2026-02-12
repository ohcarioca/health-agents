export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      clinics: {
        Row: {
          id: string;
          name: string;
          slug: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          zip_code: string | null;
          logo_url: string | null;
          timezone: string;
          operating_hours: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          logo_url?: string | null;
          timezone?: string;
          operating_hours?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          logo_url?: string | null;
          timezone?: string;
          operating_hours?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clinic_users: {
        Row: {
          id: string;
          clinic_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          user_id: string;
          role: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      insurance_plans: {
        Row: {
          id: string;
          clinic_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          clinic_id: string;
          name: string;
          duration_minutes: number;
          price_cents: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          duration_minutes?: number;
          price_cents?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          name?: string;
          duration_minutes?: number;
          price_cents?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      professionals: {
        Row: {
          id: string;
          clinic_id: string;
          name: string;
          specialty: string | null;
          appointment_duration_minutes: number;
          schedule_grid: Json;
          google_calendar_id: string | null;
          google_refresh_token: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          specialty?: string | null;
          appointment_duration_minutes?: number;
          schedule_grid?: Json;
          google_calendar_id?: string | null;
          google_refresh_token?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          name?: string;
          specialty?: string | null;
          appointment_duration_minutes?: number;
          schedule_grid?: Json;
          google_calendar_id?: string | null;
          google_refresh_token?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      patients: {
        Row: {
          id: string;
          clinic_id: string;
          name: string;
          phone: string;
          email: string | null;
          date_of_birth: string | null;
          notes: string | null;
          custom_fields: Json;
          last_visit_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          phone: string;
          email?: string | null;
          date_of_birth?: string | null;
          notes?: string | null;
          custom_fields?: Json;
          last_visit_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          date_of_birth?: string | null;
          notes?: string | null;
          custom_fields?: Json;
          last_visit_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          clinic_id: string;
          professional_id: string | null;
          patient_id: string;
          service_id: string | null;
          starts_at: string;
          ends_at: string;
          status: string;
          google_event_id: string | null;
          cancellation_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          professional_id?: string | null;
          patient_id: string;
          service_id?: string | null;
          starts_at: string;
          ends_at: string;
          status?: string;
          google_event_id?: string | null;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          professional_id?: string | null;
          patient_id?: string;
          service_id?: string | null;
          starts_at?: string;
          ends_at?: string;
          status?: string;
          google_event_id?: string | null;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      confirmation_queue: {
        Row: {
          id: string;
          clinic_id: string;
          appointment_id: string;
          stage: string;
          status: string;
          scheduled_at: string;
          sent_at: string | null;
          response: string | null;
          attempts: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          appointment_id: string;
          stage: string;
          status?: string;
          scheduled_at: string;
          sent_at?: string | null;
          response?: string | null;
          attempts?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          appointment_id?: string;
          stage?: string;
          status?: string;
          scheduled_at?: string;
          sent_at?: string | null;
          response?: string | null;
          attempts?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      nps_responses: {
        Row: {
          id: string;
          clinic_id: string;
          appointment_id: string;
          patient_id: string;
          score: number | null;
          comment: string | null;
          review_sent: boolean;
          alert_sent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          appointment_id: string;
          patient_id: string;
          score?: number | null;
          comment?: string | null;
          review_sent?: boolean;
          alert_sent?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          appointment_id?: string;
          patient_id?: string;
          score?: number | null;
          comment?: string | null;
          review_sent?: boolean;
          alert_sent?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          appointment_id: string | null;
          amount_cents: number;
          status: string;
          due_date: string;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          appointment_id?: string | null;
          amount_cents: number;
          status?: string;
          due_date: string;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string;
          appointment_id?: string | null;
          amount_cents?: number;
          status?: string;
          due_date?: string;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_links: {
        Row: {
          id: string;
          clinic_id: string;
          invoice_id: string;
          pagarme_link_id: string | null;
          url: string;
          method: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          invoice_id: string;
          pagarme_link_id?: string | null;
          url: string;
          method: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          invoice_id?: string;
          pagarme_link_id?: string | null;
          url?: string;
          method?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      recall_queue: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          last_visit_at: string;
          status: string;
          sent_at: string | null;
          attempts: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          last_visit_at: string;
          status?: string;
          sent_at?: string | null;
          attempts?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string;
          last_visit_at?: string;
          status?: string;
          sent_at?: string | null;
          attempts?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          clinic_id: string;
          type: string;
          name: string;
          description: string | null;
          instructions: string | null;
          config: Json;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          type: string;
          name: string;
          description?: string | null;
          instructions?: string | null;
          config?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          type?: string;
          name?: string;
          description?: string | null;
          instructions?: string | null;
          config?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          agent_id: string | null;
          channel: string;
          status: string;
          current_module: string | null;
          whatsapp_thread_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          agent_id?: string | null;
          channel?: string;
          status?: string;
          current_module?: string | null;
          whatsapp_thread_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          patient_id?: string;
          agent_id?: string | null;
          channel?: string;
          status?: string;
          current_module?: string | null;
          whatsapp_thread_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          clinic_id: string;
          conversation_id: string;
          role: string;
          content: string;
          external_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          conversation_id: string;
          role: string;
          content: string;
          external_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          conversation_id?: string;
          role?: string;
          content?: string;
          external_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      message_queue: {
        Row: {
          id: string;
          clinic_id: string;
          conversation_id: string;
          channel: string;
          content: string;
          template_name: string | null;
          template_params: Json | null;
          status: string;
          attempts: number;
          max_attempts: number;
          sent_at: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          conversation_id: string;
          channel: string;
          content: string;
          template_name?: string | null;
          template_params?: Json | null;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          sent_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          conversation_id?: string;
          channel?: string;
          content?: string;
          template_name?: string | null;
          template_params?: Json | null;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          sent_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      module_configs: {
        Row: {
          id: string;
          clinic_id: string;
          module_type: string;
          enabled: boolean;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          module_type: string;
          enabled?: boolean;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinic_id?: string;
          module_type?: string;
          enabled?: boolean;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_user_clinic_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
