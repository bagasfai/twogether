export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          published_at: string | null
          session_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          published_at?: string | null
          session_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          published_at?: string | null
          session_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          court_number: number
          created_at: string
          id: string
          session_id: string
          status: Database["public"]["Enums"]["court_status"]
          updated_at: string
        }
        Insert: {
          court_number: number
          created_at?: string
          id?: string
          session_id: string
          status?: Database["public"]["Enums"]["court_status"]
          updated_at?: string
        }
        Update: {
          court_number?: number
          created_at?: string
          id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["court_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      galleries: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          session_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          session_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          session_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "galleries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "galleries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_photos: {
        Row: {
          caption: string | null
          created_at: string
          gallery_id: string
          id: string
          sort_order: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          gallery_id: string
          id?: string
          sort_order?: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          gallery_id?: string
          id?: string
          sort_order?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_photos_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          match_id: string
          participant_id: string
          team: number
        }
        Insert: {
          match_id: string
          participant_id: string
          team: number
        }
        Update: {
          match_id?: string
          participant_id?: string
          team?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          completed_at: string | null
          court_id: string | null
          created_at: string
          id: string
          queue_position: number | null
          session_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          court_id?: string | null
          created_at?: string
          id?: string
          queue_position?: number | null
          session_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          court_id?: string | null
          created_at?: string
          id?: string
          queue_position?: number | null
          session_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          added_by: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          consented_at: string | null
          created_at: string
          id: string
          registered_at: string
          session_id: string
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          consented_at?: string | null
          created_at?: string
          id?: string
          registered_at?: string
          session_id: string
          status: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          consented_at?: string | null
          created_at?: string
          id?: string
          registered_at?: string
          session_id?: string
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles_private: {
        Row: {
          created_at: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_hosts: {
        Row: {
          added_at: string
          role: Database["public"]["Enums"]["session_host_role"]
          session_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          role?: Database["public"]["Enums"]["session_host_role"]
          session_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          role?: Database["public"]["Enums"]["session_host_role"]
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_hosts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_hosts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          court_count: number
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          id: string
          location: string
          location_url: string | null
          max_participants: number
          registration_state: Database["public"]["Enums"]["registration_state"]
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          title: string
          updated_at: string
          waitlist_capacity: number
        }
        Insert: {
          court_count?: number
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          id?: string
          location: string
          location_url?: string | null
          max_participants: number
          registration_state?: Database["public"]["Enums"]["registration_state"]
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          title: string
          updated_at?: string
          waitlist_capacity?: number
        }
        Update: {
          court_count?: number
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          id?: string
          location?: string
          location_url?: string | null
          max_participants?: number
          registration_state?: Database["public"]["Enums"]["registration_state"]
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          title?: string
          updated_at?: string
          waitlist_capacity?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_registration: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      complete_match: {
        Args: { p_match_id: string }
        Returns: {
          completed_at: string | null
          court_id: string | null
          created_at: string
          id: string
          queue_position: number | null
          session_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_match: {
        Args: {
          p_court_id: string
          p_session_id: string
          p_team1: string[]
          p_team2: string[]
        }
        Returns: {
          completed_at: string | null
          court_id: string | null
          created_at: string
          id: string
          queue_position: number | null
          session_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      host_add_participant: {
        Args: {
          p_session_id: string
          p_status?: Database["public"]["Enums"]["participant_status"]
          p_user_id: string
        }
        Returns: {
          added_by: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          consented_at: string | null
          created_at: string
          id: string
          registered_at: string
          session_id: string
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      host_set_participant_status: {
        Args: {
          p_participant_id: string
          p_status: Database["public"]["Enums"]["participant_status"]
        }
        Returns: {
          added_by: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          consented_at: string | null
          created_at: string
          id: string
          registered_at: string
          session_id: string
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_session_host: { Args: { p_session_id: string }; Returns: boolean }
      is_session_owner: { Args: { p_session_id: string }; Returns: boolean }
      member_confirm_participation: {
        Args: { p_session_id: string }
        Returns: {
          added_by: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          consented_at: string | null
          created_at: string
          id: string
          registered_at: string
          session_id: string
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_for_session: {
        Args: { p_session_id: string }
        Returns: Database["public"]["CompositeTypes"]["registration_result"]
        SetofOptions: {
          from: "*"
          to: "registration_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      session_is_public: { Args: { p_session_id: string }; Returns: boolean }
      session_lock_key: { Args: { p_session_id: string }; Returns: number }
      start_match: {
        Args: { p_match_id: string }
        Returns: {
          completed_at: string | null
          court_id: string | null
          created_at: string
          id: string
          queue_position: number | null
          session_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      waitlist_position_of: {
        Args: { p_id: string; p_registered_at: string; p_session_id: string }
        Returns: number
      }
    }
    Enums: {
      court_status: "idle" | "in_use" | "unavailable"
      match_status: "scheduled" | "in_progress" | "completed" | "cancelled"
      participant_status: "confirmed" | "waiting_list" | "cancelled"
      registration_state: "closed" | "open"
      session_host_role: "owner" | "cohost"
      session_status: "draft" | "scheduled" | "live" | "completed" | "cancelled"
      user_role: "member" | "host" | "admin"
    }
    CompositeTypes: {
      registration_result: {
        status: Database["public"]["Enums"]["participant_status"] | null
        waitlist_position: number | null
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      court_status: ["idle", "in_use", "unavailable"],
      match_status: ["scheduled", "in_progress", "completed", "cancelled"],
      participant_status: ["confirmed", "waiting_list", "cancelled"],
      registration_state: ["closed", "open"],
      session_host_role: ["owner", "cohost"],
      session_status: ["draft", "scheduled", "live", "completed", "cancelled"],
      user_role: ["member", "host", "admin"],
    },
  },
} as const

