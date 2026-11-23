// Shared shapes between the Telegram providers, the AI layer and the HTTP API.

export interface Button {
  label: string
  /** base64 of the inline button's callback data */
  data: string
}

export interface Msg {
  id: number
  from: string
  out: boolean
  text: string
  /** unix seconds */
  date: number
}

export interface FeedItem {
  /** "a:<chat>:<msg>" for approvals, "c:<chat>" for chats */
  key: string
  kind: 'approval' | 'chat'
  chatId: string
  chatTitle: string
  msgId: number
  from: string
  text: string
  date: number
  unread: number
  buttons?: Button[]
}

export interface ChannelPost {
  channel: string
  text: string
  date: number
}

export interface Provider {
  name: string
  /** Approvals first (bot messages with inline buttons), then picked chats with unread messages. */
  feed(): Promise<FeedItem[]>
  history(chatId: string, limit: number): Promise<Msg[]>
  send(chatId: string, text: string, replyTo?: number): Promise<void>
  press(chatId: string, msgId: number, data: string): Promise<string>
  markRead(chatId: string): Promise<void>
  channelPosts(sinceUnix: number): Promise<ChannelPost[]>
}
