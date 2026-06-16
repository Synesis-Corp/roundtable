import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StreamingContext } from '../lib/streaming-context';
import { NEW_CHAT_EVENT } from '../lib/layout-helpers';
import { useAuthSession } from '../hooks/useAuthSession';
import { useConversations } from '../hooks/useConversations';
import { useSidebarUi } from '../hooks/useSidebarUi';
import { useStreamingGuard } from '../hooks/useStreamingGuard';
import { SidebarHeader } from './SidebarHeader';
import { SidebarSearch } from './SidebarSearch';
import { ConversationList } from './ConversationList';
import { SidebarUserCard } from './SidebarUserCard';
import { SidebarTopbarToggles } from './SidebarTopbarToggles';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { RenameModal } from './RenameModal';

export default function Layout() {
  const navigate = useNavigate();
  const params = useParams<{ conversationId?: string }>();
  const activeConversationId = params.conversationId ?? null;
  const { t } = useTranslation();

  const { token, userName, handleLogout } = useAuthSession();
  const { streaming, setStreaming, confirmLeaveIfStreaming } = useStreamingGuard();
  const {
    mobileOpen,
    setMobileOpen,
    desktopCollapsed,
    toggleDesktopCollapsed,
    searchOpen,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    toggleSearch,
  } = useSidebarUi();
  const {
    conversations,
    loadingConversations,
    pendingDelete,
    setPendingDelete,
    deleting,
    handleDeleteConfirmed,
    pendingRename,
    setPendingRename,
    renameValue,
    setRenameValue,
    renaming,
    regeneratingTitle,
    openRename,
    handleRenameConfirmed,
    handleRegenerateTitle,
  } = useConversations(activeConversationId);

  const handleNewChat = () => {
    if (!confirmLeaveIfStreaming()) return;
    const newChatAt = Date.now();
    setMobileOpen(false);
    window.dispatchEvent(new CustomEvent(NEW_CHAT_EVENT, { detail: { newChatAt } }));
    navigate('/', { state: { newChatAt } });
  };

  // Filter the conversation history by title when a search is active.
  const query = searchQuery.trim().toLowerCase();
  const filteredConversations = query
    ? conversations.filter((c) => c.title.toLowerCase().includes(query))
    : conversations;

  // Sidebar visible on desktop unless explicitly collapsed.
  const showFullSidebar = !desktopCollapsed;

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          flex flex-col
          transform transition-all duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${showFullSidebar ? 'w-80' : 'lg:w-0 lg:overflow-hidden w-80'}
        `}
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border)',
          color: 'var(--text-1)',
        }}
      >
        <SidebarHeader
          confirmLeaveIfStreaming={confirmLeaveIfStreaming}
          onCloseMobile={() => setMobileOpen(false)}
          onToggleDesktopCollapsed={toggleDesktopCollapsed}
        />

        {/* New chat button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-sm)',
              backgroundColor: 'var(--accent-quiet)',
              border: '1px solid var(--accent-line)',
              color: 'var(--accent-text)',
              fontSize: 13,
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                'rgba(111,123,242,0.22)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent-quiet)';
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            {t('shell.newChat')}
          </button>
        </div>

        <SidebarSearch
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          searchInputRef={searchInputRef}
          onQueryChange={setSearchQuery}
          onToggle={toggleSearch}
        />

        {/* Conversation history */}
        {token && (
          <ConversationList
            loadingConversations={loadingConversations}
            conversations={conversations}
            filteredConversations={filteredConversations}
            searchQuery={searchQuery}
            activeConversationId={activeConversationId}
            confirmLeaveIfStreaming={confirmLeaveIfStreaming}
            onCloseMobile={() => setMobileOpen(false)}
            onOpenRename={openRename}
            onRequestDelete={setPendingDelete}
          />
        )}

        {/* User section */}
        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          {token ? (
            <SidebarUserCard
              userName={userName}
              conversationCount={conversations.length}
              onCloseMobile={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          ) : null}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-y-auto relative">
        <SidebarTopbarToggles
          desktopCollapsed={desktopCollapsed}
          onOpenMobile={() => setMobileOpen(true)}
          onToggleDesktopCollapsed={toggleDesktopCollapsed}
          onNewChat={handleNewChat}
        />

        <StreamingContext.Provider value={{ streaming, setStreaming }}>
          <Outlet />
        </StreamingContext.Provider>
      </main>

      {/* Soft-delete confirmation modal */}
      {pendingDelete && (
        <ConfirmDeleteModal
          title={pendingDelete.title}
          deleting={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}

      {/* Rename modal */}
      {pendingRename && (
        <RenameModal
          renameValue={renameValue}
          renaming={renaming}
          regeneratingTitle={regeneratingTitle}
          onChange={setRenameValue}
          onCancel={() => setPendingRename(null)}
          onConfirm={handleRenameConfirmed}
          onRegenerateTitle={handleRegenerateTitle}
        />
      )}
    </div>
  );
}
