import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Conversation } from '@chat/sdk';
import { groupConversationsByDate, formatConversationTime } from '../lib/conversations';
import { getProviderColor, getProviderLabel } from '../lib/layout-helpers';
import { useIncognitoFromBus } from '../lib/incognito-events';

interface ConversationListProps {
  loadingConversations: boolean;
  /** Full (unfiltered) list — drives the "no conversations yet" empty state. */
  conversations: Conversation[];
  /** Filtered by the active search query (or the full list when not searching). */
  filteredConversations: Conversation[];
  searchQuery: string;
  activeConversationId: string | null;
  /** Returns false to cancel navigation when a stream is in progress. */
  confirmLeaveIfStreaming: () => boolean;
  onCloseMobile: () => void;
  onOpenRename: (id: string, title: string) => void;
  onRequestDelete: (pending: { id: string; title: string }) => void;
}

/** Sidebar conversation history: skeleton, empty states, and grouped rows. */
export function ConversationList({
  loadingConversations,
  conversations,
  filteredConversations,
  searchQuery,
  activeConversationId,
  confirmLeaveIfStreaming,
  onCloseMobile,
  onOpenRename,
  onRequestDelete,
}: ConversationListProps) {
  const { t } = useTranslation();
  // Capability 3: dim the conversation list when incognito is active.
  // The notice and dim are removed when incognito exits.
  const incognitoActive = useIncognitoFromBus();
  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 mt-2">
      {incognitoActive && (
        <div
          data-testid="incognito-dim-notice"
          className="px-2 mb-3"
          style={{
            fontSize: 11.5,
            color: 'var(--m-amber)',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.22)',
            borderRadius: 'var(--r-sm)',
            padding: '6px 10px',
            lineHeight: 1.4,
            opacity: 1,
          }}
        >
          {t('shell.incognitoDim.notice')}
        </div>
      )}
      {loadingConversations && conversations.length === 0 ? (
        <div className="space-y-2 px-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div
                className="h-3 rounded w-3/4 mb-1.5"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              />
              <div className="h-2 rounded w-1/2" style={{ backgroundColor: 'var(--bg-surface)' }} />
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-full px-2"
          style={{ fontSize: 12, color: 'var(--text-3)' }}
        >
          {t('shell.emptyConversations')}
        </div>
      ) : filteredConversations.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center px-2 py-8 text-center"
          style={{ fontSize: 12, color: 'var(--text-3)' }}
        >
          {t('shell.noResults', { query: searchQuery.trim() })}
        </div>
      ) : (
        <div
          data-dimmed={incognitoActive ? 'true' : 'false'}
          style={{ opacity: incognitoActive ? 0.4 : 1 }}
        >
          {/* Single global "Recent" header (Capability 6). Shown above the
              first date group when the user is not searching. The first
              group's original label is suppressed to avoid double-headings. */}
          {searchQuery.trim() === '' && (
            <div
              className="px-2 mb-2"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-2)',
                marginTop: 0,
              }}
            >
              {t('shell.history.recent')}
            </div>
          )}
          {groupConversationsByDate(filteredConversations.slice(0, 30)).map((group, groupIndex) => (
            <div key={group.key}>
              {!(searchQuery.trim() === '' && groupIndex === 0) && (
                <div
                  className="px-2 mb-2 uppercase"
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    color: 'var(--text-3)',
                    marginTop: groupIndex === 0 ? 0 : 16,
                  }}
                >
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.conversations.map((conv) => {
                  const isActive = activeConversationId === conv.id;
                  const lastProvider = conv.messages?.[conv.messages.length - 1]?.providerId;
                  const providerColor = getProviderColor(lastProvider);
                  const providerLabel = getProviderLabel(lastProvider, t);
                  const isMulti = conv.messages?.some((m) => m.providerId === 'multi');
                  return (
                    <Link
                      key={conv.id}
                      to={`/c/${conv.id}`}
                      onClick={(e) => {
                        if (conv.id !== activeConversationId && !confirmLeaveIfStreaming()) {
                          e.preventDefault();
                          return;
                        }
                        onCloseMobile();
                      }}
                      className="group block w-full text-left transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)] relative"
                      style={{
                        padding: isActive ? '8px 10px 8px 13px' : '8px 10px',
                        borderRadius: 'var(--r-sm)',
                        backgroundColor: isActive ? 'var(--accent-quiet)' : 'transparent',
                        color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                        // Anti-slop fix: the 3px visible accent stripe is removed.
                        // The transparent border-left is kept (3px) to preserve
                        // the layout slot so removing the stripe doesn't shift
                        // the title's left edge. The active row compensates
                        // for that with +3px padding-left.
                        borderLeft: '3px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                            'var(--hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                            'transparent';
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {/* Provider color dot — tooltip reveals which model answered last */}
                        <span
                          className="shrink-0 rounded-full"
                          title={t('shell.lastModel', { label: providerLabel })}
                          aria-label={t('shell.lastModel', { label: providerLabel })}
                          role="img"
                          style={{
                            width: 7,
                            height: 7,
                            backgroundColor: providerColor,
                          }}
                        />
                        {/* Title */}
                        <span
                          className="flex-1 truncate"
                          style={{
                            fontSize: 13.5,
                            fontWeight: 500,
                            color: isActive ? 'var(--text-1)' : 'var(--text-1)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {conv.title}
                        </span>
                        {/* Meta: Multi chip or time */}
                        {isMulti ? (
                          <span
                            className="shrink-0"
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              padding: '2px 8px',
                              borderRadius: 'var(--r-pill)',
                              backgroundColor: 'var(--accent-quiet)',
                              color: 'var(--accent-text)',
                            }}
                          >
                            Multi
                          </span>
                        ) : (
                          <span
                            className="shrink-0"
                            style={{
                              fontSize: 11,
                              color: 'var(--text-4)',
                            }}
                          >
                            {formatConversationTime(conv.updatedAt, group.key)}
                          </span>
                        )}
                        {/* Rename — appears on hover/focus */}
                        <button
                          type="button"
                          aria-label={t('shell.renameConversation', { title: conv.title })}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenRename(conv.id, conv.title);
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity focus:outline-none"
                          style={{
                            color: 'var(--text-4)',
                            padding: 2,
                            borderRadius: 6,
                            lineHeight: 0,
                            // REQ-DIM-1: row actions are non-interactive in incognito.
                            // The dim wrapper applies opacity 0.4; we additionally
                            // disable clicks on rename/delete so the user can't
                            // accidentally mutate non-incognito state.
                            pointerEvents: incognitoActive ? 'none' : 'auto',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-4)';
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {/* Delete (soft) — appears on hover/focus */}
                        <button
                          type="button"
                          aria-label={t('shell.deleteConversation', { title: conv.title })}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRequestDelete({ id: conv.id, title: conv.title });
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity focus:outline-none"
                          style={{
                            color: 'var(--text-4)',
                            padding: 2,
                            borderRadius: 6,
                            lineHeight: 0,
                            // REQ-DIM-1: see rename above.
                            pointerEvents: incognitoActive ? 'none' : 'auto',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--m-rose)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-4)';
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
