---
name: sync-examples
description: Regenerate the committed voice/contacts/facts example templates from the real gitignored files, with all personal data replaced by fictional data. Use when the schema of those files changes.
disable-model-invocation: true
---

# Sync example templates

`voice.example.json`, `contacts.example.json` and `facts.example.json` are **not**
documentation — they are the runtime fallback the loaders use when the real file is
absent (`src/profile/*.ts`). If their schema drifts from the real files, a fresh
clone silently loads a malformed profile.

## The hard rule

The real files contain **verbatim transcripts of conversations with named people**
and private personal facts. This repository is public.

- Never copy a real name, handle, phone number, address, price, or message into an example file.
- Replace every value with plausible fictional data. Keep only the **shape**.
- The `.claude/settings.json` hook blocks reading those files. That is deliberate.
  Ask Doston to paste a redacted sample of the structure rather than trying to work around it.

## Procedure

1. Read the TypeScript interfaces — they are the real schema:
   - `Contact` / `ContactsFile` in `src/profile/contacts.ts`
   - `FactsFile` / `FaqEntry` in `src/profile/facts.ts`
   - `VoiceProfile` / `VoiceStyle` / `VoiceExample` in `src/profile/voice.ts`
2. Check each `*.example.json` against its interface: every optional field should
   appear at least once so the file doubles as a worked example.
3. Report a diff of what is missing or stale, then apply it.
4. Verify each file still parses and that the loader accepts it:
   ```bash
   for f in voice contacts facts; do jq -e . $f.example.json >/dev/null && echo "$f ok"; done
   npm run typecheck
   ```
