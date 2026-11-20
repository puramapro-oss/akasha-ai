import { expect,test,type Page } from '@playwright/test'
import type { fixture } from './auth-supabase'
declare global { interface Window { authFixture: typeof fixture } }
async function setup(page:Page,settings:Record<string,string>={}){
  await page.addInitScript(settings=>{for(const [k,v] of Object.entries(settings))sessionStorage.setItem(k,v)},settings)
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
}
test('real hook and chat load one session and profile without subscription churn',async({page})=>{
  await setup(page,{'auth-initial-user':'A'});await page.goto('/dashboard/chat?model=akasha-opus')
  await page.getByTestId('chat-input').fill('bonjour');await expect(page.getByTestId('chat-send')).toBeEnabled()
  expect(await page.evaluate(()=>window.authFixture.stats)).toEqual({sessions:1,profiles:1,subscriptions:1})
})
test('late bootstrap cannot replace the newer identity or its access',async({page})=>{
  await setup(page,{'auth-hold-session':'true','auth-hold-profiles':'true'});await page.goto('/dashboard/chat?model=akasha-opus')
  await page.evaluate(()=>window.authFixture.emit('SIGNED_IN','B'))
  await expect.poll(()=>page.evaluate(()=>window.authFixture.pending())).toContain('B')
  await page.evaluate(()=>{window.authFixture.resolveProfile('B','free');window.authFixture.finishInitial('A')})
  await page.getByTestId('chat-input').fill('conserver B');await expect(page.getByRole('alert')).toContainText('indisponible')
  await expect(page.getByTestId('chat-send')).toBeDisabled();expect(await page.evaluate(()=>window.authFixture.stats.profiles)).toBe(1)
})
test('late privileged profile cannot leak across accounts',async({page})=>{
  await setup(page,{'auth-hold-profiles':'true'});await page.goto('/dashboard/chat?model=akasha-opus')
  await page.evaluate(()=>window.authFixture.emit('SIGNED_IN','A'));await expect.poll(()=>page.evaluate(()=>window.authFixture.pending())).toContain('A')
  await page.getByTestId('chat-input').fill('brouillon privé A');await page.evaluate(()=>window.authFixture.emit('SIGNED_IN','B'))
  await expect(page.getByTestId('chat-input')).toHaveValue('');await expect.poll(()=>page.evaluate(()=>window.authFixture.pending())).toContain('B')
  await page.evaluate(()=>{window.authFixture.resolveProfile('B','free');window.authFixture.resolveProfile('A','complete','admin')})
  await expect(page.getByRole('alert')).toContainText('indisponible');await page.getByTestId('chat-input').fill('B')
  await expect(page.getByTestId('chat-send')).toBeDisabled()
})
test('profile error is visible and retry restores the real chat without reload',async({page})=>{
  await setup(page,{'auth-initial-user':'A','auth-profile-failure':'true'});await page.goto('/dashboard/chat')
  await expect(page.getByRole('alert')).toContainText('Impossible de charger ton profil')
  await expect(page.getByText('synthetic private database detail')).toHaveCount(0)
  await page.getByTestId('chat-input').fill('brouillon à conserver');await expect(page.getByTestId('chat-send')).toBeDisabled()
  await page.evaluate(()=>window.authFixture.failProfiles(false));await page.getByRole('button',{name:'Réessayer la connexion'}).click()
  await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByTestId('chat-input')).toHaveValue('brouillon à conserver');await page.getByTestId('chat-input').fill('rétabli');await expect(page.getByTestId('chat-send')).toBeEnabled()
})
test('sign-out clears draft and invalidates pending profile',async({page})=>{
  await setup(page,{'auth-initial-user':'A','auth-hold-profiles':'true'});await page.goto('/dashboard/chat')
  await expect.poll(()=>page.evaluate(()=>window.authFixture.pending())).toContain('A');await page.getByTestId('chat-input').fill('privé')
  await page.evaluate(()=>{window.authFixture.emit('SIGNED_OUT',null);window.authFixture.resolveProfile('A','complete','admin')})
  await expect(page.getByTestId('chat-input')).toHaveValue('');await page.getByTestId('chat-input').fill('ne pas envoyer')
  await expect(page.getByTestId('chat-send')).toBeDisabled()
})
test('token refresh and refocus preserve the current draft without duplicate profile reads',async({page})=>{
  await setup(page,{'auth-initial-user':'A'});await page.goto('/dashboard/chat');await page.getByTestId('chat-input').fill('brouillon')
  await expect(page.getByTestId('chat-send')).toBeEnabled()
  await page.evaluate(()=>{window.authFixture.emit('TOKEN_REFRESHED','A');window.authFixture.emit('SIGNED_IN','A')})
  await expect(page.getByTestId('chat-input')).toHaveValue('brouillon');expect(await page.evaluate(()=>window.authFixture.stats.profiles)).toBe(1)
})
