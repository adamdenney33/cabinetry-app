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
  public: {
    Tables: {
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
          default_labour_rate: number
          default_labour_times: Json
          default_markup_pct: number
          default_packaging_hours: number
          default_tax_pct: number
          default_units: string
          default_weekday_hours: Json
          default_workday_hours: number
          email: string | null
          id: number
          logo_url: string | null
          name: string
          phone: string | null
          production_queue_start_date: string | null
          unit_format: Json | null
          updated_at: string
          user_id: string
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
          default_labour_rate?: number
          default_labour_times?: Json
          default_markup_pct?: number
          default_packaging_hours?: number
          default_tax_pct?: number
          default_units?: string
          default_weekday_hours?: Json
          default_workday_hours?: number
          email?: string | null
          id?: number
          logo_url?: string | null
          name?: string
          phone?: string | null
          production_queue_start_date?: string | null
          unit_format?: Json | null
          updated_at?: string
          user_id: string
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
          default_labour_rate?: number
          default_labour_times?: Json
          default_markup_pct?: number
          default_packaging_hours?: number
          default_tax_pct?: number
          default_units?: string
          default_weekday_hours?: Json
          default_workday_hours?: number
          email?: string | null
          id?: number
          logo_url?: string | null
          name?: string
          phone?: string | null
          production_queue_start_date?: string | null
          unit_format?: Json | null
          updated_at?: string
          user_id?: string
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
      catalog_items: {
        Row: {
          created_at: string
          id: number
          name: string
          notes: string | null
          price: number
          specs: Json
          type: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          notes?: string | null
          price?: number
          specs?: Json
          type: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          notes?: string | null
          price?: number
          specs?: Json
          type?: string
          unit?: string
          updated_at?: string
          user_id?: string
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
          user_id?: string
        }
        Relationships: []
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
      order_lines: {
        Row: {
          adj_shelves: number
          base_type: string | null
          construction: string | null
          created_at: string
          d_mm: number | null
          discount: number
          door_count: number
          door_handle: string | null
          door_pct: number | null
          drawer_count: number
          drawer_front_material: string | null
          drawer_inner_material: string | null
          drawer_pct: number | null
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
          order_id: number
          partitions: number
          position: number
          qty: number
          room: string | null
          schedule_hours: number | null
          type: string | null
          unit_price: number | null
          updated_at: string
          user_id: string
          w_mm: number | null
        }
        Insert: {
          adj_shelves?: number
          base_type?: string | null
          construction?: string | null
          created_at?: string
          d_mm?: number | null
          discount?: number
          door_count?: number
          door_handle?: string | null
          door_pct?: number | null
          drawer_count?: number
          drawer_front_material?: string | null
          drawer_inner_material?: string | null
          drawer_pct?: number | null
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
          order_id: number
          partitions?: number
          position?: number
          qty?: number
          room?: string | null
          schedule_hours?: number | null
          type?: string | null
          unit_price?: number | null
          updated_at?: string
          user_id: string
          w_mm?: number | null
        }
        Update: {
          adj_shelves?: number
          base_type?: string | null
          construction?: string | null
          created_at?: string
          d_mm?: number | null
          discount?: number
          door_count?: number
          door_handle?: string | null
          door_pct?: number | null
          drawer_count?: number
          drawer_front_material?: string | null
          drawer_inner_material?: string | null
          drawer_pct?: number | null
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
          order_id?: number
          partitions?: number
          position?: number
          qty?: number
          room?: string | null
          schedule_hours?: number | null
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
          sidebar_order_index: number
          status: string | null
          stock_markup: number
          tax: number
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          auto_schedule?: boolean
          client_id?: number | null
          contingency_hours?: number | null
          contingency_pct?: number | null
          created_at?: string | null
          discount?: number
          due?: string | null
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
          sidebar_order_index?: number
          status?: string | null
          stock_markup?: number
          tax?: number
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          auto_schedule?: boolean
          client_id?: number | null
          contingency_hours?: number | null
          contingency_pct?: number | null
          created_at?: string | null
          discount?: number
          due?: string | null
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
          sidebar_order_index?: number
          status?: string | null
          stock_markup?: number
          tax?: number
          updated_at?: string
          user_id?: string
          value?: number | null
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
          construction: string | null
          created_at: string
          d_mm: number | null
          discount: number
          door_count: number
          door_finish: string | null
          door_handle: string | null
          door_hardware: Json | null
          door_pct: number | null
          drawer_box_finish: string | null
          drawer_count: number
          drawer_front_finish: string | null
          drawer_front_material: string | null
          drawer_hardware: Json | null
          drawer_inner_material: string | null
          drawer_pct: number | null
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
          partitions: number
          position: number
          qty: number
          quote_id: number
          room: string | null
          schedule_hours: number
          type: string | null
          unit_price: number | null
          updated_at: string
          user_id: string
          w_mm: number | null
        }
        Insert: {
          adj_shelves?: number
          base_type?: string | null
          construction?: string | null
          created_at?: string
          d_mm?: number | null
          discount?: number
          door_count?: number
          door_finish?: string | null
          door_handle?: string | null
          door_hardware?: Json | null
          door_pct?: number | null
          drawer_box_finish?: string | null
          drawer_count?: number
          drawer_front_finish?: string | null
          drawer_front_material?: string | null
          drawer_hardware?: Json | null
          drawer_inner_material?: string | null
          drawer_pct?: number | null
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
          partitions?: number
          position?: number
          qty?: number
          quote_id: number
          room?: string | null
          schedule_hours?: number
          type?: string | null
          unit_price?: number | null
          updated_at?: string
          user_id: string
          w_mm?: number | null
        }
        Update: {
          adj_shelves?: number
          base_type?: string | null
          construction?: string | null
          created_at?: string
          d_mm?: number | null
          discount?: number
          door_count?: number
          door_finish?: string | null
          door_handle?: string | null
          door_hardware?: Json | null
          door_pct?: number | null
          drawer_box_finish?: string | null
          drawer_count?: number
          drawer_front_finish?: string | null
          drawer_front_material?: string | null
          drawer_hardware?: Json | null
          drawer_inner_material?: string | null
          drawer_pct?: number | null
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
          partitions?: number
          position?: number
          qty?: number
          quote_id?: number
          room?: string | null
          schedule_hours?: number
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
          client_id: number | null
          created_at: string | null
          date: string | null
          discount: number
          id: number
          markup: number | null
          name: string | null
          notes: string | null
          quote_number: string | null
          status: string | null
          stock_markup: number
          tax: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: number | null
          created_at?: string | null
          date?: string | null
          discount?: number
          id?: never
          markup?: number | null
          name?: string | null
          notes?: string | null
          quote_number?: string | null
          status?: string | null
          stock_markup?: number
          tax?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: number | null
          created_at?: string | null
          date?: string | null
          discount?: number
          id?: never
          markup?: number | null
          name?: string | null
          notes?: string | null
          quote_number?: string | null
          status?: string | null
          stock_markup?: number
          tax?: number | null
          updated_at?: string
          user_id?: string
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
          created_at: string | null
          glue: string | null
          h: number | null
          id: number
          length_m: number | null
          low: number | null
          name: string
          qty: number | null
          sku: string | null
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
          created_at?: string | null
          glue?: string | null
          h?: number | null
          id?: never
          length_m?: number | null
          low?: number | null
          name?: string
          qty?: number | null
          sku?: string | null
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
          created_at?: string | null
          glue?: string | null
          h?: number | null
          id?: never
          length_m?: number | null
          low?: number | null
          name?: string
          qty?: number | null
          sku?: string | null
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
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
