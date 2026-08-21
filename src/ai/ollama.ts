import type { Message } from "../store/sessions";
import { withRetry, sanitizeReply } from "./shared";

/**
 * Ollama backend, using the native /api/chat endpoint.
 *
 * Native rather than Ollama's OpenAI-compatible shim because /api/chat exposes
 * three things this bot needs: `think: false` (suppresses <think> blocks on
 * reasoning models), `format: "json"` (constrained decoding, which is what makes
 * the admin command parser reliable on small models), and `keep_alive` (keeps the
 * model resident so replies aren't gated on a cold load).
 */

const BASE_URL = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/+$/, "");
const CHAT_MODEL = process.env.OLLAMA_MODEL ?? "mistral-nemo:12b";
// Small models drift off-persona with a long history; the default context fits
// the composed system prompt (~1k tokens) plus the 20-pair window comfortably.
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
// How long Ollama keeps the model in VRAM after a request. A cold load is 5-15s,
// which would blow straight through the natural-pacing gap.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? "30m";

interface ChatResponse {
  message?: { role: string; content: string };
  error?: string;
}

interface ChatOptions {
  temperature: number;
  json?: boolean;
}

/** Sessions store Gemini's roles ("model"); Ollama wants OpenAI's ("assistant"). */
function toOllamaRole(role: Message["role"]): "user" | "assistant" {
  return role === "model" ? "assistant" : "user";
}

async function chat(
  messages: Array<{ role: string; content: string }>,
  model: string,
  { temperature, json }: ChatOptions,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      keep_alive: KEEP_ALIVE,
      ...(json ? { format: "json" } : {}),
      options: { temperature, num_ctx: NUM_CTX },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 404 from /api/chat means the model isn't pulled — by far the most common setup error.
    if (res.status === 404) {
      throw new Error(`Ollama has no model "${model}". Run: ollama pull ${model}`);
    }
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as ChatResponse;
  if (data.error) throw new Error(`Ollama: ${data.error}`);
  return data.message?.content ?? "";
}

export async function generateReply(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: toOllamaRole(m.role), content: m.content })),
    { role: "user", content: userMessage },
  ];

  const raw = await withRetry(() => chat(messages, CHAT_MODEL, { temperature: 0.85 }));
  const text = sanitizeReply(raw);
  if (!text) throw new Error("Ollama returned an empty response");
  return text;
}

export async function generateJson(systemPrompt: string, userMessage: string): Promise<string> {
  return chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    CHAT_MODEL,
    { temperature: 0, json: true },
  );
}

/**
 * Ollama serves text and vision models only — it has no speech-to-text support,
 * so voice notes need either a whisper server (AI_PROVIDER_TRANSCRIBE=whisper)
 * or Gemini (AI_PROVIDER_TRANSCRIBE=gemini).
 */
export async function transcribeAudio(): Promise<string> {
  throw new Error(
    "Ollama cannot transcribe audio. Set AI_PROVIDER_TRANSCRIBE=whisper (with a local " +
      "whisper server) or AI_PROVIDER_TRANSCRIBE=gemini to handle voice notes.",
  );
}

/** One-shot startup check so a misconfigured host fails loudly at boot, not mid-conversation. */
export async function checkReachable(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const names = (data.models ?? []).map((m) => m.name);
    if (!names.includes(CHAT_MODEL)) {
      console.warn(
        `⚠️  Ollama is up but "${CHAT_MODEL}" is not pulled. Available: ${names.join(", ") || "(none)"}\n` +
          `   Run: ollama pull ${CHAT_MODEL}`,
      );
    } else {
      console.log(`Ollama ready at ${BASE_URL} (model: ${CHAT_MODEL}, keep_alive: ${KEEP_ALIVE})`);
    }
  } catch (err) {
    console.warn(
      `⚠️  Cannot reach Ollama at ${BASE_URL}: ${(err as Error).message}\n` +
        `   Is it running? Try: ollama serve`,
    );
  }
}
