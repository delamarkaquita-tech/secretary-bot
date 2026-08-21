import { withRetry } from "./shared";

/**
 * Local speech-to-text via the OpenAI-compatible /v1/audio/transcriptions endpoint.
 *
 * Ollama has no speech support, so a fully-local voice-note setup needs a separate
 * ASR server. whisper.cpp's `whisper-server`, faster-whisper-server, Speaches and
 * LocalAI all expose this same endpoint, so one client covers them.
 */

const BASE_URL = (process.env.WHISPER_BASE_URL ?? "http://localhost:8080/v1").replace(/\/+$/, "");
const MODEL = process.env.WHISPER_MODEL ?? "whisper-1";
// Whisper autodetects language, but pinning it lifts accuracy a lot on short clips.
// Leave unset for mixed-language senders; "uz" / "ru" / "en" to pin.
const LANGUAGE = process.env.WHISPER_LANGUAGE;

interface TranscriptionResponse {
  text?: string;
  error?: { message?: string } | string;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  return "ogg";
}

export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  return withRetry(async () => {
    const form = new FormData();
    // Telegram voice notes are OGG/Opus; the filename extension is how most whisper
    // servers pick a decoder, so it has to match the real container.
    form.append(
      "file",
      new Blob([Buffer.from(base64Audio, "base64")], { type: mimeType }),
      `voice.${extensionFor(mimeType)}`,
    );
    form.append("model", MODEL);
    form.append("response_format", "json");
    form.append("temperature", "0");
    if (LANGUAGE) form.append("language", LANGUAGE);

    const res = await fetch(`${BASE_URL}/audio/transcriptions`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Whisper ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as TranscriptionResponse;
    if (data.error) {
      const msg = typeof data.error === "string" ? data.error : data.error.message;
      throw new Error(`Whisper: ${msg ?? "unknown error"}`);
    }
    return (data.text ?? "").trim();
  });
}
