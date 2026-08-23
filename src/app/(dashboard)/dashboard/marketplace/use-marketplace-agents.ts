// =============================================================================
// AKASHA AI — useMarketplaceAgents Hook
// Charge les agents publics de la marketplace
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import type { Agent } from './marketplace-types';

export function useMarketplaceAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('is_public', true)
      .order('installs_count', { ascending: false });

    if (!error && data) {
      setAgents(data as Agent[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const incrementInstallCount = useCallback((agentId: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId ? { ...a, installs_count: a.installs_count + 1 } : a
      )
    );
  }, []);

  return { agents, loading, fetchAgents, incrementInstallCount };
}
