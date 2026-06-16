import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

type AngleKey = 'pragmatic' | 'robust' | 'economic' | 'innovative' | 'secure' | 'user-centric';

function angleLabelKey(angleId: string | undefined): AngleKey | null {
  const valid: AngleKey[] = [
    'pragmatic',
    'robust',
    'economic',
    'innovative',
    'secure',
    'user-centric',
  ];
  if (!angleId) return null;
  return valid.includes(angleId as AngleKey) ? (angleId as AngleKey) : null;
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

type VoteChipKind = 'winner' | 'pending' | 'for' | 'changed' | 'against';

function voteChipKey(vote: CouncilVote['vote'], isWinner: boolean): VoteChipKind {
  if (isWinner) return 'winner';
  if (vote === 'pending') return 'pending';
  if (vote === 'for') return 'for';
  if (vote === 'changed') return 'changed';
  return 'against';
}

function voteChipStyle(kind: VoteChipKind): { bg: string; color: string; border: string } {
  switch (kind) {
    case 'winner':
      return {
        bg: 'var(--accent-quiet)',
        color: 'var(--accent-text)',
        border: '1px solid var(--accent-line)',
      };
    case 'pending':
      return {
        bg: 'var(--bg-elevated)',
        color: 'var(--text-2)',
        border: '1px solid var(--border)',
      };
    case 'for':
      return {
        bg: 'rgba(92,176,139,0.14)',
        color: 'var(--m-green)',
        border: '1px solid rgba(92,176,139,0.32)',
      };
    case 'changed':
      return {
        bg: 'var(--hover)',
        color: 'var(--text-2)',
        border: '1px solid var(--border)',
      };
    case 'against':
    default:
      return {
        bg: 'var(--bg-elevated)',
        color: 'var(--text-3)',
        border: '1px solid var(--border)',
      };
  }
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

interface StepDef {
  key: StepKey;
  n: number;
  labelKey: 'chat.council.tab.proposals' | 'chat.council.tab.debate' | 'chat.council.tab.vote';
  hintKey:
    | 'chat.council.tabHint.proposals'
    | 'chat.council.tabHint.debate'
    | 'chat.council.tabHint.vote';
}

const STEPS: StepDef[] = [
  {
    key: 'proposals',
    n: 1,
    labelKey: 'chat.council.tab.proposals',
    hintKey: 'chat.council.tabHint.proposals',
  },
  {
    key: 'debate',
    n: 2,
    labelKey: 'chat.council.tab.debate',
    hintKey: 'chat.council.tabHint.debate',
  },
  { key: 'vote', n: 3, labelKey: 'chat.council.tab.vote', hintKey: 'chat.council.tabHint.vote' },
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
  const { t } = useTranslation();
  const chipKind = step === 'vote' ? voteChipKey(vote.vote, vote.isWinner) : null;
  const chipStyle = chipKind ? voteChipStyle(chipKind) : null;
  const chipLabel = chipKind ? t(`chat.council.chip.${chipKind}`) : null;
  const longContent =
    step === 'proposals' ? vote.proposalText : step === 'debate' ? vote.debateText : undefined;
  const canExpand = Boolean(longContent);

  const summary =
    step === 'proposals'
      ? vote.approachLabel
      : step === 'debate'
        ? vote.debateText
          ? t('chat.council.summary.debateEvaluated')
          : t('chat.council.summary.debateMissing')
        : vote.voteReason || t('chat.council.summary.voteMissing');

  const angleKey = angleLabelKey(vote.angle);

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
                {t(`chat.council.tier.${vote.tier}`)}
              </span>
            )}
            {step === 'proposals' && angleKey && (
              <span
                className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--accent-text)',
                  border: '1px solid var(--accent-line)',
                }}
                title={t('chat.council.angleTitle', { angle: t(`chat.council.angle.${angleKey}`) })}
              >
                {t(`chat.council.angle.${angleKey}`)}
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
                {t(`chat.council.confidence.${vote.confidence}`)}
              </span>
            )}
            {chipLabel && chipStyle && (
              <span
                className="inline-flex items-center px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap ml-auto"
                style={{
                  backgroundColor: chipStyle.bg,
                  color: chipStyle.color,
                  border: chipStyle.border,
                }}
              >
                {chipLabel}
              </span>
            )}
          </div>

          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {summary}
          </p>

          {/* Vote step shows confidence, risk and the requested improvement inline. */}
          {step === 'vote' && vote.risk && (
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              <span style={{ color: 'var(--m-red)', fontWeight: 500 }}>
                {t('chat.council.riskLabel')}
              </span>
              {vote.risk}
            </p>
          )}
          {step === 'vote' && vote.voteImprovement && (
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
              <span style={{ color: 'var(--accent-text)', fontWeight: 500 }}>
                {t('chat.council.improvementLabel')}
              </span>
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
                  {t('chat.council.sourcesLabel')}
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
  const { t } = useTranslation();
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
          {t('chat.council.thinkingRow')}
        </p>
      </div>
      <span className="dot-pulse shrink-0" aria-label={t('chat.council.thinkingAria')}>
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
  const { t } = useTranslation();
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
      ? t('chat.council.consensusByVote')
      : t('chat.council.consensusByMajority')
    : council.currentRoundKind === 'proposals'
      ? t('chat.council.proposalsCollecting')
      : council.currentRoundKind === 'debate'
        ? t('chat.council.debateInProgress')
        : council.currentRoundKind === 'vote'
          ? t('chat.council.votingInProgress')
          : t('chat.council.synthesizing');

  const voteMeta =
    council.tally.total > 0
      ? t('chat.council.tally', { for: council.tally.for, total: council.tally.total })
      : t('chat.council.tallyEmpty', {
          votes: council.votes.length,
          total: memberCount,
        });

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
              ? t('chat.council.badge', { count: memberCount })
              : t('chat.council.badgeBase')}
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
                {t(`chat.council.confidence.${council.confidence}`)}
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
              {t('chat.council.answerEyebrow')}
            </p>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-1)' }}>
            <MarkdownContent content={answerText} />
            {isSynthesizing && (
              <span
                className="typing-cursor"
                aria-label={t('chat.council.synthesizingAria')}
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
              ? t('chat.council.generatingProposals')
              : council.currentRoundKind === 'debate'
                ? t('chat.council.debating')
                : council.currentRoundKind === 'vote'
                  ? t('chat.council.voting')
                  : t('chat.council.synthesizingFull')}
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
          <span className="text-[13px] font-medium">{t('chat.council.explorerToggle')}</span>
        </button>

        {open && (
          <div className="mt-3 animate-fade-in-up">
            {/* Stepper — selectable rounds */}
            <div
              className="flex items-stretch gap-1 p-1 rounded-xl"
              role="tablist"
              aria-label={t('chat.council.explorerAria')}
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
                    title={isLocked ? t('chat.council.lockedHint') : t(s.hintKey)}
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
                        {t(s.labelKey)}
                      </span>
                    </span>
                    <span
                      className="text-[10px] hidden sm:block text-left"
                      style={{ color: 'var(--text-4)' }}
                    >
                      {t(s.hintKey)}
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
                    ? t('chat.council.empty.debate')
                    : t('chat.council.empty.generic')}
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
