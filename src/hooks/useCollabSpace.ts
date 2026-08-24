import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { CollabSpace, CollabMember, CollabMessage } from '@/types/collab'

export function useCollabSpace(spaceId: string) {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()

  const [space, setSpace] = useState<CollabSpace | null>(null)
  const [members, setMembers] = useState<CollabMember[]>([])
  const [messages, setMessages] = useState<CollabMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Space
    const { data: s } = await supabase
      .from('collab_spaces')
      .select('*')
      .eq('id', spaceId)
      .single()

    if (!s) {
      toast.error('Espace introuvable')
      router.push('/dashboard/collab')
      return
    }
    setSpace(s as CollabSpace)

    // Members
    const { data: rawMembers } = await supabase
      .from('collab_members')
      .select('id, user_id, role, joined_at')
      .eq('space_id', spaceId)

    let enrichedMembers: CollabMember[] = (rawMembers ?? []) as CollabMember[]
    if (enrichedMembers.length > 0) {
      const userIds = enrichedMembers.map(m => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', userIds)
      const profMap = new Map(
        (profiles ?? []).map(
          (p: { id: string; display_name: string | null; email: string | null }) => [p.id, p]
        )
      )
      enrichedMembers = enrichedMembers.map(m => ({
        ...m,
        display_name: profMap.get(m.user_id)?.display_name ?? null,
        email: profMap.get(m.user_id)?.email ?? null,
      }))
    }
    setMembers(enrichedMembers)

    // Messages
    const { data: rawMsgs } = await supabase
      .from('collab_messages')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: true })
      .limit(200)

    let msgs: CollabMessage[] = (rawMsgs ?? []) as CollabMessage[]
    if (msgs.length > 0) {
      const ids = Array.from(new Set(msgs.map(m => m.user_id)))
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', ids)
      const profMap = new Map(
        (profiles ?? []).map((p: { id: string; display_name: string | null }) => [
          p.id,
          p.display_name,
        ])
      )
      msgs = msgs.map(m => ({ ...m, display_name: profMap.get(m.user_id) ?? null }))
    }
    setMessages(msgs)

    setLoading(false)
  }, [spaceId, supabase, user, router])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Realtime subscription
  useEffect(() => {
    if (!spaceId) return
    const channel = supabase
      .channel(`collab-${spaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'akasha_ai',
          table: 'collab_messages',
          filter: `space_id=eq.${spaceId}`,
        },
        (payload) => {
          const msg = payload.new as CollabMessage
          setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [spaceId, supabase])

  const sendMessage = async (content: string) => {
    if (!user || sending) return false
    setSending(true)
    const { error } = await supabase.from('collab_messages').insert({
      space_id: spaceId,
      user_id: user.id,
      content,
    })
    if (error) {
      toast.error('Erreur envoi')
      setSending(false)
      return false
    }
    setSending(false)
    return true
  }

  const inviteMember = async (email: string) => {
    if (!user) return false

    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (!targetProfile) {
      toast.error('Aucun utilisateur AKASHA avec cet email')
      return false
    }

    const { error } = await supabase.from('collab_members').insert({
      space_id: spaceId,
      user_id: targetProfile.id,
      role: 'editor',
    })

    if (error) {
      if (error.code === '23505') toast.info('Deja membre')
      else toast.error('Erreur invitation')
      return false
    }

    toast.success('Membre ajoute !')
    loadAll()
    return true
  }

  const removeMember = async (memberId: string) => {
    const { error } = await supabase.from('collab_members').delete().eq('id', memberId)
    if (error) {
      toast.error('Erreur suppression')
      return false
    }
    toast.success('Membre retire')
    loadAll()
    return true
  }

  return {
    space,
    members,
    messages,
    loading,
    sending,
    sendMessage,
    inviteMember,
    removeMember,
    isOwner: space?.owner_id === user?.id,
  }
}
