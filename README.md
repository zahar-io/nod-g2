# Nod: approve and reply on Telegram from your Even G2

Your bots and AI agents ask you things all day on Telegram: approve this spend, deploy this build, confirm this booking. Nod puts those questions on your G2 with the bot's own buttons, so you answer with one tap. The same goes for the people who are waiting on you: Claude has three replies ready, or you hold the touchpad, say what you mean and confirm.

Built for **Heads Up: Even Realities Hackathon** (DoraHacks, 23-29 Nov 2026).
Tracks: **01 Messaging & News** (Telegram) and **04 AI Assistants & Work** (Claude). Also entering **Best Telegram integration**.

## What it does on the glasses

| Screen | You see | You do |
|---|---|---|
| Home | Approvals first (`!`), then the chats waiting on you, each as one Claude-written line | Scroll, tap one |
| Approval | What the bot is asking, in a few words, plus its own buttons (Approve / Deny, Deploy / Hold...) | Tap a button: Nod presses that exact inline button in Telegram |
| Chat | What they said since your last message, plus 3 reply drafts from Claude | Tap a draft, or hold to speak |
| Voice | "Listening..." | Release. Whisper transcribes, Claude cleans up the dictation, keeping your words and language |
| Confirm | The exact text that will be sent | Send / Say it again / Cancel. Nothing is ever sent without this tap |
| Digest | 5 lines on what your channels posted since you last looked | Tap to go back |

Double-tap goes back (and exits from home). Tap-and-hold opens the glasses menu with Refresh and Channel digest.

## How it works

```
G2 glasses  <-BLE->  Even app WebView (app/)  --HTTPS-->  Nod server (server/)
                                                          |- Telegram user account (MTProto via GramJS)
                                                          |- Claude (reply drafts, one-line gists, dictation clean-up, digest)
                                                          '- Whisper (speech-to-text, self-hosted whisper.cpp)
```

- **app/**: Vite + TypeScript + Even Hub SDK 0.0.16. `screens.ts` is a pure state-to-screen model (unit-tested); `main.ts` drives the glasses (list + text containers, long-press push-to-talk, mic PCM capture, contextual menu); the phone page mirrors what's on the glasses and holds the pairing settings.
- **server/**: Node 22+ (TypeScript run natively). One small HTTP API: `/api/feed`, `/api/chat`, `/api/send`, `/api/press`, `/api/voice`, `/api/digest`. The glasses only ever receive display-ready text.
- **Telegram**: a real user account, so Nod sees your actual chats and can press inline buttons on any bot's message (`messages.getBotCallbackAnswer`). Login is a QR code scanned from the Telegram app; no phone number or SMS code is typed into Nod.
- **Claude**: Anthropic SDK (`claude-opus-5-5` at low effort by default, `NOD_MODEL` to change) when `ANTHROPIC_API_KEY` is set, otherwise the local `claude` CLI. Every prompt treats message text as data, never as instructions.
- **Speech**: G2 mic audio (16 kHz PCM) goes to your own Nod server, then to a self-hosted whisper.cpp server. Audio never goes to a third party.

## Run it

Requirements: Node 22.18+, `npm i -g @evenrealities/evenhub-cli @evenrealities/evenhub-simulator`, and for voice a [whisper.cpp](https://github.com/ggml-org/whisper.cpp) server (`whisper-server -m ggml-large-v3-turbo-q5_0.bin --port 8179`).

```bash
# 1. Build the glasses app (the server serves it)
cd app && npm install && npm run build

# 2a. Try it on the built-in demo account (staged chats, nothing real)
cd ../server && npm install && npm run demo

# 2b. Or on your own Telegram: get an api_id/api_hash at my.telegram.org, put them in server/.env
#     (TG_API_ID=..., TG_API_HASH=..., optional NOD_CHATS=@anna,@sam  NOD_CHANNELS=@somechannel  NOD_TOKEN=<pairing code>)
npm run login     # scan the QR in Telegram > Settings > Devices > Link Desktop Device
npm start         # http://localhost:8787

# 3. Open it in the simulator (or `evenhub qr --url http://<lan-ip>:8787` for real glasses)
evenhub-simulator http://localhost:8787 --automation-port 9898
```

No microphone on your machine? `http://localhost:8787/?simmic=/demo/reply.pcm` feeds a recorded clip through the same mic path in 100 ms frames, exactly as the G2 sends them. The demo video uses this, because the Mac we built on has no mic.

Tests: `cd server && npm test`, `cd app && npm test`.

## Safety and privacy

- Nothing is sent or pressed without an explicit tap on a confirm screen or on the button itself.
- Your Telegram session lives only on your server (`server/.session`, mode 600, git-ignored). API keys live in env vars on the server, never in the app or this repo.
- The glasses app talks only to your Nod server, which is pinned in `app.json`'s network whitelist, and a pairing code (`NOD_TOKEN`) is required when set.
- No message content is stored. Gists and drafts are cached in memory only, for speed.
- No money moves through Nod. Approving a payment just presses the button your own bot offers; the bot stays in charge.

## Built by an AI, said plainly

Nod was designed, coded, tested and demoed by **Zahar**, an AI agent made by [Flovr](https://flovr.co.uk), running Claude Code on a Mac Mini in London. Entrant: Volodymyr Romanenko (Flovr). The Flovr founders set the goal; the code in this repo was written by the agent during the hackathon.

## What existed before 23 Nov 2026

- The input-handling pattern (tap arrives with no `eventType`, double-tap to exit) follows Even Realities' official [evenhub-templates](https://github.com/even-realities/evenhub-templates) (MIT).
- Libraries: Even Hub SDK, GramJS (`telegram`), Anthropic SDK, `qrcode`, Vite. whisper.cpp was already installed on our Mac Mini for other projects.
- Everything in `app/src` and `server/src` was written from 23 Nov 2026.

## Feature requests for the API teams

1. **Even Hub SDK:** a first-party speech-to-text API, so every app doesn't need its own Whisper server.
2. **Even Hub SDK:** a way to raise a short notification while another app is in the foreground ("1 approval waiting"), opt-in per app.
3. **Telegram:** a Bot API method that lets a user's own client app read pending inline-keyboard prompts across bots, without a full MTProto user session.
4. **Even Hub simulator:** simulated mic input from a WAV file, for machines with no audio input.
5. **Even Hub SDK:** list rows longer than 63 bytes, or two-line rows, for non-Latin languages.

## Licence

MIT
