// Demo provider: a fake Telegram account with staged chats, so the app runs
// end to end without logging in. Used for tests, and as the fallback when no
// Telegram session is configured. Everything here is invented sample data.
import type { Button, ChannelPost, FeedItem, Msg, Provider } from './types.ts'

const b64 = (s: string) => Buffer.from(s).toString('base64')

interface Chat {
  id: string
  title: string
  bot?: boolean
  unread: number
  msgs: (Msg & { buttons?: Button[] })[]
}

export function createDemoProvider(now = () => Math.floor(Date.now() / 1000)): Provider {
  const t = now()
  const chats: Chat[] = [
    {
      id: 'agent',
      title: 'Ops agent',
      bot: true,
      unread: 1,
      msgs: [
        {
          id: 41, from: 'Ops agent', out: false, date: t - 240,
          text: 'ACTION: Renew the design tool seat for Maya, £12/month\nWHY: her trial ends tonight and the client review is tomorrow\nReply YES / NO',
          buttons: [{ label: 'Approve', data: b64('yes:41') }, { label: 'Deny', data: b64('no:41') }],
        },
      ],
    },
    {
      id: 'deploy',
      title: 'Deploy bot',
      bot: true,
      unread: 1,
      msgs: [
        {
          id: 7, from: 'Deploy bot', out: false, date: t - 600,
          text: 'web v2.4 is ready for production. 3 commits, 128 tests green, preview checked. Deploy now?',
          buttons: [{ label: 'Deploy', data: b64('deploy:7') }, { label: 'Hold', data: b64('hold:7') }],
        },
      ],
    },
    {
      id: 'anna',
      title: 'Anna (client)',
      unread: 2,
      msgs: [
        { id: 3, from: 'You', out: true, date: t - 86400, text: 'Sent the new homepage mockups, have a look when you can.' },
        { id: 4, from: 'Anna', out: false, date: t - 900, text: 'Looked at them, love the hero. The pricing block feels busy though.' },
        { id: 5, from: 'Anna', out: false, date: t - 840, text: "Can we move tomorrow's call from 2 to 3pm? Something came up." },
      ],
    },
    {
      id: 'sam',
      title: 'Sam',
      unread: 1,
      msgs: [
        { id: 9, from: 'Sam', out: false, date: t - 300, text: 'Train is stuck outside Reading, running 15 min late. Start standup without me?' },
      ],
    },
  ]

  const posts: ChannelPost[] = [
    { channel: 'AI Daily', date: t - 3600, text: 'Open-weights model tops a coding benchmark, beating two closed models on a fraction of the compute.' },
    { channel: 'AI Daily', date: t - 7200, text: 'EU publishes draft guidance on labelling AI-generated video; consultation runs to January.' },
    { channel: 'Founders Notes', date: t - 5400, text: 'Thread: the 3 emails that got our first 10 customers. Short, specific, one ask each.' },
    { channel: 'Crypto Wire', date: t - 1800, text: 'Testnet upgrade goes live tonight; validators asked to update before 22:00 UTC.' },
    { channel: 'Crypto Wire', date: t - 9000, text: 'Stablecoin volumes up 14% week on week, mostly on L2s.' },
  ]

  const find = (id: string) => {
    const c = chats.find(c => c.id === id)
    if (!c) throw new Error(`no chat ${id}`)
    return c
  }

  return {
    name: 'demo',
    async feed() {
      const out: FeedItem[] = []
      for (const c of chats) {
        const last = c.msgs[c.msgs.length - 1]
        if (last?.buttons?.length) {
          out.push({
            key: `a:${c.id}:${last.id}`, kind: 'approval', chatId: c.id, chatTitle: c.title,
            msgId: last.id, from: last.from, text: last.text, date: last.date, unread: c.unread, buttons: last.buttons,
          })
        }
      }
      for (const c of chats) {
        if (c.bot || c.unread === 0) continue
        const last = c.msgs[c.msgs.length - 1]
        out.push({
          key: `c:${c.id}`, kind: 'chat', chatId: c.id, chatTitle: c.title,
          msgId: last.id, from: last.from, text: last.text, date: last.date, unread: c.unread,
        })
      }
      return out
    },
    async history(chatId, limit) {
      return find(chatId).msgs.slice(-limit).map(({ buttons, ...m }) => m)
    },
    async send(chatId, text) {
      const c = find(chatId)
      c.msgs.push({ id: (c.msgs.at(-1)?.id ?? 0) + 1, from: 'You', out: true, date: now(), text })
      c.unread = 0
    },
    async press(chatId, msgId, data) {
      const c = find(chatId)
      const m = c.msgs.find(m => m.id === msgId)
      const btn = m?.buttons?.find(b => b.data === data)
      if (!m || !btn) throw new Error('button not found')
      m.buttons = undefined
      m.text += `\n\nYou pressed: ${btn.label}`
      c.unread = 0
      return `${btn.label}: done`
    },
    async markRead(chatId) {
      find(chatId).unread = 0
    },
    async channelPosts(since) {
      return posts.filter(p => p.date >= since)
    },
  }
}
