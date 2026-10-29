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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      application_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string
          application_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["application_status"] | null
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["application_status"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string
          application_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["application_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string
          application_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["application_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          account_number: string
          archived_at: string | null
          assigned_to: string | null
          created_at: string
          decided_at: string | null
          id: string
          internal_notes: string | null
          monthly_fee: number
          monthly_hours: number
          plan_id: string
          plan_name: string
          signed_at: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number: string
          archived_at?: string | null
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          internal_notes?: string | null
          monthly_fee: number
          monthly_hours: number
          plan_id: string
          plan_name: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string
          archived_at?: string | null
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          internal_notes?: string | null
          monthly_fee?: number
          monthly_hours?: number
          plan_id?: string
          plan_name?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          account_id: string | null
          action: string
          actor_id: string | null
          actor_label: string
          changes: Json | null
          created_at: string
          id: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          account_id?: string | null
          action: string
          actor_id?: string | null
          actor_label?: string
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          account_id?: string | null
          action?: string
          actor_id?: string | null
          actor_label?: string
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      compliance_requests: {
        Row: {
          actor_label: string
          completed_at: string | null
          created_at: string
          details: string | null
          due_at: string
          id: string
          kind: string
          outcome_note: string | null
          status: string
          user_id: string
        }
        Insert: {
          actor_label?: string
          completed_at?: string | null
          created_at?: string
          details?: string | null
          due_at?: string
          id?: string
          kind: string
          outcome_note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          actor_label?: string
          completed_at?: string | null
          created_at?: string
          details?: string | null
          due_at?: string
          id?: string
          kind?: string
          outcome_note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          actor_id: string | null
          actor_label: string
          body: string | null
          created_at: string
          direction: string | null
          duration_minutes: number | null
          follow_up_at: string | null
          id: string
          kind: string
          occurred_at: string
          outcome: string | null
          subject: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string
          body?: string | null
          created_at?: string
          direction?: string | null
          duration_minutes?: number | null
          follow_up_at?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          outcome?: string | null
          subject: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string
          body?: string | null
          created_at?: string
          direction?: string | null
          duration_minutes?: number | null
          follow_up_at?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          outcome?: string | null
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          archived_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          issued_at: string
          number: string
          paid_at: string | null
          status: string
          subscription_id: string | null
          user_id: string
          void_reason: string | null
        }
        Insert: {
          amount: number
          archived_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          issued_at?: string
          number: string
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
          user_id: string
          void_reason?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          issued_at?: string
          number?: string
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_manager: string | null
          account_number: string
          address_line: string | null
          city: string | null
          company: string | null
          company_size: string | null
          country: string | null
          created_at: string
          do_not_sell: boolean
          email: string | null
          first_name: string | null
          id: string
          industry: string | null
          internal_notes: string | null
          last_name: string | null
          lead_source: string | null
          legal_hold: boolean
          legal_name: string | null
          lifecycle_stage: string
          marketing_opt_in: boolean
          phone: string | null
          postal_code: string | null
          sms_opt_in: boolean
          state: string | null
          status: string
          status_changed_at: string | null
          status_reason: string | null
          tax_id: string | null
          terms_accepted_at: string | null
          timezone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_manager?: string | null
          account_number: string
          address_line?: string | null
          city?: string | null
          company?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          do_not_sell?: boolean
          email?: string | null
          first_name?: string | null
          id: string
          industry?: string | null
          internal_notes?: string | null
          last_name?: string | null
          lead_source?: string | null
          legal_hold?: boolean
          legal_name?: string | null
          lifecycle_stage?: string
          marketing_opt_in?: boolean
          phone?: string | null
          postal_code?: string | null
          sms_opt_in?: boolean
          state?: string | null
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
          tax_id?: string | null
          terms_accepted_at?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_manager?: string | null
          account_number?: string
          address_line?: string | null
          city?: string | null
          company?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          do_not_sell?: boolean
          email?: string | null
          first_name?: string | null
          id?: string
          industry?: string | null
          internal_notes?: string | null
          last_name?: string | null
          lead_source?: string | null
          legal_hold?: boolean
          legal_name?: string | null
          lifecycle_stage?: string
          marketing_opt_in?: boolean
          phone?: string | null
          postal_code?: string | null
          sms_opt_in?: boolean
          state?: string | null
          status?: string
          status_changed_at?: string | null
          status_reason?: string | null
          tax_id?: string | null
          terms_accepted_at?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          hours: number
          id: string
          name: string
          service: string
          started_at: string | null
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          hours?: number
          id?: string
          name: string
          service: string
          started_at?: string | null
          status?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          hours?: number
          id?: string
          name?: string
          service?: string
          started_at?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          application_id: string | null
          archived_at: string | null
          cancelled_at: string | null
          created_at: string
          guarantee_ends_at: string | null
          guarantee_status: string
          hours_used: number
          id: string
          monthly_fee: number
          monthly_hours: number
          notes: string | null
          plan_name: string
          renews_at: string | null
          sales_received: boolean
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          archived_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          guarantee_ends_at?: string | null
          guarantee_status?: string
          hours_used?: number
          id?: string
          monthly_fee: number
          monthly_hours: number
          notes?: string | null
          plan_name: string
          renews_at?: string | null
          sales_received?: boolean
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          archived_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          guarantee_ends_at?: string | null
          guarantee_status?: string
          hours_used?: number
          id?: string
          monthly_fee?: number
          monthly_hours?: number
          notes?: string | null
          plan_name?: string
          renews_at?: string | null
          sales_received?: boolean
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          id: string
          priority: string
          status: string
          subject: string
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actor_label: string
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          details: string | null
          due_at: string | null
          id: string
          priority: string
          project_id: string | null
          status: string
          subscription_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          actor_label?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          details?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          subscription_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          actor_label?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          details?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          subscription_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          actor_id: string | null
          actor_label: string
          body: string
          created_at: string
          id: string
          internal: boolean
          ticket_id: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          actor_id: string | null
          actor_label: string
          created_at: string
          description: string
          hours: number
          id: string
          project_id: string
          user_id: string
          worked_on: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          description: string
          hours: number
          id?: string
          project_id: string
          user_id: string
          worked_on?: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          description?: string
          hours?: number
          id?: string
          project_id?: string
          user_id?: string
          worked_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string | null
          method: string | null
          reference: string
          status: string
          subscription_id: string | null
          user_id: string
          void_reason: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          reference: string
          status?: string
          subscription_id?: string | null
          user_id: string
          void_reason?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          reference?: string
          status?: string
          subscription_id?: string | null
          user_id?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      application_status:
        | "submitted"
        | "in_review"
        | "info_requested"
        | "escalated"
        | "approved"
        | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      application_status: [
        "submitted",
        "in_review",
        "info_requested",
        "escalated",
        "approved",
        "rejected",
      ],
    },
  },
} as const
