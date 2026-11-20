// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { updatePassword, toastSuccess, toastError } = vi.hoisted(() => ({
  updatePassword: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ updatePassword }) }))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))

import PasswordChangeForm from './PasswordChangeForm'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
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

async function mount() { await act(async () => root.render(createElement(PasswordChangeForm))) }
function input(testId: string) {
  const result = container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | null
  if (!result) throw new Error(`Missing input: ${testId}`)
  return result
}
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    nativeInputValueSetter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function submitForm() {
  const form = container.querySelector('form')
  if (!form) throw new Error('Missing form')
  return form
}

describe('PasswordChangeForm — updateUser({password}) (gap ONE ID fermé)', () => {
  it('appelle updatePassword avec le nouveau mot de passe quand tout correspond', async () => {
    updatePassword.mockResolvedValueOnce({ error: null })
    await mount()
    await type(input('new-password-input'), 'nouveauMDP123')
    await type(input('confirm-password-input'), 'nouveauMDP123')
    await act(async () => { submitForm().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(updatePassword).toHaveBeenCalledWith('nouveauMDP123')
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('refuse si les 2 mots de passe ne correspondent pas, sans appeler Supabase', async () => {
    await mount()
    await type(input('new-password-input'), 'abcdef')
    await type(input('confirm-password-input'), 'abcdeg')
    await act(async () => { submitForm().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(updatePassword).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Les mots de passe ne correspondent pas')
  })

  it('refuse un mot de passe trop court avant tout appel réseau', async () => {
    await mount()
    await type(input('new-password-input'), 'abc')
    await type(input('confirm-password-input'), 'abc')
    await act(async () => { submitForm().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(updatePassword).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Le mot de passe doit contenir au moins 6 caractères')
  })

  it('affiche une erreur FR si la session de récupération a expiré', async () => {
    updatePassword.mockResolvedValueOnce({ error: { message: 'Auth session missing' } })
    await mount()
    await type(input('new-password-input'), 'nouveauMDP123')
    await type(input('confirm-password-input'), 'nouveauMDP123')
    await act(async () => { submitForm().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(toastError).toHaveBeenCalledWith('Auth session missing')
  })
})
