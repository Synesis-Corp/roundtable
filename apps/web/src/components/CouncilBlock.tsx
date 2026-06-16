import { useState, useCallback, useEffect } from 'react';
import { MarkdownContent } from './MarkdownContent';
import type { CouncilInfo, CouncilVote } from '../types/chat';

/* ── Inline icons (stroke-based) ── */

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function LockMiniIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2.4}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/* ── Helpers ── */

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function angleLabel(angleId?: string): string {
  const labels: Record<string, string> = {
    pragmatic: 'Pragmático',
    robust: 'Robusto',
    economic: 'Económico',
    innovative: 'Innovador',
    secure: 'Seguro',
    'user-centric': 'Centrado en el usuario',
  };
  return angleId ? (labels[angleId] ?? angleId) : '';
}

function confidenceLabel(confidence?: string): string {
  if (confidence === 'high') return 'Alta confianza';
  if (confidence === 'medium') return 'Confianza media';
  if (confidence === 'low') return 'Baja confianza';
  return '';
}

function confidenceColor(confidence?: string): string {
  if (confidence === 'high') return 'var(--m-green)';
  if (confidence === 'medium') return 'var(--m-amber)';
  if (confidence === 'low') return 'var(--m-red)';
  return 'var(--text-3)';
}

function providerLogoUrl(providerId: string): string {
  return `https://models.dev/logos/${providerId}.svg`;
}

function ProviderAvatar({
  provider,
  name,
  size,
  borderColor,
  title,
}: {
  provider: string;
  name: string;
  size: number;
  borderColor?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(150deg, #5b91d6, #7c6cf0 70%)',
        border: borderColor ? `2px solid ${borderColor}` : undefined,
      }}
      title={title}
    >
      {!failed ? (
        <img
          src={providerLogoUrl(provider)}
          alt=""
          className="object-contain"
          style={{ width: size * 0.58, height: size * 0.58 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-white font-bold" style={{ fontSize: Math.max(10, size * 0.36) }}>
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}

function voteChip(
  vote: CouncilVote['vote'],
  isWinner: boolean
): {
  label: string;
  bg: string;
  color: string;
  border: string;
} {
  if (isWinner) {
    return {
      label: 'Propuesta ganadora',
      bg: 'var(--accent-quiet)',
      color: 'var(--accent-text)',
      border: '1px solid var(--accent-line)',
    };
  }
  if (vote === 'pending') {
    return {
      label: 'Propuesta lista',
      bg: 'var(--bg-elevated)',
      color: 'var(--text-2)',
      border: '1px solid var(--border)',
    };
  }
  if (vote === 'for') {
    return {
      label: 'Vota a favor',
      bg: 'rgba(92,176,139,0.14)',
      color: 'var(--m-green)',
      border: '1px solid rgba(92,176,139,0.32)',
    };
  }
  if (vote === 'changed') {
    return {
      label: 'Cambió su voto',
      bg: 'var(--hover)',
      color: 'var(--text-2)',
      border: '1px solid var(--border)',
    };
  }
  return {
    label: 'Vota en contra',
    bg: 'var(--bg-elevated)',
    color: 'var(--text-3)',
    border: '1px solid var(--border)',
  };
}

function AvatarStack({ members }: { members: CouncilInfo['members'] }) {
  return (
    <div className="flex items-center">
      {members.map((m, i) => (
        <div
          key={m.modelId}
          className="rounded-full"
          style={{ marginLeft: i > 0 ? -8 : 0, zIndex: members.length - i }}
        >
          <ProviderAvatar
            provider={m.provider}
            name={m.displayName}
            size={28}
            borderColor="var(--bg-surface)"
            title={`${m.displayName} · ${m.provider}`}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Step model ── */

type StepKey = 'proposals' | 'debate' | 'vote';

const STEP_INDEX: Record<NonNullable<CouncilInfo['currentRoundKind']>, number> = {
  proposals: 1,
  debate: 2,
  vote: 3,
  synthesis: 4,
};

const STEPS: { key: StepKey; n: number; label: string; hint: string }[] = [
  { key: 'proposals', n: 1, label: 'Propuestas', hint: 'Cada modelo propone su enfoque' },
  { key: 'debate', n: 2, label: 'Debate', hint: 'Contrastan fortalezas y debilidades' },
  { key: 'vote', n: 3, label: 'Voto', hint: 'Eligen la mejor base para el consenso' },
];

/* ── A single model's contribution for the selected step ── */

function DeliberationCard({
  vote,
  step,
  expanded,
  onToggle,
}: {
  vote: CouncilVote;
  step: StepKey;
  expanded: boolean;
  onToggle: () => void;
}) {
  const chip = step === 'vote' ? voteChip(vote.vote, vote.isWinner) : null;
  const longContent =
    step === 'proposals' ? vote.proposalText : step === 'debate' ? vote.debateText : undefined;
  const canExpand = Boolean(longContent);

  const summary =
    step === 'proposals'
      ? vote.approachLabel
      : step === 'debate'
        ? vote.debateText
          ? 'Evaluó cada propuesta y propuso una base común'
          : 'No se registró el debate de esta conversación'
        : vote.voteReason || 'Emitió su voto';

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        borderLeft: vote.isWinner ? '2px solid var(--accent)' : '2px solid transparent',
        paddingLeft: vote.isWinner ? 12 : 0,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        className="w-full text-left flex items-start gap-3 py-3 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent-line)]"
        style={{ cursor: canExpand ? 'pointer' : 'default' }}
      >
        <div className="shrink-0 mt-0.5">
          <ProviderAvatar
            provider={vote.provider}
            name={vote.displayName}
            size={30}
            title={`${vote.displayName} · ${vote.provider}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
              {vote.displayName}
            </span>
            <span className="text-[11px] font-mono-ui" style={{ color: 'var(--text-3)' }}>
              {vote.provider}
            </span>
            {vote.tier && (
              <span
                className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full"
                style={{
                  backgroundColor:
                    vote.tier === 'strong' ? 'var(--accent-quiet)' : 'var(--bg-elevated)',
                  color: vote.tier === 'strong' ? 'var(--accent-text)' : 'var(--text-2)',
                  border:
                    vote.tier === 'strong'
                      ? '1px solid var(--accent-line)'
                      : '1px solid var(--border)',
                }}
              >
                {vote.tier === 'strong' ? 'Potente' : 'Liviano'}
              </span>
            )}
            {step === 'proposals' && vote.angle && (
              <span
                className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--accent-text)',
                  border: '1px solid var(--accent-line)',
                }}
                title={`Perspectiva asignada: ${angleLabel(vote.angle)}`}
              >
                {angleLabel(vote.angle)}
              </span>
            )}
            {step === 'vote' && vote.confidence && (
              <span
                className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: confidenceColor(vote.confidence),
                  border: '1px solid var(--border)',
                }}
              >
                {confidenceLabel(vote.confidence)}
              </span>
            )}
            {chip && (
              <span
                className="inline-flex items-center px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap ml-auto"
                style={{ backgroundColor: chip.bg, color: chip.color, border: chip.border }}
              >
                {chip.label}
              </span>
            )}
          </div>

          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {summary}
          </p>

          {/* Vote step shows confidence, risk and the requested improvement inline. */}
          {step === 'vote' && vote.risk && (
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              <span style={{ color: 'var(--m-red)', fontWeight: 500 }}>Riesgo: </span>
              {vote.risk}
            </p>
          )}
          {step === 'vote' && vote.voteImprovement && (
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              <span style={{ color: 'var(--accent-text)', fontWeight: 500 }}>Mejora pedida: </span>
              {vote.voteImprovement}
            </p>
          )}
        </div>

        {canExpand && (
          <span className="shrink-0 mt-1" style={{ color: 'var(--text-3)' }}>
            {expanded ? (
              <ChevronDownIcon className="w-4 h-4" />
            ) : (
              <ChevronRightIcon className="w-4 h-4" />
            )}
          </span>
        )}
      </button>

      {/* Expanded body flows directly under the header, indented to align with
          the name and marked with a left accent rule — no nested box (which is
          what made the old detail view look stacked/overlapped). */}
      {canExpand && expanded && longContent && (
        <div className="pb-3 animate-fade-in-up" style={{ paddingLeft: 42 }}>
          <div style={{ borderLeft: '2px solid var(--accent-line)', paddingLeft: 14 }}>
            <MarkdownContent content={longContent} />
            {step === 'proposals' && vote.sources && vote.sources.length > 0 && (
              <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <p
                  className="text-[11px] uppercase tracking-[0.12em] font-semibold mb-1"
                  style={{ color: 'var(--text-3)' }}
                >
                  Fuentes verificadas
                </p>
                <ul className="space-y-1">
                  {vote.sources.map((source, idx) => (
                    <li
                      key={idx}
                      className="text-[12px] leading-relaxed"
                      style={{ color: 'var(--text-2)' }}
                    >
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:no-underline"
                        style={{ color: 'var(--accent-text)' }}
                      >
                        {source.title}
                      </a>
                      {source.snippet ? `: ${source.snippet}` : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A member still working — shown live while the council deliberates. */
function CouncilThinkingRow({ member }: { member: CouncilInfo['members'][number] }) {
  return (
    <div
      className="flex items-center gap-3 py-3 animate-fade-in-up"
      style={{ borderBottom: '1px solid var(--border)', opacity: 0.9 }}
    >
      <div className="shrink-0">
        <ProviderAvatar
          provider={member.provider}
          name={member.displayName}
          size={30}
          title={`${member.displayName} · ${member.provider}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
            {member.displayName}
          </span>
          <span className="text-[11px] font-mono-ui" style={{ color: 'var(--text-3)' }}>
            {member.provider}
          </span>
        </div>
        <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-3)' }}>
          Trabajando en este paso…
        </p>
      </div>
      <span className="dot-pulse shrink-0" aria-label="Trabajando">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

/* ── Main component ── */

interface CouncilBlockProps {
  council: CouncilInfo;
}

export function CouncilBlock({ council }: CouncilBlockProps) {
  const isRunning = council.status === 'running';
  const memberCount = council.members.length;
  const hasConsensus = council.consensus;

  // Which step is the council currently on (1..4); 4 means everything is done.
  const currentStepIndex = isRunning ? STEP_INDEX[council.currentRoundKind ?? 'proposals'] : 4;
  const liveStep: StepKey =
    council.currentRoundKind === 'debate'
      ? 'debate'
      : council.currentRoundKind === 'vote'
        ? 'vote'
        : 'proposals';

  // The explorer is open by default while live (so progress is visible) and
  // collapsed once done (answer-first; the user opens it to inspect the journey).
  const [open, setOpen] = useState(isRunning);
  const [activeStep, setActiveStep] = useState<StepKey>(isRunning ? liveStep : 'vote');
  const [touched, setTouched] = useState(false);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  // While the turn is live and the user hasn't taken control, follow the round.
  useEffect(() => {
    if (isRunning && !touched) setActiveStep(liveStep);
  }, [isRunning, touched, liveStep]);

  const selectStep = useCallback((key: StepKey) => {
    setTouched(true);
    setActiveStep(key);
    setExpandedModel(null);
  }, []);

  const consensusLabel = !isRunning
    ? hasConsensus
      ? 'Elegida por consenso'
      : 'Elegida por mayoría'
    : council.currentRoundKind === 'proposals'
      ? 'Recopilando propuestas'
      : council.currentRoundKind === 'debate'
        ? 'Debate en curso'
        : council.currentRoundKind === 'vote'
          ? 'Votación en curso'
          : 'Redactando síntesis final';

  const voteMeta =
    council.tally.total > 0
      ? `${council.tally.for} de ${council.tally.total} votos`
      : `${council.votes.length} de ${memberCount} propuestas`;

  const answerText = council.answer.trim();
  const isSynthesizing = isRunning && council.currentRoundKind === 'synthesis';

  // Members that haven't contributed to the active step yet (live only).
  const votedIds = new Set(council.votes.map((v) => v.modelId));
  const pendingMembers =
    isRunning && currentStepIndex === STEPS.find((s) => s.key === activeStep)!.n
      ? council.members.filter((m) => !votedIds.has(m.modelId))
      : [];

  // Votes that have data for the active step. Proposals/Debate need the text;
  // Vote step just needs the model to have voted.
  const stepVotes = council.votes.filter((v) => {
    if (activeStep === 'proposals') return Boolean(v.proposalText || v.approachLabel);
    if (activeStep === 'debate') return true;
    return v.vote !== 'pending' || v.isWinner;
  });

  return (
    <div className="mt-1">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-flex items-center px-3 py-1 text-[12px] font-medium"
            style={{
              borderRadius: 'var(--r-pill)',
              backgroundColor:
                isRunning || hasConsensus ? 'var(--accent-quiet)' : 'rgba(207,154,94,0.14)',
              color: isRunning || hasConsensus ? 'var(--accent-text)' : 'var(--m-amber)',
              border:
                isRunning || hasConsensus
                  ? '1px solid var(--accent-line)'
                  : '1px solid rgba(207,154,94,0.32)',
            }}
          >
            {memberCount > 0
              ? `Consejo · ${memberCount} modelo${memberCount === 1 ? '' : 's'}`
              : 'Consejo'}
          </span>

          <span
            className="text-[13px] inline-flex items-center gap-2"
            style={{ color: 'var(--text-2)' }}
          >
            {isRunning && (
              <span className="dot-pulse" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            )}
            {consensusLabel} · {voteMeta}
            {!isRunning && council.confidence && (
              <span
                className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: confidenceColor(council.confidence),
                  border: '1px solid var(--border)',
                }}
              >
                {confidenceLabel(council.confidence)}
              </span>
            )}
          </span>
        </div>

        {memberCount > 0 && <AvatarStack members={council.members} />}
      </div>

      {/* ── Winner answer / streamed synthesis ── clean, no box (matches the
          single-mode assistant message). A small eyebrow marks it as the
          council's consensus, but the answer itself flows as plain content. */}
      {answerText && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <p
              className="text-[11px] uppercase tracking-[0.16em] font-semibold"
              style={{ color: 'var(--accent-text)' }}
            >
              Respuesta consensuada
            </p>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-1)' }}>
            <MarkdownContent content={answerText} />
            {isSynthesizing && (
              <span
                className="typing-cursor"
                aria-label="Redactando…"
                style={{ color: 'var(--accent-text)' }}
              />
            )}
          </div>
        </div>
      )}

      {!answerText && isRunning && (
        <div
          className="mt-4"
          style={{
            borderRadius: 'var(--r-sm)',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            padding: '12px 16px',
          }}
        >
          <p
            className="text-sm font-medium inline-flex items-center gap-2"
            style={{ color: 'var(--text-2)' }}
          >
            <span className="dot-pulse" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {council.currentRoundKind === 'proposals'
              ? 'Los modelos están generando propuestas…'
              : council.currentRoundKind === 'debate'
                ? 'El consejo está contrastando enfoques…'
                : council.currentRoundKind === 'vote'
                  ? 'Los modelos están votando la mejor propuesta…'
                  : 'El modelo ganador está redactando la respuesta final…'}
          </p>
        </div>
      )}

      {/* ── Deliberation explorer ── */}
      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex items-center gap-2 w-full text-left transition-colors py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
          style={{ color: 'var(--text-2)', borderRadius: 'var(--r-xs)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
          }}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDownIcon className="w-4 h-4 shrink-0" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 shrink-0" />
          )}
          <span className="text-[13px] font-medium">
            Ver cómo deliberó el consejo · paso a paso
          </span>
        </button>

        {open && (
          <div className="mt-3 animate-fade-in-up">
            {/* Stepper — selectable rounds */}
            <div
              className="flex items-stretch gap-1 p-1 rounded-xl"
              role="tablist"
              aria-label="Pasos de la deliberación"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              {STEPS.map((s) => {
                const isActive = activeStep === s.key;
                const isDone = currentStepIndex > s.n;
                const isCurrent = isRunning && currentStepIndex === s.n;
                // A future step that hasn't started yet can't be inspected.
                const isLocked = isRunning && s.n > currentStepIndex;
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    disabled={isLocked}
                    onClick={() => {
                      if (!isLocked) selectStep(s.key);
                    }}
                    title={isLocked ? 'Este paso todavía no empezó' : s.hint}
                    className={`flex-1 flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)] ${isCurrent ? 'animate-pulse' : ''}`}
                    style={{
                      backgroundColor: isActive ? 'var(--accent-quiet)' : 'transparent',
                      border: isActive ? '1px solid var(--accent-line)' : '1px solid transparent',
                      cursor: isLocked ? 'not-allowed' : 'pointer',
                      opacity: isLocked ? 0.45 : 1,
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
                        style={{
                          width: 16,
                          height: 16,
                          backgroundColor: isActive
                            ? 'var(--accent)'
                            : isDone
                              ? 'rgba(92,176,139,0.18)'
                              : 'var(--bg-elevated)',
                          color: isActive ? '#fff' : isDone ? 'var(--m-green)' : 'var(--text-3)',
                        }}
                      >
                        {isDone ? (
                          <CheckIcon className="w-2.5 h-2.5" />
                        ) : isLocked ? (
                          <LockMiniIcon className="w-2.5 h-2.5" />
                        ) : (
                          s.n
                        )}
                      </span>
                      <span
                        className="text-[12px] font-medium"
                        style={{ color: isActive ? 'var(--accent-text)' : 'var(--text-2)' }}
                      >
                        {s.label}
                      </span>
                    </span>
                    <span
                      className="text-[10px] hidden sm:block text-left"
                      style={{ color: 'var(--text-4)' }}
                    >
                      {s.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active step content — flat divided list (no floating cards) */}
            <div className="mt-3" role="tabpanel">
              {stepVotes.length === 0 && pendingMembers.length === 0 ? (
                <p className="text-[13px] px-1 py-3" style={{ color: 'var(--text-3)' }}>
                  {activeStep === 'debate'
                    ? 'Esta conversación no guardó el detalle del debate.'
                    : 'Todavía no hay datos para este paso.'}
                </p>
              ) : (
                <>
                  {stepVotes.map((v) => (
                    <DeliberationCard
                      key={v.modelId}
                      vote={v}
                      step={activeStep}
                      expanded={expandedModel === v.modelId}
                      onToggle={() =>
                        setExpandedModel((prev) => (prev === v.modelId ? null : v.modelId))
                      }
                    />
                  ))}
                  {pendingMembers.map((m) => (
                    <CouncilThinkingRow key={m.modelId} member={m} />
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
