// =============================================================================
// AKASHA AI — useOwnAgents Hook
// Charge les agents de l'utilisateur pour publication
// =============================================================================

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import type { OwnAgent } from './marketplace-types';

export function useOwnAgents(userId: string | undefined) {
  const [ownAgents, setOwnAgents] = useState<OwnAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const loadOwnAgents = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('agents')
      .select('id, name, description, is_public, icon, color')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });
    setOwnAgents((data ?? []) as OwnAgent[]);
    setLoading(false);
  }, [userId, supabase]);

  const togglePublic = useCallback((agentId: string, currentlyPublic: boolean) => {
    setOwnAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, is_public: !currentlyPublic } : a))
    );
  }, []);

  return { ownAgents, loading, loadOwnAgents, togglePublic };
}
