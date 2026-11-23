import { Socket } from 'node:net'
import { Resend } from 'resend'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailFixture, USER } from '../../../tests/email-sequences/fixture'
import { deliverSequence, utcSignupWindow } from './delivery'
import { EMAIL_SEQUENCE } from './templates'

let fixture: ReturnType<typeof emailFixture>
let resend: Resend
let providerFetch: ReturnType<typeof vi.fn<typeof fetch>>
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})
const deliver = () => deliverSequence(fixture.client, resend, fixture.state.profiles[0], EMAIL_SEQUENCE[0])
beforeEach(() => {
  fixture = emailFixture()
  resend = new Resend('re_synthetic_only')
  providerFetch = vi.fn<typeof fetch>(async url => {
    if (String(url) !== 'https://api.resend.com/emails') throw new Error('Unexpected synthetic provider request')
    return response({ id: 'synthetic-provider-id' })
  })
  vi.stubGlobal('fetch', providerFetch)
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Socket access disabled') })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  try { expect(Socket.prototype.connect).not.toHaveBeenCalled() }
  finally { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() }
})

describe('the installed Resend SDK preserves the delivery contract', () => {
  it('sends the stable idempotency header and only accepts a real provider id', async () => {
    expect(await deliver()).toBe('sent')
    expect(providerFetch).toHaveBeenCalledTimes(1)
    const [url, options] = providerFetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(`akasha-email/welcome/${USER}`)
    expect(JSON.parse(String(options?.body))).toMatchObject({ to: 'recipient@example.invalid' })
    expect(fixture.state.logs).toBe(1)
    expect(await deliver()).toBe('skipped')
    expect(providerFetch).toHaveBeenCalledTimes(1)
  })

  it('handles the SDK resolved error object after an HTTP rejection without automatic retry', async () => {
    providerFetch.mockResolvedValueOnce(response({ name: 'validation_error', message: 'Synthetic rejection' }, 422))
    expect(await deliver()).toBe('reconciliation_required')
    expect(await deliver()).toBe('reconciliation_required')
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(fixture.state.logs).toBe(0)
  })

  it('handles the SDK resolved error after a transport exception without automatic retry', async () => {
    providerFetch.mockRejectedValueOnce(new Error('Synthetic connection loss'))
    expect(await deliver()).toBe('reconciliation_required')
    expect(await deliver()).toBe('reconciliation_required')
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(fixture.state.logs).toBe(0)
  })

  it('never replays or counts a late provider acceptance after the wait deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let accept!: (value: Response) => void
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    providerFetch.mockImplementationOnce(() => {
      started()
      return new Promise(resolve => { accept = resolve })
    })
    const pending = deliver()
    await entered
    await vi.advanceTimersByTimeAsync(20_001)
    expect(await pending).toBe('reconciliation_required')
    accept(response({ id: 'late-synthetic-provider-id' }))
    await Promise.resolve()
    expect(await deliver()).toBe('reconciliation_required')
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(fixture.state.logs).toBe(0)
    expect(fixture.state.deliveries.get(`${USER}/welcome`)).toMatchObject({ state: 'reconciliation_required' })
  })
})

describe('signup dates use full UTC days independently of local DST offsets', () => {
  it.each([
    ['2026-03-30T00:30:00+02:00', 1, '2026-03-28T00:00:00.000Z', '2026-03-29T00:00:00.000Z'],
    ['2026-10-26T00:30:00+01:00', 1, '2026-10-24T00:00:00.000Z', '2026-10-25T00:00:00.000Z'],
    ['2027-01-01T08:00:00Z', 1, '2026-12-31T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
    ['2028-03-01T08:00:00Z', 1, '2028-02-29T00:00:00.000Z', '2028-03-01T00:00:00.000Z'],
  ])('%s minus %i day has a half-open UTC range', (now, offset, start, end) => {
    expect(utcSignupWindow(new Date(now), Number(offset))).toEqual({ start, end })
  })
})
