import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import type { Agent } from './marketplace-types'

export function useMarketplaceAgents() {
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<Agent[]> => {
    const { data, error } = await supabase.from('agents').select('id, name, description, price, rating, installs_count:installs, is_verified, is_public, creator_id, category, created_at').eq('is_public', true)
      .order('installs', { ascending: false }).abortSignal(signal)
    if (error || !Array.isArray(data)) throw new Error('Impossible de charger les agents publics.')
    return (data ?? []) as Agent[]
  }, [supabase])
  const { data: agents, loading, error, refetch } = useAsyncResource('public-agents', load, [] as Agent[])
  return { agents, loading, error, fetchAgents: refetch }
}
