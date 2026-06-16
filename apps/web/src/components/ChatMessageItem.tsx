import { useState, useCallback, useEffect, type CSSProperties } from 'react';
import { MarkdownContent } from './MarkdownContent';
import { CouncilBlock } from './CouncilBlock';
import type { ChatMessage, ToolCallRecord } from '../types/chat';
import type { Attachment } from '@chat/sdk';

interface ChatMessageItemProps {
  msg: ChatMessage;
  userName: string;
  /** True while the stream is active. */
  streaming: boolean;
  /** True when this is the last message in the list (the streaming target). */
  isLast: boolean;
  /** True when this message just appeared (triggers entrance animation). */
  isNew?: boolean;
  /** Callback to regenerate this assistant message. */
  onRegenerate?: () => void;
}

/** Placeholder content the backend/composer uses when only files are sent. */
const ATTACH_PLACEHOLDER = 'Analyze this:';

function attachmentSrc(a: Attachment): string {
  return a.base64 ?? a.url ?? '';
}

/* ── Inline icons (stroke-based, same style as the rest of the app) ── */

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ThumbsUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbsDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="w-3 h-3 transition-transform duration-200"
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/** Magnifying-glass icon used in the "searched the web" chip. Sized to match
 *  the small body text next to it. */
function SearchIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

/* ── Web search sources ── ChatGPT-style "Fuentes" surfaced from tool results. */

/** A deduped web source pulled from the assistant's web_search tool results. */
interface WebSource {
  title: string;
  url: string;
  host: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Extracts unique web sources from the assistant's tool calls. The tool
 *  result shape is the backend's `WebSearchResponse` ({ results: [...] }); we
 *  read it defensively because errored searches carry no `results`. */
function collectWebSources(toolCalls: ToolCallRecord[]): WebSource[] {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const tc of toolCalls) {
    const res = tc.result as { results?: Array<{ title?: string; url?: string }> } | undefined;
    if (!res?.results) continue;
    for (const item of res.results) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      out.push({ title: item.title || item.url, url: item.url, host: hostOf(item.url) });
    }
  }
  return out;
}

/** A source's favicon via DuckDuckGo's icon service (privacy-aligned, no
 *  Google), with a letter-badge fallback when the icon fails to load. */
function SourceFavicon({ host, size = 16 }: { host: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed || !host) {
    return (
      <span
        aria-hidden
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          fontWeight: 600,
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-3)',
        }}
      >
        {(host[0] ?? '?').toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        backgroundColor: 'var(--bg-elevated)',
      }}
    />
  );
}

/** The "searched the web" chip. When the searches returned sources, the chip
 *  becomes a toggle that expands into the list of sites consulted (à la
 *  ChatGPT's "Fuentes"). When every search soft-failed (no results), it stays
 *  a plain, non-interactive label. */
function WebSearchChip({ toolCalls }: { toolCalls: ToolCallRecord[] }) {
  const [open, setOpen] = useState(false);
  const sources = collectWebSources(toolCalls);
  const count = toolCalls.length;
  const label = count === 1 ? 'Busqué en la web' : `Busqué en la web (${count} consultas)`;
  const hasSources = sources.length > 0;
  const preview = sources.slice(0, 3);

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={hasSources ? () => setOpen((o) => !o) : undefined}
        className="flex items-center gap-1.5 text-xs transition-colors focus:outline-none"
        style={{ color: 'var(--text-3)', cursor: hasSources ? 'pointer' : 'default' }}
        aria-expanded={hasSources ? open : undefined}
        aria-label={hasSources ? `${label} · ${sources.length} fuentes` : label}
      >
        <SearchIcon />
        <span>{label}</span>
        {hasSources && (
          <>
            {/* Stacked source favicons (à la ChatGPT's "Fuentes"). */}
            <span className="flex items-center" style={{ marginLeft: 2 }}>
              {preview.map((s, i) => (
                <span
                  key={s.url}
                  className="inline-flex rounded-full"
                  style={{
                    marginLeft: i === 0 ? 0 : -5,
                    zIndex: preview.length - i,
                    boxShadow: '0 0 0 1.5px var(--bg-app)',
                  }}
                >
                  <SourceFavicon host={s.host} />
                </span>
              ))}
            </span>
            <span style={{ color: 'var(--text-4)' }}>
              · {sources.length} {sources.length === 1 ? 'fuente' : 'fuentes'}
            </span>
            <ChevronIcon open={open} />
          </>
        )}
      </button>

      {open && hasSources && (
        <div
          className="mt-2 flex flex-col gap-1.5 animate-fade-in-up"
          style={{ borderLeft: '2px solid var(--accent-line)', paddingLeft: 12 }}
        >
          {sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs transition-colors focus:outline-none"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-3)';
              }}
            >
              <SourceFavicon host={s.host} />
              <span className="truncate" style={{ maxWidth: 360, color: 'var(--text-2)' }}>
                {s.title}
              </span>
              <span className="shrink-0" style={{ color: 'var(--text-4)' }}>
                {s.host}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Python sandbox runs ── surfaced from the assistant's run_python tool. */

interface PythonRun {
  code: string;
  stdout?: string;
  result?: string;
  error?: string;
  truncated?: boolean;
  timedOut?: boolean;
}

/** Reads the run_python tool calls into a render-friendly shape. `args.code` is
 *  what the model ran; `result` is the sandbox's `{ stdout, result?, error? }`. */
function collectPythonRuns(toolCalls: ToolCallRecord[]): PythonRun[] {
  return toolCalls.map((tc) => {
    const args = tc.args as { code?: string } | undefined;
    const res = tc.result as
      | {
          stdout?: string;
          result?: string;
          error?: string;
          truncated?: boolean;
          timedOut?: boolean;
        }
      | undefined;
    return {
      code: args?.code ?? '',
      stdout: res?.stdout,
      result: res?.result,
      error: res?.error,
      truncated: res?.truncated,
      timedOut: res?.timedOut,
    };
  });
}

function TerminalIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

/** The "ran Python" chip. Collapsed by default (the model already wrote the
 *  answer in prose); expands into the executed code and its captured output so
 *  the user can audit exactly what ran — same provenance idea as the web-search
 *  "Fuentes" chip. */
function PythonRunChip({ toolCalls }: { toolCalls: ToolCallRecord[] }) {
  const [open, setOpen] = useState(false);
  const runs = collectPythonRuns(toolCalls);
  const count = runs.length;
  const label = count === 1 ? 'Ejecuté Python' : `Ejecuté Python (${count} veces)`;

  const preStyle: CSSProperties = {
    margin: 0,
    padding: '8px 10px',
    borderRadius: 'var(--r-md)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-2)',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowX: 'auto',
  };

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs transition-colors focus:outline-none"
        style={{ color: 'var(--text-3)', cursor: 'pointer' }}
        aria-expanded={open}
        aria-label={label}
      >
        <TerminalIcon />
        <span>{label}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          className="mt-2 flex flex-col gap-2 animate-fade-in-up"
          style={{ borderLeft: '2px solid var(--accent-line)', paddingLeft: 12 }}
        >
          {runs.map((run, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                Código
              </span>
              <pre style={preStyle}>{run.code}</pre>
              {run.error ? (
                <>
                  <span className="text-xs" style={{ color: 'var(--m-rose)' }}>
                    Error
                  </span>
                  <pre style={{ ...preStyle, color: 'var(--m-rose)' }}>{run.error}</pre>
                </>
              ) : (
                <>
                  <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                    Salida
                  </span>
                  <pre style={preStyle}>{(run.stdout ?? '').trim() || '(sin salida)'}</pre>
                </>
              )}
              {run.timedOut && (
                <span className="text-xs" style={{ color: 'var(--m-amber)' }}>
                  ⏱ Se agotó el tiempo de ejecución.
                </span>
              )}
              {run.truncated && (
                <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                  Salida truncada.
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Splits the assistant's tool calls by tool and renders each kind's chip.
 *  Keeps the render site tidy and ensures a run_python call never feeds the
 *  web-search chip (which would otherwise show a misleading "searched the web"). */
function ToolCallsChips({ toolCalls }: { toolCalls: ToolCallRecord[] }) {
  const web = toolCalls.filter((t) => t.name === 'web_search');
  const python = toolCalls.filter((t) => t.name === 'run_python');
  return (
    <>
      {web.length > 0 && <WebSearchChip toolCalls={web} />}
      {python.length > 0 && <PythonRunChip toolCalls={python} />}
    </>
  );
}

/** Six pulsing dots arranged like the Roundtable mark: a central node plus
 *  five satellites in the brand's signature colors. The whole ring pulses in
 *  sequence (center → green → blue → violet → amber → rose) so the indicator
 *  reads as a coordinated, lively "thinking" motion — not three quiet dots. */
function ThinkingDots() {
  const satellites = [
    { color: 'var(--m-green)', delay: '0ms' },
    { color: 'var(--m-blue)', delay: '100ms' },
    { color: 'var(--m-violet)', delay: '200ms' },
    { color: 'var(--m-amber)', delay: '300ms' },
    { color: 'var(--m-rose)', delay: '400ms' },
  ];
  return (
    <span aria-hidden className="inline-flex items-center gap-1">
      <span
        className="inline-block rounded-full"
        style={{
          width: 7,
          height: 7,
          backgroundColor: 'var(--accent)',
          animation: 'thinkingPulse 1.2s ease-in-out infinite',
        }}
      />
      {satellites.map((s) => (
        <span
          key={s.color}
          className="inline-block rounded-full"
          style={{
            width: 5,
            height: 5,
            backgroundColor: s.color,
            animation: 'thinkingPulse 1.2s ease-in-out infinite',
            animationDelay: s.delay,
          }}
        />
      ))}
    </span>
  );
}

/* ── Reasoning / thinking block ── collapsible, Roundtable-styled. */

function ReasoningBlock({ reasoning, active }: { reasoning: string; active: boolean }) {
  const [open, setOpen] = useState(active);
  const [userToggled, setUserToggled] = useState(false);

  // Auto-expand while the model is thinking; auto-collapse when it finishes —
  // unless the user has manually taken control of the toggle.
  useEffect(() => {
    if (!userToggled) setOpen(active);
  }, [active, userToggled]);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setOpen((o) => !o);
        }}
        className="flex items-center gap-2 text-xs transition-colors focus:outline-none"
        style={{ color: 'var(--text-3)' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
        }}
        aria-expanded={open}
      >
        {active ? (
          <ThinkingDots />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
        )}
        <span style={{ fontWeight: 500 }}>{active ? 'Pensando…' : 'Razonamiento'}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div
          className="mt-2 pl-3 text-sm whitespace-pre-wrap animate-fade-in-up"
          style={{
            borderLeft: '2px solid var(--accent-line)',
            color: 'var(--text-3)',
            lineHeight: 1.6,
          }}
        >
          {reasoning}
          {active && (
            <span className="animate-pulse" style={{ color: 'var(--text-4)' }}>
              ▍
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Attachment rendering ── */

function ImageAttachments({
  attachments,
  align,
}: {
  attachments: Attachment[];
  align: 'end' | 'start';
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {attachments.map((a, i) => (
        <a
          key={i}
          href={attachmentSrc(a)}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden"
          style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--border)', lineHeight: 0 }}
        >
          <img
            src={attachmentSrc(a)}
            alt={a.name ?? 'imagen adjunta'}
            className="object-cover"
            style={{ maxWidth: 280, maxHeight: 280, width: 'auto', height: 'auto' }}
          />
        </a>
      ))}
    </div>
  );
}

function PdfAttachment({ attachment }: { attachment: Attachment }) {
  const pageInfo =
    attachment.pageCount !== undefined
      ? `${attachment.pageCount} ${attachment.pageCount === 1 ? 'página' : 'páginas'}`
      : null;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        maxWidth: 280,
      }}
    >
      {/* PDF-specific icon (different from the generic file icon) */}
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        stroke="var(--m-rose)"
        strokeWidth="1.6"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9zM9 13v5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="truncate text-xs" style={{ color: 'var(--text-2)' }}>
        {attachment.name ?? 'documento.pdf'}
      </span>
      {pageInfo && (
        <span
          className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'rgba(208,119,160,0.10)', color: 'var(--m-rose)' }}
        >
          {pageInfo}
        </span>
      )}
    </div>
  );
}

function FileAttachments({
  attachments,
  align,
}: {
  attachments: Attachment[];
  align: 'end' | 'start';
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {attachments.map((a, i) =>
        a.type === 'pdf' ? (
          <PdfAttachment key={i} attachment={a} />
        ) : (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              maxWidth: 240,
            }}
          >
            <span style={{ color: 'var(--text-3)' }}>
              <FileIcon className="w-4 h-4" />
            </span>
            <span className="truncate text-xs" style={{ color: 'var(--text-2)' }}>
              {a.name ?? 'archivo'}
            </span>
          </div>
        )
      )}
    </div>
  );
}

/* ── Component ── */

/** Presentational render of a single chat message (user bubble / assistant / council / error). */
export function ChatMessageItem({
  msg,
  userName,
  streaming,
  isLast,
  isNew,
  onRegenerate,
}: ChatMessageItemProps) {
  void userName; // user identity now lives in the sidebar/topbar, not per-message
  const isCouncil = msg.provider === 'council' || msg.provider === 'consensus';
  const showTyping = streaming && isLast && msg.role === 'assistant' && !msg.isError && !isCouncil;

  /* Copy */
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail if clipboard is unavailable
    }
  }, [msg.content]);

  /* Feedback (local UI state) */
  const [feedback, setFeedback] = useState<'helpful' | 'unhelpful' | null>(null);
  const toggleFeedback = useCallback((value: 'helpful' | 'unhelpful') => {
    setFeedback((prev) => (prev === value ? null : value));
  }, []);

  /* Regenerate */
  const handleRegenerate = useCallback(() => {
    onRegenerate?.();
  }, [onRegenerate]);

  const attachments = msg.attachments ?? [];
  const imageAttachments = attachments.filter((a) => a.type === 'image');
  const fileAttachments = attachments.filter((a) => a.type !== 'image');

  /* ── USER message → right-aligned bubble (ChatGPT-style) ── */
  if (msg.role === 'user') {
    const showText = msg.content && msg.content !== ATTACH_PLACEHOLDER;
    return (
      <div className={`flex flex-col items-end gap-2 py-2.5 ${isNew ? 'animate-fade-in-up' : ''}`}>
        <div className="max-w-[80%] flex flex-col items-end gap-2">
          <ImageAttachments attachments={imageAttachments} align="end" />
          <FileAttachments attachments={fileAttachments} align="end" />
          {showText && (
            <div
              className="whitespace-pre-wrap break-words"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-1)',
                fontSize: 15,
                lineHeight: 1.5,
                padding: '10px 16px',
                borderRadius: 'var(--r-lg)',
              }}
            >
              {msg.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── ASSISTANT / COUNCIL / ERROR → clean, full-width text ── */
  const showActions = msg.role === 'assistant' && !msg.isError && !(streaming && isLast);

  return (
    <div className={`group py-3 ${isNew ? 'animate-fade-in-up' : ''}`}>
      {/* Reasoning / thinking — only when the model exposed any. */}
      {msg.reasoning && !isCouncil && (
        <ReasoningBlock reasoning={msg.reasoning} active={showTyping && !msg.content} />
      )}

      {/* Standalone typing indicator. Suppressed while the reasoning block is
          already showing its own "Pensando…" (reasoning present, no answer yet)
          to avoid the duplicate label. Still shown when there's no reasoning
          (plain "Pensando…") or once the answer starts ("Respondiendo…"). */}
      {showTyping && !(msg.reasoning && !msg.content) && (
        <div className="flex items-center gap-2 mb-2">
          <ThinkingDots />
          <span className="text-xs" style={{ color: 'var(--text-4)' }}>
            {msg.content ? 'Respondiendo…' : 'Pensando…'}
          </span>
        </div>
      )}

      {/* Tool-calls chip — shown when the assistant invoked any tool during
          this response (e.g. web_search for current data). Expands into the
          consulted sources. Hidden for Council because the deliberation UI
          already shows tool provenance at the voice level. */}
      {!isCouncil && (msg.toolCalls?.length ?? 0) > 0 && (
        <ToolCallsChips toolCalls={msg.toolCalls!} />
      )}

      {isCouncil ? (
        msg.councilInfo ? (
          <CouncilBlock council={msg.councilInfo} />
        ) : (
          <div
            className="mt-1"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              padding: 20,
            }}
          >
            <div className="flex items-center gap-2">
              <ThinkingDots />
              <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                Iniciando consejo real…
              </span>
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>
              Esperando propuestas reales de los modelos conectados.
            </p>
          </div>
        )
      ) : msg.isError ? (
        <div
          className="pl-3"
          style={{
            borderLeft: '2px solid var(--m-rose)',
            color: 'var(--m-rose)',
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          {msg.content}
        </div>
      ) : (
        <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-1)' }}>
          {msg.content ? <MarkdownContent content={msg.content} /> : null}
        </div>
      )}

      {/* ── Action toolbar (ChatGPT-style: subtle icons below the answer) ── */}
      {showActions && (
        <div className="mt-2 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs px-1.5 py-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{ color: 'var(--text-4)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-4)';
            }}
            aria-label={copied ? 'Copiado al portapapeles' : 'Copiar mensaje'}
            title={copied ? '¡Copiado!' : 'Copiar mensaje'}
          >
            <ClipboardIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{copied ? '¡Copiado!' : 'Copiar'}</span>
          </button>

          {/* Regenerate */}
          <button
            type="button"
            onClick={handleRegenerate}
            className="flex items-center gap-1 text-xs px-1.5 py-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{ color: 'var(--text-4)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-4)';
            }}
            aria-label="Regenerar respuesta"
            title="Regenerar respuesta"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Regenerar</span>
          </button>

          {/* Feedback */}
          <button
            type="button"
            onClick={() => toggleFeedback('helpful')}
            className="flex items-center px-1.5 py-1 rounded text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{ color: feedback === 'helpful' ? 'var(--m-green)' : 'var(--text-4)' }}
            onMouseEnter={(e) => {
              if (feedback !== 'helpful')
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
            }}
            onMouseLeave={(e) => {
              if (feedback !== 'helpful')
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-4)';
            }}
            aria-label="Marcar como útil"
            title="Útil"
          >
            <ThumbsUpIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => toggleFeedback('unhelpful')}
            className="flex items-center px-1.5 py-1 rounded text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{ color: feedback === 'unhelpful' ? 'var(--m-rose)' : 'var(--text-4)' }}
            onMouseEnter={(e) => {
              if (feedback !== 'unhelpful')
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
            }}
            onMouseLeave={(e) => {
              if (feedback !== 'unhelpful')
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-4)';
            }}
            aria-label="Marcar como no útil"
            title="No útil"
          >
            <ThumbsDownIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
