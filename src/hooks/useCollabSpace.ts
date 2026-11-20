import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource } from './useAsyncResource'
import type { CollabSpace, CollabMember, CollabMessage } from '@/types/collab'

type SpaceView = { space: CollabSpace | null; members: CollabMember[]; messages: CollabMessage[] }
export function useCollabSpace(spaceId: string) {
  const router = useRouter()
  const { user } = useAuth()
  const userId = user?.id
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<SpaceView> => {
    const space = await supabase.from('collab_spaces').select('*').eq('id', spaceId).abortSignal(signal).maybeSingle()
    if (space.error) throw new Error('Impossible de charger cet espace.')
    if (!space.data) throw new Error('Espace introuvable')
    const [members, messages] = await Promise.all([
      supabase.from('collab_members').select('id, user_id, role, joined_at').eq('space_id', spaceId).abortSignal(signal),
      supabase.from('collab_messages').select('*').eq('space_id', spaceId)
        .order('created_at', { ascending: true }).limit(200).abortSignal(signal),
    ])
    if (members.error || messages.error) throw new Error('Impossible de charger les membres et messages.')
    let enrichedMembers = (members.data ?? []) as CollabMember[]
    let enrichedMessages = (messages.data ?? []) as CollabMessage[]
    if (enrichedMembers.length) {
      const profiles = await supabase.from('profiles').select('id, display_name, email')
        .in('id', enrichedMembers.map(member => member.user_id)).abortSignal(signal)
      if (profiles.error) throw new Error('Impossible de charger les membres.')
      const byId = new Map((profiles.data ?? []).map(profile => [profile.id, profile]))
      enrichedMembers = enrichedMembers.map(member => ({
        ...member, display_name: byId.get(member.user_id)?.display_name ?? null, email: byId.get(member.user_id)?.email ?? null,
      }))
    }
    if (enrichedMessages.length) {
      const profiles = await supabase.from('profiles').select('id, display_name')
        .in('id', Array.from(new Set(enrichedMessages.map(message => message.user_id)))).abortSignal(signal)
      if (profiles.error) throw new Error('Impossible de charger les auteurs.')
      const names = new Map((profiles.data ?? []).map(profile => [profile.id, profile.display_name]))
      enrichedMessages = enrichedMessages.map(message => ({ ...message, display_name: names.get(message.user_id) ?? null }))
    }
    return { space: space.data as CollabSpace, members: enrichedMembers, messages: enrichedMessages }
  }, [spaceId, supabase])
  const resource = useAsyncResource<SpaceView>(userId && spaceId ? userId + ':' + spaceId : null, load, { space: null, members: [], messages: [] })
  const { isCurrent, refetch, error } = resource
  const [live, setLive] = useState<{ owner: () => boolean; messages: CollabMessage[] } | null>(null)
  const [sendingOwner, setSendingOwner] = useState<(() => boolean) | null>(null)
  const sending = sendingOwner === isCurrent
  const known = new Set(resource.data.messages.map(message => message.id))
  const messages = [...resource.data.messages, ...(live?.owner === isCurrent ? live.messages.filter(message => !known.has(message.id)) : [])]

  useEffect(() => {
    if (!error) return
    toast.error(error.message)
    if (error.message === 'Espace introuvable') router.push('/dashboard/collab')
  }, [error, router])

  useEffect(() => {
    if (!userId || !spaceId) return
    const channel = supabase.channel('collab-' + spaceId + '-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'akasha_ai', table: 'collab_messages', filter: 'space_id=eq.' + spaceId },
        payload => {
          if (!isCurrent()) return
          const message = payload.new as CollabMessage
          setLive(previous => {
            const before = previous?.owner === isCurrent ? previous.messages : []
            return { owner: isCurrent, messages: before.some(item => item.id === message.id) ? before : [...before, message] }
          })
        }).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [spaceId, userId, supabase, isCurrent])

  const sendMessage = async (content: string) => {
    if (!userId || !isCurrent() || sending) return false
    setSendingOwner(() => isCurrent)
    try {
      const { error } = await supabase.from('collab_messages').insert({ space_id: spaceId, user_id: userId, content })
      if (!isCurrent()) return false
      if (error) throw new Error('Erreur envoi')
      return true
    } catch {
      if (isCurrent()) toast.error('Erreur envoi')
      return false
    } finally {
      if (isCurrent()) setSendingOwner(null)
    }
  }
  const inviteMember = async (email: string) => {
    if (!userId || !isCurrent()) return false
    try {
      const target = await supabase.from('profiles').select('id').eq('email', email.trim().toLowerCase()).maybeSingle()
      if (!isCurrent()) return false
      if (target.error) throw new Error('Erreur invitation')
      if (!target.data) { toast.error('Aucun utilisateur AKASHA avec cet email'); return false }
      const { error } = await supabase.from('collab_members').insert({ space_id: spaceId, user_id: target.data.id, role: 'editor' })
      if (!isCurrent()) return false
      if (error) {
        if (error.code === '23505') toast.info('Deja membre')
        else toast.error('Erreur invitation')
        return false
      }
      toast.success('Membre ajoute !')
      await refetch()
      return isCurrent()
    } catch {
      if (isCurrent()) toast.error('Erreur invitation')
      return false
    }
  }
  const removeMember = async (memberId: string) => {
    if (!userId || !isCurrent()) return false
    try {
      const { error } = await supabase.from('collab_members').delete().eq('id', memberId).eq('space_id', spaceId)
      if (!isCurrent()) return false
      if (error) throw new Error('Erreur suppression')
      toast.success('Membre retire')
      await refetch()
      return isCurrent()
    } catch {
      if (isCurrent()) toast.error('Erreur suppression')
      return false
    }
  }
  return { space: resource.data.space, members: resource.data.members, messages, loading: resource.loading, error,
    sending, sendMessage, inviteMember, removeMember, isOwner: !!userId && resource.data.space?.owner_id === userId }
}
