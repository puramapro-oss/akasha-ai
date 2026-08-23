'use client'

// =============================================================================
// AKASHA AI — AgentsGrid
// Grille d'agents marketplace avec états loading/empty
// =============================================================================

import { Store } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import AgentCard from './AgentCard';
import type { Agent } from './marketplace-types';

interface AgentsGridProps {
  agents: Agent[];
  loading: boolean;
  installing: string | null;
  search: string;
  onInstall: (agent: Agent) => void;
  onOpenPublish: () => void;
}

export default function AgentsGrid({
  agents,
  loading,
  installing,
  search,
  onInstall,
  onOpenPublish,
}: AgentsGridProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={<Store className="h-10 w-10" />}
        title={search ? 'Aucun resultat' : 'Aucun agent publie pour le moment'}
        description={
          search
            ? 'Essaie avec d\'autres mots-cles.'
            : 'Sois le premier a publier un agent sur la marketplace.'
        }
        action={
          !search ? <Button onClick={onOpenPublish}>Publier un agent</Button> : undefined
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="agents-grid">
      {agents.map((agent, idx) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          index={idx}
          installing={installing === agent.id}
          onInstall={() => onInstall(agent)}
        />
      ))}
    </div>
  );
}
