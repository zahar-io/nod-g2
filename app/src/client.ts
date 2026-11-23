// Talks to the Nod server. The token pairs these glasses with one server.
import type { FeedItem } from './screens.ts'

export interface Settings {
  server: string
  token: string
  /** demo only: URL of a PCM clip played as if it came from the mic */
  simMic?: string
}

export function createClient(s: Settings) {
  const url = (p: string) => `${s.server.replace(/\/$/, '')}${p}`
  const headers = (json = true): Record<string, string> => ({
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(s.token ? { 'X-Nod-Token': s.token } : {}),
  })
  async function get<T>(p: string): Promise<T> {
    const r = await fetch(url(p), { headers: headers(false) })
    if (!r.ok) throw new Error(`${p} ${r.status}`)
    return r.json()
  }
  async function post<T>(p: string, body: unknown): Promise<T> {
    const r = await fetch(url(p), { method: 'POST', headers: headers(), body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`${p} ${r.status}`)
    return r.json()
  }
  return {
    feed: () => get<{ items: FeedItem[] }>('/api/feed'),
    chat: (id: string, title: string) =>
      get<{ lines: string[]; drafts: string[]; replyTo?: number }>(`/api/chat?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`),
    send: (chatId: string, text: string, replyTo?: number) => post('/api/send', { chatId, text, replyTo }),
    press: (item: FeedItem, b: { label: string; data: string }) =>
      post<{ answer: string }>('/api/press', { chatId: item.chatId, msgId: item.msgId, data: b.data, label: b.label }),
    digest: () => get<{ lines: string[] }>('/api/digest'),
    voice: async (pcm: Uint8Array, id: string, title: string) => {
      const r = await fetch(url(`/api/voice?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`), {
        method: 'POST', headers: { ...headers(false), 'Content-Type': 'application/octet-stream' }, body: pcm as unknown as BodyInit,
      })
      if (!r.ok) throw new Error(`voice ${r.status}`)
      return r.json() as Promise<{ heard: string; text: string }>
    },
  }
}
