# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install deps
npm run dev          # run from source via ts-node (no build)
npm run typecheck    # tsc --noEmit — the only "test" gate; run after edits
npm run build        # compile src/ -> dist/
npm start            # run compiled dist/index.js (used in production)

npx ts-node scripts/transcribe-test.ts ./clip.ogg [audio/ogg]   # manual voice-transcription check
npx ts-node scripts/dry-run.ts "salom" --compare gemma3:12b,mistral-nemo:12b -n 3   # preview replies, no Telegram
```

There is **no test suite and no linter**. `npm run typecheck` is the correctness gate — `tsconfig.json` runs in `strict` mode with `noUncheckedIndexedAccess`, so optional/undefined narrowing is enforced. CI (`.github/workflows/ci.yml`) runs exactly `npm run typecheck` + `npm run build` on Node 18 and 20; matching those locally is matching CI. Production runs the compiled output under pm2 (`ecosystem.config.js`).

`scripts/` is **outside** tsconfig's `include` (`src/**/*` only), so nothing there is typechecked or compiled — `scripts/transcribe-test.ts` is verified only by running it under `ts-node`. It's the way to sanity-check Gemini's Uzbek/Russian transcription against a saved `.ogg` without going through Telegram.

## What this is

A Telegram **Secretary Mode** (Business Mode) bot: when someone messages the *owner's* Telegram account, Telegram forwards it to this bot, which replies using Google Gemini 2.5 Flash. The persona is **first-person impersonation** — it replies *as* the owner ("tomorrow's packed"), not as a third-party assistant ("Doston is busy"); the `SYSTEM_PROMPT` and voice examples must stay first-person or the model breaks character. Config is via `.env` (see `.env.example`); `OWNER_USER_ID` is the owner's numeric Telegram ID, `OWNER_TIMEZONE` (default `Asia/Tashkent`) grounds date/time answers.

## Architecture — the non-obvious parts

**Two separate update streams that must not be confused:**
- `business_message` → the auto-responder (`src/handlers/business.ts`). Messages *to the owner* in managed chats.
- normal `message` → `src/handlers/direct.ts`. Messages sent *directly to the bot*: from the owner these route to the admin control panel (`admin.ts`); from anyone else they get a static canned reply.

Business messages arrive as `business_message` updates and **never** trigger the `message` handler, so the two handlers don't overlap.

**`allowed_updates` is load-bearing.** Telegram does *not* deliver `business_*` updates unless they're explicitly listed in `bot.start({ allowed_updates: [...] })` in `src/index.ts`. Dropping them there silently breaks the entire bot with no error.

**Startup order and `process.cwd()` are also load-bearing.** Every module reads its config at *import* time — `OWNER_USER_ID`/`SYSTEM_PROMPT`/`NATURAL_TYPING` are captured into module-level consts, and `src/ai/gemini.ts` *throws* on import when `GEMINI_API_KEY` is missing. That only works because `import "dotenv/config"` is the **first** import in `src/index.ts`; reordering it (or an import sorter doing it for you) leaves every one of those consts undefined with no error. Any new entry point must import it first too — `scripts/transcribe-test.ts` does.

Likewise, `voice.json` / `contacts.json` / `facts.json` are resolved against `process.cwd()`, **not** `__dirname` — both when read and when written back. The process must be started from the repo root (which is why the pm2 recipe is `pm2 start ecosystem.config.js` from the project directory); starting it elsewhere silently loads no profile and then writes new state files into that directory.

**The `*.example.json` fallback gets promoted on first write.** If the real file is absent, the loader falls back to the committed example — but `persist()` always writes to the *real* path. So the first `upsertContact`/`addFact` in a fresh checkout materializes `contacts.json`/`facts.json` seeded with the example data. Copy the templates deliberately (`cp contacts.example.json contacts.json`) rather than letting a chat command do it.

**Reply flow** (`business_message` handler):
1. Skip if no `business_connection_id`, or sender is the owner (`from.id === OWNER_USER_ID`) — prevents the bot replying to itself. Owner-skip happens **before** any transcription so we don't spend a Gemini call on the owner's own voice notes.
1a. Resolve the incoming text: use `msg.text`, or if it's a voice note (`msg.voice`), download the OGG via `getFile` and transcribe it with `transcribeAudio()` (Gemini native audio; prompt forces original language and Uzbek-in-Latin script). Other media is ignored. The transcript then flows through the normal pipeline and into history.
2. Skip if the connection's `can_reply` is false.
3. Call Gemini with per-chat history.
4. `ctx.api.sendMessage(chatId, reply, { business_connection_id })` — the `business_connection_id` option is what makes the reply go out *as the owner*. Omitting it sends as the bot.
5. **History is persisted only after a successful send**, so a failed send never poisons the conversation context.

**Natural pacing** (`NATURAL_TYPING`, default on): models bursty human timing. `decideGapMs()` picks a **silent** gap — usually short ("present", 1–12s) but with some probability a long one ("away", 30s–2min). The away-chance is momentum-aware: low (8%) if we replied within `ACTIVE_WINDOW_MS` (still mid-conversation), higher (30%) if the chat's been quiet (`lastReplyAt` tracks this per chat). No typing indicator shows during the gap; only afterward does `showTyping()` run a short burst (`typingMs()`, proportional to reply length) before sending. Gemini's own latency counts toward the gap. Set `NATURAL_TYPING=false` to reply instantly. **Known gap:** long delays + a contact double-texting means one delayed reply *per* message (no coalescing yet) — the natural fix is to merge messages that arrive during a gap into a single reply.

**Voice profile** (`src/profile/voice.ts`): `buildSystemPrompt(base)` composes the final Gemini system instruction from `SYSTEM_PROMPT` + style hints + few-shot examples loaded from `voice.json` (gitignored real file) or `voice.example.json` (committed fallback). Composed **once** at startup in `business.ts` (`COMPOSED_SYSTEM_PROMPT`), so editing `voice.json` requires a restart. The examples are what make replies sound like the owner rather than a generic assistant — prefer adding real example pairs over lengthening the prompt.

**Contacts** (`src/profile/contacts.ts`): `getContactContext(chatId, username)` returns a per-message context line ("You are talking to X (client). Tone: … Notes: …") resolved by `chat_id` first, then `@username`, then a `default`. Loaded from `contacts.json` (gitignored) or `contacts.example.json` (fallback) into an in-memory record that is the **source of truth**; mutations (`upsertContact`/`deleteContact`) persist back to `contacts.json` via `writeFileSync`, so owner edits take effect with no restart. Contacts carry an optional `gender` that becomes he/him or she/her pronoun guidance in the prompt, and an optional `examples` array (`{them, me}` exchange pairs, capped at `MAX_CONTACT_EXAMPLES`) injected so replies mirror how the owner actually talks to *that* person. This is where per-sender tone *and rules* live (e.g. "never quote a price").

**Learn-from-conversation** (`handleLearn` in `admin.ts`): when the owner pastes a chat transcript (`looksLikeTranscript()` heuristic), `LEARN_PROMPT` runs a Gemini extraction that infers `relationship`, `tone`, and up to `MAX_CONTACT_EXAMPLES` `{them, me}` pairs for the `@username` named in the message, then stages them (confirm → `addContactExamples` + `upsertContact`). Note: the Telegram Bot API exposes **no** chat history, so the bot can't read past messages itself — pasting is the only way to bootstrap an existing relationship. Auto-harvesting the owner's own future replies is a natural follow-on (not yet built).

**Owner control panel** (`src/handlers/admin.ts`): when the owner DMs the bot, `handleOwnerMessage()` parses the message with `generateJson()` (Gemini in JSON mode) into a `{domain, action, ...}` command over two domains — `contact` (manage people) and `knowledge` (manage facts/FAQ in `facts.ts`). Additive **and destructive bulk** actions (set/add, and `clear` of facts/contacts/`all`) are staged in a per-owner `pending` map holding a `commit()` closure and only run after an affirmative reply ("yes"); get/list/single-delete act immediately. Contact targets resolve through `normalizeTarget()` to a `@username` (lowercased) or numeric chat_id key; knowledge deletes use substring `match`. `business.ts` logs each incoming sender's id/username so the owner can reference people who have no public username. Slash commands (`/start`, `/help`, `/commands`) are intercepted before the Gemini parse and return the categorized `helpText()` directly — no wasted API call.

Because facts are editable at runtime, `buildFactsContext()` is called **per message** in `business.ts` (not cached like the voice prompt), so chat edits take effect on the next reply.

**Facts / knowledge base** (`src/profile/facts.ts`): `buildFactsContext()` injects `facts` (statements the bot may rely on) + `faq` (question→answer guidance) from `facts.json` (gitignored) or `facts.example.json`. It **always** appends a hard guard against inventing personal/sensitive details (relationships, finances, address, plans) even when no facts file exists — without it the model confidently fabricates personal facts (e.g. stating a marital status). Composed once at startup as `FACTS_CONTEXT` in `business.ts`.

The full per-message system prompt order is: `COMPOSED_SYSTEM_PROMPT + FACTS_CONTEXT + ownerContext() + getContactContext(...)`. The first two are static (built once at startup); `ownerContext()` (fresh date/time) and the contact lookup are recomputed per message.

**Provider routing** (`src/ai/index.ts`): the three AI jobs are selected *independently* — `chat` (replies a real person reads), `admin` (parsing the owner's DM into JSON), `transcribe` (voice notes). `AI_PROVIDER` sets all three; `AI_PROVIDER_CHAT`/`_ADMIN`/`_TRANSCRIBE` override individually. Default is `gemini` everywhere, so an existing `.env` is unaffected.

The split isn't hypothetical — it was measured on a 12GB RTX 3080 Ti. Local 12–14B models are **excellent** at `admin` (Ollama's `format: "json"` constrains decoding, so parses are near-perfect) and **not shippable** for `chat` in Uzbek, where they emit grammatically broken text that would go out under the owner's name. They also lose language-matching: weak models over-index on `voice.json`'s few-shot examples and reply in *that* language regardless of the sender's. Measure with `scripts/dry-run.ts` and **always `-n 3`+** — replies are sampled at 0.85, and during development one lucky first sample made a model look far better than it was.

`src/ai/ollama.ts` uses Ollama's **native `/api/chat`**, not its OpenAI-compatible shim, for three things the shim doesn't expose: `think: false` (suppresses `<think>` on reasoning models), `format: "json"` (the admin parser's reliability), and `keep_alive` (a cold model load is 5–15s, which would blow through the natural-pacing gap). Sessions store Gemini's roles (`user`/`model`), so the adapter maps `model` → `assistant` at the boundary — the store stays Gemini-flavoured on purpose.

**Ollama cannot transcribe audio** (text/vision models only). Fully-local voice notes need a separate whisper server on the OpenAI-compatible `/v1/audio/transcriptions` endpoint (`src/ai/whisper.ts`); otherwise route `transcribe` to Gemini. Setting `AI_PROVIDER_TRANSCRIBE=ollama` warns at startup and fails loudly per voice note rather than silently dropping them.

**The Gemini API key check is lazy** (built on first use in `genAI()`, not at import) so a fully-local install boots with no key. `reportProviders()` warns at startup if a Gemini path is selected without one — that warning is the only thing replacing the old import-time throw.

**Gemini wrapper** (`src/ai/gemini.ts`): `generateReply()` calls 2.5 Flash with **thinking disabled** (`thinkingConfig: { thinkingBudget: 0 }`) so its chain-of-thought can't leak into the sent message, plus `sanitizeReply()` (now in `src/ai/shared.ts`, used by every provider) strips leftover `THOUGHT:`/`Answer:` preambles **and `<think>…</think>` blocks** — the latter is how local reasoning models (qwen3, DeepSeek-R1 distills) emit chain-of-thought; `think: false` covers models that honour the flag, and the regex covers the rest. The voice prompt also carries a "message only" guardrail. All three exist because the model otherwise sometimes emits its reasoning as the reply text.

**Session store** (`src/store/sessions.ts`): in-memory `Map` keyed by `` `${business_connection_id}:${chat_id}` ``, capped at 40 entries (20 pairs). Roles use Gemini's convention — `"user"` (incoming) / `"model"` (our reply), *not* OpenAI's `assistant`. History must start with a `user` turn; the append order (user then model) guarantees this. **Memory is process-local and wiped on restart** — swap for Redis/SQLite if persistence is needed.

**Connection lifecycle** (`business_connection` handler): stores/clears `ConnectionInfo` in a module-level map and DMs the owner on connect/disconnect. `can_reply` is read defensively via `extractCanReply()` because Bot API 9.0 moved it from the connection root into `rights.can_reply` — read both to survive either grammY/types version.

**Error handling deliberately stays silent in two cases:** `BUSINESS_CHAT_INACTIVE` (the message is outside Telegram's 24h reply window) is skipped without notice; Gemini failures notify the owner but send *no* reply rather than a broken one. Never replace these with a fallback/placeholder message to the contact. Transient Gemini errors (429/5xx/"overloaded") are retried with exponential backoff via `withRetry()` in `gemini.ts` before the failure surfaces — so a brief 503 no longer drops a reply.

## Gotchas

- **`@google/generative-ai` is deprecated** in favor of `@google/genai`. It still works with `gemini-2.5-flash`; if you touch `src/ai/gemini.ts`, consider migrating. Note `thinkingConfig` isn't in this SDK's types — it's passed via an `as unknown as GenerationConfig` cast and only honored by the REST API. The newer SDK types it properly.
- **Prompt composition lives in `composeSystemPrompt()`** (exported from `business.ts`) so `scripts/dry-run.ts` exercises the real production prompt rather than a drifting copy. Keep them from diverging — the harness is worthless if it tests a different prompt.
- **`withRetry`/`sanitizeReply` moved to `src/ai/shared.ts`.** Its retry regex also matches Ollama's cold-load failures (`EOF`, `fetch failed`).
- **Text and voice notes** are handled; other media (photos, stickers, video notes) are ignored in the `business_message` handler. Extend there to support them. Voice replies (TTS) are not implemented — replies to voice notes go out as text.
- Long polling means **one instance per token** — running two concurrently conflicts.
