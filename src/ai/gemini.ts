import {
  GoogleGenerativeAI,
  type Content,
  type GenerationConfig,
} from "@google/generative-ai";
import type { Message } from "../store/sessions";
import { withRetry, sanitizeReply } from "./shared";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

// The client is built on first use, not at import time: a fully-local install
// (AI_PROVIDER=ollama) must be able to boot with no GEMINI_API_KEY at all.
let client: GoogleGenerativeAI | undefined;

function genAI(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in the environment");
    }
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

/**
 * Generate a reply with Gemini 2.5 Flash.
 *
 * @param systemPrompt persona / instructions
 * @param history      prior conversation (must alternate user/model, starting with user)
 * @param userMessage  the new incoming message
 * @returns Gemini's reply text
 * @throws if the API errors or returns an empty response — callers must catch.
 */
export async function generateReply(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
): Promise<string> {
  const model = genAI().getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
  });

  const contents: Content[] = history.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const result = await withRetry(() =>
    model.generateContent({
      contents,
      // Disable 2.5 Flash "thinking" so chain-of-thought can't leak into the reply.
      // thinkingConfig isn't in the 0.21 SDK types yet, but the REST API honors it.
      generationConfig: {
        temperature: 0.85,
        thinkingConfig: { thinkingBudget: 0 },
      } as unknown as GenerationConfig,
    }),
  );

  const text = sanitizeReply(result.response.text());

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
  return text;
}

/**
 * Transcribe an audio clip (e.g. a Telegram voice note) with Gemini's native audio support.
 * Returns the verbatim transcription in its original language, or "" if there's no speech.
 */
export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  const model = genAI().getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    } as unknown as GenerationConfig,
  });
  const result = await withRetry(() =>
    model.generateContent([
      { inlineData: { data: base64Audio, mimeType } },
      {
        text:
          "Transcribe this voice message verbatim, in its ORIGINAL language — do not translate. " +
          "The speaker most likely uses Uzbek, Russian, or English (possibly mixed). " +
          "Write Uzbek in Latin script (the way people text: \"qanaqasan\", not Cyrillic). " +
          "Output only the transcription text — no preamble, no quotes. " +
          "If there is no intelligible speech, output nothing.",
      },
    ]),
  );
  return result.response.text().trim();
}

/**
 * Structured-output call for internal tasks (e.g. parsing the owner's commands).
 * Forces JSON output and disables thinking. Returns the raw JSON string.
 */
export async function generateJson(systemPrompt: string, userMessage: string): Promise<string> {
  const model = genAI().getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    } as unknown as GenerationConfig,
  });
  const result = await model.generateContent(userMessage);
  return result.response.text();
}
