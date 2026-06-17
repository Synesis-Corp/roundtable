import { prisma } from './db';

export type UsageMode = 'single' | 'council';

export interface UsageSource {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

interface UsageLogger {
  warn: (context: Record<string, unknown>, message: string) => void;
}

export function toUsageEventData(userId: string, mode: UsageMode, source: UsageSource) {
  return {
    userId,
    providerId: source.provider,
    modelId: source.model,
    inputTokens: Number.isFinite(source.inputTokens) ? (source.inputTokens as number) : 0,
    outputTokens: Number.isFinite(source.outputTokens) ? (source.outputTokens as number) : 0,
    ...(source.latencyMs === undefined ? {} : { latencyMs: source.latencyMs }),
    mode,
  };
}

/**
 * Usage accounting must never make an otherwise successful model response fail.
 * Awaiting the write keeps tests and shutdown behavior deterministic, while the
 * internal catch leaves chat delivery independent from metrics persistence.
 */
export async function recordUsageEvent(
  userId: string,
  mode: UsageMode,
  source: UsageSource,
  log: UsageLogger
): Promise<void> {
  try {
    await prisma.usageEvent.create({
      data: toUsageEventData(userId, mode, source),
    });
  } catch (err) {
    log.warn(
      {
        err,
        providerId: source.provider,
        modelId: source.model,
        mode,
      },
      'usage event persistence failed'
    );
  }
}
