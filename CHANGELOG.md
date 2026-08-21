# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Local model support.** `AI_PROVIDER` selects `gemini` (default) or `ollama`, with
  `AI_PROVIDER_CHAT` / `_ADMIN` / `_TRANSCRIBE` overriding per job so cloud and local can be mixed.
- `src/ai/ollama.ts` — Ollama backend over the native `/api/chat` endpoint (`think: false`,
  `format: "json"`, `keep_alive`).
- `src/ai/whisper.ts` — local speech-to-text via the OpenAI-compatible
  `/v1/audio/transcriptions` endpoint, since Ollama has no audio support.
- `scripts/dry-run.ts` — preview replies and compare models without sending to Telegram.
- `GEMINI_MODEL`, and `OWNER_TIMEZONE` in `.env.example` (previously documented but missing).

### Changed
- `sanitizeReply()` now also strips `<think>…</think>` blocks emitted by local reasoning models.
- The Gemini API key is validated on first use rather than at import, so a fully-local
  install can boot without one. `reportProviders()` warns at startup instead.
- `withRetry` / `sanitizeReply` moved to `src/ai/shared.ts` and are shared by all providers.

### Notes
- Local models are not a drop-in replacement for Gemini on non-English chat — see the
  measured limitations in the README before switching `chat` to a local model.

## [Unreleased]

### Added
- Voice personalization via few-shot examples (`voice.json`).
- Per-contact awareness — tone, gender, and rules per sender (`contacts.json`).
- Paste-to-learn: extract relationship, tone, and example exchanges from a pasted conversation.
- Personal facts / FAQ knowledge base (`facts.json`) with an anti-hallucination guard.
- Interactive owner control panel — manage contacts and facts by DMing the bot (natural language), including bulk clear with confirmation.
- Human reply pacing — bursty, momentum-aware typing delays.
- Real-time date/time grounding per message.
- Retry with backoff on transient Gemini errors.
- Direct handling of `/start` and `/help` (no wasted API calls).

### Changed
- First-person persona so the bot replies *as* the owner rather than as a third-party assistant.

### Fixed
- Gemini 2.5 Flash "thinking" leaking into replies (disabled + sanitized).

[Unreleased]: https://github.com/dostonsulaymon/secretary-bot/commits/main
