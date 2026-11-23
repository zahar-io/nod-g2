import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApi, clip, within } from '../src/api.ts'
import { lines } from '../src/ai.ts'
import { createDemoProvider } from '../src/demo.ts'
import { pcmToWav } from '../src/stt.ts'
import type { Ai } from '../src/ai.ts'

const fakeAi: Ai = {
  gist: async (_f, t) => `gist:${t.slice(0, 10)}`,
  drafts: async () => ['Yes, 3pm works', 'Can we do 4?', 'Let me check'],
  tidy: async (_c, _h, s) => `tidy:${s}`,
  digest: async posts => posts.map(p => `${p.channel}: x`).slice(0, 5),
}

async function start(token?: string, transcribe = async () => 'yes three works') {
  const provider = createDemoProvider()
  const handle = createApi({ provider, ai: fakeAi, transcribe, token })
  const srv = createServer(async (req, res) => {
    if (!(await handle(req, res))) res.writeHead(404).end()
  })
  await new Promise<void>(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(base + path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Nod-Token': token } : {}), ...(init.headers ?? {}) } })
    return { status: r.status, json: await r.json().catch(() => null) as any }
  }
  return { provider, call, close: () => srv.close() }
}

test('feed puts approvals before chats and gists every line', async () => {
  const s = await start()
  const { json } = await s.call('/api/feed')
  assert.deepEqual(json.items.map((i: any) => i.kind), ['approval', 'approval', 'chat', 'chat'])
  assert.ok(json.items.every((i: any) => i.gist.startsWith('gist:')))
  s.close()
})

test('pressing an approval button resolves it and drops it from the feed', async () => {
  const s = await start()
  const { json } = await s.call('/api/feed')
  const a = json.items[0]
  const r = await s.call('/api/press', { method: 'POST', body: JSON.stringify({ chatId: a.chatId, msgId: a.msgId, data: a.buttons[0].data, label: a.buttons[0].label }) })
  assert.equal(r.json.ok, true)
  const after = await s.call('/api/feed')
  assert.ok(!after.json.items.some((i: any) => i.key === a.key))
  s.close()
})

test('chat gives 3 drafts and sending clears unread', async () => {
  const s = await start()
  const chat = await s.call('/api/chat?id=anna&title=Anna')
  assert.equal(chat.json.drafts.length, 3)
  assert.deepEqual(chat.json.lines, ['Anna: Looked at them, love the hero. The pricing block feels busy though.', "Anna: Can we move tomorrow's call from 2 to 3pm? Something came up."])
  await s.call('/api/send', { method: 'POST', body: JSON.stringify({ chatId: 'anna', text: chat.json.drafts[0], replyTo: chat.json.replyTo }) })
  const h = await s.provider.history('anna', 1)
  assert.equal(h[0].text, 'Yes, 3pm works')
  const feed = await s.call('/api/feed')
  assert.ok(!feed.json.items.some((i: any) => i.key === 'c:anna'))
  s.close()
})

test('voice goes through STT then Claude tidy', async () => {
  const s = await start()
  const r = await s.call('/api/voice?id=anna&title=Anna', { method: 'POST', body: new Uint8Array(32000) })
  assert.equal(r.json.heard, 'yes three works')
  assert.equal(r.json.text, 'tidy:yes three works')
  s.close()
})

test('token mismatch is rejected', async () => {
  const provider = createDemoProvider()
  const handle = createApi({ provider, ai: fakeAi, transcribe: async () => '', token: 'secret' })
  const srv = createServer(async (req, res) => void (await handle(req, res)))
  await new Promise<void>(r => srv.listen(0, r))
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  assert.equal((await fetch(base + '/api/feed')).status, 401)
  assert.equal((await fetch(base + '/api/health')).status, 200)
  srv.close()
})

test('digest returns short lines', async () => {
  const s = await start()
  const r = await s.call('/api/digest')
  assert.ok(r.json.lines.length > 0 && r.json.lines.length <= 5)
  s.close()
})

test('helpers', async () => {
  assert.equal(clip('a  b\nc', 10), 'a b c')
  assert.equal(clip('abcdefghijk', 5), 'abcd…')
  assert.equal(await within(new Promise(() => {}), 10, 'fb'), 'fb')
  assert.deepEqual(lines('1. one\n- two\n\n3) three\nfour', 3), ['one', 'two', 'three'])
  const wav = pcmToWav(new Uint8Array(10))
  assert.equal(wav.length, 54)
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF')
})
