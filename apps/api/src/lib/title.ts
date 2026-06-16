/**
 * Generates a short, human-readable conversation title from the first exchange,
 * the way ChatGPT/Claude do — instead of using the raw first message verbatim
 * (which leaves every "Hola" chat indistinguishable).
 *
 * Best-effort: any failure returns null and the caller keeps the fallback title.
 */

import { isUseCaseEligible } from "@chat/router";

interface TitleProvider {
  id: string;
  chat(
    request: { messages: Array<{ role: string; content: string }>; model: string },
    apiKey: string,
    signal?: AbortSignal
  ): Promise<{ content: string }>;
}

export function cleanTitle(raw: string): string {
  let title = raw
    .trim()
    .split("\n")[0]
    .replace(/^["'“”«»\s]+|["'“”«».\s]+$/g, "") // strip wrapping quotes/space/period
    .replace(/^(t[íi]tulo|title)\s*[:\-–]\s*/i, "") // drop a leading "Título:" label
    .trim();
  if (title.length > 60) title = `${title.slice(0, 60).trim()}…`;
  return title;
}

export async function generateConversationTitle(
  provider: TitleProvider,
  modelId: string,
  apiKey: string,
  userMessage: string,
  assistantSnippet: string,
  signal?: AbortSignal
): Promise<string | null> {
  // Reuses the chat turn's model; skip if the matrix excludes it from titling.
  if (!isUseCaseEligible(provider.id, modelId, "title")) return null;

  try {
    const prompt = `Genera un título muy corto (máximo 6 palabras, en el mismo idioma del usuario) que resuma el tema de esta conversación. Responde SOLO con el título, sin comillas, sin punto final, sin la palabra "Título".

Usuario: ${userMessage.slice(0, 600)}
Asistente: ${assistantSnippet.slice(0, 300)}`;

    const response = await provider.chat(
      { messages: [{ role: "user", content: prompt }], model: modelId },
      apiKey,
      signal
    );

    const title = cleanTitle(response.content ?? "");
    return title.length > 0 ? title : null;
  } catch {
    return null;
  }
}
