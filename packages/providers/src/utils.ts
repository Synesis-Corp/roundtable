import type { Message, Modality } from '@chat/sdk';
import type { CoreMessage, CoreUserMessage, CoreAssistantMessage, CoreSystemMessage } from 'ai';

/**
 * Propagates an AI SDK `error` stream part as a thrown error.
 *
 * The AI SDK v4 surfaces mid-stream failures (e.g. a provider returning HTTP
 * 4xx/5xx) as a `{ type: "error", error }` part in `fullStream`, NOT always as a
 * rejected promise. If a `streamChat` loop only handles text/tool parts, an
 * error part is silently dropped and the stream ends with no text and no error —
 * the UI then shows an endless "thinking" spinner. Call this at the top of every
 * `fullStream` loop so the failure reaches the route, which publishes it as an
 * SSE error event the frontend renders.
 */
export function throwIfErrorPart(p: { type: string; [k: string]: unknown }): void {
  if (p.type !== 'error') return;
  const e = p['error'];
  if (e instanceof Error) throw e;
  if (typeof e === 'string' && e.length > 0) throw new Error(e);
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    throw new Error((e as { message: string }).message);
  }
  throw new Error('The model provider returned a stream error.');
}

type MultimodalContent = Array<
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mimeType?: string }
  | { type: 'file'; data: string; mimeType: string }
>;

/** Options that control how attachments are routed to the target model. */
export interface ConvertMessagesOptions {
  /**
   * Modalities the target model supports. When `"pdf"` is included, PDF
   * attachments are sent as native multimodal `file` parts (consumed by
   * OpenAI / Anthropic / Google AI SDK v4). Otherwise, the extracted text
   * is inlined in the user message so text-only models can still answer.
   *
   * When this option is `undefined`, the legacy behavior is preserved
   * (all non-image attachments become a text placeholder).
   */
  targetModalities?: Modality[];
}

/**
 * Strips a `data:<mime>;base64,` prefix from a data URI, returning the raw
 * base64 string. The AI SDK v4 expects file/image content parts to carry the
 * raw base64 (no URI wrapper).
 */
function stripDataUri(dataUri: string | undefined): string {
  if (!dataUri) return '';
  const comma = dataUri.indexOf(',');
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}

/**
 * Converts internal Message format to AI SDK CoreMessage format.
 * Supports multimodal content (text + images + native PDFs).
 */
export function convertMessages(
  messages: Message[],
  options?: ConvertMessagesOptions
): CoreMessage[] {
  const targetModalities = options?.targetModalities;
  const canHandlePdf = targetModalities?.includes('pdf') ?? false;

  return messages.map((m): CoreMessage => {
    const role = m.role;

    if (m.attachments && m.attachments.length > 0) {
      const parts: MultimodalContent = [];
      const textAccumulator: string[] = [];

      // The user-visible text comes first when present, so the model reads the
      // question before the attached content.
      if (m.content) {
        textAccumulator.push(m.content);
      }

      // Legacy mode = no `options` passed. In that case, every non-image
      // attachment becomes the original `[File: name (mime)]` text placeholder,
      // byte-identical to the pre-change implementation. The new PDF-aware
      // routing (native file part + inline extracted text) only activates when
      // the caller opts in by passing `targetModalities`.
      const useLegacyMode = targetModalities === undefined;

      for (const att of m.attachments) {
        if (att.type === 'image' && att.base64) {
          parts.push({
            type: 'image',
            image: stripDataUri(att.base64),
            mimeType: att.mimeType,
          });
        } else if (!useLegacyMode && att.type === 'pdf' && canHandlePdf && att.base64) {
          // Native PDF: AI SDK v4 routes `file` parts to the provider's native
          // format (OpenAI's `file_data`, Anthropic's document block, Google's
          // inline_data). All three accept `application/pdf`.
          parts.push({
            type: 'file',
            data: stripDataUri(att.base64),
            mimeType: 'application/pdf',
          });
        } else if (!useLegacyMode && att.type === 'pdf' && att.extractedText) {
          // Fallback: inline the extracted text with a clear labeled block so
          // the model knows the content came from an attachment.
          const pageInfo = att.pageCount !== undefined ? `, ${att.pageCount} páginas` : '';
          textAccumulator.push(
            `\n\n[Documento adjunto: ${att.name || 'documento.pdf'}${pageInfo}]`
          );
          textAccumulator.push(att.extractedText);
        } else {
          // Legacy path: any other type (file, audio) or PDF in legacy mode
          // (no options) or PDF without extractedText. The text placeholder is
          // identical to the pre-change behavior.
          textAccumulator.push(
            `\n[File: ${att.name || 'attachment'} (${att.mimeType || 'application/octet-stream'})]`
          );
        }
      }

      // If we have accumulated user text, push it as the first part.
      const joinedText = textAccumulator.join('');
      if (joinedText.trim()) {
        parts.unshift({ type: 'text', text: joinedText });
      }

      if (parts.length === 1 && parts[0].type === 'text') {
        return { role: 'user' as const, content: parts[0].text } as CoreUserMessage;
      }

      return {
        role: 'user' as const,
        content: parts as CoreUserMessage['content'],
      } as CoreUserMessage;
    }

    // Plain text message
    switch (role) {
      case 'system':
        return { role: 'system', content: m.content } as CoreSystemMessage;
      case 'assistant':
        return { role: 'assistant', content: m.content } as CoreAssistantMessage;
      case 'user':
      default:
        return { role: 'user', content: m.content } as CoreUserMessage;
    }
  });
}
