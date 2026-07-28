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
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          module: string | null
          target_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module?: string | null
          target_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module?: string | null
          target_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          parts: Json
          role: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          parts?: Json
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      gain_history: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          field: string | null
          gain_id: string
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          field?: string | null
          gain_id: string
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          field?: string | null
          gain_id?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "gain_history_gain_id_fkey"
            columns: ["gain_id"]
            isOneToOne: false
            referencedRelation: "gains"
            referencedColumns: ["id"]
          },
        ]
      }
      gains: {
        Row: {
          area: string | null
          calc_memory: string | null
          code: string | null
          confidence: string | null
          created_at: string
          created_by: string
          description: string | null
          equipment: string | null
          evidences: Json
          formula: string | null
          gain_type: Database["public"]["Enums"]["gain_type"]
          hours_saved: number | null
          id: string
          implementation_cost: number | null
          inputs: Json
          iris_analysis: Json | null
          manhours_saved: number | null
          payback_months: number | null
          period_end: string | null
          period_kind: string
          period_start: string | null
          record_id: string
          rejection_reason: string | null
          responsible: string | null
          roi: number | null
          safety_metrics: Json
          source_module: Database["public"]["Enums"]["record_module"]
          status: Database["public"]["Enums"]["gain_status"]
          title: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validation_note: string | null
          value_estimated: number | null
          value_realized: number | null
          value_validated: number | null
        }
        Insert: {
          area?: string | null
          calc_memory?: string | null
          code?: string | null
          confidence?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          equipment?: string | null
          evidences?: Json
          formula?: string | null
          gain_type: Database["public"]["Enums"]["gain_type"]
          hours_saved?: number | null
          id?: string
          implementation_cost?: number | null
          inputs?: Json
          iris_analysis?: Json | null
          manhours_saved?: number | null
          payback_months?: number | null
          period_end?: string | null
          period_kind?: string
          period_start?: string | null
          record_id: string
          rejection_reason?: string | null
          responsible?: string | null
          roi?: number | null
          safety_metrics?: Json
          source_module: Database["public"]["Enums"]["record_module"]
          status?: Database["public"]["Enums"]["gain_status"]
          title: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_note?: string | null
          value_estimated?: number | null
          value_realized?: number | null
          value_validated?: number | null
        }
        Update: {
          area?: string | null
          calc_memory?: string | null
          code?: string | null
          confidence?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          equipment?: string | null
          evidences?: Json
          formula?: string | null
          gain_type?: Database["public"]["Enums"]["gain_type"]
          hours_saved?: number | null
          id?: string
          implementation_cost?: number | null
          inputs?: Json
          iris_analysis?: Json | null
          manhours_saved?: number | null
          payback_months?: number | null
          period_end?: string | null
          period_kind?: string
          period_start?: string | null
          record_id?: string
          rejection_reason?: string | null
          responsible?: string | null
          roi?: number | null
          safety_metrics?: Json
          source_module?: Database["public"]["Enums"]["record_module"]
          status?: Database["public"]["Enums"]["gain_status"]
          title?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_note?: string | null
          value_estimated?: number | null
          value_realized?: number | null
          value_validated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gains_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      image_generation_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          duration_ms: number
          error_type: string | null
          estimated_cost_cents: number
          http_status: number | null
          id: string
          job_id: string
          model: string | null
          provider_name: string
          sanitized_error_message: string | null
          started_at: string
          status: string
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          duration_ms?: number
          error_type?: string | null
          estimated_cost_cents?: number
          http_status?: number | null
          id?: string
          job_id: string
          model?: string | null
          provider_name: string
          sanitized_error_message?: string | null
          started_at?: string
          status: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          duration_ms?: number
          error_type?: string | null
          estimated_cost_cents?: number
          http_status?: number | null
          id?: string
          job_id?: string
          model?: string | null
          provider_name?: string
          sanitized_error_message?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_generation_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "image_generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      image_generation_jobs: {
        Row: {
          completed_at: string | null
          corrected_image_url: string | null
          corrections_hash: string
          created_at: string
          detected_risks: Json
          error_message: string | null
          estimated_total_cost_cents: number
          final_status: string
          generation_mode: string
          id: string
          internal_credits_used: number
          original_image_hash: string
          original_image_url: string | null
          scene_description: string | null
          selected_corrections: Json
          successful_model: string | null
          successful_provider: string | null
          total_attempts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          corrected_image_url?: string | null
          corrections_hash: string
          created_at?: string
          detected_risks?: Json
          error_message?: string | null
          estimated_total_cost_cents?: number
          final_status?: string
          generation_mode?: string
          id?: string
          internal_credits_used?: number
          original_image_hash: string
          original_image_url?: string | null
          scene_description?: string | null
          selected_corrections?: Json
          successful_model?: string | null
          successful_provider?: string | null
          total_attempts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          corrected_image_url?: string | null
          corrections_hash?: string
          created_at?: string
          detected_risks?: Json
          error_message?: string | null
          estimated_total_cost_cents?: number
          final_status?: string
          generation_mode?: string
          id?: string
          internal_credits_used?: number
          original_image_hash?: string
          original_image_url?: string | null
          scene_description?: string | null
          selected_corrections?: Json
          successful_model?: string | null
          successful_provider?: string | null
          total_attempts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      image_providers: {
        Row: {
          blocked_until: string | null
          consecutive_failures: number
          created_at: string
          current_status: string
          daily_budget_cents: number | null
          default_model: string | null
          enabled: boolean
          final_model: string | null
          id: string
          last_error_type: string | null
          last_failure_at: string | null
          last_success_at: string | null
          monthly_budget_cents: number | null
          notes: string | null
          preview_model: string | null
          priority: number
          provider_name: string
          total_cost_cents: number
          total_failure: number
          total_success: number
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          consecutive_failures?: number
          created_at?: string
          current_status?: string
          daily_budget_cents?: number | null
          default_model?: string | null
          enabled?: boolean
          final_model?: string | null
          id?: string
          last_error_type?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          monthly_budget_cents?: number | null
          notes?: string | null
          preview_model?: string | null
          priority?: number
          provider_name: string
          total_cost_cents?: number
          total_failure?: number
          total_success?: number
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          consecutive_failures?: number
          created_at?: string
          current_status?: string
          daily_budget_cents?: number | null
          default_model?: string | null
          enabled?: boolean
          final_model?: string | null
          id?: string
          last_error_type?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          monthly_budget_cents?: number | null
          notes?: string | null
          preview_model?: string | null
          priority?: number
          provider_name?: string
          total_cost_cents?: number
          total_failure?: number
          total_success?: number
          updated_at?: string
        }
        Relationships: []
      }
      inspections: {
        Row: {
          action_plan: Json | null
          ai_analysis: Json | null
          area: string
          created_at: string
          id: string
          location: string | null
          photo_after_url: string | null
          photo_before_url: string | null
          risk_level: Database["public"]["Enums"]["risk_level"] | null
          status: Database["public"]["Enums"]["inspection_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          action_plan?: Json | null
          ai_analysis?: Json | null
          area: string
          created_at?: string
          id?: string
          location?: string | null
          photo_after_url?: string | null
          photo_before_url?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          status?: Database["public"]["Enums"]["inspection_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          action_plan?: Json | null
          ai_analysis?: Json | null
          area?: string
          created_at?: string
          id?: string
          location?: string | null
          photo_after_url?: string | null
          photo_before_url?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          status?: Database["public"]["Enums"]["inspection_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      iris_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      iris_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iris_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "iris_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      lightning_strikes: {
        Row: {
          bearing_degrees: number | null
          created_at: string
          created_by: string | null
          distance_km: number
          id: string
          intensity_ka: number | null
          latitude: number
          location_id: string | null
          longitude: number
          occurred_at: string
          polarity: string | null
          provider: string
          quality: number | null
          raw: Json
          received_at: string
          strike_type: string | null
        }
        Insert: {
          bearing_degrees?: number | null
          created_at?: string
          created_by?: string | null
          distance_km: number
          id?: string
          intensity_ka?: number | null
          latitude: number
          location_id?: string | null
          longitude: number
          occurred_at: string
          polarity?: string | null
          provider: string
          quality?: number | null
          raw?: Json
          received_at?: string
          strike_type?: string | null
        }
        Update: {
          bearing_degrees?: number | null
          created_at?: string
          created_by?: string | null
          distance_km?: number
          id?: string
          intensity_ka?: number | null
          latitude?: number
          location_id?: string | null
          longitude?: number
          occurred_at?: string
          polarity?: string | null
          provider?: string
          quality?: number | null
          raw?: Json
          received_at?: string
          strike_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lightning_strikes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "weather_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
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
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          role_title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          role_title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          body: string | null
          created_at: string
          error: string | null
          http_status: number | null
          id: string
          is_test: boolean
          severity: string | null
          status: string
          subscription_id: string
          tag: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          is_test?: boolean
          severity?: string | null
          status: string
          subscription_id: string
          tag?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          is_test?: boolean
          severity?: string | null
          status?: string
          subscription_id?: string
          tag?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          failure_count: number
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          p256dh: string
          platform: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh: string
          platform?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh?: string
          platform?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      record_counters: {
        Row: {
          key: string
          seq: number
          updated_at: string
        }
        Insert: {
          key: string
          seq?: number
          updated_at?: string
        }
        Update: {
          key?: string
          seq?: number
          updated_at?: string
        }
        Relationships: []
      }
      record_history: {
        Row: {
          action: string
          created_at: string
          from_status: string | null
          id: string
          justification: string | null
          meta: Json | null
          proof_url: string | null
          record_id: string
          to_status: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          from_status?: string | null
          id?: string
          justification?: string | null
          meta?: Json | null
          proof_url?: string | null
          record_id: string
          to_status?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          from_status?: string | null
          id?: string
          justification?: string | null
          meta?: Json | null
          proof_url?: string | null
          record_id?: string
          to_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_history_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      record_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          origin_id: string
          related_id: string
          similarity: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          origin_id: string
          related_id: string
          similarity?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          origin_id?: string
          related_id?: string
          similarity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "record_links_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_links_related_id_fkey"
            columns: ["related_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      record_versions: {
        Row: {
          changes_note: string | null
          channel: string | null
          created_at: string
          id: string
          protocol: string | null
          record_id: string
          reject_category: string | null
          reject_reason: string | null
          report_url: string | null
          result: string | null
          result_at: string | null
          result_note: string | null
          root_id: string
          sent_at: string | null
          sent_by: string | null
          snapshot: Json
          vale_code: string | null
          version: number
        }
        Insert: {
          changes_note?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          protocol?: string | null
          record_id: string
          reject_category?: string | null
          reject_reason?: string | null
          report_url?: string | null
          result?: string | null
          result_at?: string | null
          result_note?: string | null
          root_id: string
          sent_at?: string | null
          sent_by?: string | null
          snapshot?: Json
          vale_code?: string | null
          version?: number
        }
        Update: {
          changes_note?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          protocol?: string | null
          record_id?: string
          reject_category?: string | null
          reject_reason?: string | null
          report_url?: string | null
          result?: string | null
          result_at?: string | null
          result_note?: string | null
          root_id?: string
          sent_at?: string | null
          sent_by?: string | null
          snapshot?: Json
          vale_code?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "record_versions_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_versions_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      records: {
        Row: {
          ai_feedback: Json
          analysis_v2: Json | null
          area: string | null
          created_at: string
          description: string | null
          duplicate_of: string | null
          env_actions: Json | null
          env_after_description: string | null
          env_after_executed_at: string | null
          env_after_executed_by: string | null
          env_after_photo_url: string | null
          env_ai_after: Json | null
          env_ai_before: Json | null
          env_aspect: string | null
          env_aspects_secondary: string[] | null
          env_audit_note: string | null
          env_audit_verdict: string | null
          env_categories: string[] | null
          env_checklist: Json | null
          env_control: number | null
          env_effectiveness: string | null
          env_impact_direct: string | null
          env_impact_indirect: string | null
          env_level_after: string | null
          env_level_before: string | null
          env_material: string | null
          env_medium: string | null
          env_persistence: number | null
          env_probability: number | null
          env_reincidence_of: string | null
          env_scope: number | null
          env_score_after: number | null
          env_score_before: number | null
          env_sensitivity: number | null
          env_severity: number | null
          env_simulation_url: string | null
          env_source: string | null
          env_validated_at: string | null
          env_validated_by: string | null
          equipment: string | null
          equipment_number: string | null
          financial_value: number | null
          human_review: Json | null
          id: string
          image_hash: string | null
          image_phash: string | null
          internal_code: string | null
          location: string | null
          meta: Json | null
          module: Database["public"]["Enums"]["record_module"]
          parent_record_id: string | null
          photo_url: string | null
          prazo: string | null
          priority: Database["public"]["Enums"]["record_priority"]
          recurrence_index: number
          responsavel: string | null
          send_note: string | null
          send_proof_url: string | null
          sent_at: string | null
          sent_by: string | null
          sent_channel: string | null
          similarity_meta: Json | null
          status: Database["public"]["Enums"]["record_status"]
          status_history: Json
          title: string
          turno: string | null
          updated_at: string
          user_id: string
          vale_channel: string | null
          vale_code: string | null
          vale_deadline: string | null
          vale_protocol: string | null
          vale_reject_category: string | null
          vale_reject_reason: string | null
          vale_result: string | null
          vale_result_at: string | null
          vale_result_by: string | null
          vale_result_document_url: string | null
          vale_result_note: string | null
          vale_result_proof_url: string | null
          vale_root_id: string | null
          vale_status: string
          vale_version: number
        }
        Insert: {
          ai_feedback?: Json
          analysis_v2?: Json | null
          area?: string | null
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          env_actions?: Json | null
          env_after_description?: string | null
          env_after_executed_at?: string | null
          env_after_executed_by?: string | null
          env_after_photo_url?: string | null
          env_ai_after?: Json | null
          env_ai_before?: Json | null
          env_aspect?: string | null
          env_aspects_secondary?: string[] | null
          env_audit_note?: string | null
          env_audit_verdict?: string | null
          env_categories?: string[] | null
          env_checklist?: Json | null
          env_control?: number | null
          env_effectiveness?: string | null
          env_impact_direct?: string | null
          env_impact_indirect?: string | null
          env_level_after?: string | null
          env_level_before?: string | null
          env_material?: string | null
          env_medium?: string | null
          env_persistence?: number | null
          env_probability?: number | null
          env_reincidence_of?: string | null
          env_scope?: number | null
          env_score_after?: number | null
          env_score_before?: number | null
          env_sensitivity?: number | null
          env_severity?: number | null
          env_simulation_url?: string | null
          env_source?: string | null
          env_validated_at?: string | null
          env_validated_by?: string | null
          equipment?: string | null
          equipment_number?: string | null
          financial_value?: number | null
          human_review?: Json | null
          id?: string
          image_hash?: string | null
          image_phash?: string | null
          internal_code?: string | null
          location?: string | null
          meta?: Json | null
          module: Database["public"]["Enums"]["record_module"]
          parent_record_id?: string | null
          photo_url?: string | null
          prazo?: string | null
          priority?: Database["public"]["Enums"]["record_priority"]
          recurrence_index?: number
          responsavel?: string | null
          send_note?: string | null
          send_proof_url?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_channel?: string | null
          similarity_meta?: Json | null
          status?: Database["public"]["Enums"]["record_status"]
          status_history?: Json
          title: string
          turno?: string | null
          updated_at?: string
          user_id: string
          vale_channel?: string | null
          vale_code?: string | null
          vale_deadline?: string | null
          vale_protocol?: string | null
          vale_reject_category?: string | null
          vale_reject_reason?: string | null
          vale_result?: string | null
          vale_result_at?: string | null
          vale_result_by?: string | null
          vale_result_document_url?: string | null
          vale_result_note?: string | null
          vale_result_proof_url?: string | null
          vale_root_id?: string | null
          vale_status?: string
          vale_version?: number
        }
        Update: {
          ai_feedback?: Json
          analysis_v2?: Json | null
          area?: string | null
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          env_actions?: Json | null
          env_after_description?: string | null
          env_after_executed_at?: string | null
          env_after_executed_by?: string | null
          env_after_photo_url?: string | null
          env_ai_after?: Json | null
          env_ai_before?: Json | null
          env_aspect?: string | null
          env_aspects_secondary?: string[] | null
          env_audit_note?: string | null
          env_audit_verdict?: string | null
          env_categories?: string[] | null
          env_checklist?: Json | null
          env_control?: number | null
          env_effectiveness?: string | null
          env_impact_direct?: string | null
          env_impact_indirect?: string | null
          env_level_after?: string | null
          env_level_before?: string | null
          env_material?: string | null
          env_medium?: string | null
          env_persistence?: number | null
          env_probability?: number | null
          env_reincidence_of?: string | null
          env_scope?: number | null
          env_score_after?: number | null
          env_score_before?: number | null
          env_sensitivity?: number | null
          env_severity?: number | null
          env_simulation_url?: string | null
          env_source?: string | null
          env_validated_at?: string | null
          env_validated_by?: string | null
          equipment?: string | null
          equipment_number?: string | null
          financial_value?: number | null
          human_review?: Json | null
          id?: string
          image_hash?: string | null
          image_phash?: string | null
          internal_code?: string | null
          location?: string | null
          meta?: Json | null
          module?: Database["public"]["Enums"]["record_module"]
          parent_record_id?: string | null
          photo_url?: string | null
          prazo?: string | null
          priority?: Database["public"]["Enums"]["record_priority"]
          recurrence_index?: number
          responsavel?: string | null
          send_note?: string | null
          send_proof_url?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_channel?: string | null
          similarity_meta?: Json | null
          status?: Database["public"]["Enums"]["record_status"]
          status_history?: Json
          title?: string
          turno?: string | null
          updated_at?: string
          user_id?: string
          vale_channel?: string | null
          vale_code?: string | null
          vale_deadline?: string | null
          vale_protocol?: string | null
          vale_reject_category?: string | null
          vale_reject_reason?: string | null
          vale_result?: string | null
          vale_result_at?: string | null
          vale_result_by?: string | null
          vale_result_document_url?: string | null
          vale_result_note?: string | null
          vale_result_proof_url?: string | null
          vale_root_id?: string | null
          vale_status?: string
          vale_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "records_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "records_env_reincidence_of_fkey"
            columns: ["env_reincidence_of"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "records_parent_record_id_fkey"
            columns: ["parent_record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "records_vale_root_id_fkey"
            columns: ["vale_root_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_plans: {
        Row: {
          created_at: string
          created_by: string
          id: string
          interventions: Json
          module_key: string | null
          photo_url: string
          record_id: string | null
          revision: number
          status: string
          svg_state: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          interventions?: Json
          module_key?: string | null
          photo_url: string
          record_id?: string | null
          revision?: number
          status?: string
          svg_state?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          interventions?: Json
          module_key?: string | null
          photo_url?: string
          record_id?: string | null
          revision?: number
          status?: string
          svg_state?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_plans_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weather_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          created_by: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          expires_at: string | null
          id: string
          location_id: string | null
          message: string | null
          metadata: Json
          resolved_at: string | null
          severity: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          expires_at?: string | null
          id?: string
          location_id?: string | null
          message?: string | null
          metadata?: Json
          resolved_at?: string | null
          severity: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          expires_at?: string | null
          id?: string
          location_id?: string | null
          message?: string | null
          metadata?: Json
          resolved_at?: string | null
          severity?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "weather_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_locations: {
        Row: {
          contract: string | null
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          is_primary: boolean
          latitude: number
          lightning_radius_km: number
          longitude: number
          name: string
          responsible_email: string | null
          responsible_name: string | null
          responsible_phone: string | null
          timezone: string
          unit: string | null
          updated_at: string
          warning_radius_km: number
        }
        Insert: {
          contract?: string | null
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          is_primary?: boolean
          latitude: number
          lightning_radius_km?: number
          longitude: number
          name: string
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          timezone?: string
          unit?: string | null
          updated_at?: string
          warning_radius_km?: number
        }
        Update: {
          contract?: string | null
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          is_primary?: boolean
          latitude?: number
          lightning_radius_km?: number
          longitude?: number
          name?: string
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          timezone?: string
          unit?: string | null
          updated_at?: string
          warning_radius_km?: number
        }
        Relationships: []
      }
      weather_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          fetched_at: string
          id: string
          latitude: number
          location_id: string | null
          longitude: number
          normalized: Json
          provider: string
          raw: Json
          response_ms: number | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          fetched_at?: string
          id?: string
          latitude: number
          location_id?: string | null
          longitude: number
          normalized?: Json
          provider?: string
          raw?: Json
          response_ms?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          fetched_at?: string
          id?: string
          latitude?: number
          location_id?: string | null
          longitude?: number
          normalized?: Json
          provider?: string
          raw?: Json
          response_ms?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_snapshots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "weather_locations"
            referencedColumns: ["id"]
          },
        ]
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
      next_internal_code: {
        Args: { _area: string; _type: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "operador"
      gain_status:
        | "estimado"
        | "em_medicao"
        | "realizado"
        | "validado"
        | "rejeitado"
        | "suspenso"
      gain_type:
        | "tempo"
        | "financeiro"
        | "produtividade"
        | "reducao_custo"
        | "reducao_retrabalho"
        | "prevencao_perda"
        | "reducao_parada"
        | "reducao_consumo"
        | "ambiental"
        | "seguranca"
        | "disponibilidade"
        | "qualidade"
        | "operacional"
      inspection_status: "aberta" | "em_acao" | "concluida"
      record_module:
        | "n3"
        | "kaizen"
        | "environment"
        | "emergency"
        | "supervision"
        | "crm"
        | "gain"
        | "inspection"
      record_priority: "baixa" | "media" | "alta" | "critica"
      record_status: "aberto" | "em_andamento" | "concluido" | "cancelado"
      risk_level: "verde" | "amarelo" | "vermelho"
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
      app_role: ["admin", "supervisor", "operador"],
      gain_status: [
        "estimado",
        "em_medicao",
        "realizado",
        "validado",
        "rejeitado",
        "suspenso",
      ],
      gain_type: [
        "tempo",
        "financeiro",
        "produtividade",
        "reducao_custo",
        "reducao_retrabalho",
        "prevencao_perda",
        "reducao_parada",
        "reducao_consumo",
        "ambiental",
        "seguranca",
        "disponibilidade",
        "qualidade",
        "operacional",
      ],
      inspection_status: ["aberta", "em_acao", "concluida"],
      record_module: [
        "n3",
        "kaizen",
        "environment",
        "emergency",
        "supervision",
        "crm",
        "gain",
        "inspection",
      ],
      record_priority: ["baixa", "media", "alta", "critica"],
      record_status: ["aberto", "em_andamento", "concluido", "cancelado"],
      risk_level: ["verde", "amarelo", "vermelho"],
    },
  },
} as const
