export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type ClientAccountRow = {
  id: string
  admin_user_id: string
  name: string
  product: Product | null
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

// Convenience row types
export type TaskRow = {
  id: string
  admin_user_id: string
  product: Product
  project_id: string | null
  description: string
  week_start_date: string
  status: TaskStatus
  is_flagged: boolean
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string | null
  updated_by: string | null
}

export type ProjectRow = {
  id: string
  admin_user_id: string
  name: string
  product: Product | null
  sort_order: number
  is_visible: boolean
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

export interface TaskWithProject extends TaskRow {
  project_name: string | null
  comment_count: number
}

export type Product = 'AH' | 'NURO' | 'EH' | 'N/A'

export type EngagementType =
  | 'monthly_review'
  | 'qbr'
  | 'training'
  | 'project_call'
  | 'spontaneous'
  | 'other'

export type AccountHealthMetadata = {
  id: string
  client_account_id: string
  admin_user_id: string
  renewal_date: string | null
  renewal_date_updated_at: string | null
  renewal_date_updated_by: string | null
  last_engagement_date: string | null
  last_engagement_date_updated_at: string | null
  last_engagement_date_updated_by: string | null
  engagement_type: EngagementType | null
  engagement_type_updated_at: string | null
  engagement_type_updated_by: string | null
  updated_at: string | null
  updated_by: string | null
}
export type TaskStatus = 'open' | 'complete'
export type RelationshipStatus = 'pending' | 'accepted' | 'archived'
export type DefaultLanding = 'task_list' | 'manager_view'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          first_name: string | null
          last_name: string | null
          email: string
          role: string | null
          default_landing: DefaultLanding
          account_health_enabled: boolean
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id: string
          first_name?: string | null
          last_name?: string | null
          email: string
          role?: string | null
          default_landing?: DefaultLanding
          account_health_enabled?: boolean
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          email?: string
          role?: string | null
          default_landing?: DefaultLanding
          account_health_enabled?: boolean
          updated_at?: string | null
        }
      }
      projects: {
        Row: {
          id: string
          admin_user_id: string
          name: string
          product: Product | null
          created_at: string
          updated_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          admin_user_id: string
          name: string
          product?: Product | null
          created_at?: string
          updated_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          name?: string
          product?: Product | null
          updated_at?: string | null
          deleted_at?: string | null
        }
      }
      manager_relationships: {
        Row: {
          id: string
          admin_user_id: string
          manager_user_id: string | null
          manager_email: string
          status: RelationshipStatus
          invited_at: string
          accepted_at: string | null
        }
        Insert: {
          id?: string
          admin_user_id: string
          manager_user_id?: string | null
          manager_email: string
          status?: RelationshipStatus
          invited_at?: string
          accepted_at?: string | null
        }
        Update: {
          manager_user_id?: string | null
          status?: RelationshipStatus
          accepted_at?: string | null
        }
      }
      tasks: {
        Row: {
          id: string
          admin_user_id: string
          product: Product
          project_id: string | null
          description: string
          week_start_date: string
          status: TaskStatus
          is_flagged: boolean
          sort_order: number
          created_by: string
          created_at: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          admin_user_id: string
          product: Product
          project_id?: string | null
          description: string
          week_start_date: string
          status?: TaskStatus
          is_flagged?: boolean
          sort_order?: number
          created_by: string
          created_at?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          product?: Product
          project_id?: string | null
          description?: string
          week_start_date?: string
          status?: TaskStatus
          is_flagged?: boolean
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
      }
      task_notes: {
        Row: {
          id: string
          task_id: string
          content: string
          created_by: string
          created_at: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          task_id: string
          content: string
          created_by: string
          created_at?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content?: string
          updated_at?: string | null
          updated_by?: string | null
        }
      }
      task_comments: {
        Row: {
          id: string
          task_id: string
          content: string
          created_by: string
          created_at: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          task_id: string
          content: string
          created_by: string
          created_at?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content?: string
          updated_at?: string | null
          updated_by?: string | null
        }
      }
    }
  }
}
