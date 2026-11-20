import { describe, it, expect, vi } from 'vitest'
import { readChatStream, MAX_CHAT_EVENT_CHARS, MAX_CHAT_STREAM_BYTES, type ChatStreamEvent } from './chat-stream'
function fixture(chunks: (string | Uint8Array)[], closed = true) {
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const item of chunks) controller.enqueue(typeof item === 'string' ? new TextEncoder().encode(item) : item)
      if (closed) controller.close()
    }, cancel,
  })
  return { body, cancel }
}
describe('bounded chat SSE framing', () => {
  for (const ending of ['\n','\r','\r\n']) {
    it(`accepts newline framing ${JSON.stringify(ending)}`, async () => {
      const f = fixture([`data:{"text":"bonjour"}${ending}${ending}data:[DONE]${ending}${ending}`])
      const event = vi.fn(); await readChatStream(f.body, new AbortController().signal, event)
      expect(event).toHaveBeenCalledWith({ text: 'bonjour', conversationId: undefined }); expect(f.body.locked).toBe(false)
    })
  }
  it('processes CRLF across chunks and a BOM without adding extra blank events', async () => {
    const f = fixture(['\uFEFFdata:{"text":"ok"}\r','\n\r','\ndata:[DONE]\r','\n\r\n']); const event = vi.fn()
    await readChatStream(f.body, new AbortController().signal, event); expect(event).toHaveBeenCalledOnce()
  })
  it('does not dispatch an incomplete final event', async () => {
    const f = fixture(['data:{"text":"never commit"}\n']); const event = vi.fn()
    await expect(readChatStream(f.body, new AbortController().signal, event)).rejects.toThrow('interrompue')
    expect(event).not.toHaveBeenCalled(); expect(f.body.locked).toBe(false)
  })
  it('stops at DONE and cancels an open transport', async () => {
    const f = fixture(['data:[DONE]\n\ndata:{"text":"bad"}\n\n'], false); const event = vi.fn()
    await readChatStream(f.body, new AbortController().signal, event)
    expect(event).not.toHaveBeenCalled(); expect(f.cancel).toHaveBeenCalledOnce(); expect(f.body.locked).toBe(false)
  })
  for (const raw of ['null','[]','{"text":42}','{"conversationId":false}','{"error":{}}','{"conversationId":""}','not-json']) {
    it(`rejects invalid message schema ${raw}`, async () => {
      const f = fixture([`data:${raw}\n\ndata:[DONE]\n\n`])
      await expect(readChatStream(f.body, new AbortController().signal, vi.fn())).rejects.toThrow('illisible')
    })
  }
  it('abort releases a pending read without requiring an upstream response', async () => {
    const f = fixture([], false); const abort = new AbortController()
    const promise = readChatStream(f.body, abort.signal, vi.fn())
    const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' }); abort.abort(); await rejected
    expect(f.cancel).toHaveBeenCalledOnce(); expect(f.body.locked).toBe(false)
  })
  it('pre-aborted requests are never delivered', async () => {
    const f = fixture(['data:{"text":"bad"}\n\ndata:[DONE]\n\n']); const abort = new AbortController(); abort.abort(); const event = vi.fn()
    await expect(readChatStream(f.body, abort.signal, event)).rejects.toMatchObject({ name: 'AbortError' }); expect(event).not.toHaveBeenCalled()
  })
  it('rejects an oversized unterminated line', async () => {
    const f = fixture(['x'.repeat(MAX_CHAT_EVENT_CHARS + 1)])
    await expect(readChatStream(f.body, new AbortController().signal, vi.fn())).rejects.toThrow('volumineux')
  })
  it('rejects an oversized aggregate even when individual events are small', async () => {
    const f = fixture([new Uint8Array(MAX_CHAT_STREAM_BYTES + 1)])
    await expect(readChatStream(f.body, new AbortController().signal, vi.fn())).rejects.toThrow('volumineuse')
  })
  it('does not publish invalid UTF-8 as silently replaced text', async () => {
    const f = fixture([new Uint8Array([0xc3,0x28])]); const event = vi.fn()
    await expect(readChatStream(f.body, new AbortController().signal, event)).rejects.toThrow('illisible'); expect(event).not.toHaveBeenCalled()
  })
  it('reports persistence refusal without treating DONE as success', async () => {
    const f = fixture(['data:{"persisted":false}\n\ndata:[DONE]\n\n'])
    await expect(readChatStream(f.body, new AbortController().signal, vi.fn())).rejects.toThrow('enregistrée')
  })
  it('the same UTF-8 stream produces the same events at every possible single split', async () => {
    const bytes = new TextEncoder().encode('data:{"text":"été 🪷"}\n\ndata:{"conversationId":"abc"}\n\ndata:[DONE]\n\n')
    for (let cut = 1; cut < bytes.length; cut++) {
      const f = fixture([bytes.slice(0, cut), bytes.slice(cut)]); const values: ChatStreamEvent[] = []
      await readChatStream(f.body, new AbortController().signal, e => values.push(e))
      expect(values).toEqual([{ text: 'été 🪷', conversationId: undefined }, { text: undefined, conversationId: 'abc' }])
    }
  })
})
