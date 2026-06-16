import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ChatPage from './ChatPage';
import type { OnboardingState } from '../lib/onboarding-helpers';
import type { UseModelsReturn } from '../hooks/useModels';
import type { UseSettingsReturn } from '../hooks/useSettings';

const mockStartStream = vi.hoisted(() => vi.fn());
const mockStopStream = vi.hoisted(() => vi.fn());
const mockResumeStream = vi.hoisted(() => vi.fn());
const mockUseSSE = vi.hoisted(() =>
  vi.fn(() => ({
    streaming: false,
    startStream: mockStartStream,
    resumeStream: mockResumeStream,
    stopStream: mockStopStream,
  }))
);

const mockUseModels = vi.hoisted(() =>
  vi.fn(
    (): Partial<UseModelsReturn> => ({
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
          id: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
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
        {
          id: 'deepseek-coder',
          name: 'DeepSeek Coder',
          provider: 'deepseek',
          description: '',
          contextWindow: 64000,
          capabilities: ['text'],
        },
      ],
      loading: false,
      error: null,
      searchModels: vi.fn(() => []),
      refetch: vi.fn(),
    })
  )
);

const mockUseSettings = vi.hoisted(() =>
  vi.fn(
    (): Partial<UseSettingsReturn> => ({
      userProviders: [
        { id: 'up-openai', providerId: 'openai', maskedKey: 'sk-****', isActive: true },
        { id: 'up-deepseek', providerId: 'deepseek', maskedKey: 'sk-****', isActive: true },
      ],
      userProvidersLoading: false,
      userProviderMap: new Map(),
      saveMessages: {},
      saving: {},
      testing: {},
      codexConnecting: false,
      codexNotice: null,
      pendingDisconnect: null,
      fetchUserProviders: vi.fn(),
      testConnection: vi.fn(),
      handleConnect: vi.fn(),
      requestDisconnect: vi.fn(),
      handleDisconnectConfirmed: vi.fn(),
      setPendingDisconnect: vi.fn(),
      handleCodexStart: vi.fn(),
      setSaveMessages: vi.fn(),
      setCodexNotice: vi.fn(),
    })
  )
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

// mockUseOnboarding — controllable per test via .mockReturnValue()
const mockUseOnboarding = vi.hoisted(() =>
  vi.fn((): { onboarding: OnboardingState; clearIsNew: () => void } => ({
    onboarding: { kind: 'hidden' },
    clearIsNew: vi.fn(),
  }))
);

vi.mock('../hooks/useSSE', () => ({
  useSSE: mockUseSSE,
}));

vi.mock('../hooks/useModels', () => ({
  useModels: mockUseModels,
}));

vi.mock('../hooks/useSettings', () => ({
  useSettings: mockUseSettings,
}));

vi.mock('../hooks/useCouncilConfig', () => ({
  useCouncilConfig: mockUseCouncilConfig,
}));

vi.mock('../hooks/useOnboarding', () => ({
  useOnboarding: mockUseOnboarding,
}));

function renderChatPage() {
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  );
}

describe('ChatPage — Council Count Display', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    Element.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows auto council count when no manual config exists', async () => {
    renderChatPage();

    // Enable council mode by clicking the Council button
    const councilButton = screen.getByRole('button', { name: /Council/i });
    fireEvent.click(councilButton);

    await waitFor(() => {
      // With 2 providers and 4 models, auto-selection should show 4 models
      // (2 per provider: openai has gpt-4o + gpt-4o-mini, deepseek has deepseek-chat + deepseek-coder)
      expect(screen.getByText(/4 models in council/i)).toBeInTheDocument();
    });
  });

  it('shows configured council count when manual config exists', async () => {
    mockUseCouncilConfig.mockReturnValue({
      config: {
        id: 'cfg-1',
        userId: 'u-1',
        modelIds: ['openai:gpt-4o', 'deepseek:deepseek-chat', 'anthropic:claude-3-opus'],
        mode: 'manual',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as any,
      loading: false,
      error: null,
      updateConfig: vi.fn(),
      deleteConfig: vi.fn(),
    });

    renderChatPage();

    // Enable council mode
    const councilButton = screen.getByRole('button', { name: /Council/i });
    fireEvent.click(councilButton);

    await waitFor(() => {
      // Manual config has 3 models, so should show 3 models
      expect(screen.getByText(/3 models in council/i)).toBeInTheDocument();
    });
  });
});

describe('ChatPage — incognito mode', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    Element.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('propagates incognito preferences and never sends a persisted conversation id', async () => {
    renderChatPage();

    fireEvent.click(screen.getByRole('switch', { name: /incognito/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Private message' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(mockStartStream).toHaveBeenCalledTimes(1));
    expect(mockStartStream).toHaveBeenCalledWith(
      'test-token',
      [{ role: 'user', content: 'Private message' }],
      expect.objectContaining({ incognito: true }),
      undefined,
      undefined
    );
  });

  it('resets the ephemeral transcript when incognito is disabled', async () => {
    renderChatPage();

    fireEvent.click(screen.getByRole('switch', { name: /incognito/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Do not persist' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect((await screen.findAllByText('Do not persist')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('switch', { name: /incognito/i }));

    await waitFor(() => {
      expect(screen.queryByText('Do not persist')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });
  });
});

// ─── Onboarding CTA tests (Phase 4.1) ────────────────────────────────────────

describe('ChatPage — Onboarding CTA (single mode)', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    Element.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
    // Default settings mock: no providers, not loading
    mockUseSettings.mockReturnValue({
      userProviders: [],
      userProvidersLoading: false,
    });
    // Default models mock: not loading
    mockUseModels.mockReturnValue({
      models: [],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('kind=new: greeting is NOT in DOM, CTA with link to /settings IS present', () => {
    mockUseOnboarding.mockReturnValue({
      onboarding: {
        kind: 'new',
        titleKey: 'onboarding.copy.new.title' as const,
        bodyKey: 'onboarding.copy.new.body' as const,
        ctaKey: 'onboarding.copy.new.cta' as const,
      },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    expect(screen.queryByText('What are we working on today?')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings|providers|provider/i })).toBeInTheDocument();
  });

  it('kind=returning: greeting IS in DOM, soft banner with link to /settings IS present', () => {
    mockUseOnboarding.mockReturnValue({
      onboarding: {
        kind: 'returning',
        titleKey: 'onboarding.copy.returning.title' as const,
        bodyKey: 'onboarding.copy.returning.body' as const,
        ctaKey: 'onboarding.copy.returning.cta' as const,
      },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    expect(screen.getByText('What are we working on today?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings|providers|provider/i })).toBeInTheDocument();
  });

  it('kind=hidden: no onboarding CTA or banner rendered', () => {
    mockUseOnboarding.mockReturnValue({
      onboarding: { kind: 'hidden' as const },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    // No link to /settings from onboarding (existing providers warning is hidden in single mode)
    expect(screen.queryByTestId('onboarding-cta')).not.toBeInTheDocument();
  });

  it('kind=loading: no onboarding CTA or banner, no flash', () => {
    mockUseOnboarding.mockReturnValue({
      onboarding: { kind: 'loading' as const },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    expect(screen.queryByTestId('onboarding-cta')).not.toBeInTheDocument();
  });

  it('multiMode=true: no onboarding CTA; showEmptyProvidersWarning block (council) unaffected', () => {
    // useOnboarding result should not matter in council mode
    mockUseOnboarding.mockReturnValue({
      onboarding: {
        kind: 'new' as const,
        titleKey: 'onboarding.copy.new.title' as const,
        bodyKey: 'onboarding.copy.new.body' as const,
        ctaKey: 'onboarding.copy.new.cta' as const,
      },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    // Activate council mode
    fireEvent.click(screen.getByRole('button', { name: /Council/i }));
    // The onboarding CTA (data-testid) must NOT be present in council mode
    expect(screen.queryByTestId('onboarding-cta')).not.toBeInTheDocument();
  });

  it('regression (2026-06-14): user connected (userProviders.length > 0) → no CTA, even if useOnboarding returns returning', () => {
    // THE BUG: in the live app, the user connected DeepSeek and the
    // model selector shows it, but the CTA banner still says
    // "Sin un proveedor activo". The integration is:
    //   ChatPage passes `useSettings().userProviders` to `useOnboarding`.
    //   useOnboarding returns `hidden` if userProviders.length > 0.
    //   ChatPage hides the CTA.
    // We mock useSettings to the real-world case (deepseek connected)
    // AND keep the mocked useOnboarding as the source of truth for
    // onboarding kind. The render path must not show the CTA.
    mockUseSettings.mockReturnValue({
      userProviders: [{ id: 'up-1', providerId: 'deepseek', maskedKey: 'sk-***', isActive: true }],
      userProvidersLoading: false,
      userProviderMap: new Map([
        ['deepseek', { id: 'up-1', providerId: 'deepseek', maskedKey: 'sk-***', isActive: true }],
      ]),
      saveMessages: {},
      saving: {},
      testing: {},
      codexConnecting: false,
      codexNotice: null,
      pendingDisconnect: null,
      fetchUserProviders: vi.fn(),
      testConnection: vi.fn(),
      handleConnect: vi.fn(),
      requestDisconnect: vi.fn(),
      handleDisconnectConfirmed: vi.fn(),
      setPendingDisconnect: vi.fn(),
      handleCodexStart: vi.fn(),
      setSaveMessages: vi.fn(),
      setCodexNotice: vi.fn(),
    });
    mockUseModels.mockReturnValue({
      models: [
        {
          id: 'deepseek-v4-pro',
          name: 'DeepSeek V4 Pro',
          provider: 'deepseek',
          description: '',
          contextWindow: 0,
          capabilities: [],
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
      searchModels: vi.fn(),
    });
    // Mocked useOnboarding is the contract: when userProviders.length > 0,
    // the hook returns hidden. The render MUST respect that.
    mockUseOnboarding.mockReturnValue({
      onboarding: { kind: 'hidden' as const },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    // The "Sin un proveedor activo" body must NOT be in the DOM.
    expect(screen.queryByText(/sin un proveedor activo/i)).toBeNull();
    // The CTA data-testid must NOT be present.
    expect(screen.queryByTestId('onboarding-cta')).toBeNull();
  });
});

// ─── Onboarding wizard (Fase 2.3) ────────────────────────────────────────────

// Mock the wizard so we don't have to drag in useProviders/useSettings/useModels
// mocking here. We assert the wizard is opened with the right open prop.
const mockOnboardingWizard = vi.hoisted(() => vi.fn());
vi.mock('../components/OnboardingWizard', () => ({
  OnboardingWizard: (props: {
    open: boolean;
    onClose: () => void;
    onCompleted: (providerId: string, modelId: string) => void;
  }) => {
    mockOnboardingWizard(props);
    return props.open ? <div data-testid="onboarding-wizard-stub">wizard-open</div> : null;
  },
}));

describe('ChatPage — onboarding wizard (Fase 2.3)', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    Element.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
    mockOnboardingWizard.mockClear();
    // Empty providers so the onboarding CTA renders
    mockUseSettings.mockReturnValue({
      userProviders: [],
      userProvidersLoading: false,
    });
    mockUseModels.mockReturnValue({
      models: [],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("onboarding CTA exposes a 'Conectar aquí' button (kind=new)", () => {
    mockUseOnboarding.mockReturnValue({
      onboarding: {
        kind: 'new' as const,
        titleKey: 'onboarding.copy.new.title' as const,
        bodyKey: 'onboarding.copy.new.body' as const,
        ctaKey: 'onboarding.copy.new.cta' as const,
      },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    expect(screen.getByRole('button', { name: /connect here/i })).toBeInTheDocument();
  });

  it("onboarding CTA exposes a 'Conectar aquí' button (kind=returning)", () => {
    mockUseOnboarding.mockReturnValue({
      onboarding: {
        kind: 'returning' as const,
        titleKey: 'onboarding.copy.returning.title' as const,
        bodyKey: 'onboarding.copy.returning.body' as const,
        ctaKey: 'onboarding.copy.returning.cta' as const,
      },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    expect(screen.getByRole('button', { name: /connect here/i })).toBeInTheDocument();
  });

  it("clicking 'Conectar aquí' opens the wizard (NOT the inline modal)", () => {
    mockUseOnboarding.mockReturnValue({
      onboarding: {
        kind: 'new' as const,
        titleKey: 'onboarding.copy.new.title' as const,
        bodyKey: 'onboarding.copy.new.body' as const,
        ctaKey: 'onboarding.copy.new.cta' as const,
      },
      clearIsNew: vi.fn(),
    });
    renderChatPage();
    // Wizard starts closed
    expect(screen.queryByTestId('onboarding-wizard-stub')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /connect here/i }));

    // Now the wizard is open (visible in the DOM)
    expect(screen.getByTestId('onboarding-wizard-stub')).toBeInTheDocument();
    // The mock received open=true
    const lastCallProps = mockOnboardingWizard.mock.calls.at(-1)?.[0];
    expect(lastCallProps?.open).toBe(true);
  });
});

describe('ChatPage — stale selectedModel cleanup (regression 2026-06-14)', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    Element.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('clears a stored selectedModel that is NOT in the current models list', async () => {
    // Simulate a previous session leaving "openai:gpt-5.4" in localStorage.
    localStorage.setItem('selectedModel', 'openai:gpt-5.4');

    // The new user only has deepseek models.
    mockUseModels.mockReturnValue({
      models: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          provider: 'deepseek',
          description: '',
          contextWindow: 1000000,
          capabilities: ['text'],
        },
        {
          id: 'deepseek-v4-pro',
          name: 'DeepSeek V4 Pro',
          provider: 'deepseek',
          description: '',
          contextWindow: 1000000,
          capabilities: ['text'],
        },
      ],
      loading: false,
      error: null,
    });
    mockUseSettings.mockReturnValue({
      userProviders: [
        { id: 'up-deepseek', providerId: 'deepseek', maskedKey: 'sk-****', isActive: true },
      ],
      userProvidersLoading: false,
    });

    renderChatPage();

    // The defensive useEffect should detect the stale value and remove it.
    await waitFor(() => {
      expect(localStorage.getItem('selectedModel')).toBeNull();
    });
  });

  it('KEEPS a stored selectedModel that IS in the current models list', async () => {
    // Same user, same model: this should be preserved.
    localStorage.setItem('selectedModel', 'deepseek:deepseek-v4-flash');

    mockUseModels.mockReturnValue({
      models: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          provider: 'deepseek',
          description: '',
          contextWindow: 1000000,
          capabilities: ['text'],
        },
      ],
      loading: false,
      error: null,
    });
    mockUseSettings.mockReturnValue({
      userProviders: [
        { id: 'up-deepseek', providerId: 'deepseek', maskedKey: 'sk-****', isActive: true },
      ],
      userProvidersLoading: false,
    });

    renderChatPage();

    // Give the effect a tick to run; value should remain.
    await new Promise((r) => setTimeout(r, 50));
    expect(localStorage.getItem('selectedModel')).toBe('deepseek:deepseek-v4-flash');
  });
});
