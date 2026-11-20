// @vitest-environment jsdom
import { act, createElement, StrictMode, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'
import type { Profile } from '@/types'
const mocks = vi.hoisted(() => ({
  session: vi.fn(), profile: vi.fn(), signup: vi.fn(), signin: vi.fn(), oauth: vi.fn(), signout: vi.fn(), reset: vi.fn(), update: vi.fn(),
  listeners: [] as { callback: (event: AuthChangeEvent, session: Session | null) => unknown; active: boolean }[],
  signals: [] as AbortSignal[], callbackResults: [] as unknown[],
}))
vi.mock('@/lib/supabase', () => {
  const client = {
    auth: {
      getSession: mocks.session, signInWithPassword: mocks.signin, signUp: mocks.signup,
      signInWithOAuth: mocks.oauth, signOut: mocks.signout, resetPasswordForEmail: mocks.reset, updateUser: mocks.update,
      onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => unknown) {
        const entry = { callback, active: true }; mocks.listeners.push(entry)
        return { data: { subscription: { unsubscribe: () => { entry.active = false } } } }
      },
    },
    from() { return { select() { return { eq(_column: string, id: string) {
      const chain = { single() { return chain }, abortSignal(signal: AbortSignal) { mocks.signals.push(signal); return chain },
        then(yes: (value: unknown) => unknown, no?: (reason: unknown) => unknown) { return Promise.resolve(mocks.profile(id)).then(yes, no) } }
      return chain
    } } } } },
  }
  return { createClient: () => client }
})
import { useAuth } from './useAuth'
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function session(id: string, token = id): Session { return { user: { id, email: `${id}@example.invalid` }, access_token: token, refresh_token: 'fixture', expires_in: 3600, token_type: 'bearer' } as Session }
function profile(id: string, role: Profile['role'] = 'user'): Profile { return { id, email: `${id}@example.invalid`, display_name: id, role, plan: 'complete' } as Profile }
const A = session('A'), B = session('B'), PA = profile('A','admin'), PB = profile('B')
let root: Root, container: HTMLDivElement, live: ReturnType<typeof useAuth>, mounted = false
function Harness({ onRender }: { onRender: (value: ReturnType<typeof useAuth>) => void }) {
  const value = useAuth(); useEffect(() => { onRender(value) }); return null
}
async function mount(strict = false) {
  await act(async () => { const node = createElement(Harness, { onRender: value => { live = value } }); root.render(strict ? createElement(StrictMode, null, node) : node) })
  mounted = true
}
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
async function emit(event: AuthChangeEvent, value: Session | null) {
  await act(async () => {
    for (const l of [...mocks.listeners]) if (l.active) {
      const result = l.callback(event,value); mocks.callbackResults.push(result)
      if (result instanceof Promise) void result.catch(() => undefined)
    }
  })
}
async function settle<T>(d: ReturnType<typeof deferred<T>>, value: T) { await act(async () => { d.resolve(value); await Promise.resolve() }) }
const stateError = () => (live as ReturnType<typeof useAuth> & { error?: string | null }).error
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); mocks.listeners.length=0; mocks.signals.length=0; mocks.callbackResults.length=0
  mocks.session.mockResolvedValue({ data: { session: null }, error: null })
  mocks.profile.mockImplementation((id: string) => Promise.resolve({ data: id==='A'?PA:PB, error: null }))
  for (const mock of [mocks.signin,mocks.signup,mocks.oauth,mocks.signout,mocks.reset,mocks.update]) mock.mockResolvedValue({ error: null })
  const store = new Map<string,string>()
  vi.stubGlobal('localStorage', { getItem: (k:string)=>store.get(k)??null, setItem: (k:string,v:string)=>store.set(k,String(v)), removeItem:(k:string)=>store.delete(k), clear:()=>store.clear(), key:(i:number)=>[...store.keys()][i]??null, get length(){return store.size} })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true); container=document.createElement('div'); document.body.append(container); root=createRoot(container)
})
afterEach(async () => { if(mounted) await act(async()=>root.unmount()); mounted=false;container.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks() })
describe('auth identity lifecycle', () => {
  it('initial signed-out session finishes without a profile request', async()=>{
    await mount();await tick();expect(live.loading).toBe(false);expect(live.user).toBeNull();expect(mocks.profile).not.toHaveBeenCalled()
  })
  it('profile load preserves one subscription and does not re-read the session',async()=>{
    mocks.session.mockResolvedValue({data:{session:A},error:null});await mount();await tick()
    expect(live.profile?.id).toBe('A');expect(mocks.listeners).toHaveLength(1);expect(mocks.session).toHaveBeenCalledOnce()
  })
  it('auth callback returns synchronously before any profile API request',async()=>{
    await mount();await tick();await emit('SIGNED_IN',A)
    expect(mocks.callbackResults.at(-1)).toBeUndefined();expect(mocks.profile).not.toHaveBeenCalled();await tick();expect(live.profile?.id).toBe('A')
  })
  it('initial session resolving after sign-in cannot replace the newer account',async()=>{
    const old=deferred<{data:{session:Session|null}}>();mocks.session.mockReturnValue(old.promise);await mount()
    await emit('SIGNED_IN',B);await tick();await settle(old,{data:{session:A}});await tick()
    expect(live.user?.id).toBe('B');expect(live.profile?.id).toBe('B')
  })
  it('late INITIAL_SESSION cannot undo an observed sign-out',async()=>{
    await mount();await emit('SIGNED_OUT',null);await emit('INITIAL_SESSION',A);await tick()
    expect(live.user).toBeNull();expect(live.profile).toBeNull()
  })
  it('switching accounts immediately clears the former profile and privileges',async()=>{
    await mount();await emit('SIGNED_IN',A);await tick();expect(live.isAdmin).toBe(true)
    const next=deferred<{data:Profile}>();mocks.profile.mockReturnValue(next.promise)
    await emit('SIGNED_IN',B)
    expect(live.user?.id).toBe('B');expect(live.profile).toBeNull();expect(live.isAdmin).toBe(false);expect(live.plan).toBe('free')
    await tick();await settle(next,{data:PB})
  })
  it('late profile from A cannot overwrite current B',async()=>{
    const a=deferred<{data:Profile}>(), b=deferred<{data:Profile}>();mocks.profile.mockImplementation((id:string)=>id==='A'?a.promise:b.promise)
    await mount();await emit('SIGNED_IN',A);await tick();await emit('SIGNED_IN',B);await tick()
    await settle(b,{data:PB});await settle(a,{data:PA});await tick()
    expect(live.user?.id).toBe('B');expect(live.profile?.id).toBe('B');expect(live.isAdmin).toBe(false)
  })
  it('late profile after sign-out cannot restore administrative flags',async()=>{
    const a=deferred<{data:Profile}>();mocks.profile.mockReturnValue(a.promise);await mount();await emit('SIGNED_IN',A);await tick()
    await emit('SIGNED_OUT',null);await settle(a,{data:PA});await tick()
    expect(live.user).toBeNull();expect(live.profile).toBeNull();expect(live.isAdmin).toBe(false)
  })
  it('token refresh updates the token without redundant profile reads',async()=>{
    await mount();await emit('SIGNED_IN',A);await tick();const before=mocks.profile.mock.calls.length
    await emit('TOKEN_REFRESHED',session('A','new-token'));await tick()
    expect(live.session?.access_token).toBe('new-token');expect(mocks.profile.mock.calls.length).toBe(before)
  })
  it('repeated confirmation of the same session does not create duplicate requests',async()=>{
    const a=deferred<{data:Profile}>();mocks.profile.mockReturnValue(a.promise);await mount()
    await emit('SIGNED_IN',A);await tick();await emit('SIGNED_IN',A);await emit('TOKEN_REFRESHED',session('A','fresh'));await tick()
    expect(mocks.profile).toHaveBeenCalledTimes(1);await settle(a,{data:PA})
  })
  it('profile with another identity is rejected even if administrative',async()=>{
    mocks.profile.mockResolvedValue({data:PA,error:null});await mount();await emit('SIGNED_IN',B);await tick()
    expect(live.profile).toBeNull();expect(live.isAdmin).toBe(false);expect(stateError()).toBeTruthy()
  })
  it('profile error clears loading, cannot grant permissions and remains recoverable',async()=>{
    mocks.profile.mockResolvedValue({data:null,error:{message:'private database error'}});await mount();await emit('SIGNED_IN',A);await tick()
    expect(live.loading).toBe(false);expect(live.profile).toBeNull();expect(stateError()).toBeTruthy();expect(stateError()).not.toContain('private')
    mocks.profile.mockResolvedValue({data:PA,error:null});let retry!:Promise<void>;act(()=>{retry=live.refetch()});await tick();await act(async()=>{await retry})
    expect(live.profile?.id).toBe('A');expect(stateError()).toBeNull()
  })
  it('old manual refresh cannot overwrite a more recent refresh',async()=>{
    await mount();await emit('SIGNED_IN',A);await tick()
    const a=deferred<{data:Profile}>(),b=deferred<{data:Profile}>();mocks.profile.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    let pa!:Promise<void>,pb!:Promise<void>;act(()=>{pa=live.refetch()});await tick();act(()=>{pb=live.refetch()});await tick()
    await settle(b,{data:{...PA,display_name:'new'}});await settle(a,{data:{...PA,display_name:'old'}});await act(async()=>{await Promise.all([pa,pb])})
    expect(live.profile?.display_name).toBe('new')
  })
  it('profile timeout clears loading and ignores a late success',async()=>{
    const a=deferred<{data:Profile}>();mocks.profile.mockReturnValue(a.promise);await mount();await emit('SIGNED_IN',A);await tick()
    await tick(15001);const stopped=!live.loading;await settle(a,{data:PA});await tick()
    expect(stopped).toBe(true);expect(live.profile).toBeNull();expect(stateError()).toBeTruthy()
  })
  it('session timeout cannot be undone by a late bootstrap result',async()=>{
    const a=deferred<{data:{session:Session}}> ();mocks.session.mockReturnValue(a.promise);await mount();await tick(15001)
    const stopped=!live.loading;await settle(a,{data:{session:A}});await tick()
    expect(stopped).toBe(true);expect(live.user).toBeNull();expect(stateError()).toBeTruthy()
  })
  it('returned session error produces a recoverable safe state',async()=>{
    mocks.session.mockResolvedValue({data:{session:null},error:{message:'secret auth failure'}});await mount();await tick()
    expect(live.loading).toBe(false);expect(stateError()).toBeTruthy();expect(stateError()).not.toContain('secret')
  })
  it('unmount aborts pending profile work and removes its listener',async()=>{
    const a=deferred<{data:Profile}>();mocks.profile.mockReturnValue(a.promise);await mount();await emit('SIGNED_IN',A);await tick()
    const signals=[...mocks.signals];await act(async()=>root.unmount());mounted=false;await settle(a,{data:PA})
    expect(signals.length).toBeGreaterThan(0);expect(signals.every(s=>s.aborted)).toBe(true);expect(mocks.listeners.every(l=>!l.active)).toBe(true)
  })
  it('StrictMode setup/cleanup leaves only the current subscription',async()=>{
    await mount(true);await tick();expect(mocks.listeners.filter(l=>l.active)).toHaveLength(1)
    await emit('SIGNED_IN',A);await tick();expect(live.user?.id).toBe('A');expect(mocks.listeners.filter(l=>l.active)).toHaveLength(1)
  })
  it('unknown profile plan is rejected instead of being forwarded as an entitlement',async()=>{
    mocks.profile.mockResolvedValue({data:{...PA,plan:'unlimited-magic'},error:null});await mount();await emit('SIGNED_IN',A);await tick()
    expect(live.plan).toBe('free');expect(live.isAdmin).toBe(false);expect(stateError()).toBeTruthy()
  })
  it('auth update forces a fresh profile before displaying its new privileges',async()=>{
    await mount();await emit('SIGNED_IN',A);await tick();mocks.profile.mockResolvedValue({data:{...PA,role:'user',plan:'free'},error:null})
    await emit('USER_UPDATED',A);await tick();expect(live.isAdmin).toBe(false);expect(live.plan).toBe('free')
  })
  it('failed sign-out preserves unrelated storage and returns the SDK error',async()=>{
    localStorage.setItem('purama-theme','dark');mocks.signout.mockResolvedValue({error:{message:'logout unavailable'}})
    await mount();await emit('SIGNED_IN',A);await tick()
    const result=await act(async()=>live.signOut())
    expect(localStorage.getItem('purama-theme')).toBe('dark');expect(result).toEqual({error:{message:'logout unavailable'}})
  })
})
