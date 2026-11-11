import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import type { Agent } from './marketplace-types'

export function useMarketplaceAgents() {
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<Agent[]> => {
    const { data, error } = await supabase.from('agents').select('*').eq('is_public', true)
      .order('installs_count', { ascending: false }).abortSignal(signal)
    if (error) throw new Error('Impossible de charger les agents publics.')
    return (data ?? []) as Agent[]
  }, [supabase])
  const { data: agents, loading, error, refetch, setData } = useAsyncResource('public-agents', load, [] as Agent[])
  const incrementInstallCount = useCallback((agentId: string) => {
    setData(previous => previous.map(agent => agent.id === agentId
      ? { ...agent, installs_count: agent.installs_count + 1 } : agent))
  }, [setData])
  return { agents, loading, error, fetchAgents: refetch, incrementInstallCount }
}
