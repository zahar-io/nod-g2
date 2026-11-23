// Nod: Telegram approvals and replies on Even G2.
// Glasses flow: home list -> approval (tap a button) or chat (tap a Claude draft,
// or hold to speak) -> confirm -> sent. Double-tap goes back; on home it exits.
import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { BACK, DIGEST, H, REFRESH, SPEAK, W, view } from './screens.ts'
import type { FeedItem, Screen } from './screens.ts'
import { createClient } from './client.ts'
import { mountCompanion, mirror } from './companion.ts'

const bridge = await waitForEvenAppBridge()
const settings = await mountCompanion(bridge)
const api = createClient(settings)

let screen: Screen = { name: 'home', items: [], note: 'Loading...' }
let started = false
let busy = false

async function show(next: Screen) {
  screen = next
  const v = view(next)
  mirror(v)
  const textObject = [
    new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: W, height: v.textHeight,
      borderWidth: 0, paddingLength: 6, containerID: 1, containerName: 'body',
      content: v.text, isEventCapture: v.list ? 0 : 1,
    }),
  ]
  const listObject = v.list
    ? [
        new ListContainerProperty({
          xPosition: 0, yPosition: v.textHeight, width: W, height: H - v.textHeight,
          borderWidth: 0, paddingLength: 4, containerID: 2, containerName: 'list', isEventCapture: 1,
          itemContainer: new ListItemContainerProperty({ itemCount: v.list.length, itemName: v.list, isItemSelectBorderEn: 1 }),
        }),
      ]
    : undefined
  const page = { containerTotalNum: listObject ? 2 : 1, textObject, listObject }
  if (!started) {
    started = true
    await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page))
  } else {
    await bridge.rebuildPageContainer(new RebuildPageContainer(page))
  }
}

async function toast(text: string, then: () => Promise<void>) {
  await show({ name: 'toast', text })
  setTimeout(() => void then(), 1300)
}

async function home(note?: string) {
  try {
    const { items } = await api.feed()
    await show({ name: 'home', items, note })
  } catch (e) {
    await show({ name: 'home', items: [], note: `Can't reach Nod server. Tap Refresh.` })
    console.error(e)
  }
}

async function openChat(item: FeedItem) {
  await show({ name: 'chat', item, lines: [`${item.from}: ${item.text}`], drafts: [], loading: true })
  const c = await api.chat(item.chatId, item.title)
  if (screen.name === 'chat' && screen.item.key === item.key) await show({ name: 'chat', item, ...c })
}

// ---- voice -------------------------------------------------------------
let rec: { item: FeedItem; chunks: Uint8Array[]; started: number; timer: number } | null = null

async function startListening(item: FeedItem) {
  if (rec) return
  rec = { item, chunks: [], started: Date.now(), timer: 0 }
  await show({ name: 'listening', item, seconds: 0 })
  await bridge.audioControl(true)
  if (settings.simMic) void playSimMic(settings.simMic)
  rec.timer = window.setInterval(() => {
    if (!rec) return
    const seconds = Math.round((Date.now() - rec.started) / 1000)
    if (seconds >= 20) return void stopListening()
    bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 1, containerName: 'body', content: view({ name: 'listening', item, seconds }).text,
    }))
  }, 1000)
}

// The simulator on our build machine has no microphone, so for demos a recorded
// clip is fed through the exact same path as G2 mic frames: 100 ms of 16 kHz PCM at a time.
async function playSimMic(src: string) {
  const pcm = new Uint8Array(await (await fetch(src)).arrayBuffer())
  for (let o = 0; o < pcm.length && rec; o += 3200) {
    rec.chunks.push(pcm.slice(o, o + 3200))
    await new Promise(r => setTimeout(r, 100))
  }
  if (rec) await stopListening()
}

async function stopListening() {
  if (!rec) return
  const r = rec
  rec = null
  clearInterval(r.timer)
  await bridge.audioControl(false)
  const pcm = new Uint8Array(r.chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of r.chunks) (pcm.set(c, o), (o += c.length))
  await show({ name: 'toast', text: 'Got it, writing...' })
  try {
    const { text, heard } = await api.voice(pcm, r.item.chatId, r.item.title)
    if (!text) return void (await toast("Didn't catch that", () => openChat(r.item)))
    await show({ name: 'confirm', item: r.item, text, heard })
  } catch {
    await toast('Voice failed, try again', () => openChat(r.item))
  }
}

// ---- input -------------------------------------------------------------
function typeOf(env?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!env) return null
  return env.eventType ?? OsEventTypeList.CLICK_EVENT // CLICK is 0 and gets dropped on the wire
}

async function back() {
  if (screen.name === 'home') return void bridge.shutDownPageContainer(1)
  if (screen.name === 'confirm') return openChat(screen.item)
  await home()
}

async function select(i: number) {
  const s = screen
  const label = view(s).list?.[i]
  if (label === BACK) return back()
  switch (s.name) {
    case 'home': {
      if (label === REFRESH) return home()
      if (label === DIGEST) {
        await show({ name: 'toast', text: 'Reading your channels...' })
        const d = await api.digest().catch(() => ({ lines: ['Digest failed, try again.'] }))
        return show({ name: 'digest', lines: d.lines })
      }
      const item = s.items[i]
      if (!item) return
      if (item.kind === 'approval') return show({ name: 'approval', item })
      return openChat(item)
    }
    case 'approval': {
      const b = s.item.buttons?.[i]
      if (!b) return
      await show({ name: 'toast', text: `${b.label}...` })
      try {
        const r = await api.press(s.item, b)
        return toast(`${b.label}: done`.slice(0, 40) + (r.answer && r.answer !== 'Done' ? `\n      ${r.answer}` : ''), () => home())
      } catch {
        return toast('Button failed, try again', () => home())
      }
    }
    case 'chat': {
      if (label === SPEAK) return startListening(s.item)
      const text = s.drafts[i]
      if (text) return show({ name: 'confirm', item: s.item, text, replyTo: s.replyTo })
      return
    }
    case 'confirm': {
      if (i === 1) return startListening(s.item)
      if (i === 2) return openChat(s.item)
      await show({ name: 'toast', text: 'Sending...' })
      try {
        await api.send(s.item.chatId, s.text, s.replyTo)
        return toast(`Sent to ${s.item.title.split(' ')[0]}`, () => home())
      } catch {
        return toast('Send failed, nothing sent', () => openChat(s.item))
      }
    }
    case 'digest':
      return home()
  }
}

bridge.onEvenHubEvent(event => {
  if (event.audioEvent?.audioPcm && rec) rec.chunks.push(event.audioEvent.audioPcm)
  const t = typeOf(event.listEvent) ?? typeOf(event.textEvent) ?? typeOf(event.sysEvent)
  if (t === null) return

  if (t === OsEventTypeList.LONG_PRESS_EVENT) {
    const item = screen.name === 'chat' || screen.name === 'confirm' ? screen.item : null
    if (item) void startListening(item)
    return
  }
  if (t === OsEventTypeList.LONG_PRESS_RELEASE_EVENT) return void stopListening()
  if (rec && t === OsEventTypeList.CLICK_EVENT) return void stopListening()
  if (busy) return
  if (t === OsEventTypeList.DOUBLE_CLICK_EVENT) return void back()
  if (t === OsEventTypeList.CLICK_EVENT) {
    if (screen.name === 'toast' || screen.name === 'listening') return
    const i = event.listEvent?.currentSelectItemIndex ?? 0
    busy = true
    void select(i).finally(() => (busy = false))
  }
  if (t === OsEventTypeList.SYSTEM_EXIT_EVENT || t === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    if (rec) void stopListening()
  }
})

await show(screen)
await home()
// Keep home fresh while it's on screen, so a new approval shows up on its own.
setInterval(() => {
  if (screen.name === 'home' && !busy) void home()
}, 20000)
