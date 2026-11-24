// One-off: make the demo bot via BotFather and the "Nod demo" group (Alex, Vova, Zahar, the bot).
// Runs on Nod's own Telegram session. The bot token goes straight into the keychain; it is never printed.
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const FOUNDERS = [464995293, 563525469] // Alex, Volodymyr (bridge/config.json)
const session = (await readFile(new URL('../.session', import.meta.url), 'utf8')).trim()
const client = new TelegramClient(new StringSession(session), Number(process.env.TG_API_ID), process.env.TG_API_HASH!, { connectionRetries: 5 })
client.setLogLevel('error' as any)
await client.connect()
await client.getDialogs({ limit: 200 })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function ask(peer: string, text: string): Promise<string> {
  const before = (await client.getMessages(peer, { limit: 1 }))[0]?.id ?? 0
  await client.sendMessage(peer, { message: text })
  for (let i = 0; i < 20; i++) {
    await sleep(1000)
    const [m] = await client.getMessages(peer, { limit: 1 })
    if (m && m.id > before && !m.out) return m.message ?? ''
  }
  throw new Error(`no answer from ${peer} to ${text}`)
}

let botUser = process.env.BOT_USERNAME
if (!botUser) {
  await ask('BotFather', '/newbot')
  await ask('BotFather', 'Nod Demo Ops')
  for (const u of ['nod_demo_ops_bot', 'nod_g2_demo_bot', `nod_demo_${Date.now() % 100000}_bot`]) {
    const r = await ask('BotFather', u)
    const token = r.match(/\d{6,}:[A-Za-z0-9_-]{30,}/)?.[0]
    if (token) {
      const k = spawnSync(`${process.env.HOME}/zahar-setup/tg-bot/caller/.venv/bin/python`, ['-I', '-c',
        'import keyring,sys;keyring.set_password("zahar-nod-demo-bot","token",sys.stdin.read().strip())'], { input: token })
      if (k.status !== 0) throw new Error('could not save the token to the keychain')
      botUser = u
      console.log(`bot @${u} created, token saved to keychain zahar-nod-demo-bot/token`)
      break
    }
    console.log(`@${u} not available: ${r.slice(0, 80)}`)
  }
  if (!botUser) throw new Error('no bot username worked')
}

const users = [...(await Promise.all(FOUNDERS.map(id => client.getInputEntity(id).catch(() => null)))), await client.getInputEntity(botUser)]
const missing = users.filter(u => !u).length
const res: any = await client.invoke(new Api.messages.CreateChat({ users: users.filter(Boolean) as any, title: 'Nod demo (G2 hackathon)' }))
const chat = res.updates?.chats?.[0] ?? res.chats?.[0]
console.log(`group created: id ${chat?.id} ${missing ? `(${missing} founder(s) not resolvable, add by hand)` : ''}`)
const failed = res.missingInvitees?.length ?? 0
if (failed) console.log(`${failed} invitee(s) couldn't be added (privacy settings): send them an invite link`)
await client.disconnect()
process.exit(0)
