import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Conversation } from '@/types'

export function useConversations(userId: string | undefined) {
  const supabase = createClient()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false })
        .limit(50)
      setConversations((data as Conversation[]) ?? [])
    } catch {
      // graceful
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  return { conversations, loading, fetchConversations }
}
