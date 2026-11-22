// @vitest-environment jsdom
import React, { act } from 'react'
import { describe, expect, it } from 'vitest'
import { click, deferred, fixture, input, json, mount } from './async-lifecycle.test-support'
import ContactPage from '@/app/contact/page'

const ID = '11111111-1111-4111-8111-111111111111'
const receipt = (team = 'accepted') => ({ success: true, stored: true, message_id: ID,
  emails: { team, confirmation: 'accepted' } })

async function filledContact() {
  const view = await mount(<ContactPage />)
  await input(view.container.querySelector('#name'), 'Synthetic User')
  await input(view.container.querySelector('#email'), 'test@example.invalid')
  await input(view.container.querySelector('#subject'), 'Synthetic contact')
  await input(view.container.querySelector('#message'), 'This test sends no real message.')
  return view
}

describe('contact acknowledgement in the user flow', () => {
  it('acknowledges a recorded contact with an unconfirmed notification and prevents an accidental resubmission', async () => {
    fixture.transport.mockResolvedValue(json(receipt('unconfirmed')))
    const view = await filledContact()
    await click(view.container.querySelector('form button'))
    expect(fixture.requests).toHaveLength(1)
    expect(view.container.querySelector('form')).toBeNull()
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('Ton message est enregistré')
    expect(view.container.textContent).toContain('Notification de l’équipe : non confirmée')
    expect(view.container.textContent).toContain('Tu n’as pas besoin de le renvoyer')
    expect(view.container.textContent).not.toContain('24h')
    expect(fixture.error).not.toHaveBeenCalled()
    await click(view.container.querySelector('[role="status"] button'))
    expect(fixture.requests).toHaveLength(1)
    expect(view.container.querySelector('form')).not.toBeNull()
    expect((view.container.querySelector('#message') as HTMLTextAreaElement).value).toBe('')
  })

  it('retains the draft when the message was not received', async () => {
    fixture.transport.mockResolvedValue(json({ stored: false, error: 'Enregistrement indisponible.' }, 503))
    const view = await filledContact()
    await click(view.container.querySelector('form button'))
    expect((view.container.querySelector('#message') as HTMLTextAreaElement).value).toBe('This test sends no real message.')
    expect(view.container.querySelector('[role="status"]')).toBeNull()
    expect(fixture.error).toHaveBeenCalledWith('Enregistrement indisponible.')
    expect((view.container.querySelector('form button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('acknowledges a complete delivery without inventing a response deadline', async () => {
    fixture.transport.mockResolvedValue(json(receipt()))
    const view = await filledContact()
    await click(view.container.querySelector('form button'))
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('Ton message est enregistré')
    expect(view.container.textContent).not.toContain('24h')
    expect(fixture.success).toHaveBeenCalledWith('Message enregistré.')
  })

  it('does not create two submissions from overlapping submit events', async () => {
    const result = deferred<Response>()
    fixture.transport.mockImplementation(() => result.promise)
    const view = await filledContact()
    const form = view.container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(fixture.requests).toHaveLength(1)
    await act(async () => { result.resolve(json(receipt())) })
    expect(view.container.querySelector('form')).toBeNull()
  })

  it('does not clear a draft on an unrecognized successful HTTP response', async () => {
    fixture.transport.mockResolvedValue(json({ status: 'unknown' }))
    const view = await filledContact()
    await click(view.container.querySelector('form button'))
    expect(view.container.querySelector('form')).not.toBeNull()
    expect((view.container.querySelector('#message') as HTMLTextAreaElement).value).toBe('This test sends no real message.')
    expect(fixture.success).not.toHaveBeenCalled()
    expect(fixture.error).toHaveBeenCalled()
  })
})
