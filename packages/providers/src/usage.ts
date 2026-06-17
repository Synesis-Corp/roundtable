export interface SdkUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface NormalizedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * Normalizes usage objects from the AI SDK.
 *
 * Different providers (and different OpenAI endpoints: /chat/completions vs
 * /responses) return token counts under different field names. We accept both
 * the legacy `promptTokens`/`completionTokens` names and the newer
 * `inputTokens`/`outputTokens` names, preferring the latter when present.
 *
 * Falls back to deriving `totalTokens` from input + output when the SDK does
 * not provide a total.
 */
export function normalizeUsage(usage: SdkUsage | null | undefined): NormalizedUsage {
  if (!usage) return {};

  const input =
    typeof usage.inputTokens === 'number' && !Number.isNaN(usage.inputTokens)
      ? usage.inputTokens
      : typeof usage.promptTokens === 'number' && !Number.isNaN(usage.promptTokens)
        ? usage.promptTokens
        : undefined;

  const output =
    typeof usage.outputTokens === 'number' && !Number.isNaN(usage.outputTokens)
      ? usage.outputTokens
      : typeof usage.completionTokens === 'number' && !Number.isNaN(usage.completionTokens)
        ? usage.completionTokens
        : undefined;

  const total =
    typeof usage.totalTokens === 'number' && !Number.isNaN(usage.totalTokens)
      ? usage.totalTokens
      : input !== undefined && output !== undefined
        ? input + output
        : undefined;

  return { inputTokens: input, outputTokens: output, totalTokens: total };
}
