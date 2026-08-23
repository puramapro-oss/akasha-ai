'use client'

import { Trash2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import { getInitials, formatDate } from '@/lib/utils'
import type { CollabMember, CollabSpace } from '@/types/collab'

interface CollabMembersProps {
  space: CollabSpace
  members: CollabMember[]
  userId?: string
  isOwner: boolean
  onRemoveMember: (memberId: string) => Promise<boolean>
}

export default function CollabMembers({
  space,
  members,
  userId,
  isOwner,
  onRemoveMember,
}: CollabMembersProps) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Membres ({members.length + 1})
      </h2>
      <div className="flex flex-col gap-2">
        {/* Owner */}
        <div className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] text-xs font-bold text-black">
            {getInitials(null)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {space.owner_id === userId ? 'Toi' : 'Createur'}
            </p>
            <p className="text-xs text-[var(--cyan)]">Admin</p>
          </div>
        </div>
        {members
          .filter(m => m.user_id !== space.owner_id)
          .map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-xl p-2 hover:bg-white/5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--purple)] to-[var(--pink)] text-xs font-bold text-white">
                {getInitials(m.display_name ?? m.email ?? null)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {m.display_name ?? m.email ?? 'Membre'}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{m.role}</p>
              </div>
              {isOwner && (
                <button
                  onClick={() => onRemoveMember(m.id)}
                  className="rounded-lg p-1 text-red-400 hover:bg-red-500/10"
                  aria-label="Retirer le membre"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
      </div>
      <p className="mt-4 text-[10px] text-[var(--text-muted)]">
        Cree le {formatDate(space.created_at)}
      </p>
    </Card>
  )
}
