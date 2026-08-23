'use client'

// =============================================================================
// AKASHA AI — AgentCard
// Carte d'un agent dans la marketplace
// =============================================================================

import { Star, Download, ShieldCheck } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatPrice, getInitials } from '@/lib/utils';
import { ACCENT_COLORS } from './marketplace-constants';
import type { Agent } from './marketplace-types';

interface AgentCardProps {
  agent: Agent;
  index: number;
  installing: boolean;
  onInstall: () => void;
}

export default function AgentCard({
  agent,
  index,
  installing,
  onInstall,
}: AgentCardProps) {
  return (
    <Card
      className="flex flex-col gap-4 p-5"
      data-testid={`agent-card-${agent.id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-black ${
            ACCENT_COLORS[index % ACCENT_COLORS.length]
          }`}
        >
          {getInitials(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold text-[var(--text-primary)]">
              {agent.name}
            </p>
            {agent.is_verified && (
              <span title="Verifie">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--cyan)]" />
              </span>
            )}
          </div>
          {agent.creator_name && (
            <p className="text-xs text-[var(--text-muted)]">par {agent.creator_name}</p>
          )}
        </div>
      </div>

      <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
        {agent.description ?? 'Aucune description disponible.'}
      </p>

      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-[var(--gold)] fill-[var(--gold)]" />
          {agent.rating != null ? agent.rating.toFixed(1) : '—'}
        </span>
        <span className="flex items-center gap-1">
          <Download className="h-3.5 w-3.5" />
          {agent.installs_count} installs
        </span>
        <span className="ml-auto">
          {agent.price === 0 ? (
            <Badge variant="green">Gratuit</Badge>
          ) : (
            <Badge variant="gold">{formatPrice(agent.price)}</Badge>
          )}
        </span>
      </div>

      <Button
        size="sm"
        variant="secondary"
        onClick={onInstall}
        loading={installing}
        icon={<Download className="h-3.5 w-3.5" />}
        className="w-full"
        data-testid={`install-agent-${agent.id}`}
      >
        Installer
      </Button>
    </Card>
  );
}
