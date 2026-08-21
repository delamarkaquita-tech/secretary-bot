<div align="center">

# Secretary Bot

**An AI auto-responder for your personal Telegram account.**

When someone messages you, a bot connected via Telegram's Business (Secretary) Mode replies *as you* — in your voice, your language, and within your rules — powered by Google Gemini 2.5 Flash.

[![CI](https://github.com/dostonsulaymon/secretary-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/dostonsulaymon/secretary-bot/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![grammY](https://img.shields.io/badge/grammY-1.30-009688)](https://grammy.dev/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

</div>

---

## Overview

Secretary Bot uses Telegram's [Business Mode](https://core.telegram.org/bots#business) (also called *Chat Automation* / *Secretary Mode*) to handle incoming messages on your behalf. Unlike a generic chatbot, it's built to sound like **you**: it reads from a small set of your real example messages, mirrors your tone and language, and respects boundaries you define — so replies feel personal, not robotic.

## Features

- 🧠 **Speaks in your voice** — few-shot examples from your own messages teach it your tone, length, and style.
- 👥 **Per-contact awareness** — set tone, gender, and rules per sender (casual with friends, "never quote a price" to clients).
- 🤝 **Learns relationships** — paste a real chat and it captures how you talk to *that specific person* (tone + example exchanges), so replies match each relationship.
- 🗣️ **Configure by chat** — DM the bot *"treat @ali as my client, he's a he"* or *"add a fact: I don't work weekends"* and it parses, confirms, and saves contacts **and facts** — no file editing, no restart.
- 📇 **Personal knowledge base** — answers from a facts/FAQ file, and refuses to invent personal details it doesn't know.
- ⌨️ **Human pacing** — bursty, bimodal timing: usually replies in seconds, but occasionally goes quiet for a minute or two like someone who stepped away, then a short "typing…" burst right before sending. Momentum-aware (rapid back-and-forth stays snappy).
- 🎙️ **Voice notes** — transcribes incoming voice messages (Uzbek/Russian/English, kept verbatim) and replies to them like any text.
- 🌍 **Language-matching** — replies in whatever language the sender writes in.
- 🏠 **Local or cloud** — run on Gemini, or fully offline on a local model via Ollama, or mix the two per job.
- 💬 **Per-chat memory** — keeps the last 20 message pairs of context for each conversation.
- ⏰ **Time-aware** — grounded with your real local date/time, so it never fabricates "what time is it?"
- 🔇 **No leaked reasoning** — Gemini's internal thinking is disabled and sanitized so only the final message is sent.
- 🛡️ **Safe by design** — never replies to your own messages, respects Telegram's 24-hour window, and notifies you instead of sending a broken reply on failure.

## How it works

```
Someone messages YOU ──▶ Telegram ──(business_message)──▶ Secretary Bot ──▶ Gemini 2.5 Flash
                                                                              │
          Their chat  ◀──(sendMessage with business_connection_id)───────────┘
```

The bot subscribes to Telegram's `business_connection` and `business_message` updates. For each incoming message it composes a prompt (persona + your voice examples + per-message context + recent history), calls Gemini, and sends the reply back into the chat **as you** via the `business_connection_id` parameter.

## Prerequisites

- **Node.js ≥ 18**
- A **Telegram bot token** — from [@BotFather](https://t.me/BotFather)
- **Business (Secretary) Mode enabled** on that bot in BotFather — see [step 1](#1-enable-business-mode-on-the-bot). Without it, Telegram won't deliver the `business_message` updates the bot depends on, and nothing will work.
- A **Google Gemini API key** — from [Google AI Studio](https://aistudio.google.com/apikey)

## Quick start

```bash
git clone https://github.com/dostonsulaymon/secretary-bot.git
cd secretary-bot
npm install
cp .env.example .env       # then fill in your values
npm run dev                # run from source
```

### 1. Enable Business Mode on the bot

In [@BotFather](https://t.me/BotFather): `/mybots` → select your bot → **Bot Settings** → **Business Mode** → **Enable**.

### 2. Connect the bot to your profile

In the Telegram app: **Settings → Telegram Business → Chatbots** *(or **Chat Automation** on some clients)* → enter `@yourbotusername`, and grant the **"Reply to messages"** permission.

You'll receive a confirmation DM: `✅ Secretary Mode active`.

### 3. Personalize it (recommended)

Three optional, gitignored files shape how the bot behaves. Each ships with a committed `*.example.json` template — copy and edit:

```bash
cp voice.example.json    voice.json      # how you talk
cp contacts.example.json contacts.json   # who you talk to
cp facts.example.json    facts.json      # what you know
```

- **`voice.json`** — paste **15–20 of your real Telegram replies** plus `style` hints. Examples teach tone far better than instructions; this is what makes replies sound like you.
- **`contacts.json`** — per-sender `tone`, `relationship`, and `notes`/rules, keyed by `chat_id` or `@username`. A `default` entry covers everyone else.
- **`facts.json`** — `facts` the bot may rely on and `faq` guidance. It answers from these and refuses to invent personal details beyond them.

Restart the bot after editing — these load once at startup.

> **Tip:** You don't have to edit `contacts.json` or `facts.json` by hand. Just **DM the bot** (from your owner account) in plain language — it confirms before saving, and changes apply with no restart:
> - **Contacts:** *"treat @ali as my client, formal, he's a he, never quote prices"* · *"who is @ali"* · *"list my contacts"* · *"forget @ali"*
> - **Teach a relationship:** *"this is my chat with @bekzod:"* then paste a real conversation → it learns the tone and saves up to 10 example exchanges for that person
> - **Facts:** *"add a fact: I don't work weekends"* · *"when someone asks for my email, tell them to message me here"* · *"what do you know about me"* · *"forget the fact about weekends"*
> - **Clear (asks to confirm):** *"clear all facts"* · *"clear all contacts"* · *"reset everything"*
>
> To tag someone without a public `@username`, use their numeric `chat_id` (the bot logs each sender's id when they message you).

## Configuration

All configuration lives in `.env` (see [`.env.example`](.env.example)):

| Variable | Required | Description |
|---|:---:|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from BotFather |
| `GEMINI_API_KEY` | ✅* | Google Gemini API key. *Not required if every job is routed to a local provider |
| `OWNER_USER_ID` | ✅ | Your numeric Telegram ID ([@userinfobot](https://t.me/userinfobot)) — used to notify you and to ignore your own messages |
| `SYSTEM_PROMPT` | ✅ | Base persona / instructions for the model |
| `OWNER_TIMEZONE` | — | IANA timezone for date/time grounding (default `Asia/Tashkent`) |
| `NATURAL_TYPING` | — | Show "typing…" and delay replies to feel human; `false` to reply instantly (default `true`) |
| `AI_PROVIDER` | — | `gemini` (default) or `ollama`. Sets all three jobs at once |
| `AI_PROVIDER_CHAT` / `_ADMIN` / `_TRANSCRIBE` | — | Override the provider per job — see [Model providers](#model-providers) |
| `GEMINI_MODEL` | — | Default `gemini-2.5-flash` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | — | Default `http://localhost:11434` / `gemma3:12b` |
| `OLLAMA_NUM_CTX` / `OLLAMA_KEEP_ALIVE` | — | Default `8192` / `30m` |
| `WHISPER_BASE_URL` / `WHISPER_MODEL` / `WHISPER_LANGUAGE` | — | Local speech-to-text, only for `AI_PROVIDER_TRANSCRIBE=whisper` |

## Model providers

The bot runs on **Google Gemini** (cloud) by default, or a **local model via [Ollama](https://ollama.com)** — with no API key, no per-message cost, and no message ever leaving your machine.

Local support is opt-in and backwards-compatible: an existing `.env` with none of these variables set behaves exactly as it always did.

### Three jobs, chosen independently

The bot asks a model to do three different things, and local models are *not* equally good at all three. So each is routed separately:

| Job | What it does | Local viability |
|---|---|---|
| `chat` | The replies real people receive, sent as you | **Weakest.** Fine in English; unreliable in low-resource languages |
| `admin` | Parses your own DM commands into JSON | **Excellent.** Ollama constrains decoding with `format: "json"` |
| `transcribe` | Voice notes → text | **Not possible in Ollama** — needs whisper (see below) |

`AI_PROVIDER` sets all three; `AI_PROVIDER_CHAT`, `AI_PROVIDER_ADMIN` and `AI_PROVIDER_TRANSCRIBE` override individually. That is what makes the useful hybrid possible:

```env
# Gemini writes the replies people actually read;
# the local model handles your admin commands for free.
AI_PROVIDER=gemini
AI_PROVIDER_ADMIN=ollama
```

### Quick start — fully local

```bash
curl -fsSL https://ollama.com/install.sh | sh   # if you don't have it
ollama pull gemma3:12b
```

```env
AI_PROVIDER=ollama
OLLAMA_MODEL=gemma3:12b
AI_PROVIDER_TRANSCRIBE=whisper    # or =gemini, or drop voice-note support
```

Then check it before letting it near a real chat:

```bash
npx ts-node scripts/dry-run.ts "salom, qalesan?" -n 3
```

### Choosing a model

Two things matter far more than benchmark scores: **your VRAM**, and **the languages you actually get messaged in**.

| Model | Size | Notes |
|---|---|---|
| `gemma3:12b` | ~8 GB | **Recommended starting point.** Shares Gemini's 262k tokenizer and is trained for 140+ languages. Clearly the best of the four tested at Uzbek, and excellent at English |
| `mistral-nemo:12b` | ~7 GB | Good casual English tone, fits comfortably in 12 GB VRAM |
| `qwen2.5:14b` | ~9 GB | The most precise at `admin` JSON parsing (gemma3 mis-fills the `match` field when deleting facts); notably weaker at conversational non-English |
| `gemma3:27b` / `qwen2.5:32b` | 17 GB+ | Noticeably better, but needs 24 GB+ VRAM to stay on the GPU |

> **Fit the model in VRAM.** On a 12 GB card a ~9 GB model spills to CPU and slows to a crawl, while a ~7–8 GB one stays fully resident. `ollama ps` shows the CPU/GPU split. `OLLAMA_KEEP_ALIVE` keeps it loaded between messages — a cold load costs 5–15s, enough to blow through the natural-pacing gap.

### ⚠️ Honest limitations of local chat

Measured on a 12 GB RTX 3080 Ti, not extrapolated from benchmarks:

- **Low-resource languages are the real ceiling.** For Uzbek, 12–14B models produced grammatically broken output that no owner would want sent under their own name. Gemini handled the same prompts cleanly. If you're messaged in a low-resource language, **keep `chat` on Gemini** and route only `admin` locally.
- **Language matching degrades.** Small models over-index on the few-shot examples in `voice.json` and reply in *that* language regardless of what the sender wrote — e.g. answering a Russian message in Uzbek. Adding an explicit language directive helps but does not fix it.
- **Test with `-n 3` or more.** Replies are sampled at temperature 0.85. During development a single lucky sample made a model look far better than repeated runs showed it to be.
- **Reasoning models leak.** Qwen3 and DeepSeek-R1 distills emit `<think>` blocks. The bot sets `think: false` and strips the tags in `sanitizeReply()`, but a non-reasoning model is one less thing to go wrong.

English-only? Local is genuinely viable. Otherwise treat it as a cost-saver for `admin`, not a drop-in replacement for `chat`.

### Voice notes on a local stack

Ollama serves text and vision models only — it has **no** speech-to-text. For fully-local voice notes, run any server exposing the OpenAI-compatible `/v1/audio/transcriptions` endpoint ([whisper.cpp](https://github.com/ggerganov/whisper.cpp), [faster-whisper-server](https://github.com/fedirz/faster-whisper-server), [Speaches](https://github.com/speaches-ai/speaches), LocalAI):

```env
AI_PROVIDER_TRANSCRIBE=whisper
WHISPER_BASE_URL=http://localhost:8080/v1
WHISPER_MODEL=whisper-1
WHISPER_LANGUAGE=uz      # optional; pinning helps a lot on short clips
```

Set `AI_PROVIDER_TRANSCRIBE=gemini` to keep cloud transcription while everything else stays local. If it's left on `ollama`, the bot warns at startup and voice notes fail loudly rather than being silently dropped.


## Production

Build and run under [pm2](https://pm2.keymetrics.io/):

```bash
npm run build
pm2 start ecosystem.config.js
pm2 save && pm2 startup     # survive reboots
pm2 logs secretary-bot
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run from source via `ts-node` |
| `npm run typecheck` | Type-check without emitting (`tsc --noEmit`) |
| `npm run build` | Compile `src/` → `dist/` |
| `npm start` | Run the compiled build |
| `npx ts-node scripts/dry-run.ts "<msg>"` | Preview a reply without Telegram — see [Model providers](#model-providers) |
| `npx ts-node scripts/transcribe-test.ts <audio>` | Check voice transcription against a local file |

## Project structure

```
src/
├── index.ts              # entry point, bot setup, allowed_updates
├── handlers/
│   ├── business.ts       # business_connection + business_message (the core auto-responder)
│   ├── direct.ts         # routes owner DMs to admin; canned reply for everyone else
│   └── admin.ts          # owner control panel — manage contacts by chatting with the bot
├── ai/
│   ├── index.ts          # provider routing (chat / admin / transcribe)
│   ├── gemini.ts         # Gemini API backend
│   ├── ollama.ts         # local backend via Ollama /api/chat
│   ├── whisper.ts        # local speech-to-text (/v1/audio/transcriptions)
│   └── shared.ts         # retry + reasoning-leak sanitiser
├── profile/
│   ├── voice.ts          # persona + style + voice examples → system prompt
│   ├── contacts.ts       # per-sender tone & rules lookup (by chat_id / @username)
│   └── facts.ts          # facts/FAQ knowledge base + anti-hallucination guard
└── store/
    └── sessions.ts       # in-memory per-chat conversation memory
```

## Limitations

- **Memory is in-process** — conversation history is wiped on restart. Swap `src/store/sessions.ts` for Redis/SQLite to persist.
- **Text & voice** — text messages and voice notes (transcribed via Gemini) are handled; other media (photos, stickers, video notes) are currently ignored.
- **Single instance** — long polling does not support multiple instances on the same token.
- **SDK** — uses the now-deprecated `@google/generative-ai`; migration to `@google/genai` is planned.
- **Local chat quality** — local models are markedly weaker at low-resource languages; see [honest limitations](#️-honest-limitations-of-local-chat).

## Roadmap

- [x] Voice personalization via few-shot examples
- [x] Per-contact awareness (tone & rules per sender)
- [x] A personal facts / FAQ knowledge base
- [x] Interactive owner control — manage contacts by DMing the bot
- [x] Local model support (Ollama + whisper)
- [ ] Draft-approval mode for important contacts

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) before opening a PR. Found a security issue? See [SECURITY.md](SECURITY.md) — report it privately, not as a public issue.

## License

[MIT](LICENSE) © Doston Sulaymon
