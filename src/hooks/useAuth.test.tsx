// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { updateUser, getSession, onAuthStateChange } = vi.hoisted(() => ({
  updateUser: vi.fn(),
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
}))

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: { getSession, onAuthStateChange, updateUser },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
  }),
}))

import { useAuth } from './useAuth'

let root: Root
let container: HTMLDivElement
let latest: ReturnType<typeof useAuth>

function Harness({ onRender }: { onRender: (value: ReturnType<typeof useAuth>) => void }) {
  const value = useAuth()
  useEffect(() => { onRender(value) })
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue({ data: { session: null } })
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function mount() {
  await act(async () => root.render(createElement(Harness, { onRender: (value) => { latest = value } })))
}

describe('useAuth.updatePassword — ferme l\'impasse mot de passe oublié (ONE ID T2)', () => {
  it('appelle réellement supabase.auth.updateUser({password})', async () => {
    updateUser.mockResolvedValueOnce({ error: null })
    await mount()
    const { error } = await act(async () => latest.updatePassword('motDePasseNeuf1'))
    expect(updateUser).toHaveBeenCalledWith({ password: 'motDePasseNeuf1' })
    expect(error).toBeNull()
  })

  it('propage l\'erreur Supabase (ex: session de récupération expirée)', async () => {
    updateUser.mockResolvedValueOnce({ error: { message: 'Auth session missing' } })
    await mount()
    const { error } = await act(async () => latest.updatePassword('motDePasseNeuf1'))
    expect(error?.message).toBe('Auth session missing')
  })
})
