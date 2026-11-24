// One-time Telegram login by QR code: no phone number or SMS typed here.
// Open Telegram on your phone > Settings > Devices > Link Desktop Device, and scan.
// Or `npm run login -- +441234567890` to log in with the code Telegram sends to your app.
// Saves the session to server/.session (mode 600). Never commit it.
import { writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import QRCode from 'qrcode'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const apiId = Number(process.env.TG_API_ID)
const apiHash = process.env.TG_API_HASH ?? ''
if (!apiId || !apiHash) {
  console.error('Set TG_API_ID and TG_API_HASH (from my.telegram.org > API development tools) first.')
  process.exit(1)
}

const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 })
await client.connect()
const rl = createInterface({ input: process.stdin, output: process.stdout })

const phone = process.argv[2] // `npm run login -- +44...` = code login; no argument = QR login
if (phone) {
  await client.start({
    phoneNumber: phone,
    forceSMS: process.env.TG_FORCE_SMS === '1', // when no other device is logged in to read the code
    phoneCode: async () => rl.question('Login code from Telegram: '),
    password: async hint => rl.question(`Two-step verification password${hint ? ` (hint: ${hint})` : ''}: `),
    onError: err => console.error(err.message),
  })
} else await client.signInUserWithQrCode({ apiId, apiHash }, {
  qrCode: async code => {
    const url = `tg://login?token=${code.token.toString('base64url')}`
    console.log(await QRCode.toString(url, { type: 'terminal', small: true }))
    await QRCode.toFile('login-qr.png', url)
    console.log('Scan in Telegram: Settings > Devices > Link Desktop Device (also saved as login-qr.png). Refreshes every 30 s.')
  },
  password: async hint => rl.question(`Two-step verification password${hint ? ` (hint: ${hint})` : ''}: `),
  onError: async err => {
    console.error(err.message)
    return true
  },
})

await writeFile('.session', String(client.session.save()), { mode: 0o600 })
const me: any = await client.getMe()
console.log(`Logged in as ${me.firstName ?? ''} (@${me.username ?? 'no username'}). Session saved to server/.session.`)
rl.close()
await client.disconnect()
process.exit(0)
