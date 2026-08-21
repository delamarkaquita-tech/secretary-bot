import type { Message } from "../store/sessions";
import * as gemini from "./gemini";
import * as ollama from "./ollama";
import * as whisper from "./whisper";

/**
 * Provider routing.
 *
 * Each of the three AI jobs is selected independently, because they have very
 * different requirements and local models are not equally good at them:
 *
 *   chat       — replies a real person reads, as the owner. Needs strong
 *                multilingual fluency; this is where local models struggle most.
 *   admin      — parsing the owner's DM into a JSON command. Constrained decoding
 *                (Ollama's `format: "json"`) makes local models reliable here.
 *   transcribe — speech-to-text. Ollama cannot do this at all, so a fully-local
 *                setup needs a separate whisper server.
 *
 * AI_PROVIDER sets all three; AI_PROVIDER_CHAT / _ADMIN / _TRANSCRIBE override
 * individually, which is what makes a hybrid (local admin, Gemini replies) possible.
 */

export type Provider = "gemini" | "ollama";
export type TranscribeProvider = Provider | "whisper";

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  const v = value.trim().toLowerCase() as T;
  if (!allowed.includes(v)) {
    throw new Error(
      `Invalid provider "${value}". Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return v;
}

const DEFAULT_PROVIDER = pick(process.env.AI_PROVIDER, ["gemini", "ollama"] as const, "gemini");

export const CHAT_PROVIDER = pick(
  process.env.AI_PROVIDER_CHAT,
  ["gemini", "ollama"] as const,
  DEFAULT_PROVIDER,
);
export const ADMIN_PROVIDER = pick(
  process.env.AI_PROVIDER_ADMIN,
  ["gemini", "ollama"] as const,
  DEFAULT_PROVIDER,
);
export const TRANSCRIBE_PROVIDER = pick(
  process.env.AI_PROVIDER_TRANSCRIBE,
  ["gemini", "ollama", "whisper"] as const,
  DEFAULT_PROVIDER,
);

const backends = { gemini, ollama } as const;

export function generateReply(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
): Promise<string> {
  return backends[CHAT_PROVIDER].generateReply(systemPrompt, history, userMessage);
}

export function generateJson(systemPrompt: string, userMessage: string): Promise<string> {
  return backends[ADMIN_PROVIDER].generateJson(systemPrompt, userMessage);
}

export function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  if (TRANSCRIBE_PROVIDER === "whisper") return whisper.transcribeAudio(base64Audio, mimeType);
  if (TRANSCRIBE_PROVIDER === "ollama") return ollama.transcribeAudio();
  return gemini.transcribeAudio(base64Audio, mimeType);
}

/**
 * Log the resolved routing and check that whatever is selected is actually usable.
 * Called once at startup so misconfiguration surfaces at boot rather than the first
 * time a stranger messages the owner.
 */
export async function reportProviders(): Promise<void> {
  console.log(
    `AI providers — chat: ${CHAT_PROVIDER}, admin: ${ADMIN_PROVIDER}, transcribe: ${TRANSCRIBE_PROVIDER}`,
  );

  if (TRANSCRIBE_PROVIDER === "ollama") {
    console.warn(
      "⚠️  AI_PROVIDER_TRANSCRIBE=ollama, but Ollama cannot transcribe audio — voice notes will fail.\n" +
        "   Use AI_PROVIDER_TRANSCRIBE=whisper (local ASR server) or =gemini.",
    );
  }

  const usesGemini = [CHAT_PROVIDER, ADMIN_PROVIDER, TRANSCRIBE_PROVIDER].includes("gemini");
  if (usesGemini && !process.env.GEMINI_API_KEY) {
    console.warn("⚠️  A Gemini provider is selected but GEMINI_API_KEY is not set.");
  }

  if (CHAT_PROVIDER === "ollama" || ADMIN_PROVIDER === "ollama") {
    await ollama.checkReachable();
  }
}
