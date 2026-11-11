import type { Conversation } from '../../../src/types'

export function useAuth() {
  return {
    user: sessionStorage.getItem('fixture-user') === 'signed-out' ? null : { id: sessionStorage.getItem('fixture-user') ?? 'fixture-user' },
    plan: sessionStorage.getItem('fixture-plan') ?? 'free',
    loading: sessionStorage.getItem('fixture-auth-loading') === 'true',
  }
}
const noop = async () => {}
export function useConversations() {
  return { conversations: [] as Conversation[], loading: false, fetchConversations: noop }
}
export function useQuota() {
  return { quota: null, fetchQuota: noop }
}
export function useVoiceInput() {
  return { listening: false, toggleVoice: noop }
}
