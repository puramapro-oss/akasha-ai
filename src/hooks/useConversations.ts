import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAsyncResource } from './useAsyncResource'
import type { Conversation } from '@/types'

export function useConversations(userId: string | undefined) {
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<Conversation[]> => {
    const { data, error } = await supabase.from('conversations').select('*')
      .eq('user_id', userId!).eq('is_archived', false)
      .order('updated_at', { ascending: false }).limit(50).abortSignal(signal)
    if (error) throw new Error('Impossible de charger les conversations.')
    return (data ?? []) as Conversation[]
  }, [userId, supabase])
  const resource = useAsyncResource(userId ?? null, load, [] as Conversation[])
  return { conversations: resource.data, loading: resource.loading, error: resource.error, fetchConversations: resource.refetch }
}
