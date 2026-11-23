// Nod server: Telegram + Claude + local Whisper behind a tiny HTTP API.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAi } from './ai.ts'
import { createApi } from './api.ts'
import { createDemoProvider } from './demo.ts'
import { transcribe } from './stt.ts'
import type { Provider } from './types.ts'

const env = process.env
const list = (s?: string) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean)

async function provider(): Promise<Provider> {
  env.TG_SESSION ||= await readFile(new URL('../.session', import.meta.url), 'utf8').catch(() => '')
  if (env.TG_SESSION && env.TG_API_ID && env.TG_API_HASH && env.NOD_DEMO !== '1') {
    const { createTelegramProvider } = await import('./telegram.ts')
    return createTelegramProvider({
      apiId: Number(env.TG_API_ID), apiHash: env.TG_API_HASH, session: env.TG_SESSION,
      chats: list(env.NOD_CHATS), channels: list(env.NOD_CHANNELS),
    })
  }
  console.log('No Telegram session set: running on the demo account (NOD_DEMO).')
  return createDemoProvider()
}

const p = await provider()
const api = createApi({
  provider: p,
  ai: createAi(),
  transcribe,
  token: env.NOD_TOKEN,
  log: l => console.log(new Date().toISOString().slice(11, 19), l),
})

const dist = fileURLToPath(new URL('../../app/dist/', import.meta.url))
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }

const port = Number(env.PORT || 8787)
createServer(async (req, res) => {
  if (await api(req, res)) return
  // Serve the built glasses app, so one server is enough in production.
  const path = normalize(new URL(req.url ?? '/', 'http://x').pathname).replace(/^(\.\.[/\\])+/, '')
  try {
    const file = join(dist, path === '/' ? 'index.html' : path)
    if (!file.startsWith(dist)) throw new Error('outside')
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file))
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, () => console.log(`Nod server on http://localhost:${port} (${p.name})`))
