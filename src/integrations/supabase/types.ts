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
  public: {
    Tables: {
      ai_agent_configs: {
        Row: {
          agent_name: string
          auto_reply_enabled: boolean | null
          business_context: string | null
          communication_style: Json | null
          competitor_handling: string | null
          created_at: string | null
          custom_instructions: string | null
          escalation_after_minutes: number | null
          escalation_keywords: string[] | null
          escalation_on_negative_sentiment: boolean | null
          faq_context: string | null
          forbidden_topics: string[] | null
          id: string
          is_enabled: boolean | null
          knowledge_base_enabled: boolean | null
          learn_from_agents: boolean | null
          max_auto_replies: number | null
          max_discount_percent: number | null
          objection_style: string | null
          out_of_hours_message: string | null
          persona_description: string | null
          personality_traits: Json | null
          product_catalog: string | null
          response_delay_seconds: number | null
          sector_id: string
          tone_of_voice: string | null
          updated_at: string | null
          upsell_enabled: boolean | null
          upsell_triggers: string[] | null
          welcome_message: string | null
          working_days: number[] | null
          working_hours_end: string | null
          working_hours_start: string | null
          working_timezone: string | null
        }
        Insert: {
          agent_name?: string
          auto_reply_enabled?: boolean | null
          business_context?: string | null
          communication_style?: Json | null
          competitor_handling?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          escalation_after_minutes?: number | null
          escalation_keywords?: string[] | null
          escalation_on_negative_sentiment?: boolean | null
          faq_context?: string | null
          forbidden_topics?: string[] | null
          id?: string
          is_enabled?: boolean | null
          knowledge_base_enabled?: boolean | null
          learn_from_agents?: boolean | null
          max_auto_replies?: number | null
          max_discount_percent?: number | null
          objection_style?: string | null
          out_of_hours_message?: string | null
          persona_description?: string | null
          personality_traits?: Json | null
          product_catalog?: string | null
          response_delay_seconds?: number | null
          sector_id: string
          tone_of_voice?: string | null
          updated_at?: string | null
          upsell_enabled?: boolean | null
          upsell_triggers?: string[] | null
          welcome_message?: string | null
          working_days?: number[] | null
          working_hours_end?: string | null
          working_hours_start?: string | null
          working_timezone?: string | null
        }
        Update: {
          agent_name?: string
          auto_reply_enabled?: boolean | null
          business_context?: string | null
          communication_style?: Json | null
          competitor_handling?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          escalation_after_minutes?: number | null
          escalation_keywords?: string[] | null
          escalation_on_negative_sentiment?: boolean | null
          faq_context?: string | null
          forbidden_topics?: string[] | null
          id?: string
          is_enabled?: boolean | null
          knowledge_base_enabled?: boolean | null
          learn_from_agents?: boolean | null
          max_auto_replies?: number | null
          max_discount_percent?: number | null
          objection_style?: string | null
          out_of_hours_message?: string | null
          persona_description?: string | null
          personality_traits?: Json | null
          product_catalog?: string | null
          response_delay_seconds?: number | null
          sector_id?: string
          tone_of_voice?: string | null
          updated_at?: string | null
          upsell_enabled?: boolean | null
          upsell_triggers?: string[] | null
          welcome_message?: string | null
          working_days?: number[] | null
          working_hours_end?: string | null
          working_hours_start?: string | null
          working_timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_configs_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: true
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_logs: {
        Row: {
          action: string
          ai_response: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          input_message: string | null
          metadata: Json | null
          model_used: string | null
          response_time_ms: number | null
          session_id: string | null
          tokens_used: number | null
        }
        Insert: {
          action: string
          ai_response?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          input_message?: string | null
          metadata?: Json | null
          model_used?: string | null
          response_time_ms?: number | null
          session_id?: string | null
          tokens_used?: number | null
        }
        Update: {
          action?: string
          ai_response?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          input_message?: string | null
          metadata?: Json | null
          model_used?: string | null
          response_time_ms?: number | null
          session_id?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_sessions: {
        Row: {
          auto_reply_count: number | null
          conversation_id: string
          conversation_summary: string | null
          created_at: string | null
          detected_intent: string | null
          escalated_at: string | null
          escalated_to: string | null
          escalation_priority: number | null
          escalation_reason: string | null
          handoff_context: Json | null
          handoff_requested_at: string | null
          handoff_summary: string | null
          id: string
          last_ai_response_at: string | null
          lead_score: number | null
          mode: string | null
          updated_at: string | null
        }
        Insert: {
          auto_reply_count?: number | null
          conversation_id: string
          conversation_summary?: string | null
          created_at?: string | null
          detected_intent?: string | null
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_priority?: number | null
          escalation_reason?: string | null
          handoff_context?: Json | null
          handoff_requested_at?: string | null
          handoff_summary?: string | null
          id?: string
          last_ai_response_at?: string | null
          lead_score?: number | null
          mode?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_reply_count?: number | null
          conversation_id?: string
          conversation_summary?: string | null
          created_at?: string | null
          detected_intent?: string | null
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_priority?: number | null
          escalation_reason?: string | null
          handoff_context?: Json | null
          handoff_requested_at?: string | null
          handoff_summary?: string | null
          id?: string
          last_ai_response_at?: string | null
          lead_score?: number | null
          mode?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_sessions_escalated_to_fkey"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_response_feedback: {
        Row: {
          conversation_id: string | null
          corrected_response: string | null
          correction_reason: string | null
          created_at: string | null
          feedback_type: string | null
          given_by: string | null
          id: string
          log_id: string | null
          rating: number | null
        }
        Insert: {
          conversation_id?: string | null
          corrected_response?: string | null
          correction_reason?: string | null
          created_at?: string | null
          feedback_type?: string | null
          given_by?: string | null
          id?: string
          log_id?: string | null
          rating?: number | null
        }
        Update: {
          conversation_id?: string | null
          corrected_response?: string | null
          correction_reason?: string | null
          created_at?: string | null
          feedback_type?: string | null
          given_by?: string | null
          id?: string
          log_id?: string | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_response_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_given_by_fkey"
            columns: ["given_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_feedback_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      api_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          permissions: string[]
          rate_limit_per_minute: number | null
          token_hash: string
          token_prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name: string
          permissions?: string[]
          rate_limit_per_minute?: number | null
          token_hash: string
          token_prefix: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          permissions?: string[]
          rate_limit_per_minute?: number | null
          token_hash?: string
          token_prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_logs: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          response_time_ms: number | null
          status_code: number | null
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          response_time_ms?: number | null
          status_code?: number | null
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          response_time_ms?: number | null
          status_code?: number | null
          token_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "api_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_rules: {
        Row: {
          created_at: string | null
          fixed_agent_id: string | null
          id: string
          instance_id: string | null
          is_active: boolean | null
          name: string
          round_robin_agents: string[] | null
          round_robin_last_index: number | null
          rule_type: string
          sector_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fixed_agent_id?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          name: string
          round_robin_agents?: string[] | null
          round_robin_last_index?: number | null
          rule_type: string
          sector_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fixed_agent_id?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          name?: string
          round_robin_agents?: string[] | null
          round_robin_last_index?: number | null
          rule_type?: string
          sector_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_rules_fixed_agent_id_fkey"
            columns: ["fixed_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_rules_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_rules_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          agent_id: string | null
          created_at: string | null
          day_of_week: number | null
          end_time: string
          id: string
          is_active: boolean | null
          max_concurrent_meetings: number | null
          sector_id: string | null
          slot_type: string | null
          specific_date: string | null
          start_time: string
          timezone: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          day_of_week?: number | null
          end_time: string
          id?: string
          is_active?: boolean | null
          max_concurrent_meetings?: number | null
          sector_id?: string | null
          slot_type?: string | null
          specific_date?: string | null
          start_time: string
          timezone?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          day_of_week?: number | null
          end_time?: string
          id?: string
          is_active?: boolean | null
          max_concurrent_meetings?: number | null
          sector_id?: string | null
          slot_type?: string | null
          specific_date?: string | null
          start_time?: string
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_slots_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      business_knowledge_base: {
        Row: {
          category: string
          confidence_score: number | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          keywords: string[] | null
          last_used_at: string | null
          parent_id: string | null
          sector_id: string | null
          source: string | null
          subcategory: string | null
          title: string
          updated_at: string | null
          usage_count: number | null
          verified_by: string | null
          version: number | null
        }
        Insert: {
          category: string
          confidence_score?: number | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          keywords?: string[] | null
          last_used_at?: string | null
          parent_id?: string | null
          sector_id?: string | null
          source?: string | null
          subcategory?: string | null
          title: string
          updated_at?: string | null
          usage_count?: number | null
          verified_by?: string | null
          version?: number | null
        }
        Update: {
          category?: string
          confidence_score?: number | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          keywords?: string[] | null
          last_used_at?: string | null
          parent_id?: string | null
          sector_id?: string | null
          source?: string | null
          subcategory?: string | null
          title?: string
          updated_at?: string | null
          usage_count?: number | null
          verified_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_knowledge_base_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_knowledge_base_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "business_knowledge_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_knowledge_base_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_knowledge_base_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_logs: {
        Row: {
          button_clicked: string | null
          button_clicked_at: string | null
          campaign_id: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          read_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          button_clicked?: string | null
          button_clicked_at?: string | null
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          button_clicked?: string | null
          button_clicked_at?: string | null
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          button_options: Json | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          delivered_count: number | null
          description: string | null
          failed_count: number | null
          id: string
          instance_id: string
          media_mimetype: string | null
          media_type: string | null
          media_url: string | null
          message_content: string
          message_type: string
          name: string
          read_count: number | null
          scheduled_at: string | null
          sent_count: number | null
          started_at: string | null
          status: string
          target_contacts: Json | null
          total_recipients: number | null
          updated_at: string
        }
        Insert: {
          button_options?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string
          instance_id: string
          media_mimetype?: string | null
          media_type?: string | null
          media_url?: string | null
          message_content: string
          message_type?: string
          name: string
          read_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string
          target_contacts?: Json | null
          total_recipients?: number | null
          updated_at?: string
        }
        Update: {
          button_options?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string
          instance_id?: string
          media_mimetype?: string | null
          media_type?: string | null
          media_url?: string | null
          message_content?: string
          message_type?: string
          name?: string
          read_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string
          target_contacts?: Json | null
          total_recipients?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_assignments: {
        Row: {
          assigned_by: string | null
          assigned_from: string | null
          assigned_to: string
          conversation_id: string
          created_at: string | null
          id: string
          reason: string | null
        }
        Insert: {
          assigned_by?: string | null
          assigned_from?: string | null
          assigned_to: string
          conversation_id: string
          created_at?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          assigned_by?: string | null
          assigned_from?: string | null
          assigned_to?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_assigned_from_fkey"
            columns: ["assigned_from"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_distribution_config: {
        Row: {
          auto_assign_enabled: boolean | null
          created_at: string
          distribution_method: string
          id: string
          max_concurrent_escalations_per_agent: number | null
          max_queue_time_minutes: number | null
          priority_boost_after_minutes: number | null
          sector_id: string
          updated_at: string
        }
        Insert: {
          auto_assign_enabled?: boolean | null
          created_at?: string
          distribution_method?: string
          id?: string
          max_concurrent_escalations_per_agent?: number | null
          max_queue_time_minutes?: number | null
          priority_boost_after_minutes?: number | null
          sector_id: string
          updated_at?: string
        }
        Update: {
          auto_assign_enabled?: boolean | null
          created_at?: string
          distribution_method?: string
          id?: string
          max_concurrent_escalations_per_agent?: number | null
          max_queue_time_minutes?: number | null
          priority_boost_after_minutes?: number | null
          sector_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_distribution_config_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: true
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_notifications: {
        Row: {
          created_at: string
          dismissed_at: string | null
          escalation_id: string
          id: string
          notification_type: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          escalation_id: string
          id?: string
          notification_type?: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          escalation_id?: string
          id?: string
          notification_type?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_notifications_escalation_id_fkey"
            columns: ["escalation_id"]
            isOneToOne: false
            referencedRelation: "escalation_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_queue: {
        Row: {
          ai_summary: string | null
          assigned_at: string | null
          assigned_to: string | null
          conversation_id: string
          created_at: string
          customer_sentiment: string | null
          detected_intent: string | null
          escalation_reason: string
          expires_at: string | null
          id: string
          instance_id: string | null
          lead_score: number | null
          priority: number | null
          resolution_notes: string | null
          resolved_at: string | null
          sector_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          conversation_id: string
          created_at?: string
          customer_sentiment?: string | null
          detected_intent?: string | null
          escalation_reason?: string
          expires_at?: string | null
          id?: string
          instance_id?: string | null
          lead_score?: number | null
          priority?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          sector_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          conversation_id?: string
          created_at?: string
          customer_sentiment?: string | null
          detected_intent?: string | null
          escalation_reason?: string
          expires_at?: string | null
          id?: string
          instance_id?: string | null
          lead_score?: number | null
          priority?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          sector_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_queue_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_queue_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks: {
        Row: {
          comentario: string | null
          created_at: string
          id: string
          nota: number
          ticket_id: string
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          id?: string
          nota: number
          ticket_id: string
        }
        Update: {
          comentario?: string | null
          created_at?: string
          id?: string
          nota?: number
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns_config: {
        Row: {
          color: string | null
          column_id: string
          created_at: string | null
          custom_title: string
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          sector_id: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          column_id: string
          created_at?: string | null
          custom_title: string
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          sector_id: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          column_id?: string
          created_at?: string | null
          custom_title?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          sector_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kanban_columns_config_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          lead_id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification_criteria: {
        Row: {
          authority_keywords: string[] | null
          authority_weight: number | null
          auto_create_lead_threshold: number | null
          auto_create_leads: boolean | null
          auto_qualify_threshold: number | null
          budget_keywords: string[] | null
          budget_weight: number | null
          created_at: string | null
          id: string
          messages_before_qualification: number | null
          need_keywords: string[] | null
          need_weight: number | null
          qualification_enabled: boolean | null
          sector_id: string | null
          timeline_keywords: string[] | null
          timeline_weight: number | null
          updated_at: string | null
        }
        Insert: {
          authority_keywords?: string[] | null
          authority_weight?: number | null
          auto_create_lead_threshold?: number | null
          auto_create_leads?: boolean | null
          auto_qualify_threshold?: number | null
          budget_keywords?: string[] | null
          budget_weight?: number | null
          created_at?: string | null
          id?: string
          messages_before_qualification?: number | null
          need_keywords?: string[] | null
          need_weight?: number | null
          qualification_enabled?: boolean | null
          sector_id?: string | null
          timeline_keywords?: string[] | null
          timeline_weight?: number | null
          updated_at?: string | null
        }
        Update: {
          authority_keywords?: string[] | null
          authority_weight?: number | null
          auto_create_lead_threshold?: number | null
          auto_create_leads?: boolean | null
          auto_qualify_threshold?: number | null
          budget_keywords?: string[] | null
          budget_weight?: number | null
          created_at?: string | null
          id?: string
          messages_before_qualification?: number | null
          need_keywords?: string[] | null
          need_weight?: number | null
          qualification_enabled?: boolean | null
          sector_id?: string | null
          timeline_keywords?: string[] | null
          timeline_weight?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_qualification_criteria_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: true
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification_logs: {
        Row: {
          ai_reasoning: string | null
          bant_analysis: Json
          conversation_id: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          model_used: string | null
          new_score: number | null
          previous_score: number | null
          score_change: number | null
          tokens_used: number | null
          trigger_source: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          bant_analysis?: Json
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          model_used?: string | null
          new_score?: number | null
          previous_score?: number | null
          score_change?: number | null
          tokens_used?: number | null
          trigger_source?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          bant_analysis?: Json
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          model_used?: string | null
          new_score?: number | null
          previous_score?: number | null
          score_change?: number | null
          tokens_used?: number | null
          trigger_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_qualification_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_qualification_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          lead_id: string
          new_status: string
          old_status: string | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          lead_id: string
          new_status: string
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          new_status?: string
          old_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          bant_authority: Json | null
          bant_budget: Json | null
          bant_need: Json | null
          bant_timeline: Json | null
          closed_at: string | null
          company: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          email: string | null
          expected_close_date: string | null
          id: string
          last_qualification_at: string | null
          lead_score: number | null
          metadata: Json | null
          name: string
          notes: string | null
          phone: string | null
          pipeline_insight: Json | null
          probability: number | null
          qualification_data: Json | null
          qualified_at: string | null
          qualified_by: string | null
          sector_id: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          tags: string[] | null
          updated_at: string
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          bant_authority?: Json | null
          bant_budget?: Json | null
          bant_need?: Json | null
          bant_timeline?: Json | null
          closed_at?: string | null
          company?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          expected_close_date?: string | null
          id?: string
          last_qualification_at?: string | null
          lead_score?: number | null
          metadata?: Json | null
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_insight?: Json | null
          probability?: number | null
          qualification_data?: Json | null
          qualified_at?: string | null
          qualified_by?: string | null
          sector_id?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[] | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          bant_authority?: Json | null
          bant_budget?: Json | null
          bant_need?: Json | null
          bant_timeline?: Json | null
          closed_at?: string | null
          company?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          expected_close_date?: string | null
          id?: string
          last_qualification_at?: string | null
          lead_score?: number | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_insight?: Json | null
          probability?: number | null
          qualification_data?: Json | null
          qualified_at?: string | null
          qualified_by?: string | null
          sector_id?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[] | null
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_examples: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          customer_satisfied: boolean | null
          id: string
          ideal_response: string
          input_context: string
          lead_converted: boolean | null
          marked_as_good_by: string | null
          marked_at: string | null
          message_id: string | null
          notes: string | null
          quality_score: number | null
          scenario_type: string | null
          sector_id: string | null
          tags: string[] | null
          times_referenced: number | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          customer_satisfied?: boolean | null
          id?: string
          ideal_response: string
          input_context: string
          lead_converted?: boolean | null
          marked_as_good_by?: string | null
          marked_at?: string | null
          message_id?: string | null
          notes?: string | null
          quality_score?: number | null
          scenario_type?: string | null
          sector_id?: string | null
          tags?: string[] | null
          times_referenced?: number | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          customer_satisfied?: boolean | null
          id?: string
          ideal_response?: string
          input_context?: string
          lead_converted?: boolean | null
          marked_as_good_by?: string | null
          marked_at?: string | null
          message_id?: string | null
          notes?: string | null
          quality_score?: number | null
          scenario_type?: string | null
          sector_id?: string | null
          tags?: string[] | null
          times_referenced?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_examples_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_examples_marked_as_good_by_fkey"
            columns: ["marked_as_good_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_examples_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_examples_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_schedules: {
        Row: {
          ai_session_id: string | null
          assigned_agent_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          lead_id: string | null
          location: string | null
          meeting_link: string | null
          meeting_type: string | null
          metadata: Json | null
          notes: string | null
          reminder_1h_sent: boolean | null
          reminder_24h_sent: boolean | null
          reminder_custom_sent: boolean | null
          scheduled_at: string
          sector_id: string | null
          status: string | null
          timezone: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_session_id?: string | null
          assigned_agent_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_link?: string | null
          meeting_type?: string | null
          metadata?: Json | null
          notes?: string | null
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          reminder_custom_sent?: boolean | null
          scheduled_at: string
          sector_id?: string | null
          status?: string | null
          timezone?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_session_id?: string | null
          assigned_agent_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_link?: string | null
          meeting_type?: string | null
          metadata?: Json | null
          notes?: string | null
          reminder_1h_sent?: boolean | null
          reminder_24h_sent?: boolean | null
          reminder_custom_sent?: boolean | null
          scheduled_at?: string
          sector_id?: string | null
          status?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_schedules_ai_session_id_fkey"
            columns: ["ai_session_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedules_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedules_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedules_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedules_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedules_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_audit_logs: {
        Row: {
          changed_by: string
          created_at: string | null
          id: string
          metadata: Json | null
          new_value: boolean | null
          old_value: boolean | null
          permission_key: string
          reason: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          changed_by: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_value?: boolean | null
          old_value?: boolean | null
          permission_key: string
          reason?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          changed_by?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          new_value?: boolean | null
          old_value?: boolean | null
          permission_key?: string
          reason?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_audit_logs_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_types: {
        Row: {
          category: string | null
          created_at: string | null
          default_for_admin: boolean | null
          default_for_agent: boolean | null
          default_for_supervisor: boolean | null
          description: string | null
          key: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          default_for_admin?: boolean | null
          default_for_agent?: boolean | null
          default_for_supervisor?: boolean | null
          description?: string | null
          key: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          default_for_admin?: boolean | null
          default_for_agent?: boolean | null
          default_for_supervisor?: boolean | null
          description?: string | null
          key?: string
          name?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          attributes: Json | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_modifier: number
          product_id: string
          sku: string | null
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          attributes?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_modifier?: number
          product_id: string
          sku?: string | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          attributes?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_modifier?: number
          product_id?: string
          sku?: string | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          category: string
          created_at: string
          currency: string
          description: string | null
          features: Json | null
          id: string
          images: string[] | null
          is_active: boolean
          max_discount_percent: number
          metadata: Json | null
          min_quantity: number
          name: string
          sector_id: string | null
          sku: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          base_price?: number
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          max_discount_percent?: number
          metadata?: Json | null
          min_quantity?: number
          name: string
          sector_id?: string | null
          sku?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          max_discount_percent?: number
          metadata?: Json | null
          min_quantity?: number
          name?: string
          sector_id?: string | null
          sku?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_approved: boolean | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          is_approved?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_approved?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_config: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      response_templates: {
        Row: {
          avg_sentiment_after: number | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          intent_match: string[] | null
          is_active: boolean | null
          name: string
          priority: number | null
          sector_id: string | null
          success_rate: number | null
          template_content: string
          trigger_patterns: string[] | null
          updated_at: string | null
          usage_count: number | null
          variables: Json | null
        }
        Insert: {
          avg_sentiment_after?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          intent_match?: string[] | null
          is_active?: boolean | null
          name: string
          priority?: number | null
          sector_id?: string | null
          success_rate?: number | null
          template_content: string
          trigger_patterns?: string[] | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Update: {
          avg_sentiment_after?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          intent_match?: string[] | null
          is_active?: boolean | null
          name?: string
          priority?: number | null
          sector_id?: string | null
          success_rate?: number | null
          template_content?: string
          trigger_patterns?: string[] | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "response_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_templates_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_targets: {
        Row: {
          created_at: string
          id: string
          period_end: string
          period_start: string
          target_leads: number | null
          target_value: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          target_leads?: number | null
          target_value: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          target_leads?: number | null
          target_value?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_config: {
        Row: {
          allow_ai_scheduling: boolean | null
          allowed_meeting_types: string[] | null
          auto_cancel_no_confirmation_hours: number | null
          buffer_after_minutes: number | null
          buffer_before_minutes: number | null
          confirmation_message: string | null
          created_at: string | null
          custom_reminder_hours: number | null
          default_duration_minutes: number | null
          default_meeting_type: string | null
          google_calendar_sync: boolean | null
          id: string
          is_enabled: boolean | null
          max_advance_days: number | null
          min_advance_hours: number | null
          reminder_message_1h: string | null
          reminder_message_24h: string | null
          require_confirmation: boolean | null
          sector_id: string | null
          send_reminder_1h: boolean | null
          send_reminder_24h: boolean | null
          slot_interval_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          allow_ai_scheduling?: boolean | null
          allowed_meeting_types?: string[] | null
          auto_cancel_no_confirmation_hours?: number | null
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          confirmation_message?: string | null
          created_at?: string | null
          custom_reminder_hours?: number | null
          default_duration_minutes?: number | null
          default_meeting_type?: string | null
          google_calendar_sync?: boolean | null
          id?: string
          is_enabled?: boolean | null
          max_advance_days?: number | null
          min_advance_hours?: number | null
          reminder_message_1h?: string | null
          reminder_message_24h?: string | null
          require_confirmation?: boolean | null
          sector_id?: string | null
          send_reminder_1h?: boolean | null
          send_reminder_24h?: boolean | null
          slot_interval_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_ai_scheduling?: boolean | null
          allowed_meeting_types?: string[] | null
          auto_cancel_no_confirmation_hours?: number | null
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          confirmation_message?: string | null
          created_at?: string | null
          custom_reminder_hours?: number | null
          default_duration_minutes?: number | null
          default_meeting_type?: string | null
          google_calendar_sync?: boolean | null
          id?: string
          is_enabled?: boolean | null
          max_advance_days?: number | null
          min_advance_hours?: number | null
          reminder_message_1h?: string | null
          reminder_message_24h?: string | null
          require_confirmation?: boolean | null
          sector_id?: string | null
          send_reminder_1h?: boolean | null
          send_reminder_24h?: boolean | null
          slot_interval_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_config_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: true
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_intents: {
        Row: {
          ai_session_id: string | null
          confidence: number | null
          conversation_id: string | null
          created_at: string | null
          detected_at: string | null
          duration_requested: number | null
          expires_at: string | null
          id: string
          intent_type: string | null
          meeting_purpose: string | null
          offered_slots: Json | null
          preferred_dates: Json | null
          resulting_meeting_id: string | null
          selected_slot_index: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          ai_session_id?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string | null
          detected_at?: string | null
          duration_requested?: number | null
          expires_at?: string | null
          id?: string
          intent_type?: string | null
          meeting_purpose?: string | null
          offered_slots?: Json | null
          preferred_dates?: Json | null
          resulting_meeting_id?: string | null
          selected_slot_index?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_session_id?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string | null
          detected_at?: string | null
          duration_requested?: number | null
          expires_at?: string | null
          id?: string
          intent_type?: string | null
          meeting_purpose?: string | null
          offered_slots?: Json | null
          preferred_dates?: Json | null
          resulting_meeting_id?: string | null
          selected_slot_index?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_intents_ai_session_id_fkey"
            columns: ["ai_session_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_intents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_intents_resulting_meeting_id_fkey"
            columns: ["resulting_meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      sector_permissions: {
        Row: {
          created_at: string | null
          id: string
          is_enabled: boolean | null
          permission_key: string
          sector_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          permission_key: string
          sector_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          permission_key?: string
          sector_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sector_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "sector_permissions_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          created_at: string | null
          description: string | null
          gera_ticket: boolean | null
          id: string
          instance_id: string
          is_active: boolean | null
          is_default: boolean | null
          mensagem_boas_vindas: string | null
          mensagem_encerramento: string | null
          name: string
          tipo_atendimento: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gera_ticket?: boolean | null
          id?: string
          instance_id: string
          is_active?: boolean | null
          is_default?: boolean | null
          mensagem_boas_vindas?: string | null
          mensagem_encerramento?: string | null
          name: string
          tipo_atendimento?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gera_ticket?: boolean | null
          id?: string
          instance_id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          mensagem_boas_vindas?: string | null
          mensagem_encerramento?: string | null
          name?: string
          tipo_atendimento?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sectors_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_config: {
        Row: {
          created_at: string | null
          id: string
          prioridade: string
          tempo_primeira_resposta_minutos: number
          tempo_resolucao_minutos: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          prioridade: string
          tempo_primeira_resposta_minutos: number
          tempo_resolucao_minutos: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          prioridade?: string
          tempo_primeira_resposta_minutos?: number
          tempo_resolucao_minutos?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      sla_violations: {
        Row: {
          created_at: string | null
          expected_at: string
          id: string
          ticket_id: string
          violated_at: string
          violation_type: string
        }
        Insert: {
          created_at?: string | null
          expected_at: string
          id?: string
          ticket_id: string
          violated_at: string
          violation_type: string
        }
        Update: {
          created_at?: string | null
          expected_at?: string
          id?: string
          ticket_id?: string
          violated_at?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_violations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          atendente_id: string | null
          canal: string | null
          categoria: string | null
          closed_at: string | null
          closed_by: string | null
          conversation_id: string
          created_at: string
          first_response_at: string | null
          id: string
          prioridade: string | null
          sector_id: string
          sla_violated_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          atendente_id?: string | null
          canal?: string | null
          categoria?: string | null
          closed_at?: string | null
          closed_by?: string | null
          conversation_id: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          prioridade?: string | null
          sector_id: string
          sla_violated_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          atendente_id?: string | null
          canal?: string | null
          categoria?: string | null
          closed_at?: string | null
          closed_by?: string | null
          conversation_id?: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          prioridade?: string | null
          sector_id?: string
          sla_violated_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_enabled: boolean
          permission_key: string
          reason: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_enabled: boolean
          permission_key: string
          reason?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          permission_key?: string
          reason?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sectors: {
        Row: {
          created_at: string | null
          id: string
          is_primary: boolean | null
          sector_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          sector_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          sector_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sectors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          attempt_number: number | null
          created_at: string
          error_message: string | null
          event: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          response_time_ms: number | null
          success: boolean
          webhook_id: string
        }
        Insert: {
          attempt_number?: number | null
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean
          webhook_id: string
        }
        Update: {
          attempt_number?: number | null
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          created_by: string | null
          events: string[]
          failure_count: number | null
          headers: Json | null
          id: string
          is_active: boolean
          last_failure_at: string | null
          last_success_at: string | null
          last_triggered_at: string | null
          name: string
          retry_count: number | null
          secret_key: string | null
          timeout_ms: number | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          failure_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          name: string
          retry_count?: number | null
          secret_key?: string | null
          timeout_ms?: number | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          failure_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          name?: string
          retry_count?: number | null
          secret_key?: string | null
          timeout_ms?: number | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          instance_id: string
          is_group: boolean | null
          metadata: Json | null
          name: string
          notes: string | null
          opt_in: boolean | null
          opt_in_updated_at: string | null
          phone_number: string
          profile_picture_url: string | null
          sector_id: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          instance_id: string
          is_group?: boolean | null
          metadata?: Json | null
          name: string
          notes?: string | null
          opt_in?: boolean | null
          opt_in_updated_at?: string | null
          phone_number: string
          profile_picture_url?: string | null
          sector_id?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          instance_id?: string
          is_group?: boolean | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          opt_in?: boolean | null
          opt_in_updated_at?: string | null
          phone_number?: string
          profile_picture_url?: string | null
          sector_id?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversation_notes: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_pinned: boolean | null
          updated_at: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversation_summaries: {
        Row: {
          action_items: Json | null
          conversation_id: string
          created_at: string | null
          id: string
          key_points: Json | null
          messages_count: number | null
          period_end: string | null
          period_start: string | null
          sentiment_at_time: string | null
          summary: string
        }
        Insert: {
          action_items?: Json | null
          conversation_id: string
          created_at?: string | null
          id?: string
          key_points?: Json | null
          messages_count?: number | null
          period_end?: string | null
          period_start?: string | null
          sentiment_at_time?: string | null
          summary: string
        }
        Update: {
          action_items?: Json | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          key_points?: Json | null
          messages_count?: number | null
          period_end?: string | null
          period_start?: string | null
          sentiment_at_time?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversation_summaries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          assigned_to: string | null
          contact_id: string
          conversation_mode: string | null
          created_at: string
          id: string
          instance_id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_qualification_at: string | null
          messages_since_qualification: number | null
          metadata: Json | null
          sector_id: string | null
          status: string | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          conversation_mode?: string | null
          created_at?: string
          id?: string
          instance_id: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_qualification_at?: string | null
          messages_since_qualification?: number | null
          metadata?: Json | null
          sector_id?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          conversation_mode?: string | null
          created_at?: string
          id?: string
          instance_id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_qualification_at?: string | null
          messages_since_qualification?: number | null
          metadata?: Json | null
          sector_id?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instance_secrets: {
        Row: {
          api_key: string
          api_url: string
          created_at: string | null
          id: string
          instance_id: string
          updated_at: string | null
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string | null
          id?: string
          instance_id: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string | null
          id?: string
          instance_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_secrets_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          id: string
          instance_id_external: string | null
          instance_name: string
          metadata: Json | null
          name: string
          provider_type: string
          qr_code: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id_external?: string | null
          instance_name: string
          metadata?: Json | null
          name: string
          provider_type?: string
          qr_code?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id_external?: string | null
          instance_name?: string
          metadata?: Json | null
          name?: string
          provider_type?: string
          qr_code?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_macros: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          description: string | null
          id: string
          instance_id: string | null
          is_active: boolean | null
          name: string
          shortcut: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          description?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          name: string
          shortcut: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          description?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          name?: string
          shortcut?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_macros_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_edit_history: {
        Row: {
          conversation_id: string
          created_at: string
          edited_at: string
          id: string
          message_id: string
          previous_content: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          edited_at?: string
          id?: string
          message_id: string
          previous_content: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          edited_at?: string
          id?: string
          message_id?: string
          previous_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_edit_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          audio_transcription: string | null
          content: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          is_from_me: boolean | null
          is_internal: boolean
          is_supervisor_message: boolean | null
          media_mimetype: string | null
          media_url: string | null
          message_id: string
          message_type: string | null
          metadata: Json | null
          original_content: string | null
          quoted_message_id: string | null
          remote_jid: string
          sent_by: string | null
          status: string | null
          ticket_id: string | null
          timestamp: string
          transcription_status: string | null
        }
        Insert: {
          audio_transcription?: string | null
          content: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_from_me?: boolean | null
          is_internal?: boolean
          is_supervisor_message?: boolean | null
          media_mimetype?: string | null
          media_url?: string | null
          message_id: string
          message_type?: string | null
          metadata?: Json | null
          original_content?: string | null
          quoted_message_id?: string | null
          remote_jid: string
          sent_by?: string | null
          status?: string | null
          ticket_id?: string | null
          timestamp: string
          transcription_status?: string | null
        }
        Update: {
          audio_transcription?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_from_me?: boolean | null
          is_internal?: boolean
          is_supervisor_message?: boolean | null
          media_mimetype?: string | null
          media_url?: string | null
          message_id?: string
          message_type?: string | null
          metadata?: Json | null
          original_content?: string | null
          quoted_message_id?: string | null
          remote_jid?: string
          sent_by?: string | null
          status?: string | null
          ticket_id?: string | null
          timestamp?: string
          transcription_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_reactions: {
        Row: {
          conversation_id: string
          created_at: string | null
          emoji: string
          id: string
          is_from_me: boolean | null
          message_id: string
          reactor_jid: string
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          emoji: string
          id?: string
          is_from_me?: boolean | null
          message_id: string
          reactor_jid: string
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          emoji?: string
          id?: string
          is_from_me?: boolean | null
          message_id?: string
          reactor_jid?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sentiment_analysis: {
        Row: {
          confidence_score: number | null
          contact_id: string
          conversation_id: string
          created_at: string
          id: string
          messages_analyzed: number | null
          metadata: Json | null
          reasoning: string | null
          sentiment: Database["public"]["Enums"]["sentiment_type"]
          summary: string | null
        }
        Insert: {
          confidence_score?: number | null
          contact_id: string
          conversation_id: string
          created_at?: string
          id?: string
          messages_analyzed?: number | null
          metadata?: Json | null
          reasoning?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"]
          summary?: string | null
        }
        Update: {
          confidence_score?: number | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          messages_analyzed?: number | null
          metadata?: Json | null
          reasoning?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sentiment_analysis_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sentiment_analysis_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sentiment_history: {
        Row: {
          confidence_score: number | null
          contact_id: string
          conversation_id: string
          created_at: string
          id: string
          messages_analyzed: number | null
          sentiment: Database["public"]["Enums"]["sentiment_type"]
          summary: string | null
        }
        Insert: {
          confidence_score?: number | null
          contact_id: string
          conversation_id: string
          created_at?: string
          id?: string
          messages_analyzed?: number | null
          sentiment: Database["public"]["Enums"]["sentiment_type"]
          summary?: string | null
        }
        Update: {
          confidence_score?: number | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          messages_analyzed?: number | null
          sentiment?: Database["public"]["Enums"]["sentiment_type"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sentiment_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sentiment_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_topics_history: {
        Row: {
          ai_confidence: number | null
          ai_reasoning: string | null
          categorization_model: string | null
          contact_id: string
          conversation_id: string
          created_at: string
          id: string
          primary_topic: string | null
          topics: string[]
        }
        Insert: {
          ai_confidence?: number | null
          ai_reasoning?: string | null
          categorization_model?: string | null
          contact_id: string
          conversation_id: string
          created_at?: string
          id?: string
          primary_topic?: string | null
          topics: string[]
        }
        Update: {
          ai_confidence?: number | null
          ai_reasoning?: string | null
          categorization_model?: string | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          primary_topic?: string | null
          topics?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agent_can_be_assigned_to_conversation: {
        Args: { _agent_id: string; _conversation_id: string }
        Returns: boolean
      }
      can_access_contact: {
        Args: { _contact_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_conversation: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
      get_available_slots: {
        Args: {
          p_duration_minutes?: number
          p_end_date: string
          p_sector_id: string
          p_start_date: string
        }
        Returns: {
          agent_id: string
          is_available: boolean
          slot_datetime: string
          slot_end_datetime: string
        }[]
      }
      get_escalation_wait_time: {
        Args: { escalation_created_at: string }
        Returns: number
      }
      get_user_effective_permissions: {
        Args: { _user_id: string }
        Returns: {
          is_enabled: boolean
          permission_key: string
          source: string
        }[]
      }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_first_user: { Args: never; Returns: boolean }
      search_knowledge_base: {
        Args: {
          p_category?: string
          p_limit?: number
          p_query: string
          p_sector_id: string
        }
        Returns: {
          category: string
          confidence_score: number
          content: string
          id: string
          relevance_score: number
          title: string
        }[]
      }
      user_belongs_to_instance: {
        Args: { _instance_id: string; _user_id: string }
        Returns: boolean
      }
      user_belongs_to_sector: {
        Args: { _sector_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "agent"
      lead_source:
        | "whatsapp"
        | "website"
        | "referral"
        | "ads"
        | "organic"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      permission_key:
        | "can_access_conversations"
        | "can_respond_conversations"
        | "can_access_kanban"
        | "can_view_global_data"
        | "can_access_admin_panel"
        | "can_send_internal_messages"
        | "can_transfer_conversations"
      sentiment_type: "positive" | "neutral" | "negative"
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
      app_role: ["admin", "supervisor", "agent"],
      lead_source: [
        "whatsapp",
        "website",
        "referral",
        "ads",
        "organic",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      permission_key: [
        "can_access_conversations",
        "can_respond_conversations",
        "can_access_kanban",
        "can_view_global_data",
        "can_access_admin_panel",
        "can_send_internal_messages",
        "can_transfer_conversations",
      ],
      sentiment_type: ["positive", "neutral", "negative"],
    },
  },
} as const
