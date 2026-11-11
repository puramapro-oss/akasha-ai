'use client'

// =============================================================================
// AKASHA AI — PublishModal
// Modal de publication d'agents sur la marketplace
// =============================================================================

import { X, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import type { OwnAgent } from './marketplace-types';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownAgents: OwnAgent[];
  loading: boolean;
  publishingId: string | null;
  setPublishingId: (id: string | null) => void;
  onToggleSuccess: (agentId: string, wasPublic: boolean) => void;
}

export default function PublishModal({
  isOpen,
  onClose,
  ownAgents,
  loading,
  publishingId,
  setPublishingId,
  onToggleSuccess,
}: PublishModalProps) {
  const supabase = createClient();

  const handlePublishAgent = async (agentId: string, currentlyPublic: boolean) => {
    setPublishingId(agentId);
    const { error } = await supabase
      .from('agents')
      .update({ is_public: !currentlyPublic })
      .eq('id', agentId);

    if (error) {
      toast.error('Erreur publication');
    } else {
      toast.success(
        currentlyPublic
          ? 'Agent retire de la marketplace'
          : 'Agent publie sur la marketplace !'
      );
      onToggleSuccess(agentId, currentlyPublic);
    }
    setPublishingId(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="publish-modal"
    >
      <Card className="w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Publier un agent
          </h2>
          <button aria-label="Fermer"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Choisis un de tes agents customs a rendre public sur la marketplace.
        </p>

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : ownAgents.length === 0 ? (
          <EmptyState
            title="Aucun agent custom"
            description="Cree d'abord un agent depuis la page Agents."
            action={
              <Button
                onClick={() => {
                  onClose();
                  window.location.href = '/dashboard/agents';
                }}
              >
                Aller a la page Agents
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {ownAgents.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white/5 p-3"
                data-testid={`own-agent-${a.id}`}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                  style={{ backgroundColor: (a.color ?? '#00d4ff') + '22' }}
                >
                  {a.icon ?? '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {a.name}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {a.description ?? 'Pas de description'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={a.is_public ? 'ghost' : 'secondary'}
                  onClick={() => handlePublishAgent(a.id, a.is_public)}
                  loading={publishingId === a.id}
                  icon={<Globe className="h-3.5 w-3.5" />}
                  data-testid={`publish-toggle-${a.id}`}
                >
                  {a.is_public ? 'Retirer' : 'Publier'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
