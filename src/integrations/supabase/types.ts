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
          visible_to_client: boolean
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
          visible_to_client?: boolean
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
          visible_to_client?: boolean
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
      billing_settings: {
        Row: {
          court_fees: Json
          id: number
          legal_after_days: number
          legal_fee_min: number
          legal_fee_pct: number
          monthly_interest_pct: number
          overage_needs_approval: boolean
          overage_rates: Json
          updated_at: string
        }
        Insert: {
          court_fees?: Json
          id?: number
          legal_after_days?: number
          legal_fee_min?: number
          legal_fee_pct?: number
          monthly_interest_pct?: number
          overage_needs_approval?: boolean
          overage_rates?: Json
          updated_at?: string
        }
        Update: {
          court_fees?: Json
          id?: number
          legal_after_days?: number
          legal_fee_min?: number
          legal_fee_pct?: number
          monthly_interest_pct?: number
          overage_needs_approval?: boolean
          overage_rates?: Json
          updated_at?: string
        }
        Relationships: []
      }
      blocked_email_domains: {
        Row: {
          created_at: string
          created_by_label: string
          domain: string
          reason: string
        }
        Insert: {
          created_at?: string
          created_by_label?: string
          domain: string
          reason?: string
        }
        Update: {
          created_at?: string
          created_by_label?: string
          domain?: string
          reason?: string
        }
        Relationships: []
      }
      client_reports: {
        Row: {
          actor_label: string
          archived_at: string | null
          created_at: string
          id: string
          metrics: Json
          period_start: string
          published_at: string | null
          subscription_id: string | null
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_label?: string
          archived_at?: string | null
          created_at?: string
          id?: string
          metrics?: Json
          period_start: string
          published_at?: string | null
          subscription_id?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_label?: string
          archived_at?: string | null
          created_at?: string
          id?: string
          metrics?: Json
          period_start?: string
          published_at?: string | null
          subscription_id?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reports_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
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
          follow_up_done_at: string | null
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
          follow_up_done_at?: string | null
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
          follow_up_done_at?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          outcome?: string | null
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      deliverables: {
        Row: {
          actor_label: string
          archived_at: string | null
          assigned_to: string | null
          client_feedback: string | null
          created_at: string
          decided_at: string | null
          description: string | null
          due_at: string | null
          id: string
          project_id: string | null
          review_round: number
          status: string
          submitted_at: string | null
          subscription_id: string | null
          task_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_label?: string
          archived_at?: string | null
          assigned_to?: string | null
          client_feedback?: string | null
          created_at?: string
          decided_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          project_id?: string | null
          review_round?: number
          status?: string
          submitted_at?: string | null
          subscription_id?: string | null
          task_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_label?: string
          archived_at?: string | null
          assigned_to?: string | null
          client_feedback?: string | null
          created_at?: string
          decided_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          project_id?: string | null
          review_round?: number
          status?: string
          submitted_at?: string | null
          subscription_id?: string | null
          task_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          kind: string
          mime_type: string | null
          related_id: string | null
          related_table: string | null
          size_bytes: number | null
          status: string
          storage_path: string
          title: string
          uploaded_by: string | null
          uploaded_by_label: string
          user_id: string
          visible_to_client: boolean
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string | null
          related_id?: string | null
          related_table?: string | null
          size_bytes?: number | null
          status?: string
          storage_path: string
          title: string
          uploaded_by?: string | null
          uploaded_by_label?: string
          user_id: string
          visible_to_client?: boolean
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string | null
          related_id?: string | null
          related_table?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string
          title?: string
          uploaded_by?: string | null
          uploaded_by_label?: string
          user_id?: string
          visible_to_client?: boolean
        }
        Relationships: []
      }
      invoice_charges: {
        Row: {
          actor_label: string
          amount: number
          billed_invoice_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string | null
          kind: string
          stripe_item_id: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          actor_label?: string
          amount: number
          billed_invoice_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id?: string | null
          kind: string
          stripe_item_id?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          actor_label?: string
          amount?: number
          billed_invoice_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string | null
          kind?: string
          stripe_item_id?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_charges_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          archived_at: string | null
          collection_notes: string | null
          collection_stage: string
          created_at: string
          description: string | null
          due_at: string | null
          failed_payment_at: string | null
          fees_accrued: number
          hosted_url: string | null
          id: string
          interest_accrued: number
          interest_paused: boolean
          issued_at: string
          kind: string
          number: string
          paid_at: string | null
          pdf_url: string | null
          stage_changed_at: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_status: string | null
          stripe_synced_at: string | null
          subscription_id: string | null
          user_id: string
          void_reason: string | null
        }
        Insert: {
          amount: number
          archived_at?: string | null
          collection_notes?: string | null
          collection_stage?: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          failed_payment_at?: string | null
          fees_accrued?: number
          hosted_url?: string | null
          id?: string
          interest_accrued?: number
          interest_paused?: boolean
          issued_at?: string
          kind?: string
          number: string
          paid_at?: string | null
          pdf_url?: string | null
          stage_changed_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_status?: string | null
          stripe_synced_at?: string | null
          subscription_id?: string | null
          user_id: string
          void_reason?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          collection_notes?: string | null
          collection_stage?: string
          created_at?: string
          description?: string | null
          due_at?: string | null
          failed_payment_at?: string | null
          fees_accrued?: number
          hosted_url?: string | null
          id?: string
          interest_accrued?: number
          interest_paused?: boolean
          issued_at?: string
          kind?: string
          number?: string
          paid_at?: string | null
          pdf_url?: string | null
          stage_changed_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_status?: string | null
          stripe_synced_at?: string | null
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
      job_runs: {
        Row: {
          last_run_at: string | null
          last_run_on: string | null
          name: string
        }
        Insert: {
          last_run_at?: string | null
          last_run_on?: string | null
          name: string
        }
        Update: {
          last_run_at?: string | null
          last_run_on?: string | null
          name?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          purpose: string
          subject: string
          updated_at: string
          updated_by_label: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          purpose?: string
          subject: string
          updated_at?: string
          updated_by_label?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          purpose?: string
          subject?: string
          updated_at?: string
          updated_by_label?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          email_attempts: number
          email_status: string
          email_to: string | null
          emailed_at: string | null
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          email_attempts?: number
          email_status?: string
          email_to?: string | null
          emailed_at?: string | null
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          email_attempts?: number
          email_status?: string
          email_to?: string | null
          emailed_at?: string | null
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_briefs: {
        Row: {
          answers: Json
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          email_notifications: boolean
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
          stripe_customer_id: string | null
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
          email_notifications?: boolean
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
          stripe_customer_id?: string | null
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
          email_notifications?: boolean
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
          stripe_customer_id?: string | null
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
      security_settings: {
        Row: {
          id: number
          require_staff_mfa: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          require_staff_mfa?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          require_staff_mfa?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      sign_in_events: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          id: string
          ip: string | null
          new_location: boolean
          region: string | null
          reviewed_at: string | null
          reviewed_by_label: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          new_location?: boolean
          region?: string | null
          reviewed_at?: string | null
          reviewed_by_label?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          new_location?: boolean
          region?: string | null
          reviewed_at?: string | null
          reviewed_by_label?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      signed_agreements: {
        Row: {
          application_id: string
          body: string
          created_at: string
          id: string
          sha256: string
          signed_at: string
          title: string
          user_id: string
          version: string
        }
        Insert: {
          application_id: string
          body: string
          created_at?: string
          id?: string
          sha256: string
          signed_at: string
          title: string
          user_id: string
          version: string
        }
        Update: {
          application_id?: string
          body?: string
          created_at?: string
          id?: string
          sha256?: string
          signed_at?: string
          title?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "signed_agreements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          received_at: string
          type: string
        }
        Insert: {
          id: string
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          application_id: string | null
          archived_at: string | null
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          first_paid_at: string | null
          guarantee_claimed_at: string | null
          guarantee_ends_at: string | null
          guarantee_status: string
          guarantee_void_reason: string | null
          hours_used: number
          id: string
          monthly_fee: number
          monthly_hours: number
          notes: string | null
          overage_billed_hours: number
          paused_by_account_status: boolean
          payment_warning: string | null
          pending_plan_id: string | null
          plan_name: string
          renews_at: string | null
          sales_received: boolean
          started_at: string | null
          status: string
          stripe_status: string | null
          stripe_subscription_id: string | null
          stripe_synced_at: string | null
          user_id: string
        }
        Insert: {
          application_id?: string | null
          archived_at?: string | null
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          first_paid_at?: string | null
          guarantee_claimed_at?: string | null
          guarantee_ends_at?: string | null
          guarantee_status?: string
          guarantee_void_reason?: string | null
          hours_used?: number
          id?: string
          monthly_fee: number
          monthly_hours: number
          notes?: string | null
          overage_billed_hours?: number
          paused_by_account_status?: boolean
          payment_warning?: string | null
          pending_plan_id?: string | null
          plan_name: string
          renews_at?: string | null
          sales_received?: boolean
          started_at?: string | null
          status?: string
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          stripe_synced_at?: string | null
          user_id: string
        }
        Update: {
          application_id?: string | null
          archived_at?: string | null
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          first_paid_at?: string | null
          guarantee_claimed_at?: string | null
          guarantee_ends_at?: string | null
          guarantee_status?: string
          guarantee_void_reason?: string | null
          hours_used?: number
          id?: string
          monthly_fee?: number
          monthly_hours?: number
          notes?: string | null
          overage_billed_hours?: number
          paused_by_account_status?: boolean
          payment_warning?: string | null
          pending_plan_id?: string | null
          plan_name?: string
          renews_at?: string | null
          sales_received?: boolean
          started_at?: string | null
          status?: string
          stripe_status?: string | null
          stripe_subscription_id?: string | null
          stripe_synced_at?: string | null
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
          contact_phone: string | null
          contact_preference: string
          created_at: string
          department: string
          first_response_at: string | null
          id: string
          last_client_message_at: string | null
          last_staff_message_at: string | null
          priority: string
          project_id: string | null
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
          contact_phone?: string | null
          contact_preference?: string
          created_at?: string
          department?: string
          first_response_at?: string | null
          id?: string
          last_client_message_at?: string | null
          last_staff_message_at?: string | null
          priority?: string
          project_id?: string | null
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
          contact_phone?: string | null
          contact_preference?: string
          created_at?: string
          department?: string
          first_response_at?: string | null
          id?: string
          last_client_message_at?: string | null
          last_staff_message_at?: string | null
          priority?: string
          project_id?: string | null
          status?: string
          subject?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
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
          estimated_hours: number | null
          id: string
          over_allowance: boolean
          overage_approved: boolean
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
          estimated_hours?: number | null
          id?: string
          over_allowance?: boolean
          overage_approved?: boolean
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
          estimated_hours?: number | null
          id?: string
          over_allowance?: boolean
          overage_approved?: boolean
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
          task_id: string | null
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
          task_id?: string | null
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
          task_id?: string | null
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
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
          stripe_id: string | null
          stripe_payment_intent: string | null
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
          stripe_id?: string | null
          stripe_payment_intent?: string | null
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
          stripe_id?: string | null
          stripe_payment_intent?: string | null
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
      account_access_ok: { Args: never; Returns: boolean }
      email_domain_blocked: { Args: { _email: string }; Returns: boolean }
      has_perm: { Args: { _perm: string; _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      level_grants: {
        Args: { _level: string; _perm: string }
        Returns: boolean
      }
      mark_notifications_read: { Args: { _ids?: string[] }; Returns: number }
      mfa_satisfied: { Args: never; Returns: boolean }
      mfa_session_ok: { Args: never; Returns: boolean }
      notify: {
        Args: {
          _body: string
          _dedupe?: string
          _email?: boolean
          _kind: string
          _link: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      notify_staff: {
        Args: {
          _assigned: string
          _body: string
          _dedupe?: string
          _kind: string
          _link: string
          _perm: string
          _title: string
        }
        Returns: undefined
      }
      revoke_user_sessions: {
        Args: { _session?: string; _user: string }
        Returns: number
      }
      staff_directory: {
        Args: never
        Returns: {
          created_at: string
          email: string
          level: string
          mfa_enabled: boolean
          name: string
          user_id: string
        }[]
      }
      staff_search: {
        Args: { q: string }
        Returns: {
          account_id: string
          id: string
          kind: string
          subtitle: string
          title: string
        }[]
      }
      user_sessions: { Args: { _user: string }; Returns: Json[] }
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
        | "suspended"
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
        "suspended",
      ],
    },
  },
} as const
