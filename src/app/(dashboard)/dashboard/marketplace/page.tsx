'use client'

// =============================================================================
// AKASHA AI — Marketplace Page
// Marketplace d'agents de la communauté
// =============================================================================

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import { useMarketplaceAgents } from './use-marketplace-agents';
import { useOwnAgents } from './use-own-agents';
import SearchAndFilters from './SearchAndFilters';
import AgentsGrid from './AgentsGrid';
import PublishModal from './PublishModal';
import type { Agent, FilterType } from './marketplace-types';

export default function MarketplacePage() {
  const { user } = useAuth();
  const { agents, loading, fetchAgents, incrementInstallCount } = useMarketplaceAgents();
  const { ownAgents, loading: loadingOwn, loadOwnAgents, togglePublic } = useOwnAgents(user?.id);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [installing, setInstalling] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const supabase = createClient();

  const openPublishModal = useCallback(async () => {
    if (!user) {
      toast.error('Connecte-toi pour publier un agent');
      return;
    }
    setShowPublish(true);
    await loadOwnAgents();
  }, [user, loadOwnAgents]);

  const closePublishModal = useCallback(() => {
    setShowPublish(false);
  }, []);

  const handleInstall = async (agent: Agent) => {
    if (!user) {
      toast.error('Connecte-toi pour installer cet agent');
      return;
    }
    setInstalling(agent.id);
    const { error } = await supabase
      .from('agent_installs')
      .upsert({ agent_id: agent.id, user_id: user.id }, { onConflict: 'agent_id,user_id' });

    if (error) {
      toast.error('Erreur lors de l\'installation');
    } else {
      toast.success(`Agent "${agent.name}" installe !`);
      incrementInstallCount(agent.id);
    }
    setInstalling(null);
  };

  const handleToggleSuccess = useCallback((agentId: string, wasPublic: boolean) => {
    togglePublic(agentId, wasPublic);
    fetchAgents();
  }, [togglePublic, fetchAgents]);

  const filtered = agents.filter((a) => {
    const matchSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.description ?? '').toLowerCase().includes(search.toLowerCase());

    let matchFilter = true;
    if (filter === 'free') matchFilter = a.price === 0;
    if (filter === 'premium') matchFilter = a.price > 0;

    return matchSearch && matchFilter;
  });

  const sortedAgents =
    filter === 'new'
      ? [...filtered].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      : filtered;

  return (
    <div className="flex flex-col gap-6" data-testid="marketplace-page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
            Marketplace
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Decouvre les agents de la communaute
          </p>
        </div>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={openPublishModal}
          data-testid="open-publish-btn"
        >
          Publier un agent
        </Button>
      </div>

      <SearchAndFilters
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
      />

      <AgentsGrid
        agents={sortedAgents}
        loading={loading}
        installing={installing}
        search={search}
        onInstall={handleInstall}
        onOpenPublish={openPublishModal}
      />

      <PublishModal
        isOpen={showPublish}
        onClose={closePublishModal}
        ownAgents={ownAgents}
        loading={loadingOwn}
        publishingId={publishingId}
        setPublishingId={setPublishingId}
        onToggleSuccess={handleToggleSuccess}
      />
    </div>
  );
}
