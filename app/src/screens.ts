// Pure screen model: state in, what the glasses show out. No SDK here, so it is
// unit-tested without a simulator. One screen = a text block + an optional list.

export interface FeedItem {
  key: string
  kind: 'approval' | 'chat'
  chatId: string
  msgId: number
  title: string
  from: string
  gist: string
  text: string
  unread: number
  buttons?: { label: string; data: string }[]
}

export type Screen =
  | { name: 'home'; items: FeedItem[]; note?: string }
  | { name: 'approval'; item: FeedItem }
  | { name: 'chat'; item: FeedItem; lines: string[]; drafts: string[]; replyTo?: number; loading?: boolean }
  | { name: 'listening'; item: FeedItem; seconds: number }
  | { name: 'confirm'; item: FeedItem; text: string; replyTo?: number; heard?: string }
  | { name: 'digest'; lines: string[] }
  | { name: 'toast'; text: string }

export interface View {
  text: string
  /** height of the text block; the list fills the rest */
  textHeight: number
  list?: string[]
}

export const W = 576
export const H = 288
export const SPEAK = 'Speak a reply (or hold)'
export const BACK = 'Back'
export const DIGEST = 'Channel digest'
export const REFRESH = 'Refresh'

/** List rows are capped at 63 UTF-8 bytes by the firmware. */
export function fit(s: string, bytes = 60): string {
  const one = s.replace(/\s+/g, ' ').trim()
  const enc = new TextEncoder()
  if (enc.encode(one).length <= bytes) return one
  let out = ''
  for (const ch of one) {
    if (enc.encode(out + ch + '...').length > bytes) break
    out += ch
  }
  return out.trimEnd() + '...'
}

const firstName = (s: string) => s.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || s

export function homeRow(it: FeedItem): string {
  if (it.kind === 'approval') return fit(`! ${it.title.length <= 14 ? it.title : firstName(it.title)}: ${it.gist}`)
  const n = it.unread > 1 ? ` (${it.unread})` : ''
  return fit(`${firstName(it.title)}${n}: ${it.gist}`)
}

export function view(s: Screen): View {
  switch (s.name) {
    case 'home': {
      const a = s.items.filter(i => i.kind === 'approval').length
      const c = s.items.length - a
      const head = s.note ?? (s.items.length
        ? [a && `${a} to approve`, c && `${c} to answer`].filter(Boolean).join(' · ')
        : 'All clear. Nothing needs you.')
      return { text: `NOD  ${head}`, textHeight: 40, list: [...s.items.map(homeRow), DIGEST, REFRESH] }
    }
    case 'approval':
      return {
        text: `${s.item.title} asks:\n${s.item.gist}\n\n${clip(s.item.text.replace(/\n+/g, ' / '), 150)}`,
        textHeight: 168,
        list: [...(s.item.buttons ?? []).map(b => fit(b.label, 40)), BACK],
      }
    case 'chat':
      return {
        text: clip(s.lines.join('\n'), 150),
        textHeight: 128,
        list: s.loading ? ['Drafting replies...', SPEAK, BACK] : [...s.drafts.map(d => fit(d)), SPEAK, BACK],
      }
    case 'listening':
      return { text: `To ${s.item.title}\n\nListening... ${s.seconds}s\nRelease or tap to finish`, textHeight: H }
    case 'confirm':
      return {
        text: `Send to ${s.item.title}?\n\n${clip(s.text, 220)}`,
        textHeight: 168,
        list: ['Send', 'Say it again', 'Cancel'],
      }
    case 'digest':
      return {
        text: s.lines.length ? `Channels since you last looked\n${s.lines.map(l => `- ${l}`).join('\n')}` : 'No new channel posts.',
        textHeight: 248,
        list: [BACK],
      }
    case 'toast':
      return { text: `\n\n      ${s.text}`, textHeight: H }
  }
}

export function clip(s: string, n: number): string {
  const one = s.replace(/[ \t]+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 3).trimEnd() + '...' : one
}
