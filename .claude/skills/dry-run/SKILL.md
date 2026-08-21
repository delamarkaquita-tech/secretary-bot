---
name: dry-run
description: Preview what the bot would reply to a message, without Telegram and without messaging a real person. Use when changing voice.json, facts.json, the SYSTEM_PROMPT, or when comparing local models.
disable-model-invocation: true
---

# Dry run

Runs the **real** production prompt (`composeSystemPrompt()` from `src/handlers/business.ts`)
through the configured provider and prints the reply. Nothing is sent to Telegram.

## Usage

```bash
npx ts-node scripts/dry-run.ts "<incoming message>" [flags]
```

| Flag | Purpose |
|---|---|
| `--as @user` | Resolve contact context as that person (tone, rules, examples) |
| `--provider gemini\|ollama` | Override the provider for this run |
| `--model <name>` | Override the model |
| `--compare a,b,c` | Same message through several Ollama models |
| `-n <count>` | Samples per model |
| `--show-prompt` | Print the fully composed system prompt |

## How to run it

1. Take the message the user wants to test. If they didn't give one, ask for a
   realistic one **in the language they care about** — this bot's hardest case is
   Uzbek, and an English-only test will look far better than reality.
2. **Always pass `-n 3` or more.** Replies are sampled at temperature 0.85. A single
   output is noise; a lucky first sample has already misled us once.
3. Report the outputs verbatim. Do not clean up or translate them — garbled Uzbek is
   the signal, and smoothing it over hides the actual finding.

## What to look for

- **Language matching** — does it reply in the sender's language? Weak models
  over-index on the few-shot examples in `voice.json` and answer in whatever
  language those examples use, regardless of input.
- **Persona** — first person, as the owner. Never "Doston is busy", never "As an AI".
- **Leaked reasoning** — any `<think>` block or `THOUGHT:` prefix that survived
  `sanitizeReply()`.
- **Invented facts** — commitments, prices, or personal details not in `facts.json`.

## Cost note

`--provider gemini` spends real API quota. `--provider ollama` is free but occupies
the GPU. Prefer ollama for iterating on prompt *structure*, gemini to judge final quality.
