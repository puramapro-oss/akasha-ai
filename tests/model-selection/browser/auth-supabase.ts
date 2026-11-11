// Qualification only: no credentials, Supabase endpoint, database or outgoing request.
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
function session(id: string): Session { return { user: { id, email: `${id}@example.invalid` }, access_token: id, refresh_token: 'fixture', token_type: 'bearer', expires_in: 3600 } as Session }
type ProfileReply = { data: { id: string; role: string; plan: string; display_name: string } | null; error?: { message: string } }
const listeners = new Set<(event: AuthChangeEvent, value: Session|null)=>void>()
let initial: ((value: { data: {session: Session|null}; error: null })=>void) | null = null
const pending: { id:string; resolve:(reply:ProfileReply)=>void }[]=[]
let held = sessionStorage.getItem('auth-hold-profiles') === 'true'
let failure = sessionStorage.getItem('auth-profile-failure') === 'true'
let current: Session|null = sessionStorage.getItem('auth-initial-user') ? session(sessionStorage.getItem('auth-initial-user')!) : null
const stats={sessions:0,profiles:0,subscriptions:0}
function reply(id:string,plan='complete',role='user'):ProfileReply{return {data:{id,plan,role,display_name:id}}}
export const fixture={
  stats,
  emit(event:AuthChangeEvent,id:string|null){current=id?session(id):null;for(const listener of listeners)listener(event,current)},
  finishInitial(id:string|null){initial?.({data:{session:id?session(id):null},error:null})},
  holdProfiles(value:boolean){held=value},
  failProfiles(value:boolean){failure=value},
  resolveProfile(id:string,plan='complete',role='user'){const i=pending.findIndex(p=>p.id===id);if(i<0)throw new Error('No pending synthetic profile');pending.splice(i,1)[0].resolve(reply(id,plan,role))},
  pending:()=>pending.map(p=>p.id),
}
;(window as unknown as { authFixture: typeof fixture }).authFixture=fixture
const client = {
  auth: {
    getSession() {
      stats.sessions++
      if (sessionStorage.getItem('auth-hold-session') === 'true') {
        return new Promise<{data:{session:Session|null};error:null}>(resolve => { initial = resolve })
      }
      return Promise.resolve({data:{session:current},error:null})
    },
    onAuthStateChange(callback:(e:AuthChangeEvent,s:Session|null)=>void) {
      stats.subscriptions++; listeners.add(callback)
      return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}}
    },
    signInWithPassword:async()=>({error:null}), signUp:async()=>({error:null}),
    signInWithOAuth:async()=>({error:null}), resetPasswordForEmail:async()=>({error:null}),
    updateUser:async()=>({error:null}),
    signOut:async()=>{fixture.emit('SIGNED_OUT',null);return {error:null}},
  },
  from(table:string) {
    if (table !== 'profiles') throw new Error('Only profile qualification is allowed')
    return {
      select() {
        return {
          eq(_column:string,id:string) {
            const chain = {
              single() { return chain },
              abortSignal() { return chain },
              then(yes:(value:ProfileReply)=>unknown,no?:(error:unknown)=>unknown) {
                stats.profiles++
                const value = held
                  ? new Promise<ProfileReply>(resolve => pending.push({id,resolve}))
                  : Promise.resolve(failure ? {data:null,error:{message:'synthetic private database detail'}} : reply(id))
                return value.then(yes,no)
              },
            }
            return chain
          },
        }
      },
    }
  },
}
export function createClient(){return client}
