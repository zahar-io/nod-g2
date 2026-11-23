// HTTP API the glasses app talks to. Small on purpose: the glasses only ever
// get display-ready text, never raw Telegram objects or credentials.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Ai } from './ai.ts'
import type { Provider } from './types.ts'

export interface ApiDeps {
  provider: Provider
  ai: Ai
  transcribe: (pcm: Uint8Array) => Promise<string>
  token?: string
  log?: (line: string) => void
}

/** Wait for p, but fall back after ms so the glasses never stare at a spinner. */
export async function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: NodeJS.Timeout | undefined
  const timeout = new Promise<T>(r => (t = setTimeout(() => r(fallback), ms)))
  try {
    return await Promise.race([p.catch(() => fallback), timeout])
  } finally {
    clearTimeout(t)
  }
}

/** Incoming messages after my last one (at most 2), or the last message. */
export function unanswered<T extends { out: boolean }>(h: T[]): T[] {
  const lastOut = h.map(m => m.out).lastIndexOf(true)
  const after = h.slice(lastOut + 1)
  return (after.length ? after : h).slice(-2)
}

export const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1).trimEnd() + '…' : one
}

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 4_000_000) throw new Error('body too large')
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks)
}

export function createApi(d: ApiDeps) {
  const log = d.log ?? (() => {})
  let lastDigest = Math.floor(Date.now() / 1000) - 12 * 3600

  const routes: Record<string, (req: IncomingMessage, url: URL) => Promise<unknown>> = {
    'GET /api/health': async () => ({ ok: true, provider: d.provider.name }),

    'GET /api/feed': async () => {
      const items = await d.provider.feed()
      const out = await Promise.all(
        items.map(async it => ({
          key: it.key,
          kind: it.kind,
          chatId: it.chatId,
          msgId: it.msgId,
          title: it.chatTitle,
          from: it.from,
          gist: clip(await within(d.ai.gist(it.from, it.text), 6000, it.text), 44),
          text: it.text.slice(0, 400),
          unread: it.unread,
          buttons: it.buttons,
        })),
      )
      // Warm the reply drafts for the top chats so a tap feels instant.
      for (const it of items.filter(i => i.kind === 'chat').slice(0, 3))
        d.provider.history(it.chatId, 8).then(h => d.ai.drafts(it.chatTitle, h)).catch(() => {})
      return { items: out }
    },

    'GET /api/chat': async (_req, url) => {
      const chatId = url.searchParams.get('id') ?? ''
      const title = url.searchParams.get('title') ?? ''
      const history = await d.provider.history(chatId, 8)
      const drafts = await within(d.ai.drafts(title, history), 12000, [])
      const lastIn = [...history].reverse().find(m => !m.out)
      return {
        // What they said since my last message: that's what needs an answer.
        lines: unanswered(history).map(m => clip(`${m.from.split(' ')[0]}: ${m.text}`, 150)),
        drafts: drafts.length ? drafts : ['OK, thanks!', 'Can I reply later?', 'Call me when free?'],
        replyTo: lastIn?.id,
      }
    },

    'POST /api/send': async req => {
      const { chatId, text, replyTo } = JSON.parse((await body(req)).toString())
      if (!chatId || !text) throw new Error('chatId and text required')
      await d.provider.send(chatId, String(text).slice(0, 1000), replyTo)
      await d.provider.markRead(chatId).catch(() => {})
      log(`sent to ${chatId}: ${text}`)
      return { ok: true }
    },

    'POST /api/press': async req => {
      const { chatId, msgId, data, label } = JSON.parse((await body(req)).toString())
      const answer = await d.provider.press(chatId, Number(msgId), data)
      log(`pressed "${label}" on ${chatId}/${msgId}`)
      return { ok: true, answer: clip(answer, 80) }
    },

    'POST /api/read': async req => {
      const { chatId } = JSON.parse((await body(req)).toString())
      await d.provider.markRead(chatId)
      return { ok: true }
    },

    'POST /api/voice': async (req, url) => {
      const pcm = new Uint8Array(await body(req))
      const heard = await d.transcribe(pcm)
      if (!heard) return { heard: '', text: '' }
      const chatId = url.searchParams.get('id') ?? ''
      const title = url.searchParams.get('title') ?? ''
      const history = chatId ? await d.provider.history(chatId, 6) : []
      const text = await within(d.ai.tidy(title, history, heard), 10000, heard)
      log(`voice: "${heard}" -> "${text}"`)
      return { heard, text: clip(text, 300) }
    },

    'GET /api/digest': async () => {
      const posts = await d.provider.channelPosts(lastDigest)
      lastDigest = Math.floor(Date.now() / 1000)
      const lines = await within(d.ai.digest(posts), 15000, posts.slice(0, 5).map(p => clip(`${p.channel}: ${p.text}`, 70)))
      return { lines: lines.map(l => clip(l, 72)), count: posts.length }
    },
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://local')
    if (!url.pathname.startsWith('/api/')) return false
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Nod-Token')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return true
    }
    const route = routes[`${req.method} ${url.pathname}`]
    if (!route) {
      res.writeHead(404).end()
      return true
    }
    if (d.token && req.headers['x-nod-token'] !== d.token && url.pathname !== '/api/health') {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"pair first"}')
      return true
    }
    try {
      const out = await route(req, url)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out))
    } catch (e) {
      log(`error ${url.pathname}: ${(e as Error).message}`)
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }))
    }
    return true
  }
}
