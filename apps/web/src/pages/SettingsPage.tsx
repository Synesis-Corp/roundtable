import { storage } from '../lib/storage';
import { useState, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useProviders } from '../hooks/useProviders';
import { useProvidersHealth } from '../hooks/useProvidersHealth';
import { useSettings } from '../hooks/useSettings';
import { useModels } from '../hooks/useModels';
import { useCouncilConfig } from '../hooks/useCouncilConfig';
import { ProviderRow } from '../components/ProviderRow';
import { CouncilMembersModal } from '../components/CouncilMembersModal';
import { ActiveModelsModal } from '../components/ActiveModelsModal';
import { MemorySettingsSection } from '../components/MemorySettingsSection';
import { ProfileForm } from '../components/ProfileForm';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { getInitials } from '../lib/initials';
import UsagePage from './UsagePage';
import { useTranslation, Trans } from 'react-i18next';

type ProviderFilter = 'all' | 'connected' | 'popular';
type SettingsTab = 'profile' | 'providers' | 'usage' | 'council' | 'memory';

const TABS: { key: SettingsTab; labelKey: string }[] = [
  { key: 'profile', labelKey: 'settings.tabs.profile' },
  { key: 'providers', labelKey: 'settings.tabs.providers' },
  { key: 'usage', labelKey: 'settings.tabs.usage' },
  { key: 'council', labelKey: 'settings.tabs.council' },
  { key: 'memory', labelKey: 'settings.tabs.memory' },
];

export default function SettingsPage() {
  const location = useLocation();
  const { t } = useTranslation();
  const {
    providers,
    popularProviders,
    otherProviders,
    loading: providersLoading,
    error: providersError,
  } = useProviders();

  const {
    userProviders,
    userProvidersLoading,
    userProviderMap,
    saveMessages,
    saving,
    testing,
    codexConnecting,
    codexNotice,
    testConnection,
    handleConnect,
    pendingDisconnect,
    requestDisconnect,
    handleDisconnectConfirmed,
    setPendingDisconnect,
    handleCodexStart,
    setCodexNotice,
  } = useSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    location.pathname.endsWith('/usage') ? 'usage' : 'profile'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [providerOptions, setProviderOptions] = useState<
    Record<string, { baseURL?: string; headers?: string; endpoint?: string }>
  >({});
  const [showCouncilModal, setShowCouncilModal] = useState(false);
  const [activeModelsProvider, setActiveModelsProvider] = useState<string | null>(null);
  const [showAllProviders, setShowAllProviders] = useState(false);

  const { models } = useModels();
  const { health: providersHealth, loading: healthLoading } = useProvidersHealth();
  const { config: councilConfig, updateConfig, deleteConfig } = useCouncilConfig();

  const token = storage.get('token');

  const userEmail = useMemo(() => {
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return typeof payload.email === 'string' ? payload.email : '';
    } catch {
      return '';
    }
  }, [token]);

  const userName = userEmail ? userEmail.split('@')[0] : t('shell.userFallback');

  const connectedCount = userProviders.length;
  const totalProviders = providers.length;

  const isConnected = useCallback(
    (providerId: string) => userProviderMap.has(providerId),
    [userProviderMap]
  );

  const getMaskedKey = useCallback(
    (providerId: string) => userProviderMap.get(providerId)?.maskedKey ?? '',
    [userProviderMap]
  );

  const filterProviders = useCallback(
    (list: typeof providers) => {
      let result = list;
      if (providerFilter === 'connected') result = result.filter((p) => isConnected(p.id));
      if (providerFilter === 'popular') result = result.filter((p) => p.popular);
      if (!searchQuery.trim()) return result;
      const q = searchQuery.toLowerCase();
      return result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
    },
    [isConnected, providerFilter, searchQuery]
  );

  const filteredPopular = filterProviders(popularProviders);
  const filteredOther = filterProviders(otherProviders);

  // Group for a calmer browsing flow: your connected providers always show first,
  // then popular ones; the long tail (~130) collapses behind "Ver todos" unless
  // you're actively searching or filtering. Functionality is unchanged.
  const isPopularProvider = useCallback(
    (id: string) => popularProviders.some((p) => p.id === id),
    [popularProviders]
  );
  const connectedList = [...filteredPopular, ...filteredOther].filter((p) => isConnected(p.id));
  const popularUnconnected = filteredPopular.filter((p) => !isConnected(p.id));
  const otherUnconnected = filteredOther.filter((p) => !isConnected(p.id));
  const isBrowsing = Boolean(searchQuery.trim()) || providerFilter !== 'all';

  const renderProviderRow = (provider: (typeof providers)[number], withCodex: boolean) => (
    <ProviderRow
      key={provider.id}
      provider={provider}
      isConnected={isConnected(provider.id)}
      health={providersHealth[provider.id]}
      healthLoading={healthLoading}
      maskedKey={getMaskedKey(provider.id)}
      apiKey={apiKeys[provider.id] || ''}
      onApiKeyChange={(val) => setApiKeys((prev) => ({ ...prev, [provider.id]: val }))}
      showKey={showKeys[provider.id] || false}
      onToggleShowKey={() =>
        setShowKeys((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))
      }
      saving={saving[provider.id] || false}
      message={saveMessages[provider.id] || null}
      onConnect={() =>
        handleConnect(provider.id, apiKeys[provider.id]?.trim() || '', providerOptions[provider.id])
      }
      onRequestDisconnect={() => requestDisconnect(provider.id)}
      onTestConnection={() => {
        const key = apiKeys[provider.id]?.trim();
        if (key) testConnection(provider.id, key);
      }}
      testing={testing[provider.id] || false}
      options={providerOptions[provider.id] || {}}
      onOptionsChange={(opts) => setProviderOptions((prev) => ({ ...prev, [provider.id]: opts }))}
      advancedOpen={advancedOpen[provider.id] || false}
      onToggleAdvanced={() =>
        setAdvancedOpen((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))
      }
      codexConnecting={withCodex ? codexConnecting : false}
      onCodexConnect={withCodex ? handleCodexStart : () => {}}
      onManageModels={
        isConnected(provider.id) ? () => setActiveModelsProvider(provider.id) : undefined
      }
    />
  );

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-app)' }}>
      <div className="mx-auto px-4 py-8 max-w-4xl">
        {/* Account identity */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="flex shrink-0 items-center justify-center text-sm font-semibold text-white"
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--r-sm)',
              background: 'linear-gradient(150deg, #5b91d6, #7c6cf0 70%)',
            }}
          >
            {userName ? getInitials(userName) : 'U'}
          </div>
          <div className="min-w-0">
            <div
              className="truncate"
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}
            >
              {userName || t('shell.userFallback')}
            </div>
            <div className="truncate" style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {userEmail}
            </div>
          </div>
        </div>

        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: 'var(--text-1)',
            letterSpacing: '-0.02em',
          }}
        >
          {t('settings.title')}
        </h1>

        {/* Tabs — equal width for a consistent, balanced segmented control */}
        <div
          className="mt-4 mb-6 grid grid-cols-5 gap-1 p-1 rounded-xl w-full max-w-xl"
          role="tablist"
          aria-label={t('settings.sectionsAria')}
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className="py-1.5 text-[13px] font-medium rounded-lg text-center transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]"
                style={{
                  backgroundColor: isActive ? 'var(--accent-quiet)' : 'transparent',
                  color: isActive ? 'var(--accent-text)' : 'var(--text-2)',
                  border: isActive ? '1px solid var(--accent-line)' : '1px solid transparent',
                }}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Codex notice (providers flow) */}
        {codexNotice && activeTab === 'providers' && (
          <div
            className="mb-6"
            style={{
              borderRadius: 'var(--r-md)',
              border:
                codexNotice.type === 'error'
                  ? '1px solid rgba(208,119,160,0.2)'
                  : '1px solid rgba(92,176,139,0.2)',
              backgroundColor:
                codexNotice.type === 'error' ? 'rgba(208,119,160,0.06)' : 'rgba(92,176,139,0.06)',
              padding: '12px 16px',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <p
                className="text-sm"
                style={{ color: codexNotice.type === 'error' ? 'var(--m-rose)' : 'var(--m-green)' }}
              >
                {codexNotice.text}
              </p>
              <button
                onClick={() => setCodexNotice(null)}
                className="shrink-0 p-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                style={{ color: 'var(--text-3)', borderRadius: 'var(--r-xs)' }}
                aria-label={t('settings.dismissNotice')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <div role="tabpanel">
            <ProfileForm />
          </div>
        )}

        {/* ── PROVIDERS TAB ── */}
        {activeTab === 'providers' && (
          <div className="space-y-8" role="tabpanel">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium"
                  style={{
                    backgroundColor: 'rgba(92,176,139,0.14)',
                    color: 'var(--m-green)',
                    border: '1px solid rgba(92,176,139,0.32)',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--m-green)' }}
                  />
                  {t('settings.connectedCount', { count: connectedCount })}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {t('settings.ofTotalCouncil', { total: totalProviders })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('settings.searchProviders')}
                    className="w-44 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      color: 'var(--text-1)',
                      padding: '7px 10px 7px 32px',
                    }}
                  />
                  <svg
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: 'var(--text-3)' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
                  className="text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)',
                    color: 'var(--text-1)',
                    padding: '7px 24px 7px 10px',
                  }}
                >
                  <option value="all">{t('settings.filter.all')}</option>
                  <option value="connected">{t('settings.filter.connected')}</option>
                  <option value="popular">{t('settings.filter.popular')}</option>
                </select>
              </div>
            </div>

            {providersError && (
              <div
                style={{
                  borderRadius: 'var(--r-md)',
                  border: '1px solid rgba(208,119,160,0.2)',
                  backgroundColor: 'rgba(208,119,160,0.06)',
                  padding: '12px 16px',
                }}
              >
                <p className="text-sm" style={{ color: 'var(--m-rose)' }}>
                  {providersError}
                </p>
              </div>
            )}

            {(providersLoading || userProvidersLoading) &&
              filteredPopular.length === 0 &&
              filteredOther.length === 0 && (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="animate-shimmer"
                      style={{
                        height: 120,
                        borderRadius: 'var(--r-md)',
                        backgroundColor: 'var(--bg-surface)',
                      }}
                    />
                  ))}
                </div>
              )}

            {connectedCount === 0 && !providersLoading && !userProvidersLoading && (
              <div
                className="flex flex-col items-center justify-center py-12"
                style={{
                  borderRadius: 'var(--r-md)',
                  border: '1px dashed var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <div
                  className="flex items-center justify-center mb-4"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 'var(--r-md)',
                    backgroundColor: 'var(--accent-quiet)',
                  }}
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: 'var(--accent)' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <p
                  className="font-medium text-center"
                  style={{ fontSize: 15, color: 'var(--text-1)' }}
                >
                  {t('settings.empty.title')}
                </p>
                <p
                  className="text-center mt-1 max-w-sm"
                  style={{ fontSize: 13, color: 'var(--text-3)' }}
                >
                  {t('settings.empty.body')}
                </p>
              </div>
            )}

            {/* Connected providers — always first, so your setup is front-and-center */}
            {connectedList.length > 0 && (
              <div>
                <h2
                  className="uppercase font-medium mb-3"
                  style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-3)' }}
                >
                  {t('settings.group.connected')}
                </h2>
                <div className="space-y-3">
                  {connectedList.map((p) => renderProviderRow(p, isPopularProvider(p.id)))}
                </div>
              </div>
            )}

            {/* Popular, not yet connected */}
            {popularUnconnected.length > 0 && (
              <div>
                <h2
                  className="uppercase font-medium mb-3"
                  style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-3)' }}
                >
                  {t('settings.group.popular')}
                </h2>
                <div className="space-y-3">
                  {popularUnconnected.map((p) => renderProviderRow(p, true))}
                </div>
              </div>
            )}

            {/* The long tail — collapsed by default unless searching/filtering */}
            {otherUnconnected.length > 0 &&
              (isBrowsing || showAllProviders ? (
                <div>
                  <h2
                    className="uppercase font-medium mb-3"
                    style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-3)' }}
                  >
                    {isBrowsing ? t('settings.group.results') : t('settings.group.all')}
                  </h2>
                  <div className="space-y-3">
                    {otherUnconnected.map((p) => renderProviderRow(p, false))}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAllProviders(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                  style={{
                    border: '1px dashed var(--border)',
                    borderRadius: 'var(--r-md)',
                    color: 'var(--text-2)',
                    backgroundColor: 'var(--bg-surface)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      'var(--bg-surface)';
                  }}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {t('settings.showAll', { count: otherUnconnected.length })}
                </button>
              ))}
          </div>
        )}

        {/* ── USAGE TAB ── */}
        {activeTab === 'usage' && (
          <div role="tabpanel" className="-mx-4">
            <UsagePage embedded />
          </div>
        )}
        {/* embedded UsagePage supplies its own px-4 */}

        {/* ── COUNCIL TAB ── */}
        {activeTab === 'council' && (
          <div role="tabpanel" className="space-y-4">
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: 20,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
                    {t('settings.council.membersTitle')}
                  </h2>
                  <p
                    className="mt-1"
                    style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}
                  >
                    {t('settings.council.membersDesc')}
                  </p>
                </div>
                <span
                  className="shrink-0 inline-flex items-center px-2.5 py-1 text-[12px] font-medium rounded-full"
                  style={{
                    backgroundColor:
                      councilConfig?.mode === 'manual'
                        ? 'var(--accent-quiet)'
                        : 'var(--bg-elevated)',
                    color:
                      councilConfig?.mode === 'manual' ? 'var(--accent-text)' : 'var(--text-2)',
                    border: `1px solid ${councilConfig?.mode === 'manual' ? 'var(--accent-line)' : 'var(--border)'}`,
                  }}
                >
                  {councilConfig?.mode === 'manual'
                    ? t('settings.council.manualBadge', { count: councilConfig.modelIds.length })
                    : t('settings.council.auto')}
                </span>
              </div>

              {/* Who participates right now */}
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <p
                  className="mb-2 uppercase font-medium"
                  style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--text-3)' }}
                >
                  {t('settings.council.participatingNow')}
                </p>
                {councilConfig?.mode === 'manual' && councilConfig.modelIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {councilConfig.modelIds.map((id) => {
                      const m = models.find((mm) => mm.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px]"
                          style={{
                            backgroundColor: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-2)',
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: 'var(--accent)' }}
                          />
                          {m?.name ?? id}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
                    <Trans
                      i18nKey="settings.council.autoSelection"
                      components={{
                        accent: <span style={{ color: 'var(--text-2)', fontWeight: 500 }} />,
                      }}
                    />
                  </p>
                )}
              </div>

              {/* Action */}
              <div className="mt-5 flex items-center gap-3 flex-wrap">
                {connectedCount >= 2 ? (
                  <button
                    onClick={() => setShowCouncilModal(true)}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        'var(--accent-hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        'var(--accent)';
                    }}
                  >
                    {t('settings.council.membersButton')}
                  </button>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--m-amber)' }}>
                    {t('settings.council.needTwo')}
                  </p>
                )}
                {councilConfig?.mode === 'manual' && (
                  <button
                    onClick={() => deleteConfig()}
                    className="text-sm transition-colors focus:outline-none"
                    style={{ color: 'var(--text-3)' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)';
                    }}
                  >
                    {t('settings.council.resetAuto')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div role="tabpanel">
            <MemorySettingsSection />
          </div>
        )}

        <CouncilMembersModal
          open={showCouncilModal}
          onClose={() => setShowCouncilModal(false)}
          models={models}
          currentConfig={councilConfig}
          onSave={(modelIds, mode) => updateConfig(modelIds, mode)}
          onReset={() => deleteConfig()}
        />

        <ActiveModelsModal
          providerId={activeModelsProvider}
          providerName={
            providers.find((p) => p.id === activeModelsProvider)?.name ?? activeModelsProvider ?? ''
          }
          onClose={() => setActiveModelsProvider(null)}
        />

        {pendingDisconnect && (
          <ConfirmActionModal
            title={t('settings.disconnect.title')}
            message={
              <Trans
                i18nKey="settings.disconnect.message"
                values={{ name: pendingDisconnect.name }}
                components={{ strong: <strong style={{ color: 'var(--text-1)' }} /> }}
              />
            }
            confirmLabel={t('settings.disconnect.confirm')}
            cancelLabel={t('settings.disconnect.cancel')}
            destructive
            loading={saving[pendingDisconnect.providerId] || false}
            onCancel={() => setPendingDisconnect(null)}
            onConfirm={handleDisconnectConfirmed}
          />
        )}
      </div>
    </div>
  );
}
