// Demo approval bot for the video: posts staged requests with real inline buttons
// into the "Nod demo" group and answers presses. No money or deploys happen: it's a prop.
//   node src/demobot.ts post   -> post the staged requests, then keep answering presses
//   node src/demobot.ts        -> just answer presses
const TOKEN = process.env.NOD_DEMO_BOT_TOKEN
const CHAT = process.env.NOD_DEMO_CHAT || '-5359871175' // our demo group; set NOD_DEMO_CHAT for yours
if (!TOKEN) throw new Error('NOD_DEMO_BOT_TOKEN not set')
const api = async (method: string, body: object = {}) => {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j: any = await r.json()
  if (!j.ok) throw new Error(`${method}: ${j.description}`)
  return j.result
}

export const REQUESTS = [
  { text: 'ACTION: Renew the design tool seat for Maya, £12/month\nWHY: her trial ends tonight and the client review is tomorrow', yes: 'Approve', no: 'Deny' },
  { text: 'web v2.4 is ready for production: 3 commits, 128 tests green, preview checked. Deploy now?', yes: 'Deploy', no: 'Hold' },
]

if (process.argv[2] === 'post') {
  for (const [i, q] of REQUESTS.entries())
    await api('sendMessage', {
      chat_id: CHAT, text: q.text,
      reply_markup: { inline_keyboard: [[{ text: q.yes, callback_data: `y${i}` }, { text: q.no, callback_data: `n${i}` }]] },
    })
  console.log(`posted ${REQUESTS.length} requests`)
}

let offset = 0
for (;;) {
  const updates: any[] = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['callback_query'] }).catch(e => (console.error(e.message), []))
  for (const u of updates) {
    offset = u.update_id + 1
    const cb = u.callback_query
    if (!cb) continue
    const q = REQUESTS[Number(cb.data.slice(1))]
    const label = cb.data[0] === 'y' ? q?.yes : q?.no
    const who = cb.from.first_name
    await api('answerCallbackQuery', { callback_query_id: cb.id, text: `${label}: done` }).catch(() => {})
    await api('editMessageText', {
      chat_id: cb.message.chat.id, message_id: cb.message.message_id,
      text: `${cb.message.text}\n\n${label === 'Approve' || label === 'Deploy' ? '✅' : '⏸'} ${label} by ${who}`,
    }).catch(() => {})
    console.log(`${who} pressed ${label}`)
  }
}
