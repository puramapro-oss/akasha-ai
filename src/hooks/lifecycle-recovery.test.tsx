// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  A, B, actor, deferred, fail, fixture, mountHook, pending, reads, respond, liveChannels,
} from './lifecycle-recovery.test-support'
import { useConversations } from './useConversations'
import { useWallet } from './useWallet'
import { useQRCode } from '@/components/home/use-qr-code'
import { useReferralStats } from '@/components/home/use-referral-stats'
import { useCollabSpace } from './useCollabSpace'
import { useWorkflowData } from './useWorkflowData'
import { useFinancerData } from './useFinancerData'

describe('actor-scoped asynchronous reads — controlled real Supabase transport', () => {
  it('an old successful A read cannot overwrite B', async () => {
    function useProbe() { return useConversations(fixture.user?.id) }
    const view = await mountHook(useProbe)
    const oldA = pending('conversations', A)
    actor(B); await view.rerender()
    await respond(pending('conversations', B), [{ id: 'B conversation' }])
    await respond(oldA, [{ id: 'A conversation' }])
    expect(view.value.conversations).toEqual([{ id: 'B conversation' }])
  })

  it('an old A failure cannot stop the pending B spinner', async () => {
    function useProbe() { return useConversations(fixture.user?.id) }
    const view = await mountHook(useProbe)
    const oldA = pending('conversations', A)
    actor(B); await view.rerender()
    await fail(oldA)
    expect(view.value.loading).toBe(true)
    await respond(pending('conversations', B), [])
    expect(view.value.loading).toBe(false)
  })

  it('logout hides loaded private data immediately and does not stay loading', async () => {
    function useProbe() { return useConversations(fixture.user?.id) }
    const view = await mountHook(useProbe)
    await respond(pending('conversations', A), [{ id: 'private-A' }])
    actor(null); await view.rerender()
    expect(view.value.conversations).toEqual([])
    expect(view.value.loading).toBe(false)
    expect(view.container.textContent).not.toContain('private-A')
  })

  it('A to B to A gives the second A its own generation', async () => {
    function useProbe() { return useConversations(fixture.user?.id) }
    const view = await mountHook(useProbe)
    const firstA = pending('conversations', A)
    actor(B); await view.rerender()
    actor(A); await view.rerender()
    const secondA = reads.filter(read => read.url.pathname.endsWith('/conversations')
      && read.url.searchParams.get('user_id') === 'eq.' + A).at(-1)!
    expect(secondA).not.toBe(firstA)
    await respond(secondA, [{ id: 'new-A' }])
    await respond(firstA, [{ id: 'old-A' }])
    expect(view.value.conversations).toEqual([{ id: 'new-A' }])
  })

  it('a new object with the same actor does not cause another read', async () => {
    function useProbe() { return useWallet() }
    const view = await mountHook(useProbe)
    await respond(pending('wallets', A), { balance: 7, total_earned: 11 })
    const before = reads.length
    actor(A); await view.rerender()
    expect(reads).toHaveLength(before)
    expect(view.value.balance).toBe(7)
  })

  it('a signed-out wallet uses a settled empty view', async () => {
    actor(null)
    function useProbe() { return useWallet() }
    const view = await mountHook(useProbe)
    expect(view.value).toMatchObject({ balance: 0, totalEarned: 0, loading: false })
    expect(reads).toHaveLength(0)
  })

  it('refetch keeps current data while loading and the newest request wins', async () => {
    function useProbe() { return useConversations(fixture.user?.id) }
    const view = await mountHook(useProbe)
    await respond(pending('conversations', A), [{ id: 'initial' }])
    let first!: Promise<void>; let second!: Promise<void>
    await act(async () => { first = view.value.fetchConversations() })
    const older = pending('conversations', A)
    expect(view.value.conversations).toEqual([{ id: 'initial' }])
    expect(view.value.loading).toBe(true)
    await act(async () => { second = view.value.fetchConversations() })
    const newest = reads.at(-1)!
    await respond(newest, [{ id: 'fresh' }])
    await respond(older, [{ id: 'late' }])
    await act(async () => { await Promise.all([first, second]) })
    expect(view.value.conversations).toEqual([{ id: 'fresh' }])
  })

  it('cleanup aborts the real SDK request signal', async () => {
    function useProbe() { return useConversations(fixture.user?.id) }
    const view = await mountHook(useProbe)
    const request = pending('conversations', A)
    await view.unmount()
    expect(request.signal?.aborted).toBe(true)
    await respond(request, [{ id: 'after unmount' }])
  })

  it('a failed current read exposes an error and ends loading', async () => {
    function useProbe() { return useConversations(fixture.user?.id) }
    const view = await mountHook(useProbe)
    await fail(pending('conversations', A))
    expect(view.value.loading).toBe(false)
    expect('error' in view.value && view.value.error).toBeTruthy()
  })

  it('referral aggregate does not publish a partial successful zero on denial', async () => {
    function useProbe() { return useReferralStats(fixture.user?.id) }
    const view = await mountHook(useProbe)
    await respond(pending('referrals', A), null, 200, 2)
    await respond(pending('commissions', A), [{ amount: 10 }])
    await fail(pending('influencer_profiles', A))
    expect(view.value.loading).toBe(false)
    expect('error' in view.value && view.value.error).toBeTruthy()
    expect(view.value.stats.totalCommissions).toBe(0)
  })
})

describe('QR requests belong to their current URL', () => {
  it('a late prior URL cannot replace the current QR code', async () => {
    const old = deferred<string>()
    fixture.qr.mockImplementationOnce(() => old.promise).mockResolvedValueOnce('data:new')
    let url = 'https://example.invalid/old'
    function useProbe() { return useQRCode(url) }
    const view = await mountHook(useProbe)
    url = 'https://example.invalid/new'; await view.rerender()
    expect(view.value).toBe('data:new')
    await act(async () => old.resolve('data:old'))
    expect(view.value).toBe('data:new')
  })

  it('clearing the URL invalidates a still-pending QR generation', async () => {
    const old = deferred<string>()
    fixture.qr.mockImplementationOnce(() => old.promise)
    let url = 'https://example.invalid/old'
    function useProbe() { return useQRCode(url) }
    const view = await mountHook(useProbe)
    url = ''; await view.rerender()
    await act(async () => old.resolve('data:old'))
    expect(view.value).toBeNull()
    expect(fixture.qr).toHaveBeenCalledTimes(1)
  })
})


describe('subscriptions and mutation completion boundaries', () => {
  it('an early realtime insert is buffered without cancelling the initial space load', async () => {
    function useProbe() { return useCollabSpace('space-1') }
    const view = await mountHook(useProbe)
    const request = pending('collab_spaces')
    await act(async () => liveChannels[0].receive({ id: 'message-1', user_id: A, space_id: 'space-1', content: 'Hello' }))
    expect(request.signal?.aborted).toBe(false)
    expect(view.value.loading).toBe(true)
    await respond(request, { id: 'space-1', owner_id: A })
    await respond(pending('collab_members'), [])
    await respond(pending('collab_messages'), [])
    expect(view.value.space?.id).toBe('space-1')
    expect(view.value.messages.map(message => message.id)).toEqual(['message-1'])
    expect(view.value.loading).toBe(false)
  })

  it('changing actor removes the old channel and ignores its late insert', async () => {
    function useProbe() { return useCollabSpace('space-1') }
    const view = await mountHook(useProbe)
    const old = liveChannels[0]
    actor(B); await view.rerender()
    expect(old.removed).toBe(true)
    expect(liveChannels).toHaveLength(2)
    await act(async () => old.receive({ id: 'old-private-message', user_id: A, content: 'Private A' }))
    expect(view.value.messages).toEqual([])
    expect(view.container.textContent).not.toContain('Private A')
    await view.unmount()
    expect(liveChannels[1].removed).toBe(true)
  })

  it('a stale workflow action cannot dispatch, and a current denied write cannot announce success', async () => {
    function useProbe() { return useWorkflowData() }
    const view = await mountHook(useProbe)
    const oldCreate = view.value.createWorkflow
    actor(B); await view.rerender()
    await act(async () => { expect(await oldCreate('Old A workflow')).toBe(false) })
    expect(reads.filter(read => read.method === 'POST')).toHaveLength(0)
    let creation!: Promise<boolean>
    await act(async () => { creation = view.value.createWorkflow('Current B workflow') })
    const write = reads.find(read => read.method === 'POST')!
    expect(write.body).toMatchObject({ user_id: B, name: 'Current B workflow' })
    await fail(write)
    await expect(creation).resolves.toBe(false)
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalled()
  })

  it('a stalled dossier request aborts and does not report a document as generated', async () => {
    vi.useFakeTimers()
    const removal: { invoke?: () => ReturnType<ReturnType<typeof useFinancerData>['handleGeneratePDF']>; result?: ReturnType<ReturnType<typeof useFinancerData>['handleGeneratePDF']> } = {}
    function useProbe() {
      const resource = useFinancerData()
      useLayoutEffect(() => () => { removal.result = removal.invoke?.() }, [])
      return resource
    }
    const view = await mountHook(useProbe)
    await respond(pending('aides'), { aides: [] })
    await act(async () => view.value.setSelectedAides(new Set(['aide-1'])))
    let generation!: ReturnType<typeof view.value.handleGeneratePDF>
    await act(async () => { generation = view.value.handleGeneratePDF(null, null, '75', false) })
    const write = pending('dossier')
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    await expect(generation).resolves.toEqual({ success: false })
    expect(write.signal?.aborted).toBe(true)
    expect(view.value.loading).toBe(false)
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalledWith(expect.stringContaining('vérifier le dossier'))
    const captured = view.value.handleGeneratePDF
    removal.invoke = () => captured(null, null, '75', false)
    await view.unmount()
    await expect(removal.result).resolves.toEqual({ success: false })
    expect(reads.filter(read => read.url.pathname.endsWith('/dossier'))).toHaveLength(1)
  })
})
