/**
 * Provider-agnostic helpers shared by every AI backend.
 */

// Transient failures worth retrying: rate limits, overload, gateway/availability blips.
// Ollama adds its own: a cold model load can time out or EOF before the server is ready.
const RETRYABLE = /\b(429|500|502|503|504)\b|overloaded|unavailable|timeout|ECONNRESET|EOF|fetch failed/i;

/**
 * Retry a model call on transient errors with exponential backoff + jitter.
 * Non-transient errors (bad API key, safety blocks, unknown model) fail fast.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (i === attempts - 1 || !RETRYABLE.test(message)) throw err;
      const delayMs = 500 * 2 ** i + Math.random() * 250;
      console.warn(`Transient model error (attempt ${i + 1}/${attempts}), retrying in ${Math.round(delayMs)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Defensive cleanup in case a model emits its reasoning instead of just the message.
 * Two shapes are stripped:
 *   1. `<think>…</think>` blocks — how local reasoning models (qwen3, DeepSeek-R1
 *      distills) emit chain-of-thought. Ollama's `think: false` suppresses this on
 *      models that support the flag, but plenty ignore it, so we strip it anyway.
 *   2. Leading labels like "THOUGHT:", "REASONING:", "FINAL ANSWER:".
 */
export function sanitizeReply(raw: string): string {
  // Drop complete <think>…</think> blocks, plus an unterminated one (truncated output).
  let text = raw
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .replace(/^[\s\S]*?<\/(?:think|thinking|reasoning)>/i, "")
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*$/i, "")
    .trim();

  const labels = /^(thought|thinking|reasoning|analysis|final answer|answer|response)\s*:/i;
  const lines = text.split("\n");
  while (lines.length > 0 && labels.test(lines[0]!.trim())) {
    lines.shift();
  }
  return lines.join("\n").trim();
}
