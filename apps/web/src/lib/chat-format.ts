/** Human label for an effort/variant id. */
export function formatEffortLabel(effort: string): string {
  return effort === 'default' ? 'Default' : effort;
}

/**
 * Splits a "provider:modelId" selection into its parts. Returns null when the
 * string is malformed (no separator, or separator at either edge).
 */
export function parseSelectedModel(
  selectedModel: string
): { provider: string; modelId: string } | null {
  const separator = selectedModel.indexOf(':');
  if (separator <= 0 || separator === selectedModel.length - 1) return null;
  return {
    provider: selectedModel.slice(0, separator),
    modelId: selectedModel.slice(separator + 1),
  };
}
