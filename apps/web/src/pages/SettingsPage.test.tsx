import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';

const mockUseProviders = vi.hoisted(() =>
  vi.fn(() => ({
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        npm: '@ai-sdk/openai',
        doc: '',
        env: [],
        modelCount: 5,
        popular: true,
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        npm: 'x',
        doc: '',
        env: [],
        modelCount: 2,
        popular: false,
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        npm: 'x',
        doc: '',
        env: [],
        modelCount: 3,
        popular: true,
      },
    ],
    popularProviders: [
      {
        id: 'openai',
        name: 'OpenAI',
        npm: '@ai-sdk/openai',
        doc: '',
        env: [],
        modelCount: 5,
        popular: true,
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        npm: 'x',
        doc: '',
        env: [],
        modelCount: 3,
        popular: true,
      },
    ],
    otherProviders: [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        npm: 'x',
        doc: '',
        env: [],
        modelCount: 2,
        popular: false,
      },
    ],
    loading: false,
    error: null,
  }))
);

const mockUseSettings = vi.hoisted(() =>
  vi.fn(() => ({
    userProviders: [
      { providerId: 'openai', maskedKey: 'sk-****', isActive: true },
      { providerId: 'deepseek', maskedKey: 'sk-****', isActive: true },
    ],
    userProvidersLoading: false,
    userProviderMap: new Map([
      ['openai', { providerId: 'openai', maskedKey: 'sk-****', isActive: true }],
      ['deepseek', { providerId: 'deepseek', maskedKey: 'sk-****', isActive: true }],
    ]),
    saveMessages: {},
    saving: {},
    testing: {},
    codexConnecting: false,
    codexNotice: null,
    testConnection: vi.fn(),
    handleConnect: vi.fn(),
    pendingDisconnect: null,
    requestDisconnect: vi.fn(),
    handleDisconnectConfirmed: vi.fn(),
    setPendingDisconnect: vi.fn(),
    handleCodexStart: vi.fn(),
    setSaveMessages: vi.fn(),
    setCodexNotice: vi.fn(),
  }))
);

const mockUseModels = vi.hoisted(() =>
  vi.fn(() => ({
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        description: '',
        contextWindow: 128000,
        capabilities: ['text'],
      },
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        description: '',
        contextWindow: 64000,
        capabilities: ['text'],
      },
    ],
    loading: false,
    error: null,
  }))
);

const mockUseCouncilConfig = vi.hoisted(() =>
  vi.fn(() => ({
    config: null,
    loading: false,
    error: null,
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
  }))
);

vi.mock('../hooks/useProviders', () => ({
  useProviders: mockUseProviders,
}));

vi.mock('../hooks/useSettings', () => ({
  useSettings: mockUseSettings,
}));

vi.mock('../hooks/useModels', () => ({
  useModels: mockUseModels,
}));

vi.mock('../hooks/useCouncilConfig', () => ({
  useCouncilConfig: mockUseCouncilConfig,
}));

function renderSettingsPage() {
  return render(
    <BrowserRouter>
      <SettingsPage />
    </BrowserRouter>
  );
}

/** The council config now lives under the "Consejo" tab of the Settings hub. */
function openCouncilTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Council' }));
}

describe('SettingsPage — Council tab', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders the Settings tabs', () => {
    renderSettingsPage();
    expect(screen.getByRole('tab', { name: 'Providers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Usage' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Council' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Memory' })).toBeInTheDocument();
  });

  it('shows the "Council members" button in the Consejo tab when ≥2 providers are connected', () => {
    renderSettingsPage();
    openCouncilTab();
    expect(screen.getByRole('button', { name: 'Council members' })).toBeInTheDocument();
  });

  it('does NOT show the "Council members" button when <2 providers are connected', () => {
    mockUseSettings.mockReturnValue({
      userProviders: [{ providerId: 'openai', maskedKey: 'sk-****', isActive: true }],
      userProvidersLoading: false,
      userProviderMap: new Map([
        ['openai', { providerId: 'openai', maskedKey: 'sk-****', isActive: true }],
      ]),
      saveMessages: {},
      saving: {},
      testing: {},
      codexConnecting: false,
      codexNotice: null,
      testConnection: vi.fn(),
      handleConnect: vi.fn(),
      pendingDisconnect: null,
      requestDisconnect: vi.fn(),
      handleDisconnectConfirmed: vi.fn(),
      setPendingDisconnect: vi.fn(),
      handleCodexStart: vi.fn(),
      setSaveMessages: vi.fn(),
      setCodexNotice: vi.fn(),
    } as any);

    renderSettingsPage();
    openCouncilTab();
    expect(screen.queryByRole('button', { name: 'Council members' })).not.toBeInTheDocument();
  });

  it('opens the council members modal when clicked', async () => {
    renderSettingsPage();
    openCouncilTab();
    fireEvent.click(screen.getByRole('button', { name: 'Council members' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('closes the modal when cancel is clicked', async () => {
    renderSettingsPage();
    openCouncilTab();
    fireEvent.click(screen.getByRole('button', { name: 'Council members' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows the configured members as chips when the council config is manual', () => {
    mockUseCouncilConfig.mockReturnValue({
      config: { mode: 'manual', modelIds: ['gpt-4o', 'deepseek-chat'] },
      loading: false,
      error: null,
      updateConfig: vi.fn(),
      deleteConfig: vi.fn(),
    } as any);

    renderSettingsPage();
    openCouncilTab();

    expect(screen.getByText('Participating now')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('DeepSeek Chat')).toBeInTheDocument();
    expect(screen.getByText('Manual · 2 models')).toBeInTheDocument();
  });

  it('opens a confirmation modal when disconnect is clicked', () => {
    const requestDisconnect = vi.fn();
    mockUseSettings.mockReturnValue({
      userProviders: [{ providerId: 'openai', maskedKey: 'sk-****', isActive: true }],
      userProvidersLoading: false,
      userProviderMap: new Map([
        ['openai', { providerId: 'openai', maskedKey: 'sk-****', isActive: true }],
      ]),
      saveMessages: {},
      saving: {},
      testing: {},
      codexConnecting: false,
      codexNotice: null,
      testConnection: vi.fn(),
      handleConnect: vi.fn(),
      pendingDisconnect: { providerId: 'openai', name: 'openai' },
      requestDisconnect,
      handleDisconnectConfirmed: vi.fn(),
      setPendingDisconnect: vi.fn(),
      handleCodexStart: vi.fn(),
      setSaveMessages: vi.fn(),
      setCodexNotice: vi.fn(),
    } as any);

    renderSettingsPage();
    const disconnectButtons = screen.getAllByText('Disconnect');
    fireEvent.click(disconnectButtons[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Disconnect provider')).toBeInTheDocument();
    expect(requestDisconnect).toHaveBeenCalledWith('openai');
  });
});
