// Telegram provider: a real user account over MTProto (GramJS).
// Log in once with `npm run login` (QR code, scanned from the Telegram app).
// The session string stays on this server and is never sent to the glasses.
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import type { Button, ChannelPost, FeedItem, Msg, Provider } from './types.ts'

export interface TelegramConfig {
  apiId: number
  apiHash: string
  session: string
  /** usernames or ids of the chats to show; empty = unmuted private chats */
  chats: string[]
  /** usernames or ids of channels for the digest; empty = all unread channels */
  channels: string[]
}

const nameOf = (e: any): string =>
  e ? (e.title ?? [e.firstName, e.lastName].filter(Boolean).join(' ') ?? e.username ?? 'Unknown') : 'Unknown'

function inlineButtons(m: Api.Message): Button[] {
  const rm = m.replyMarkup
  if (!(rm instanceof Api.ReplyInlineMarkup)) return []
  const out: Button[] = []
  for (const row of rm.rows)
    for (const b of row.buttons)
      if (b instanceof Api.KeyboardButtonCallback) out.push({ label: b.text, data: Buffer.from(b.data).toString('base64') })
  return out
}

export async function createTelegramProvider(cfg: TelegramConfig): Promise<Provider> {
  const client = new TelegramClient(new StringSession(cfg.session), cfg.apiId, cfg.apiHash, { connectionRetries: 5 })
  client.setLogLevel('error' as any)
  await client.connect()
  if (!(await client.checkAuthorization())) throw new Error('Telegram session is not logged in: run npm run login')

  const entities = new Map<string, any>()
  const pressed = new Set<string>()
  const picked = new Set(cfg.chats.map(s => s.replace(/^@/, '').toLowerCase()))
  const channelPick = new Set(cfg.channels.map(s => s.replace(/^@/, '').toLowerCase()))
  const isPicked = (set: Set<string>, d: any) =>
    set.has(d.id.toString()) || (d.entity?.username && set.has(String(d.entity.username).toLowerCase()))

  async function dialogs() {
    const ds = await client.getDialogs({ limit: 80 })
    for (const d of ds) entities.set(d.id!.toString(), d.entity)
    return ds
  }
  const entity = (chatId: string) => {
    const e = entities.get(chatId)
    if (!e) throw new Error(`unknown chat ${chatId}`)
    return e
  }
  const muted = (d: any) => (d.dialog?.notifySettings?.muteUntil ?? 0) > Date.now() / 1000

  return {
    name: 'telegram',
    async feed() {
      const ds = await dialogs()
      const approvals: FeedItem[] = []
      const chats: FeedItem[] = []
      const dayAgo = Date.now() / 1000 - 86400
      for (const d of ds) {
        const id = d.id!.toString()
        const ent: any = d.entity
        const want = picked.size ? isPicked(picked, d) : d.isUser && !ent?.bot && !muted(d)
        // Approvals: recent bot messages with callback buttons, in bot chats or picked chats.
        if ((ent?.bot || want || d.isGroup) && d.message && d.message.date > dayAgo) {
          const recent = d.unreadCount > 0 || want ? await client.getMessages(ent, { limit: 8 }) : []
          for (const m of recent) {
            if (m.date < dayAgo || pressed.has(`${id}:${m.id}`)) continue
            const buttons = inlineButtons(m)
            if (!buttons.length) continue
            const sender = await m.getSender().catch(() => undefined)
            approvals.push({
              key: `a:${id}:${m.id}`, kind: 'approval', chatId: id, chatTitle: d.title ?? nameOf(ent),
              msgId: m.id, from: nameOf(sender) || d.title || 'Bot', text: m.message ?? '', date: m.date,
              unread: d.unreadCount, buttons,
            })
          }
        }
        if (want && !ent?.bot && d.unreadCount > 0 && d.message && !d.message.out) {
          const sender = await d.message.getSender().catch(() => undefined)
          chats.push({
            key: `c:${id}`, kind: 'chat', chatId: id, chatTitle: d.title ?? nameOf(ent), msgId: d.message.id,
            from: nameOf(sender), text: d.message.message ?? '', date: d.message.date, unread: d.unreadCount,
          })
        }
      }
      approvals.sort((a, b) => b.date - a.date)
      chats.sort((a, b) => b.date - a.date)
      return [...approvals.slice(0, 6), ...chats.slice(0, 12)]
    },
    async history(chatId, limit) {
      const ms = await client.getMessages(entity(chatId), { limit })
      const out: Msg[] = []
      for (const m of ms.reverse()) {
        if (!m.message) continue
        const s = m.out ? undefined : await m.getSender().catch(() => undefined)
        out.push({ id: m.id, from: m.out ? 'You' : nameOf(s), out: !!m.out, text: m.message, date: m.date })
      }
      return out
    },
    async send(chatId, text, replyTo) {
      await client.sendMessage(entity(chatId), { message: text, replyTo })
    },
    async press(chatId, msgId, data) {
      const ans: any = await client.invoke(
        new Api.messages.GetBotCallbackAnswer({ peer: entity(chatId), msgId, data: Buffer.from(data, 'base64') }),
      )
      pressed.add(`${chatId}:${msgId}`)
      await client.markAsRead(entity(chatId)).catch(() => {})
      return ans?.message || 'Done'
    },
    async markRead(chatId) {
      await client.markAsRead(entity(chatId))
    },
    async channelPosts(since) {
      const ds = await dialogs()
      const out: ChannelPost[] = []
      for (const d of ds) {
        if (!d.isChannel || d.isGroup) continue
        if (channelPick.size ? !isPicked(channelPick, d) : d.unreadCount === 0) continue
        const ms = await client.getMessages(d.entity, { limit: 10 })
        for (const m of ms) if (m.message && m.date >= since) out.push({ channel: d.title ?? 'Channel', text: m.message.slice(0, 600), date: m.date })
      }
      return out.sort((a, b) => b.date - a.date).slice(0, 30)
    },
  }
}
