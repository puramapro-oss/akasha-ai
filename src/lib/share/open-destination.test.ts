// @vitest-environment jsdom
import { Socket } from 'node:net'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openShareDestination } from './open-destination'

let popup: {
  closed: boolean; opener: Window | null; document: Document
  location: { replace: ReturnType<typeof vi.fn> }; close: ReturnType<typeof vi.fn>
}
beforeEach(() => {
  popup = { closed: false, opener: window, document: document.implementation.createHTMLDocument(),
    location: { replace: vi.fn() }, close: vi.fn() }
  vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window)
  // Observe the DOM hand-off without asking jsdom to navigate or use a provider.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network disabled') }))
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('Sockets disabled') })
})
afterEach(() => {
  try {
    expect(fetch).not.toHaveBeenCalled()
    expect(Socket.prototype.connect).not.toHaveBeenCalled()
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals() }
})

it.each([
  'https://destination.example.invalid/share?message=synthetic',
  'mailto:recipient@example.invalid?body=synthetic',
  'sms:?body=synthetic',
])('hands off %s synchronously through a noreferrer link inside the detached popup', url => {
  let returned = false
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (this: HTMLAnchorElement) {
    expect(returned).toBe(false)
    expect(this.ownerDocument).toBe(popup.document)
    expect(this.isConnected).toBe(true)
    expect(this.getAttribute('href')).toBe(url)
    expect(this.target).toBe('_self')
    expect(this.referrerPolicy).toBe('no-referrer')
    expect(this.relList.contains('noreferrer')).toBe(true)
    expect(this.relList.contains('noopener')).toBe(true)
    expect(popup.opener).toBeNull()
    expect(popup.location.replace).not.toHaveBeenCalled()
  })
  const accepted = openShareDestination(url)
  returned = true
  expect(accepted).toBe(true)
  expect(window.open).toHaveBeenCalledExactlyOnceWith('about:blank', '_blank')
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
  expect(popup.document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer')
  expect(popup.close).not.toHaveBeenCalled()
})

it.each([
  'javascript:alert(1)', 'data:text/html,synthetic', 'http://destination.example.invalid',
  '//destination.example.invalid', 'not a URL',
])('refuses %s before opening a popup', url => {
  expect(openShareDestination(url)).toBe(false)
  expect(window.open).not.toHaveBeenCalled()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})

it('returns false when popup creation is blocked', () => {
  vi.mocked(window.open).mockReturnValue(null)
  expect(openShareDestination('https://destination.example.invalid')).toBe(false)
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})
it('returns false when the browser returns an already closed popup', () => {
  popup.closed = true
  expect(openShareDestination('https://destination.example.invalid')).toBe(false)
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})
it('returns false when popup creation throws', () => {
  vi.mocked(window.open).mockImplementation(() => { throw new Error('Synthetic popup failure') })
  expect(openShareDestination('https://destination.example.invalid')).toBe(false)
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})
it('closes the blank popup when opener cannot be detached', () => {
  Object.defineProperty(popup, 'opener', { set() { throw new Error('Synthetic opener failure') } })
  expect(openShareDestination('https://destination.example.invalid')).toBe(false)
  expect(popup.close).toHaveBeenCalledOnce()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})
it('closes the blank popup when its document cannot create the navigation elements', () => {
  vi.spyOn(popup.document, 'createElement').mockImplementation(() => { throw new Error('Synthetic document failure') })
  expect(openShareDestination('https://destination.example.invalid')).toBe(false)
  expect(popup.close).toHaveBeenCalledOnce()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})
it('closes the blank popup when the link cannot be attached', () => {
  vi.spyOn(popup.document.body, 'append').mockImplementation(() => { throw new Error('Synthetic append failure') })
  expect(openShareDestination('https://destination.example.invalid')).toBe(false)
  expect(popup.close).toHaveBeenCalledOnce()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})
it('returns false and closes the popup when the synchronous hand-off throws', () => {
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => { throw new Error('Synthetic click failure') })
  expect(openShareDestination('https://destination.example.invalid')).toBe(false)
  expect(popup.close).toHaveBeenCalledOnce()
})
it('still returns false if closing a failed popup also throws', () => {
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => { throw new Error('Synthetic click failure') })
  popup.close.mockImplementation(() => { throw new Error('Synthetic close failure') })
  expect(openShareDestination('https://destination.example.invalid')).toBe(false)
  expect(popup.close).toHaveBeenCalledOnce()
})
