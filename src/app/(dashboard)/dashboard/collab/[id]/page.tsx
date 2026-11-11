'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useCollabSpace } from '@/hooks/useCollabSpace'
import CollabChat from '@/components/collab/CollabChat'
import CollabMembers from '@/components/collab/CollabMembers'
import InviteModal from '@/components/collab/InviteModal'

export default function CollabSpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const [showInvite, setShowInvite] = useState(false)

  const {
    space,
    members,
    messages,
    loading,
    sending,
    sendMessage,
    inviteMember,
    removeMember,
    isOwner,
  } = useCollabSpace(id)

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (!space) return null

  return (
    <div className="flex flex-col gap-6" data-testid="collab-space-detail">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link aria-label="Retour"
          href="/dashboard/collab"
          className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
            {space.name}
          </h1>
          {space.description && (
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{space.description}</p>
          )}
        </div>
        {isOwner && (
          <Button
            icon={<UserPlus className="h-4 w-4" />}
            onClick={() => setShowInvite(true)}
            data-testid="invite-member-btn"
          >
            Inviter
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <CollabChat
          messages={messages}
          userId={user?.id}
          sending={sending}
          onSend={sendMessage}
        />
        <CollabMembers
          space={space}
          members={members}
          userId={user?.id}
          isOwner={isOwner}
          onRemoveMember={removeMember}
        />
      </div>

      <InviteModal show={showInvite} onClose={() => setShowInvite(false)} onInvite={inviteMember} />
    </div>
  )
}
