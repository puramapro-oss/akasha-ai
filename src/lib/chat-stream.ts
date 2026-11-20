/** SSE framing for the existing chat endpoint. No provider calls or retries. */
export class ChatStreamError extends Error {}
export interface ChatStreamEvent { text?: string; conversationId?: string }
export const MAX_CHAT_EVENT_CHARS = 256 * 1024
export const MAX_CHAT_STREAM_BYTES = 2 * 1024 * 1024
const interrupted = 'La réponse a été interrompue. Le texte déjà reçu est conservé.'
const malformed = 'La réponse reçue est illisible. Réessaie dans quelques instants.'

/** A blank line commits an event; EOF without [DONE] is never a success. */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let line = '', data: string[] = [], eventSize = 0, total = 0, skipLf = false, completed = false
  // Cancellation must not delay cleanup if an underlying source rejects cancel().
  const cancel = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  function consumeLine() {
    if (line === '') {
      if (data.length) {
        const raw = data.join('\n')
        data = []; eventSize = 0
        if (raw === '[DONE]') { completed = true; return }
        let event: unknown
        try { event = JSON.parse(raw) } catch { throw new ChatStreamError(malformed) }
        if (!event || typeof event !== 'object' || Array.isArray(event)) throw new ChatStreamError(malformed)
        const value = event as Record<string, unknown>
        for (const name of ['text', 'conversationId', 'error']) {
          if (name in value && typeof value[name] !== 'string') throw new ChatStreamError(malformed)
        }
        if (value.error) throw new ChatStreamError((value.error as string).slice(0, 500))
        if (value.persisted === false) throw new ChatStreamError("La réponse n'a pas pu être enregistrée.")
        if (value.conversationId === '') throw new ChatStreamError(malformed)
        onEvent({ text: value.text as string | undefined, conversationId: value.conversationId as string | undefined })
      }
    } else if (!line.startsWith(':')) {
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? '' : line.slice(colon + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'data') {
        eventSize += value.length + 1
        if (eventSize > MAX_CHAT_EVENT_CHARS) throw new ChatStreamError('Réponse trop volumineuse pour être affichée en sécurité.')
        data.push(value)
      }
    }
    line = ''
  }
  try {
    while (!completed) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (done) { decoder.decode(); throw new ChatStreamError(interrupted) }
      total += value.byteLength
      if (total > MAX_CHAT_STREAM_BYTES) throw new ChatStreamError('Réponse trop volumineuse pour être affichée en sécurité.')
      const chunk = decoder.decode(value, { stream: true })
      for (const char of chunk) {
        if (skipLf && char === '\n') { skipLf = false; continue }
        skipLf = false
        if (char === '\r' || char === '\n') {
          consumeLine(); skipLf = char === '\r'
          if (completed) break
        } else {
          line += char
          if (line.length > MAX_CHAT_EVENT_CHARS) throw new ChatStreamError('Événement de réponse trop volumineux.')
        }
      }
    }
  } catch (error) {
    if (error instanceof ChatStreamError || signal.aborted) throw error
    throw new ChatStreamError(malformed)
  } finally {
    signal.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}

/** Observe cancellation even if a supplied transport does not settle promptly. */
export function awaitChatOperation<T>(pending: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', aborted, { once: true })
    Promise.resolve(pending).then(value => {
      signal.removeEventListener('abort', aborted)
      if (signal.aborted) aborted()
      else resolve(value)
    }, reason => {
      signal.removeEventListener('abort', aborted)
      reject(reason)
    })
    if (signal.aborted) { signal.removeEventListener('abort', aborted); aborted() }
  })
}
