export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      actions: {
        Row: {
          assigned_to: string | null;
          created_at: string | null;
          description: string | null;
          due_date: string | null;
          id: string;
          meeting_id: string | null;
          organization_id: string | null;
          priority: string | null;
          status: Database["public"]["Enums"]["action_status"] | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          created_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          meeting_id?: string | null;
          organization_id?: string | null;
          priority?: string | null;
          status?: Database["public"]["Enums"]["action_status"] | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          created_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          meeting_id?: string | null;
          organization_id?: string | null;
          priority?: string | null;
          status?: Database["public"]["Enums"]["action_status"] | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "actions_meeting_id_fkey";
            columns: ["meeting_id"];
            isOneToOne: false;
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
          id: string;
          reason: string | null;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      candidates: {
        Row: {
          ai_analysis: Json | null;
          created_at: string | null;
          email: string | null;
          id: string;
          name: string;
          organization_id: string | null;
          phone: string | null;
          resume_url: string | null;
          status: Database["public"]["Enums"]["candidate_status"] | null;
          vaga_id: string | null;
        };
        Insert: {
          ai_analysis?: Json | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          organization_id?: string | null;
          phone?: string | null;
          resume_url?: string | null;
          status?: Database["public"]["Enums"]["candidate_status"] | null;
          vaga_id?: string | null;
        };
        Update: {
          ai_analysis?: Json | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          organization_id?: string | null;
          phone?: string | null;
          resume_url?: string | null;
          status?: Database["public"]["Enums"]["candidate_status"] | null;
          vaga_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidates_vaga_id_fkey";
            columns: ["vaga_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          city: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          invite_code: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          city?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          invite_code: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          invite_code?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      interviews: {
        Row: {
          candidate_id: string | null;
          created_at: string | null;
          evaluation: Json | null;
          id: string;
          job_id: string | null;
          notes: string | null;
          organization_id: string | null;
          scheduled_at: string | null;
          status: string | null;
        };
        Insert: {
          candidate_id?: string | null;
          created_at?: string | null;
          evaluation?: Json | null;
          id?: string;
          job_id?: string | null;
          notes?: string | null;
          organization_id?: string | null;
          scheduled_at?: string | null;
          status?: string | null;
        };
        Update: {
          candidate_id?: string | null;
          created_at?: string | null;
          evaluation?: Json | null;
          id?: string;
          job_id?: string | null;
          notes?: string | null;
          organization_id?: string | null;
          scheduled_at?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          created_at: string | null;
          department: string | null;
          description: string | null;
          id: string;
          organization_id: string | null;
          requirements: string[] | null;
          responsibilities: string[] | null;
          status: Database["public"]["Enums"]["job_status"] | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          department?: string | null;
          description?: string | null;
          id?: string;
          organization_id?: string | null;
          requirements?: string[] | null;
          responsibilities?: string[] | null;
          status?: Database["public"]["Enums"]["job_status"] | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          department?: string | null;
          description?: string | null;
          id?: string;
          organization_id?: string | null;
          requirements?: string[] | null;
          responsibilities?: string[] | null;
          status?: Database["public"]["Enums"]["job_status"] | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          boosted_until: string | null;
          category: string | null;
          city: string | null;
          created_at: string;
          description: string | null;
          fraud_analysis: string | null;
          fraud_flags: string[];
          fraud_score: number | null;
          group_id: string | null;
          id: string;
          intent: Database["public"]["Enums"]["listing_intent"];
          latitude: number | null;
          longitude: number | null;
          photos: string[];
          price: number | null;
          status: Database["public"]["Enums"]["listing_status"];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          boosted_until?: string | null;
          category?: string | null;
          city?: string | null;
          created_at?: string;
          description?: string | null;
          fraud_analysis?: string | null;
          fraud_flags?: string[];
          fraud_score?: number | null;
          group_id?: string | null;
          id?: string;
          intent?: Database["public"]["Enums"]["listing_intent"];
          latitude?: number | null;
          longitude?: number | null;
          photos?: string[];
          price?: number | null;
          status?: Database["public"]["Enums"]["listing_status"];
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          boosted_until?: string | null;
          category?: string | null;
          city?: string | null;
          created_at?: string;
          description?: string | null;
          fraud_analysis?: string | null;
          fraud_flags?: string[];
          fraud_score?: number | null;
          group_id?: string | null;
          id?: string;
          intent?: Database["public"]["Enums"]["listing_intent"];
          latitude?: number | null;
          longitude?: number | null;
          photos?: string[];
          price?: number | null;
          status?: Database["public"]["Enums"]["listing_status"];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          buyer_id: string;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          id: string;
          listing_id: string;
          seller_id: string;
        };
        Insert: {
          buyer_id: string;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          id?: string;
          listing_id: string;
          seller_id: string;
        };
        Update: {
          buyer_id?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          id?: string;
          listing_id?: string;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matches_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      meeting_sessions: {
        Row: {
          actions: Json | null;
          decisions: Json | null;
          end_time: string | null;
          id: string;
          metadata: Json | null;
          pending: Json | null;
          start_time: string | null;
          summary: string | null;
          title: string;
          transcription: Json | null;
          user_id: string;
        };
        Insert: {
          actions?: Json | null;
          decisions?: Json | null;
          end_time?: string | null;
          id?: string;
          metadata?: Json | null;
          pending?: Json | null;
          start_time?: string | null;
          summary?: string | null;
          title: string;
          transcription?: Json | null;
          user_id: string;
        };
        Update: {
          actions?: Json | null;
          decisions?: Json | null;
          end_time?: string | null;
          id?: string;
          metadata?: Json | null;
          pending?: Json | null;
          start_time?: string | null;
          summary?: string | null;
          title?: string;
          transcription?: Json | null;
          user_id?: string;
        };
        Relationships: [];
      };
      meetings: {
        Row: {
          agenda: string | null;
          created_at: string | null;
          created_by: string | null;
          duration_minutes: number | null;
          id: string;
          is_online: boolean | null;
          location: string | null;
          meeting_link: string | null;
          notes: string | null;
          objective: string | null;
          organization_id: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["meeting_status"] | null;
          title: string;
          type: Database["public"]["Enums"]["meeting_type"] | null;
          updated_at: string | null;
        };
        Insert: {
          agenda?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          duration_minutes?: number | null;
          id?: string;
          is_online?: boolean | null;
          location?: string | null;
          meeting_link?: string | null;
          notes?: string | null;
          objective?: string | null;
          organization_id?: string | null;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["meeting_status"] | null;
          title: string;
          type?: Database["public"]["Enums"]["meeting_type"] | null;
          updated_at?: string | null;
        };
        Update: {
          agenda?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          duration_minutes?: number | null;
          id?: string;
          is_online?: boolean | null;
          location?: string | null;
          meeting_link?: string | null;
          notes?: string | null;
          objective?: string | null;
          organization_id?: string | null;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["meeting_status"] | null;
          title?: string;
          type?: Database["public"]["Enums"]["meeting_type"] | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meetings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      meetups: {
        Row: {
          address: string | null;
          buyer_confirmed_at: string | null;
          buyer_id: string;
          buyer_safety_ack: boolean;
          cancelled_reason: string | null;
          created_at: string;
          id: string;
          latitude: number | null;
          listing_id: string | null;
          location_name: string;
          longitude: number | null;
          match_id: string;
          proposed_by: string;
          qr_token: string;
          scheduled_at: string;
          seller_confirmed_at: string | null;
          seller_id: string;
          seller_safety_ack: boolean;
          status: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          buyer_confirmed_at?: string | null;
          buyer_id: string;
          buyer_safety_ack?: boolean;
          cancelled_reason?: string | null;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          listing_id?: string | null;
          location_name: string;
          longitude?: number | null;
          match_id: string;
          proposed_by: string;
          qr_token?: string;
          scheduled_at: string;
          seller_confirmed_at?: string | null;
          seller_id: string;
          seller_safety_ack?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          buyer_confirmed_at?: string | null;
          buyer_id?: string;
          buyer_safety_ack?: boolean;
          cancelled_reason?: string | null;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          listing_id?: string | null;
          location_name?: string;
          longitude?: number | null;
          match_id?: string;
          proposed_by?: string;
          qr_token?: string;
          scheduled_at?: string;
          seller_confirmed_at?: string | null;
          seller_id?: string;
          seller_safety_ack?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meetups_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meetups_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          content: string | null;
          created_at: string;
          id: string;
          image_url: string | null;
          match_id: string;
          sender_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          match_id: string;
          sender_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          match_id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      minutes: {
        Row: {
          created_at: string | null;
          decisions: string[] | null;
          id: string;
          insights: string[] | null;
          meeting_id: string | null;
          risks: string[] | null;
          summary: string | null;
          template_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          decisions?: string[] | null;
          id?: string;
          insights?: string[] | null;
          meeting_id?: string | null;
          risks?: string[] | null;
          summary?: string | null;
          template_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          decisions?: string[] | null;
          id?: string;
          insights?: string[] | null;
          meeting_id?: string | null;
          risks?: string[] | null;
          summary?: string | null;
          template_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "minutes_meeting_id_fkey";
            columns: ["meeting_id"];
            isOneToOne: false;
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          data: Json;
          id: string;
          read_at: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          read_at?: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          read_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          created_at: string | null;
          id: string;
          organization_id: string | null;
          role: Database["public"]["Enums"]["user_role"] | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          organization_id?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          organization_id?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string | null;
          id: string;
          name: string;
          slug: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      professional_memories: {
        Row: {
          category: Database["public"]["Enums"]["professional_memory_category"];
          content: string;
          created_at: string;
          id: string;
          keywords: string[] | null;
          metadata: Json | null;
          summary: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["professional_memory_category"];
          content: string;
          created_at?: string;
          id?: string;
          keywords?: string[] | null;
          metadata?: Json | null;
          summary?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["professional_memory_category"];
          content?: string;
          created_at?: string;
          id?: string;
          keywords?: string[] | null;
          metadata?: Json | null;
          summary?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profile_contacts: {
        Row: {
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          city: string | null;
          created_at: string;
          id: string;
          latitude: number | null;
          lifetime_points: number;
          longitude: number | null;
          name: string | null;
          points: number;
          trust_score: number;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          id: string;
          latitude?: number | null;
          lifetime_points?: number;
          longitude?: number | null;
          name?: string | null;
          points?: number;
          trust_score?: number;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          lifetime_points?: number;
          longitude?: number | null;
          name?: string | null;
          points?: number;
          trust_score?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      proposals: {
        Row: {
          amount: number;
          created_at: string;
          from_user: string;
          id: string;
          listing_id: string | null;
          match_id: string;
          message: string | null;
          responded_at: string | null;
          status: string;
          to_user: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          from_user: string;
          id?: string;
          listing_id?: string | null;
          match_id: string;
          message?: string | null;
          responded_at?: string | null;
          status?: string;
          to_user: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          from_user?: string;
          id?: string;
          listing_id?: string | null;
          match_id?: string;
          message?: string | null;
          responded_at?: string | null;
          status?: string;
          to_user?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposals_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposals_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          evidence_urls: string[];
          id: string;
          listing_id: string | null;
          match_id: string | null;
          reason: string;
          reported_user_id: string | null;
          reporter_id: string;
          resolution: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          evidence_urls?: string[];
          id?: string;
          listing_id?: string | null;
          match_id?: string | null;
          reason: string;
          reported_user_id?: string | null;
          reporter_id: string;
          resolution?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          evidence_urls?: string[];
          id?: string;
          listing_id?: string | null;
          match_id?: string | null;
          reason?: string;
          reported_user_id?: string | null;
          reporter_id?: string;
          resolution?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      resumes: {
        Row: {
          content_text: string | null;
          created_at: string;
          file_path: string;
          id: string;
          is_active: boolean | null;
          parsed_data: Json | null;
          user_id: string;
        };
        Insert: {
          content_text?: string | null;
          created_at?: string;
          file_path: string;
          id?: string;
          is_active?: boolean | null;
          parsed_data?: Json | null;
          user_id: string;
        };
        Update: {
          content_text?: string | null;
          created_at?: string;
          file_path?: string;
          id?: string;
          is_active?: boolean | null;
          parsed_data?: Json | null;
          user_id?: string;
        };
        Relationships: [];
      };
      saved_listings: {
        Row: {
          created_at: string;
          listing_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          listing_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          listing_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      swipes: {
        Row: {
          action: Database["public"]["Enums"]["swipe_action"];
          created_at: string;
          id: string;
          listing_id: string;
          user_id: string;
        };
        Insert: {
          action: Database["public"]["Enums"]["swipe_action"];
          created_at?: string;
          id?: string;
          listing_id: string;
          user_id: string;
        };
        Update: {
          action?: Database["public"]["Enums"]["swipe_action"];
          created_at?: string;
          id?: string;
          listing_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swipes_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: {
          content: Json;
          created_at: string | null;
          id: string;
          is_system: boolean | null;
          name: string;
          organization_id: string | null;
          type: string;
        };
        Insert: {
          content: Json;
          created_at?: string | null;
          id?: string;
          is_system?: boolean | null;
          name: string;
          organization_id?: string | null;
          type: string;
        };
        Update: {
          content?: Json;
          created_at?: string | null;
          id?: string;
          is_system?: boolean | null;
          name?: string;
          organization_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      transcripts: {
        Row: {
          content: string | null;
          created_at: string | null;
          id: string;
          json_data: Json | null;
          meeting_id: string | null;
          provider: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string | null;
          id?: string;
          json_data?: Json | null;
          meeting_id?: string | null;
          provider?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
          id?: string;
          json_data?: Json | null;
          meeting_id?: string | null;
          provider?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transcripts_meeting_id_fkey";
            columns: ["meeting_id"];
            isOneToOne: false;
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          },
        ];
      };
      user_badges: {
        Row: {
          badge_key: string;
          earned_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          badge_key: string;
          earned_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          badge_key?: string;
          earned_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_streaks: {
        Row: {
          created_at: string;
          current_streak: number;
          freebies_earned: number;
          last_active_date: string | null;
          longest_streak: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          current_streak?: number;
          freebies_earned?: number;
          last_active_date?: string | null;
          longest_streak?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          current_streak?: number;
          freebies_earned?: number;
          last_active_date?: string | null;
          longest_streak?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      award_badge: {
        Args: {
          _badge_key: string;
          _body: string;
          _title: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      daily_checkin: {
        Args: never;
        Returns: {
          awarded_points: number;
          is_new_day: boolean;
          longest: number;
          milestone: string;
          streak: number;
        }[];
      };
      is_group_member: {
        Args: { _group_id: string; _user_id: string };
        Returns: boolean;
      };
      recompute_my_trust: { Args: never; Returns: number };
      recompute_user_trust: { Args: { _user_id: string }; Returns: number };
    };
    Enums: {
      action_status: "open" | "in_progress" | "blocked" | "delayed" | "completed" | "cancelled";
      candidate_status:
        "applied" | "screening" | "interview" | "evaluating" | "approved" | "rejected";
      job_status: "open" | "closed" | "paused";
      listing_intent: "sell" | "trade" | "buy";
      listing_status: "active" | "paused" | "sold";
      meeting_status: "scheduled" | "in_progress" | "completed" | "cancelled";
      meeting_type:
        | "daily"
        | "weekly"
        | "management"
        | "project"
        | "client"
        | "security"
        | "maintenance"
        | "hr"
        | "commercial"
        | "other";
      professional_memory_category:
        | "PERFIL"
        | "FORMAÇÃO"
        | "EXPERIÊNCIA"
        | "EMPRESA"
        | "CARGO"
        | "PROJETO"
        | "COMPETÊNCIA"
        | "CERTIFICAÇÃO"
        | "CURSO"
        | "RESULTADO"
        | "CONHECIMENTO TÉCNICO"
        | "HISTÓRIA PROFISSIONAL"
        | "RESPOSTA PREFERIDA";
      swipe_action: "like" | "pass" | "super_like";
      user_role: "admin" | "manager" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      action_status: ["open", "in_progress", "blocked", "delayed", "completed", "cancelled"],
      candidate_status: ["applied", "screening", "interview", "evaluating", "approved", "rejected"],
      job_status: ["open", "closed", "paused"],
      listing_intent: ["sell", "trade", "buy"],
      listing_status: ["active", "paused", "sold"],
      meeting_status: ["scheduled", "in_progress", "completed", "cancelled"],
      meeting_type: [
        "daily",
        "weekly",
        "management",
        "project",
        "client",
        "security",
        "maintenance",
        "hr",
        "commercial",
        "other",
      ],
      professional_memory_category: [
        "PERFIL",
        "FORMAÇÃO",
        "EXPERIÊNCIA",
        "EMPRESA",
        "CARGO",
        "PROJETO",
        "COMPETÊNCIA",
        "CERTIFICAÇÃO",
        "CURSO",
        "RESULTADO",
        "CONHECIMENTO TÉCNICO",
        "HISTÓRIA PROFISSIONAL",
        "RESPOSTA PREFERIDA",
      ],
      swipe_action: ["like", "pass", "super_like"],
      user_role: ["admin", "manager", "member"],
    },
  },
} as const;
