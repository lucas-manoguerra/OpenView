// Generated from the connected OpenView Supabase project.
// Regenerate after database schema changes with the Supabase type generator.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      chart_drawings: {
        Row: {
          created_at: string;
          drawing_id: string;
          instrument_id: string;
          payload: Json;
          revision: number;
          timeframe_scope: string | null;
          updated_at: string;
          user_id: string;
          z_order: number;
        };
        Insert: {
          created_at?: string;
          drawing_id: string;
          instrument_id: string;
          payload: Json;
          revision?: number;
          timeframe_scope?: string | null;
          updated_at?: string;
          user_id: string;
          z_order?: number;
        };
        Update: {
          created_at?: string;
          drawing_id?: string;
          instrument_id?: string;
          payload?: Json;
          revision?: number;
          timeframe_scope?: string | null;
          updated_at?: string;
          user_id?: string;
          z_order?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
