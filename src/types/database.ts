export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agents: {
        Row: {
          active: boolean
          clinic_id: string
          config: Json
          created_at: string
          description: string | null
          id: string
          instructions: string | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancellation_reason: string | null
          clinic_id: string
          created_at: string
          ends_at: string
          google_event_id: string | null
          id: string
          insurance_plan_id: string | null
          patient_id: string
          professional_id: string | null
          service_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          clinic_id: string
          created_at?: string
          ends_at: string
          google_event_id?: string | null
          id?: string
          insurance_plan_id?: string | null
          patient_id: string
          professional_id?: string | null
          service_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          clinic_id?: string
          created_at?: string
          ends_at?: string
          google_event_id?: string | null
          id?: string
          insurance_plan_id?: string | null
          patient_id?: string
          professional_id?: string | null
          service_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_insurance_plan_id_fkey"
            columns: ["insurance_plan_id"]
            isOneToOne: false
            referencedRelation: "insurance_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_users: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_users_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          google_reviews_url: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          operating_hours: Json
          phone: string | null
          slug: string
          state: string | null
          timezone: string
          updated_at: string
          whatsapp_access_token: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_waba_id: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          google_reviews_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          operating_hours?: Json
          phone?: string | null
          slug: string
          state?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_access_token?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_waba_id?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          google_reviews_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          operating_hours?: Json
          phone?: string | null
          slug?: string
          state?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_access_token?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_waba_id?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      confirmation_queue: {
        Row: {
          appointment_id: string
          attempts: number
          clinic_id: string
          created_at: string
          id: string
          response: string | null
          scheduled_at: string
          sent_at: string | null
          stage: string
          status: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          clinic_id: string
          created_at?: string
          id?: string
          response?: string | null
          scheduled_at: string
          sent_at?: string | null
          stage: string
          status?: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          clinic_id?: string
          created_at?: string
          id?: string
          response?: string | null
          scheduled_at?: string
          sent_at?: string | null
          stage?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "confirmation_queue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confirmation_queue_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string | null
          channel: string
          clinic_id: string
          created_at: string
          current_module: string | null
          id: string
          patient_id: string
          status: string
          updated_at: string
          whatsapp_thread_id: string | null
        }
        Insert: {
          agent_id?: string | null
          channel?: string
          clinic_id: string
          created_at?: string
          current_module?: string | null
          id?: string
          patient_id: string
          status?: string
          updated_at?: string
          whatsapp_thread_id?: string | null
        }
        Update: {
          agent_id?: string | null
          channel?: string
          clinic_id?: string
          created_at?: string
          current_module?: string | null
          id?: string
          patient_id?: string
          status?: string
          updated_at?: string
          whatsapp_thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_plans: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_plans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          clinic_id: string
          created_at: string
          due_date: string
          id: string
          notes: string | null
          paid_at: string | null
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          clinic_id: string
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          clinic_id?: string
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_queue: {
        Row: {
          attempts: number
          channel: string
          clinic_id: string
          content: string
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          max_attempts: number
          sent_at: string | null
          status: string
          template_name: string | null
          template_params: Json | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          clinic_id: string
          content: string
          conversation_id: string
          created_at?: string
          error?: string | null
          id?: string
          max_attempts?: number
          sent_at?: string | null
          status?: string
          template_name?: string | null
          template_params?: Json | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          clinic_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          max_attempts?: number
          sent_at?: string | null
          status?: string
          template_name?: string | null
          template_params?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_queue_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          clinic_id: string
          content: string
          conversation_id: string
          created_at: string
          external_id: string | null
          id: string
          metadata: Json
          role: string
        }
        Insert: {
          clinic_id: string
          content: string
          conversation_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          metadata?: Json
          role: string
        }
        Update: {
          clinic_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          metadata?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      module_configs: {
        Row: {
          clinic_id: string
          created_at: string
          enabled: boolean
          id: string
          module_type: string
          settings: Json
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          module_type: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          module_type?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_configs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          alert_sent: boolean
          appointment_id: string
          clinic_id: string
          comment: string | null
          created_at: string
          id: string
          patient_id: string
          review_sent: boolean
          score: number | null
        }
        Insert: {
          alert_sent?: boolean
          appointment_id: string
          clinic_id: string
          comment?: string | null
          created_at?: string
          id?: string
          patient_id: string
          review_sent?: boolean
          score?: number | null
        }
        Update: {
          alert_sent?: boolean
          appointment_id?: string
          clinic_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          patient_id?: string
          review_sent?: boolean
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          asaas_customer_id: string | null
          clinic_id: string
          cpf: string | null
          created_at: string
          custom_fields: Json
          date_of_birth: string | null
          email: string | null
          id: string
          last_visit_at: string | null
          name: string
          notes: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          asaas_customer_id?: string | null
          clinic_id: string
          cpf?: string | null
          created_at?: string
          custom_fields?: Json
          date_of_birth?: string | null
          email?: string | null
          id?: string
          last_visit_at?: string | null
          name: string
          notes?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          custom_fields?: Json
          date_of_birth?: string | null
          email?: string | null
          id?: string
          last_visit_at?: string | null
          name?: string
          notes?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          asaas_payment_id: string | null
          boleto_identification_field: string | null
          clinic_id: string
          created_at: string
          id: string
          invoice_id: string
          invoice_url: string | null
          method: string
          pix_payload: string | null
          status: string
          url: string
        }
        Insert: {
          asaas_payment_id?: string | null
          boleto_identification_field?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          invoice_id: string
          invoice_url?: string | null
          method: string
          pix_payload?: string | null
          status?: string
          url: string
        }
        Update: {
          asaas_payment_id?: string | null
          boleto_identification_field?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          invoice_url?: string | null
          method?: string
          pix_payload?: string | null
          status?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean
          appointment_duration_minutes: number
          clinic_id: string
          created_at: string
          google_calendar_id: string | null
          google_refresh_token: string | null
          id: string
          name: string
          schedule_grid: Json
          specialty: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          appointment_duration_minutes?: number
          clinic_id: string
          created_at?: string
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          id?: string
          name: string
          schedule_grid?: Json
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          appointment_duration_minutes?: number
          clinic_id?: string
          created_at?: string
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          id?: string
          name?: string
          schedule_grid?: Json
          specialty?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_services: {
        Row: {
          created_at: string
          id: string
          price_cents: number
          professional_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          price_cents: number
          professional_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          price_cents?: number
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      recall_queue: {
        Row: {
          attempts: number
          clinic_id: string
          created_at: string
          id: string
          last_visit_at: string
          patient_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          clinic_id: string
          created_at?: string
          id?: string
          last_visit_at: string
          patient_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          clinic_id?: string
          created_at?: string
          id?: string
          last_visit_at?: string
          patient_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recall_queue_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_queue_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          clinic_id: string
          created_at: string
          duration_minutes: number
          id: string
          name: string
          price_cents: number | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name: string
          price_cents?: number | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_clinic_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
