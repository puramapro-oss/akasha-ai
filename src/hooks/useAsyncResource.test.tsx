// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ASYNC_RESOURCE_TIMEOUT_MS, useAsyncResource } from './useAsyncResource'
import { deferred, mountHook } from './lifecycle-recovery.test-support'

describe('useAsyncResource bounded lifecycle', () => {
  it('a blocked load reaches a real deadline, aborts and reports a retryable read error', async () => {
    vi.useFakeTimers()
    const blocked = deferred<string>()
    let signal!: AbortSignal
    const loader = vi.fn((value: AbortSignal) => { signal = value; return blocked.promise })
    function useProbe() { return useAsyncResource('A', loader, '') }
    const view = await mountHook(useProbe)
    expect(view.value.loading).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(ASYNC_RESOURCE_TIMEOUT_MS) })
    expect(signal.aborted).toBe(true)
    expect(view.value.loading).toBe(false)
    expect(view.value.error?.message).toContain('délai')
    await act(async () => blocked.resolve('too late'))
    expect(view.value.data).toBe('')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('StrictMode cleans up its first subscription and accepts the replacement only', async () => {
    const jobs: Array<{ signal: AbortSignal; task: ReturnType<typeof deferred<string>> }> = []
    const loader = (signal: AbortSignal) => {
      const task = deferred<string>(); jobs.push({ signal, task }); return task.promise
    }
    function useProbe() { return useAsyncResource('A', loader, '') }
    const view = await mountHook(useProbe, true)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].signal.aborted).toBe(true)
    expect(jobs[1].signal.aborted).toBe(false)
    await act(async () => jobs[1].task.resolve('current'))
    await act(async () => jobs[0].task.resolve('obsolete'))
    expect(view.value.data).toBe('current')
    await view.unmount()
    expect(jobs[1].signal.aborted).toBe(false)
  })

  it('a local update cancels an older read instead of being overwritten by it', async () => {
    const task = deferred<number>()
    let signal!: AbortSignal
    const loader = (value: AbortSignal) => { signal = value; return task.promise }
    function useProbe() { return useAsyncResource('A', loader, 0) }
    const view = await mountHook(useProbe)
    await act(async () => view.value.setData(value => value + 5))
    expect(signal.aborted).toBe(true)
    await act(async () => task.resolve(2))
    expect(view.value.data).toBe(5)
    expect(view.value.loading).toBe(false)
  })

  it('the captured updater and current check lose authority after the scope changes', async () => {
    let key: string | null = 'A'
    const loader = async () => 'loaded'
    function useProbe() { return useAsyncResource(key, loader, '') }
    const view = await mountHook(useProbe)
    const old = view.value
    key = 'B'; await view.rerender()
    expect(old.isCurrent()).toBe(false)
    await act(async () => old.setData('private A mutation'))
    expect(view.value.data).toBe('loaded')
    key = null; await view.rerender()
    expect(view.value).toMatchObject({ data: '', loading: false, error: null })
  })

  it('refetch promises settle when the scope is invalidated', async () => {
    let key: string | null = 'A'
    const loader = () => new Promise<string>(() => undefined)
    function useProbe() { return useAsyncResource(key, loader, '') }
    const view = await mountHook(useProbe)
    let result!: Promise<void>
    await act(async () => { result = view.value.refetch() })
    key = null; await view.rerender()
    await expect(result).resolves.toBeUndefined()
    expect(view.value.loading).toBe(false)
  })

  it('a synchronous loader exception is an explicit settled error', async () => {
    const loader = (): Promise<string> => { throw new Error('controlled read failure') }
    function useProbe() { return useAsyncResource('A', loader, '') }
    const view = await mountHook(useProbe)
    expect(view.value.loading).toBe(false)
    expect(view.value.error?.message).toBe('controlled read failure')
  })

  it('equivalent rerenders preserve stable refresh and seed identity', async () => {
    const loader = async () => ['current']
    function useProbe() { return useAsyncResource('A', loader, [] as string[]) }
    const view = await mountHook(useProbe)
    const refresh = view.value.refetch
    const update = view.value.setData
    await view.rerender()
    expect(view.value.refetch).toBe(refresh)
    expect(view.value.setData).toBe(update)
    expect(view.value.data).toEqual(['current'])
  })
})


describe('commit boundary and nullable resource values', () => {
  it('revokes the previous scope before a new commit can invoke its captured callback', async () => {
    let key = 'A'
    let oldCurrent: () => boolean = () => false
    const observed: boolean[] = []
    const loader = async () => 'value'
    function useProbe() {
      const resource = useAsyncResource(key, loader, '')
      useLayoutEffect(() => { if (key === 'B') observed.push(oldCurrent?.() ?? false) }, [resource])
      return resource
    }
    const view = await mountHook(useProbe)
    oldCurrent = view.value.isCurrent
    key = 'B'; await view.rerender()
    expect(observed[0]).toBe(false)
  })

  it('preserves a valid nullable result instead of substituting the seed', async () => {
    const loader = async (): Promise<string | null> => null
    function useProbe() { return useAsyncResource<string | null>('A', loader, 'neutral') }
    const view = await mountHook(useProbe)
    expect(view.value.data).toBeNull()
  })
})
