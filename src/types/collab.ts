export interface CollabSpace {
  id: string
  name: string
  description: string | null
  owner_id: string
  created_at: string
}

export interface CollabMember {
  id: string
  user_id: string
  role: string
  joined_at: string
  display_name?: string | null
  email?: string | null
}

export interface CollabMessage {
  id: string
  user_id: string
  content: string
  created_at: string
  display_name?: string | null
}
