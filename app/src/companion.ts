// Phone-side page: pair with a Nod server, and mirror what the glasses show.
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { Settings } from './client.ts'
import type { View } from './screens.ts'

export async function mountCompanion(bridge: EvenAppBridge): Promise<Settings> {
  const saved = async (k: string) => (await bridge.getLocalStorage(k).catch(() => '')) || ''
  const s: Settings = {
    server: (await saved('nod.server')) || import.meta.env.VITE_NOD_SERVER || location.origin,
    token: (await saved('nod.token')) || import.meta.env.VITE_NOD_TOKEN || '',
    simMic: new URLSearchParams(location.search).get('simmic') || undefined,
  }
  const app = document.getElementById('app')!
  app.innerHTML = `
    <h1>Nod</h1>
    <p class="sub">Telegram approvals and replies on your G2.</p>
    ${s.simMic ? '<p class="sub">Simulated mic: voice replies use a recorded clip.</p>' : ''}
    <div class="glass"><pre id="g-text"></pre><ol id="g-list"></ol></div>
    <details><summary>Pairing</summary>
      <label>Server <input id="srv" value="${s.server}"></label>
      <label>Pairing code <input id="tok" value="${s.token}" type="password"></label>
      <button id="save">Save and reload</button>
    </details>`
  document.getElementById('save')!.onclick = async () => {
    await bridge.setLocalStorage('nod.server', (document.getElementById('srv') as HTMLInputElement).value.trim())
    await bridge.setLocalStorage('nod.token', (document.getElementById('tok') as HTMLInputElement).value.trim())
    location.reload()
  }
  return s
}

export function mirror(v: View) {
  const t = document.getElementById('g-text')
  const l = document.getElementById('g-list')
  if (!t || !l) return
  t.textContent = v.text
  l.innerHTML = ''
  for (const row of v.list ?? []) {
    const li = document.createElement('li')
    li.textContent = row
    l.appendChild(li)
  }
}
