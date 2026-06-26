import type { Message, ModelCapability } from '@chat/sdk';

/** Mixin fans out to every eligible active model, but never beyond this cost and latency guardrail. */
export const MAX_MIXIN_MODELS = 8;

const MAX_SYNTHESIS_SOURCE_CHARS = 8_000;

/**
 * Keep model selection deterministic so the same active catalogue produces the
 * same capped Mixin group. More capable, larger-context models lead the group
 * and are therefore preferred for the final synthesis too.
 */
export function rankMixinModels(models: ModelCapability[]): ModelCapability[] {
  return [...models].sort(
    (a, b) =>
      b.features.length - a.features.length ||
      (b.contextWindow ?? 0) - (a.contextWindow ?? 0) ||
      a.provider.localeCompare(b.provider) ||
      a.modelId.localeCompare(b.modelId)
  );
}

export function selectMixinModels(models: ModelCapability[]): ModelCapability[] {
  return rankMixinModels(models).slice(0, MAX_MIXIN_MODELS);
}

/**
 * Builds the message variant for text-only Mixin members: image attachments are
 * removed (some providers throw on image parts they can't consume) and any
 * message that carried an image gets a notice so the model doesn't claim "no
 * image attached". Vision-capable members keep the original messages instead.
 *
 * Returns the input untouched when there are no images, so callers can share a
 * single array across all members in the common case.
 */
export function stripImagesForTextOnly(messages: Message[], imageCount: number): Message[] {
  if (imageCount <= 0) return messages;
  return messages.map((message) => {
    if (!message.attachments?.length) return message;
    const hadImage = message.attachments.some((att) => att.type === 'image');
    const kept = message.attachments.filter((att) => att.type !== 'image');
    const notice = hadImage
      ? `\n\n[Nota: el usuario adjuntó ${imageCount} ${
          imageCount === 1 ? 'imagen' : 'imágenes'
        } que vos no podés ver. Otros modelos con visión las analizarán; no afirmes que no se adjuntó imagen.]`
      : '';
    return {
      ...message,
      content: message.content + notice,
      attachments: kept.length ? kept : undefined,
    };
  });
}

/**
 * Synthesis is deliberately a separate final pass, not a Council vote. It
 * combines independent answers while preventing runaway prompt growth from a
 * verbose individual provider.
 */
export function buildMixinSynthesisPrompt(
  responses: Array<{ provider: string; modelId: string; content: string }>
): string {
  const contributions = responses
    .map(
      ({ provider, modelId, content }) =>
        `Fuente interna (${provider}/${modelId}):\n${content.slice(0, MAX_SYNTHESIS_SOURCE_CHARS)}`
    )
    .join('\n\n');

  return [
    'Redacta una única respuesta final clara, correcta y accionable a la solicitud del usuario.',
    'Integra los aportes independientes, corrige contradicciones y conserva los detalles útiles.',
    'No menciones modelos, fuentes internas ni el proceso de síntesis.',
    '',
    contributions,
  ].join('\n');
}
