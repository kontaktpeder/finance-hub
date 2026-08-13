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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_clients: {
        Row: {
          allowed_scopes: Database["public"]["Enums"]["api_scope"][]
          created_at: string
          created_by: string
          id: string
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
        }
        Insert: {
          allowed_scopes?: Database["public"]["Enums"]["api_scope"][]
          created_at?: string
          created_by: string
          id?: string
          last_used_at?: string | null
          name: string
          organization_id: string
          revoked_at?: string | null
        }
        Update: {
          allowed_scopes?: Database["public"]["Enums"]["api_scope"][]
          created_at?: string
          created_by?: string
          id?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_events: {
        Row: {
          api_client_id: string | null
          created_at: string
          endpoint: string
          id: string
          meta: Json | null
          method: string
          organization_id: string
          status_code: number
        }
        Insert: {
          api_client_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          meta?: Json | null
          method: string
          organization_id: string
          status_code: number
        }
        Update: {
          api_client_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          meta?: Json | null
          method?: string
          organization_id?: string
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_events_api_client_id_fkey"
            columns: ["api_client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          api_client_id: string
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          revoked_at: string | null
        }
        Insert: {
          api_client_id: string
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          revoked_at?: string | null
        }
        Update: {
          api_client_id?: string
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_api_client_id_fkey"
            columns: ["api_client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_connection_id: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          organization_id: string
          provider_account_id: string
          raw_metadata: Json
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_connection_id: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          organization_id: string
          provider_account_id: string
          raw_metadata?: Json
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_connection_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          provider_account_id?: string
          raw_metadata?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          bank_id: string | null
          bank_name: string | null
          consent_expires_at: string | null
          created_at: string
          created_by: string | null
          device_id: string
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          organization_id: string
          provider: string
          provider_connection_id: string | null
          raw_metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          bank_id?: string | null
          bank_name?: string | null
          consent_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          organization_id: string
          provider?: string
          provider_connection_id?: string | null
          raw_metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          bank_id?: string | null
          bank_name?: string | null
          consent_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          organization_id?: string
          provider?: string
          provider_connection_id?: string | null
          raw_metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          booking_date: string | null
          category: string | null
          counterparty: string | null
          created_at: string
          currency: string
          description: string | null
          finance_entry_id: string | null
          id: string
          is_income: boolean
          organization_id: string
          provider_transaction_id: string
          raw_payload: Json
          status: string
          transaction_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          booking_date?: string | null
          category?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          finance_entry_id?: string | null
          id?: string
          is_income: boolean
          organization_id: string
          provider_transaction_id: string
          raw_payload?: Json
          status?: string
          transaction_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          booking_date?: string | null
          category?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          finance_entry_id?: string | null
          id?: string
          is_income?: boolean
          organization_id?: string
          provider_transaction_id?: string
          raw_payload?: Json
          status?: string
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_finance_entry_id_fkey"
            columns: ["finance_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_attachments: {
        Row: {
          entry_id: string | null
          file_name: string
          id: string
          mime_type: string | null
          organization_id: string
          page_index: number | null
          receipt_draft_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          entry_id?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          organization_id: string
          page_index?: number | null
          receipt_draft_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          entry_id?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          organization_id?: string
          page_index?: number | null
          receipt_draft_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "finance_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_attachments_receipt_draft_id_fkey"
            columns: ["receipt_draft_id"]
            isOneToOne: false
            referencedRelation: "finance_receipt_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_books: {
        Row: {
          created_at: string
          currency: string
          fiscal_year: number | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          updated_at: string
          voucher_seq: number
        }
        Insert: {
          created_at?: string
          currency?: string
          fiscal_year?: number | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          updated_at?: string
          voucher_seq?: number
        }
        Update: {
          created_at?: string
          currency?: string
          fiscal_year?: number | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          voucher_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_books_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          accountant_approved: boolean
          amount_gross: number
          amount_net: number
          api_client_id: string | null
          book_id: string
          category: string | null
          category_group: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          created_via: string
          currency: string
          description: string
          documentation_status: string
          due_date: string | null
          entry_date: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          external_url: string | null
          id: string
          invoice_status: Database["public"]["Enums"]["invoice_status"]
          notes: string | null
          organization_id: string
          original_voucher_number: string | null
          paid_at: string | null
          paid_by: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          period_lock_exception_id: string | null
          posting_kind: string
          pre_company_expense: boolean
          private_expense: boolean
          reimbursed: boolean
          reverses_entry_id: string | null
          reversed_by_entry_id: string | null
          source_app: string | null
          source_ref: string | null
          source_type: string | null
          updated_at: string
          vat_amount: number
          vat_rate: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voucher_number: string | null
          booking_status: string
          correction_of_entry_id: string | null
        }
        Insert: {
          accountant_approved?: boolean
          amount_gross?: number
          amount_net?: number
          api_client_id?: string | null
          book_id: string
          category?: string | null
          category_group?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          currency?: string
          description: string
          documentation_status?: string
          due_date?: string | null
          entry_date?: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          external_url?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["invoice_status"]
          notes?: string | null
          organization_id: string
          original_voucher_number?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          period_lock_exception_id?: string | null
          posting_kind?: string
          pre_company_expense?: boolean
          private_expense?: boolean
          reimbursed?: boolean
          reverses_entry_id?: string | null
          reversed_by_entry_id?: string | null
          source_app?: string | null
          source_ref?: string | null
          source_type?: string | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voucher_number?: string | null
          booking_status?: string
          correction_of_entry_id?: string | null
        }
        Update: {
          accountant_approved?: boolean
          amount_gross?: number
          amount_net?: number
          api_client_id?: string | null
          book_id?: string
          booking_status?: string
          category?: string | null
          category_group?: string | null
          correction_of_entry_id?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          currency?: string
          description?: string
          documentation_status?: string
          due_date?: string | null
          entry_date?: string
          entry_type?: Database["public"]["Enums"]["entry_type"]
          external_url?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["invoice_status"]
          notes?: string | null
          organization_id?: string
          original_voucher_number?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          period_lock_exception_id?: string | null
          posting_kind?: string
          pre_company_expense?: boolean
          private_expense?: boolean
          reimbursed?: boolean
          reverses_entry_id?: string | null
          reversed_by_entry_id?: string | null
          source_app?: string | null
          source_ref?: string | null
          source_type?: string | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voucher_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "finance_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entry_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entry_id: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          organization_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entry_id: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entry_id?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      finance_payments: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          entry_id: string
          id: string
          kind: string
          notes: string | null
          organization_id: string
          paid_by: string | null
          paid_on: string
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          entry_id: string
          id?: string
          kind?: string
          notes?: string | null
          organization_id: string
          paid_by?: string | null
          paid_on: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          entry_id?: string
          id?: string
          kind?: string
          notes?: string | null
          organization_id?: string
          paid_by?: string | null
          paid_on?: string
        }
        Relationships: []
      }
      finance_period_locks: {
        Row: {
          id: string
          locked_at: string
          locked_by: string | null
          organization_id: string
          period_month: number
          period_year: number
          reason: string | null
        }
        Insert: {
          id?: string
          locked_at?: string
          locked_by?: string | null
          organization_id: string
          period_month: number
          period_year: number
          reason?: string | null
        }
        Update: {
          id?: string
          locked_at?: string
          locked_by?: string | null
          organization_id?: string
          period_month?: number
          period_year?: number
          reason?: string | null
        }
        Relationships: []
      }
      finance_admin_exceptions: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entry_id: string | null
          id: string
          organization_id: string
          period_month: number | null
          period_year: number | null
          reason: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entry_id?: string | null
          id?: string
          organization_id: string
          period_month?: number | null
          period_year?: number | null
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entry_id?: string | null
          id?: string
          organization_id?: string
          period_month?: number | null
          period_year?: number | null
          reason?: string
        }
        Relationships: []
      }
      finance_receipt_drafts: {
        Row: {
          ai_model: string | null
          ai_suggestion: Json | null
          attachment_id: string | null
          book_id: string
          converted_entry_id: string | null
          created_at: string
          error: string | null
          extracted_text: string | null
          id: string
          organization_id: string
          status: Database["public"]["Enums"]["receipt_draft_status"]
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_model?: string | null
          ai_suggestion?: Json | null
          attachment_id?: string | null
          book_id: string
          converted_entry_id?: string | null
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          id?: string
          organization_id: string
          status?: Database["public"]["Enums"]["receipt_draft_status"]
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_model?: string | null
          ai_suggestion?: Json | null
          attachment_id?: string | null
          book_id?: string
          converted_entry_id?: string | null
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["receipt_draft_status"]
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          description: string
          id: string
          invoice_id: string
          line_net: number
          line_total: number
          line_vat: number
          quantity: number
          sort_order: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          line_net: number
          line_total: number
          line_vat: number
          quantity?: number
          sort_order?: number
          unit_price: number
          vat_rate?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          line_net?: number
          line_total?: number
          line_vat?: number
          quantity?: number
          sort_order?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_org_number: string | null
          due_date: string | null
          finance_entry_id: string | null
          id: string
          invoice_number: string | null
          issue_date: string
          locked_at: string | null
          organization_id: string
          paid_at: string | null
          pdf_attachment_id: string | null
          seller_snapshot: Json
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_org_number?: string | null
          due_date?: string | null
          finance_entry_id?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string
          locked_at?: string | null
          organization_id: string
          paid_at?: string | null
          pdf_attachment_id?: string | null
          seller_snapshot?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_org_number?: string | null
          due_date?: string | null
          finance_entry_id?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string
          locked_at?: string | null
          organization_id?: string
          paid_at?: string | null
          pdf_attachment_id?: string | null
          seller_snapshot?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_finance_entry_id_fkey"
            columns: ["finance_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_pdf_attachment_id_fkey"
            columns: ["pdf_attachment_id"]
            isOneToOne: false
            referencedRelation: "finance_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          bank_account: string | null
          city: string | null
          country: string
          created_at: string
          created_by: string
          id: string
          invoice_seq: number
          invoice_seq_year: number | null
          kind: string
          name: string
          org_number: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by: string
          id?: string
          invoice_seq?: number
          invoice_seq_year?: number | null
          kind?: string
          name: string
          org_number?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string
          id?: string
          invoice_seq?: number
          invoice_seq_year?: number | null
          kind?: string
          name?: string
          org_number?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
          _user: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      org_role_of: {
        Args: { _org: string; _user: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
    }
    Enums: {
      api_scope:
        | "entries:read"
        | "entries:write"
        | "attachments:write"
        | "reports:read"
        | "invoices:read"
        | "invoices:write"
        | "platform:read"
        | "platform:verify"
      entry_type: "income" | "expense"
      invoice_status: "none" | "draft" | "sent" | "overdue" | "paid"
      org_role: "owner" | "admin" | "editor" | "viewer"
      payment_status: "unpaid" | "paid" | "partial" | "refunded"
      receipt_draft_status: "draft" | "reviewed" | "converted" | "rejected"
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
  public: {
    Enums: {
      api_scope: [
        "entries:read",
        "entries:write",
        "attachments:write",
        "reports:read",
        "invoices:read",
        "invoices:write",
        "platform:read",
        "platform:verify",
      ],
      entry_type: ["income", "expense"],
      invoice_status: ["none", "draft", "sent", "overdue", "paid"],
      org_role: ["owner", "admin", "editor", "viewer"],
      payment_status: ["unpaid", "paid", "partial", "refunded"],
      receipt_draft_status: ["draft", "reviewed", "converted", "rejected"],
    },
  },
} as const
