// Speech-to-text: G2 mic audio (PCM s16le, 16 kHz, mono) -> text.
// Default backend is a local whisper.cpp server (whisper-server), so voice
// never leaves our own machine. Set WHISPER_URL to point elsewhere.

export function pcmToWav(pcm: Uint8Array, rate = 16000): Uint8Array {
  const h = new DataView(new ArrayBuffer(44))
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE')
  w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true)
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true)
  w(36, 'data'); h.setUint32(40, pcm.length, true)
  const out = new Uint8Array(44 + pcm.length)
  out.set(new Uint8Array(h.buffer), 0)
  out.set(pcm, 44)
  return out
}

export async function transcribe(pcm: Uint8Array): Promise<string> {
  if (pcm.length < 16000) return '' // under half a second: treat as an accidental press
  const url = process.env.WHISPER_URL || 'http://127.0.0.1:8179/inference'
  const form = new FormData()
  form.append('file', new Blob([pcmToWav(pcm)], { type: 'audio/wav' }), 'reply.wav')
  form.append('response_format', 'json')
  form.append('temperature', '0')
  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`whisper ${res.status}`)
  const j = (await res.json()) as { text?: string }
  return (j.text ?? '').replace(/\[[^\]]*\]/g, '').trim()
}
