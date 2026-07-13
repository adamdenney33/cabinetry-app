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
    PostgrestVersion: "14.4"
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
      accounting_connections: {
        Row: {
          access_token_enc: string | null
          connected_at: string
          default_tax_code: string | null
          expires_at: string | null
          id: number
          org_name: string | null
          provider: string
          realm_id: string | null
          refresh_token_enc: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          connected_at?: string
          default_tax_code?: string | null
          expires_at?: string | null
          id?: number
          org_name?: string | null
          provider: string
          realm_id?: string | null
          refresh_token_enc?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          connected_at?: string
          default_tax_code?: string | null
          expires_at?: string | null
          id?: number
          org_name?: string | null
          provider?: string
          realm_id?: string | null
          refresh_token_enc?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      accounting_invoice_links: {
        Row: {
          doc_type: string
          external_id: string
          external_number: string | null
          external_url: string | null
          id: number
          order_id: number | null
          provider: string
          pushed_at: string
          quote_id: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          doc_type?: string
          external_id: string
          external_number?: string | null
          external_url?: string | null
          id?: number
          order_id?: number | null
          provider: string
          pushed_at?: string
          quote_id?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          doc_type?: string
          external_id?: string
          external_number?: string | null
          external_url?: string | null
          id?: number
          order_id?: number | null
          provider?: string
          pushed_at?: string
          quote_id?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_invoice_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_invoice_links_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      business_info: {
        Row: {
          abn: string | null
          address: string | null
          bank_details: string | null
          created_at: string
          default_base_types: Json
          default_carcass_types: Json
          default_constructions: Json
          default_contingency_hours: number
          default_contingency_pct: number | null
          default_currency: string
          default_deposit_pct: number
          default_door_types: Json
          default_drawer_box_types: Json
          default_drawer_front_types: Json
          default_edge_banding: Json
          default_edging_per_m: number
          default_installation_hours: number
          default_labour_rate: number
          default_labour_times: Json
          default_markup_pct: number
          default_packaging_hours: number
          default_tax_pct: number
          default_units: string
          default_weekday_hours: Json
          default_workday_hours: number
          email: string | null
          email_bridge_enabled: boolean
          id: number
          logo_url: string | null
          name: string
          onboarding_state: Json
          phone: string | null
          production_queue_start_date: string | null
          unit_format: Json | null
          updated_at: string
          user_id: string
          workday_start_time: string
        }
        Insert: {
          abn?: string | null
          address?: string | null
          bank_details?: string | null
          created_at?: string
          default_base_types?: Json
          default_carcass_types?: Json
          default_constructions?: Json
          default_contingency_hours?: number
          default_contingency_pct?: number | null
          default_currency?: string
          default_deposit_pct?: number
          default_door_types?: Json
          default_drawer_box_types?: Json
          default_drawer_front_types?: Json
          default_edge_banding?: Json
          default_edging_per_m?: number
          default_installation_hours?: number
          default_labour_rate?: number
          default_labour_times?: Json
          default_markup_pct?: number
          default_packaging_hours?: number
          default_tax_pct?: number
          default_units?: string
          default_weekday_hours?: Json
          default_workday_hours?: number
          email?: string | null
          email_bridge_enabled?: boolean
          id?: number
          logo_url?: string | null
          name?: string
          onboarding_state?: Json
          phone?: string | null
          production_queue_start_date?: string | null
          unit_format?: Json | null
          updated_at?: string
          user_id: string
          workday_start_time?: string
        }
        Update: {
          abn?: string | null
          address?: string | null
          bank_details?: string | null
          created_at?: string
          default_base_types?: Json
          default_carcass_types?: Json
          default_constructions?: Json
          default_contingency_hours?: number
          default_contingency_pct?: number | null
          default_currency?: string
          default_deposit_pct?: number
          default_door_types?: Json
          default_drawer_box_types?: Json
          default_drawer_front_types?: Json
          default_edge_banding?: Json
          default_edging_per_m?: number
          default_installation_hours?: number
          default_labour_rate?: number
          default_labour_times?: Json
          default_markup_pct?: number
          default_packaging_hours?: number
          default_tax_pct?: number
          default_units?: string
          default_weekday_hours?: Json
          default_workday_hours?: number
          email?: string | null
          email_bridge_enabled?: boolean
          id?: number
          logo_url?: string | null
          name?: string
          onboarding_state?: Json
          phone?: string | null
          production_queue_start_date?: string | null
          unit_format?: Json | null
          updated_at?: string
          user_id?: string
          workday_start_time?: string
        }
        Relationships: []
      }
      cabinet_hardware: {
        Row: {
          cabinet_id: number
          created_at: string
          id: number
          name: string
          qty: number
          unit_price: number
          user_id: string
        }
        Insert: {
          cabinet_id: number
          created_at?: string
          id?: number
          name: string
          qty?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          cabinet_id?: number
          created_at?: string
          id?: number
          name?: string
          qty?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cabinet_hardware_cabinet_id_fkey"
            columns: ["cabinet_id"]
            isOneToOne: false
            referencedRelation: "cabinets"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinet_templates: {
        Row: {
          created_at: string
          default_d_mm: number | null
          default_h_mm: number | null
          default_specs: Json
          default_w_mm: number | null
          id: number
          name: string
          tags: Json
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_d_mm?: number | null
          default_h_mm?: number | null
          default_specs?: Json
          default_w_mm?: number | null
          id?: number
          name: string
          tags?: Json
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_d_mm?: number | null
          default_h_mm?: number | null
          default_specs?: Json
          default_w_mm?: number | null
          id?: number
          name?: string
          tags?: Json
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cabinets: {
        Row: {
          adj_shelves: number
          back_material: string | null
          base_type: string | null
          cable_holes: number
          carcass_material: string | null
          created_at: string
          d_mm: number
          door_count: number
          door_handle: string | null
          door_material: string | null
          drawer_count: number
          drawer_front_material: string | null
          drawer_handle: string | null
          drawer_inner_material: string | null
          extra_labour_hours: number
          finish: string | null
          fixed_shelves: number
          h_mm: number
          has_back: boolean
          id: number
          loose_shelves: number
          name: string
          notes: string | null
          position: number
          qty: number
          top_material: string | null
          updated_at: string
          user_id: string
          w_mm: number
        }
        Insert: {
          adj_shelves?: number
          back_material?: string | null
          base_type?: string | null
          cable_holes?: number
          carcass_material?: string | null
          created_at?: string
          d_mm: number
          door_count?: number
          door_handle?: string | null
          door_material?: string | null
          drawer_count?: number
          drawer_front_material?: string | null
          drawer_handle?: string | null
          drawer_inner_material?: string | null
          extra_labour_hours?: number
          finish?: string | null
          fixed_shelves?: number
          h_mm: number
          has_back?: boolean
          id?: number
          loose_shelves?: number
          name?: string
          notes?: string | null
          position?: number
          qty?: number
          top_material?: string | null
          updated_at?: string
          user_id: string
          w_mm: number
        }
        Update: {
          adj_shelves?: number
          back_material?: string | null
          base_type?: string | null
          cable_holes?: number
          carcass_material?: string | null
          created_at?: string
          d_mm?: number
          door_count?: number
          door_handle?: string | null
          door_material?: string | null
          drawer_count?: number
          drawer_front_material?: string | null
          drawer_handle?: string | null
          drawer_inner_material?: string | null
          extra_labour_hours?: number
          finish?: string | null
          fixed_shelves?: number
          h_mm?: number
          has_back?: boolean
          id?: number
          loose_shelves?: number
          name?: string
          notes?: string | null
          position?: number
          qty?: number
          top_material?: string | null
          updated_at?: string
          user_id?: string
          w_mm?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          id: number
          name: string
          notes: string | null
          phone: string | null
          reply_token: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: never
          name: string
          notes?: string | null
          phone?: string | null
          reply_token?: string
          user_id?: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: never
          name?: string
          notes?: string | null
          phone?: string | null
          reply_token?: string
          user_id?: string
        }
        Relationships: []
      }
      cowork_email_plan_state: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_messages: {
        Row: {
          body: string
          client_id: number
          created_at: string
          email_verified: boolean | null
          id: number
          inbound_email_id: string | null
          order_id: number | null
          outbound_email_id: string | null
          outbound_status: string | null
          quote_id: number | null
          read_at: string | null
          sender: string
          user_id: string
          via: string
        }
        Insert: {
          body: string
          client_id: number
          created_at?: string
          email_verified?: boolean | null
          id?: number
          inbound_email_id?: string | null
          order_id?: number | null
          outbound_email_id?: string | null
          outbound_status?: string | null
          quote_id?: number | null
          read_at?: string | null
          sender: string
          user_id: string
          via?: string
        }
        Update: {
          body?: string
          client_id?: number
          created_at?: string
          email_verified?: boolean | null
          id?: number
          inbound_email_id?: string | null
          order_id?: number | null
          outbound_email_id?: string | null
          outbound_status?: string | null
          quote_id?: number | null
          read_at?: string | null
          sender?: string
          user_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_messages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      cutlist_cabinets: {
        Row: {
          cabinet_id: number
          created_at: string
          cutlist_id: number
          user_id: string
        }
        Insert: {
          cabinet_id: number
          created_at?: string
          cutlist_id: number
          user_id: string
        }
        Update: {
          cabinet_id?: number
          created_at?: string
          cutlist_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutlist_cabinets_cabinet_id_fkey"
            columns: ["cabinet_id"]
            isOneToOne: false
            referencedRelation: "cabinet_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutlist_cabinets_cutlist_id_fkey"
            columns: ["cutlist_id"]
            isOneToOne: false
            referencedRelation: "cutlists"
            referencedColumns: ["id"]
          },
        ]
      }
      cutlists: {
        Row: {
          created_at: string
          id: number
          name: string
          position: number
          quote_id: number | null
          tags: Json
          ui_prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          position?: number
          quote_id?: number | null
          tags?: Json
          ui_prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          position?: number
          quote_id?: number | null
          tags?: Json
          ui_prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutlists_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_bands: {
        Row: {
          color: string | null
          created_at: string
          cutlist_id: number | null
          glue: string | null
          id: number
          length_m: number
          name: string
          position: number
          thickness_mm: number
          user_id: string
          width_mm: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          cutlist_id?: number | null
          glue?: string | null
          id?: number
          length_m?: number
          name?: string
          position?: number
          thickness_mm?: number
          user_id: string
          width_mm?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          cutlist_id?: number | null
          glue?: string | null
          id?: number
          length_m?: number
          name?: string
          position?: number
          thickness_mm?: number
          user_id?: string
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "edge_bands_cutlist_id_fkey"
            columns: ["cutlist_id"]
            isOneToOne: false
            referencedRelation: "cutlists"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_suggestion_votes: {
        Row: {
          created_at: string
          suggestion_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          suggestion_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          suggestion_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_suggestion_votes_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "feature_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_suggestions: {
        Row: {
          created_at: string
          description: string | null
          id: number
          status: string
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          status?: string
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          status?: string
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: []
      }
      founders_welcome_sends: {
        Row: {
          email: string
          resend_id: string | null
          sent_at: string
        }
        Insert: {
          email: string
          resend_id?: string | null
          sent_at?: string
        }
        Update: {
          email?: string
          resend_id?: string | null
          sent_at?: string
        }
        Relationships: []
      }
      gcal_connections: {
        Row: {
          access_token_enc: string | null
          calendar_id: string
          connected_at: string
          expires_at: string | null
          google_email: string | null
          id: number
          last_synced_at: string | null
          refresh_token_enc: string | null
          selected_calendars: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          calendar_id?: string
          connected_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: number
          last_synced_at?: string | null
          refresh_token_enc?: string | null
          selected_calendars?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          calendar_id?: string
          connected_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: number
          last_synced_at?: string | null
          refresh_token_enc?: string | null
          selected_calendars?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbound_emails: {
        Row: {
          client_id: number | null
          created_at: string
          customer_message_id: number | null
          from_addr: string | null
          message_id: string
          raw_html: string | null
          resend_email_id: string | null
          role: string | null
          status: string
          user_id: string | null
          verified: boolean | null
        }
        Insert: {
          client_id?: number | null
          created_at?: string
          customer_message_id?: number | null
          from_addr?: string | null
          message_id: string
          raw_html?: string | null
          resend_email_id?: string | null
          role?: string | null
          status?: string
          user_id?: string | null
          verified?: boolean | null
        }
        Update: {
          client_id?: number | null
          created_at?: string
          customer_message_id?: number | null
          from_addr?: string | null
          message_id?: string
          raw_html?: string | null
          resend_email_id?: string | null
          role?: string | null
          status?: string
          user_id?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_customer_message_id_fkey"
            columns: ["customer_message_id"]
            isOneToOne: false
            referencedRelation: "customer_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      line_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: number
          owner_id: number
          owner_kind: string
          position: number
          storage_path: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: number
          owner_id: number
          owner_kind: string
          position?: number
          storage_path: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: number
          owner_id?: number
          owner_kind?: string
          position?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      order_lines: {
        Row: {
          adj_shelves: number
          base_type: string | null
          carcass_type: string | null
          construction: string | null
          created_at: string
          customer_editable: boolean
          customer_included: boolean
          customer_price: number | null
          d_mm: number | null
          discount: number
          door_count: number
          door_finish: string | null
          door_handle: string | null
          door_hardware: Json | null
          door_material: string | null
          door_pct: number | null
          door_type: string | null
          drawer_box_finish: string | null
          drawer_box_type: string | null
          drawer_count: number
          drawer_front_finish: string | null
          drawer_front_hardware: Json | null
          drawer_front_material: string | null
          drawer_front_type: string | null
          drawer_hardware: Json | null
          drawer_inner_material: string | null
          drawer_pct: number | null
          editable_specs: Json
          end_panels: number
          extras: Json
          finish: string | null
          fixed_shelves: number
          h_mm: number | null
          hardware: Json
          id: number
          labour_hours: number | null
          labour_override: boolean
          line_kind: string
          loose_shelves: number
          material: string | null
          material_cost_override: number | null
          name: string
          notes: string | null
          optional: boolean
          order_id: number
          partitions: number
          position: number
          qty: number
          room: string | null
          schedule_hours: number | null
          shelf_hardware: Json | null
          type: string | null
          unit_price: number | null
          updated_at: string
          user_id: string
          w_mm: number | null
        }
        Insert: {
          adj_shelves?: number
          base_type?: string | null
          carcass_type?: string | null
          construction?: string | null
          created_at?: string
          customer_editable?: boolean
          customer_included?: boolean
          customer_price?: number | null
          d_mm?: number | null
          discount?: number
          door_count?: number
          door_finish?: string | null
          door_handle?: string | null
          door_hardware?: Json | null
          door_material?: string | null
          door_pct?: number | null
          door_type?: string | null
          drawer_box_finish?: string | null
          drawer_box_type?: string | null
          drawer_count?: number
          drawer_front_finish?: string | null
          drawer_front_hardware?: Json | null
          drawer_front_material?: string | null
          drawer_front_type?: string | null
          drawer_hardware?: Json | null
          drawer_inner_material?: string | null
          drawer_pct?: number | null
          editable_specs?: Json
          end_panels?: number
          extras?: Json
          finish?: string | null
          fixed_shelves?: number
          h_mm?: number | null
          hardware?: Json
          id?: number
          labour_hours?: number | null
          labour_override?: boolean
          line_kind?: string
          loose_shelves?: number
          material?: string | null
          material_cost_override?: number | null
          name?: string
          notes?: string | null
          optional?: boolean
          order_id: number
          partitions?: number
          position?: number
          qty?: number
          room?: string | null
          schedule_hours?: number | null
          shelf_hardware?: Json | null
          type?: string | null
          unit_price?: number | null
          updated_at?: string
          user_id: string
          w_mm?: number | null
        }
        Update: {
          adj_shelves?: number
          base_type?: string | null
          carcass_type?: string | null
          construction?: string | null
          created_at?: string
          customer_editable?: boolean
          customer_included?: boolean
          customer_price?: number | null
          d_mm?: number | null
          discount?: number
          door_count?: number
          door_finish?: string | null
          door_handle?: string | null
          door_hardware?: Json | null
          door_material?: string | null
          door_pct?: number | null
          door_type?: string | null
          drawer_box_finish?: string | null
          drawer_box_type?: string | null
          drawer_count?: number
          drawer_front_finish?: string | null
          drawer_front_hardware?: Json | null
          drawer_front_material?: string | null
          drawer_front_type?: string | null
          drawer_hardware?: Json | null
          drawer_inner_material?: string | null
          drawer_pct?: number | null
          editable_specs?: Json
          end_panels?: number
          extras?: Json
          finish?: string | null
          fixed_shelves?: number
          h_mm?: number | null
          hardware?: Json
          id?: number
          labour_hours?: number | null
          labour_override?: boolean
          line_kind?: string
          loose_shelves?: number
          material?: string | null
          material_cost_override?: number | null
          name?: string
          notes?: string | null
          optional?: boolean
          order_id?: number
          partitions?: number
          position?: number
          qty?: number
          room?: string | null
          schedule_hours?: number | null
          shelf_hardware?: Json | null
          type?: string | null
          unit_price?: number | null
          updated_at?: string
          user_id?: string
          w_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          auto_schedule: boolean
          client_id: number | null
          contingency_hours: number | null
          contingency_pct: number | null
          created_at: string | null
          discount: number
          due: string | null
          hours_allocated: number | null
          id: number
          manual_end_date: string | null
          manual_start_date: string | null
          markup: number
          name: string | null
          notes: string | null
          order_number: string | null
          packaging_hours: number | null
          priority: number
          production_start_date: string | null
          quote_id: number | null
          run_over_hours: number
          share_settings: Json
          share_token: string | null
          sidebar_order_index: number
          status: string | null
          stock_markup: number
          tax: number
          updated_at: string
          user_id: string
          value: number | null
          viewed_at: string | null
        }
        Insert: {
          auto_schedule?: boolean
          client_id?: number | null
          contingency_hours?: number | null
          contingency_pct?: number | null
          created_at?: string | null
          discount?: number
          due?: string | null
          hours_allocated?: number | null
          id?: never
          manual_end_date?: string | null
          manual_start_date?: string | null
          markup?: number
          name?: string | null
          notes?: string | null
          order_number?: string | null
          packaging_hours?: number | null
          priority?: number
          production_start_date?: string | null
          quote_id?: number | null
          run_over_hours?: number
          share_settings?: Json
          share_token?: string | null
          sidebar_order_index?: number
          status?: string | null
          stock_markup?: number
          tax?: number
          updated_at?: string
          user_id: string
          value?: number | null
          viewed_at?: string | null
        }
        Update: {
          auto_schedule?: boolean
          client_id?: number | null
          contingency_hours?: number | null
          contingency_pct?: number | null
          created_at?: string | null
          discount?: number
          due?: string | null
          hours_allocated?: number | null
          id?: never
          manual_end_date?: string | null
          manual_start_date?: string | null
          markup?: number
          name?: string | null
          notes?: string | null
          order_number?: string | null
          packaging_hours?: number | null
          priority?: number
          production_start_date?: string | null
          quote_id?: number | null
          run_over_hours?: number
          share_settings?: Json
          share_token?: string | null
          sidebar_order_index?: number
          status?: string | null
          stock_markup?: number
          tax?: number
          updated_at?: string
          user_id?: string
          value?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          application_fee: number
          created_at: string
          currency: string
          customer_email: string | null
          id: number
          kind: string
          order_id: number | null
          quote_id: number | null
          status: string
          stripe_checkout_session: string | null
          stripe_payment_intent: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          application_fee?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          id?: number
          kind: string
          order_id?: number | null
          quote_id?: number | null
          status?: string
          stripe_checkout_session?: string | null
          stripe_payment_intent?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          application_fee?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          id?: number
          kind?: string
          order_id?: number | null
          quote_id?: number | null
          status?: string
          stripe_checkout_session?: string | null
          stripe_payment_intent?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_edges: {
        Row: {
          edge_band_id: number
          piece_id: number
          side: string
        }
        Insert: {
          edge_band_id: number
          piece_id: number
          side: string
        }
        Update: {
          edge_band_id?: number
          piece_id?: number
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_edges_edge_band_id_fkey"
            columns: ["edge_band_id"]
            isOneToOne: false
            referencedRelation: "edge_bands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_edges_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      pieces: {
        Row: {
          color: string | null
          created_at: string
          cutlist_id: number | null
          enabled: boolean
          grain: string
          h_mm: number
          id: number
          label: string
          material: string | null
          notes: string | null
          position: number
          qty: number
          user_id: string
          w_mm: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          cutlist_id?: number | null
          enabled?: boolean
          grain?: string
          h_mm: number
          id?: number
          label?: string
          material?: string | null
          notes?: string | null
          position?: number
          qty?: number
          user_id: string
          w_mm: number
        }
        Update: {
          color?: string | null
          created_at?: string
          cutlist_id?: number | null
          enabled?: boolean
          grain?: string
          h_mm?: number
          id?: number
          label?: string
          material?: string | null
          notes?: string | null
          position?: number
          qty?: number
          user_id?: string
          w_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "pieces_cutlist_id_fkey"
            columns: ["cutlist_id"]
            isOneToOne: false
            referencedRelation: "cutlists"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          adj_shelves: number
          base_type: string | null
          carcass_type: string | null
          construction: string | null
          created_at: string
          customer_editable: boolean
          customer_included: boolean
          customer_price: number | null
          d_mm: number | null
          discount: number
          door_count: number
          door_finish: string | null
          door_handle: string | null
          door_hardware: Json | null
          door_material: string | null
          door_pct: number | null
          door_type: string | null
          drawer_box_finish: string | null
          drawer_box_type: string | null
          drawer_count: number
          drawer_front_finish: string | null
          drawer_front_hardware: Json | null
          drawer_front_material: string | null
          drawer_front_type: string | null
          drawer_hardware: Json | null
          drawer_inner_material: string | null
          drawer_pct: number | null
          editable_specs: Json
          end_panels: number
          extras: Json
          finish: string | null
          fixed_shelves: number
          h_mm: number | null
          hardware: Json
          id: number
          labour_hours: number | null
          labour_override: boolean
          line_kind: string
          loose_shelves: number
          material: string | null
          material_cost_override: number | null
          name: string
          notes: string | null
          optional: boolean
          partitions: number
          position: number
          qty: number
          quote_id: number
          room: string | null
          schedule_hours: number
          shelf_hardware: Json | null
          type: string | null
          unit_price: number | null
          updated_at: string
          user_id: string
          w_mm: number | null
        }
        Insert: {
          adj_shelves?: number
          base_type?: string | null
          carcass_type?: string | null
          construction?: string | null
          created_at?: string
          customer_editable?: boolean
          customer_included?: boolean
          customer_price?: number | null
          d_mm?: number | null
          discount?: number
          door_count?: number
          door_finish?: string | null
          door_handle?: string | null
          door_hardware?: Json | null
          door_material?: string | null
          door_pct?: number | null
          door_type?: string | null
          drawer_box_finish?: string | null
          drawer_box_type?: string | null
          drawer_count?: number
          drawer_front_finish?: string | null
          drawer_front_hardware?: Json | null
          drawer_front_material?: string | null
          drawer_front_type?: string | null
          drawer_hardware?: Json | null
          drawer_inner_material?: string | null
          drawer_pct?: number | null
          editable_specs?: Json
          end_panels?: number
          extras?: Json
          finish?: string | null
          fixed_shelves?: number
          h_mm?: number | null
          hardware?: Json
          id?: number
          labour_hours?: number | null
          labour_override?: boolean
          line_kind?: string
          loose_shelves?: number
          material?: string | null
          material_cost_override?: number | null
          name?: string
          notes?: string | null
          optional?: boolean
          partitions?: number
          position?: number
          qty?: number
          quote_id: number
          room?: string | null
          schedule_hours?: number
          shelf_hardware?: Json | null
          type?: string | null
          unit_price?: number | null
          updated_at?: string
          user_id: string
          w_mm?: number | null
        }
        Update: {
          adj_shelves?: number
          base_type?: string | null
          carcass_type?: string | null
          construction?: string | null
          created_at?: string
          customer_editable?: boolean
          customer_included?: boolean
          customer_price?: number | null
          d_mm?: number | null
          discount?: number
          door_count?: number
          door_finish?: string | null
          door_handle?: string | null
          door_hardware?: Json | null
          door_material?: string | null
          door_pct?: number | null
          door_type?: string | null
          drawer_box_finish?: string | null
          drawer_box_type?: string | null
          drawer_count?: number
          drawer_front_finish?: string | null
          drawer_front_hardware?: Json | null
          drawer_front_material?: string | null
          drawer_front_type?: string | null
          drawer_hardware?: Json | null
          drawer_inner_material?: string | null
          drawer_pct?: number | null
          editable_specs?: Json
          end_panels?: number
          extras?: Json
          finish?: string | null
          fixed_shelves?: number
          h_mm?: number | null
          hardware?: Json
          id?: number
          labour_hours?: number | null
          labour_override?: boolean
          line_kind?: string
          loose_shelves?: number
          material?: string | null
          material_cost_override?: number | null
          name?: string
          notes?: string | null
          optional?: boolean
          partitions?: number
          position?: number
          qty?: number
          quote_id?: number
          room?: string | null
          schedule_hours?: number
          shelf_hardware?: Json | null
          type?: string | null
          unit_price?: number | null
          updated_at?: string
          user_id?: string
          w_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          accepted_snapshot: Json | null
          client_id: number | null
          created_at: string | null
          date: string | null
          discount: number
          id: number
          markup: number | null
          name: string | null
          notes: string | null
          quote_number: string | null
          rate_card: Json | null
          share_settings: Json
          share_token: string | null
          status: string | null
          stock_markup: number
          tax: number | null
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_snapshot?: Json | null
          client_id?: number | null
          created_at?: string | null
          date?: string | null
          discount?: number
          id?: never
          markup?: number | null
          name?: string | null
          notes?: string | null
          quote_number?: string | null
          rate_card?: Json | null
          share_settings?: Json
          share_token?: string | null
          status?: string | null
          stock_markup?: number
          tax?: number | null
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_snapshot?: Json | null
          client_id?: number | null
          created_at?: string | null
          date?: string | null
          discount?: number
          id?: never
          markup?: number | null
          name?: string | null
          notes?: string | null
          quote_number?: string | null
          rate_card?: Json | null
          share_settings?: Json
          share_token?: string | null
          status?: string | null
          stock_markup?: number
          tax?: number | null
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_day_overrides: {
        Row: {
          created_at: string
          date: string
          hours: number
          id: number
          label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          hours: number
          id?: number
          label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          hours?: number
          id?: number
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      schedule_tasks: {
        Row: {
          all_day: boolean
          created_at: string
          done: boolean
          end_at: string
          gcal_event_id: string | null
          gcal_synced_at: string | null
          id: number
          notes: string | null
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          done?: boolean
          end_at: string
          gcal_event_id?: string | null
          gcal_synced_at?: string | null
          id?: number
          notes?: string | null
          start_at: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          done?: boolean
          end_at?: string
          gcal_event_id?: string | null
          gcal_synced_at?: string | null
          id?: number
          notes?: string | null
          start_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sheets: {
        Row: {
          color: string | null
          created_at: string
          cutlist_id: number | null
          enabled: boolean
          grain: string
          h_mm: number
          id: number
          kerf_mm: number
          name: string
          position: number
          qty: number
          user_id: string
          w_mm: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          cutlist_id?: number | null
          enabled?: boolean
          grain?: string
          h_mm: number
          id?: number
          kerf_mm?: number
          name?: string
          position?: number
          qty?: number
          user_id: string
          w_mm: number
        }
        Update: {
          color?: string | null
          created_at?: string
          cutlist_id?: number | null
          enabled?: boolean
          grain?: string
          h_mm?: number
          id?: number
          kerf_mm?: number
          name?: string
          position?: number
          qty?: number
          user_id?: string
          w_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "sheets_cutlist_id_fkey"
            columns: ["cutlist_id"]
            isOneToOne: false
            referencedRelation: "cutlists"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          category: string | null
          cost: number | null
          coverage_sqm: number | null
          created_at: string | null
          customer_visible: boolean
          glue: string | null
          h: number | null
          id: number
          length_m: number | null
          low: number | null
          name: string
          qty: number | null
          sku: string | null
          sort_order: number | null
          supplier: string | null
          supplier_url: string | null
          tags: Json
          thickness_mm: number | null
          updated_at: string
          user_id: string
          variant: string | null
          w: number | null
          width_mm: number | null
        }
        Insert: {
          category?: string | null
          cost?: number | null
          coverage_sqm?: number | null
          created_at?: string | null
          customer_visible?: boolean
          glue?: string | null
          h?: number | null
          id?: never
          length_m?: number | null
          low?: number | null
          name?: string
          qty?: number | null
          sku?: string | null
          sort_order?: number | null
          supplier?: string | null
          supplier_url?: string | null
          tags?: Json
          thickness_mm?: number | null
          updated_at?: string
          user_id: string
          variant?: string | null
          w?: number | null
          width_mm?: number | null
        }
        Update: {
          category?: string | null
          cost?: number | null
          coverage_sqm?: number | null
          created_at?: string | null
          customer_visible?: boolean
          glue?: string | null
          h?: number | null
          id?: never
          length_m?: number | null
          low?: number | null
          name?: string
          qty?: number | null
          sku?: string | null
          sort_order?: number | null
          supplier?: string | null
          supplier_url?: string | null
          tags?: Json
          thickness_mm?: number | null
          updated_at?: string
          user_id?: string
          variant?: string | null
          w?: number | null
          width_mm?: number | null
        }
        Relationships: []
      }
      stripe_accounts: {
        Row: {
          charges_enabled: boolean
          country: string | null
          created_at: string
          default_currency: string | null
          details_submitted: boolean
          payouts_enabled: boolean
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          default_currency?: string | null
          details_submitted?: boolean
          payouts_enabled?: boolean
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          default_currency?: string | null
          details_submitted?: boolean
          payouts_enabled?: boolean
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: number
          plan: string | null
          status: string | null
          stripe_customer_id: string
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: number
          plan?: string | null
          status?: string | null
          stripe_customer_id: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: number
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      founder_seats_taken: { Args: never; Returns: number }
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
