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
      finance_attachments: {
        Row: {
          entry_id: string | null
          file_name: string
          id: string
          mime_type: string | null
          organization_id: string
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
          due_date: string | null
          entry_date: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          external_url: string | null
          id: string
          invoice_status: Database["public"]["Enums"]["invoice_status"]
          notes: string | null
          organization_id: string
          paid_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pre_company_expense: boolean
          source_app: string | null
          source_ref: string | null
          source_type: string | null
          updated_at: string
          vat_amount: number
          vat_rate: number
          voucher_number: string | null
        }
        Insert: {
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
          due_date?: string | null
          entry_date?: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          external_url?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["invoice_status"]
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pre_company_expense?: boolean
          source_app?: string | null
          source_ref?: string | null
          source_type?: string | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          voucher_number?: string | null
        }
        Update: {
          amount_gross?: number
          amount_net?: number
          api_client_id?: string | null
          book_id?: string
          category?: string | null
          category_group?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          currency?: string
          description?: string
          due_date?: string | null
          entry_date?: string
          entry_type?: Database["public"]["Enums"]["entry_type"]
          external_url?: string | null
          id?: string
          invoice_status?: Database["public"]["Enums"]["invoice_status"]
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pre_company_expense?: boolean
          source_app?: string | null
          source_ref?: string | null
          source_type?: string | null
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
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
          created_at: string
          created_by: string
          id: string
          kind: string
          name: string
          org_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          name: string
          org_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          name?: string
          org_number?: string | null
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
      ],
      entry_type: ["income", "expense"],
      invoice_status: ["none", "draft", "sent", "overdue", "paid"],
      org_role: ["owner", "admin", "editor", "viewer"],
      payment_status: ["unpaid", "paid", "partial", "refunded"],
      receipt_draft_status: ["draft", "reviewed", "converted", "rejected"],
    },
  },
} as const
