import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import type { OwnAgent } from './marketplace-types'

export function useOwnAgents(userId: string | undefined, enabled = true) {
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<OwnAgent[]> => {
    if (!userId) return []
    const { data, error } = await supabase.from('agents')
      .select('id, creator_id, name, description, is_public, icon, color')
      .eq('creator_id', userId).order('created_at', { ascending: false }).abortSignal(signal)
    if (error || !Array.isArray(data) || data.some(agent =>
      agent.creator_id !== userId || typeof agent.id !== 'string' || typeof agent.is_public !== 'boolean')) {
      throw new Error('Impossible de charger tes agents. Réessaie.')
    }
    return data as OwnAgent[]
  }, [supabase, userId])
  const { data: ownAgents, loading, error, refetch, setData } = useAsyncResource(
    enabled && userId ? userId : null, load, [] as OwnAgent[],
  )
  const togglePublic = useCallback((agentId: string, currentlyPublic: boolean) => {
    setData(previous => previous.map(agent =>
      agent.id === agentId && agent.is_public === currentlyPublic
        ? { ...agent, is_public: !currentlyPublic } : agent))
  }, [setData])
  return { ownAgents, loading, error, loadOwnAgents: refetch, togglePublic }
}
