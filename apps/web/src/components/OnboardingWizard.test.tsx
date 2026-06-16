import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingWizard } from './OnboardingWizard';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const POPULAR_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    npm: '@ai-sdk/openai',
    doc: '',
    env: [],
    modelCount: 12,
    popular: true,
    models: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    npm: '@ai-sdk/anthropic',
    doc: '',
    env: [],
    modelCount: 5,
    popular: true,
    models: [],
  },
  {
    id: 'google',
    name: 'Google',
    npm: '@ai-sdk/google',
    doc: '',
    env: [],
    modelCount: 4,
    popular: true,
    models: [],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    npm: '@ai-sdk/openai-compatible',
    doc: '',
    env: [],
    modelCount: 2,
    popular: true,
    models: [],
  },
];

const SAMPLE_MODELS = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    description: 'text',
    contextWindow: 64000,
    capabilities: ['text'],
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    description: 'reasoning',
    contextWindow: 64000,
    capabilities: ['text', 'reasoning'],
  },
];

const mockUseProviders = vi.hoisted(() =>
  vi.fn(() => ({
    providers: POPULAR_PROVIDERS,
    popularProviders: POPULAR_PROVIDERS,
    otherProviders: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }))
);

const mockHandleConnect = vi.hoisted(() => vi.fn());
const mockHandleCodexStart = vi.hoisted(() => vi.fn());
const mockTestConnection = vi.hoisted(() => vi.fn());
const mockUseSettings = vi.hoisted(() =>
  vi.fn(() => ({
    userProviders: [],
    userProvidersLoading: false,
    userProviderMap: new Map(),
    saveMessages: {},
    saving: {},
    testing: {},
    codexConnecting: false,
    codexNotice: null,
    pendingDisconnect: null,
    fetchUserProviders: vi.fn(),
    testConnection: mockTestConnection,
    handleConnect: mockHandleConnect,
    requestDisconnect: vi.fn(),
    handleDisconnectConfirmed: vi.fn(),
    setPendingDisconnect: vi.fn(),
    handleCodexStart: mockHandleCodexStart,
    setSaveMessages: vi.fn(),
    setCodexNotice: vi.fn(),
  }))
);

const mockUseModels = vi.hoisted(() =>
  vi.fn(() => ({
    models: SAMPLE_MODELS,
    loading: false,
    error: null,
    refetch: vi.fn(),
    searchModels: vi.fn(),
  }))
);

vi.mock('../hooks/useProviders', () => ({ useProviders: mockUseProviders }));
vi.mock('../hooks/useSettings', () => ({ useSettings: mockUseSettings }));
vi.mock('../hooks/useModels', () => ({ useModels: mockUseModels }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderWizard(opts: { open?: boolean; onCompleted?: ReturnType<typeof vi.fn> } = {}) {
  const onClose = vi.fn();
  const onCompleted = opts.onCompleted ?? vi.fn();
  const result = render(
    <OnboardingWizard open={opts.open ?? true} onClose={onClose} onCompleted={onCompleted} />
  );
  return { ...result, onClose, onCompleted };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OnboardingWizard', () => {
  beforeEach(() => {
    mockUseProviders.mockClear();
    mockUseSettings.mockClear();
    mockUseModels.mockClear();
    mockHandleConnect.mockReset();
    mockHandleCodexStart.mockReset();
    mockTestConnection.mockReset();
    mockHandleConnect.mockResolvedValue(undefined);
    mockHandleCodexStart.mockResolvedValue(undefined);
    mockTestConnection.mockResolvedValue({ success: true });
    localStorage.setItem('token', 'test-token');
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // ── Render gating ───────────────────────────────────────────────────────

  it('renders nothing when open=false', () => {
    renderWizard({ open: false });
    expect(screen.queryByTestId('onboarding-wizard')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the stepper with 4 step indicators when open=true', () => {
    renderWizard();
    expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('step-indicator-1')).toBeInTheDocument();
    expect(screen.getByTestId('step-indicator-2')).toBeInTheDocument();
    expect(screen.getByTestId('step-indicator-3')).toBeInTheDocument();
    expect(screen.getByTestId('step-indicator-4')).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  it('starts on step 1 by default (Choose your first provider)', () => {
    renderWizard();
    expect(screen.getByText(/choose your first provider/i)).toBeInTheDocument();
  });

  it('backdrop click calls onClose (without completing)', () => {
    const { onClose } = renderWizard();
    fireEvent.click(screen.getByTestId('onboarding-wizard'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── STEP 1: Provider picker ─────────────────────────────────────────────

  it('step 1 lists the popular providers as cards', () => {
    renderWizard();
    expect(screen.getByTestId('provider-card-openai')).toBeInTheDocument();
    expect(screen.getByTestId('provider-card-anthropic')).toBeInTheDocument();
    expect(screen.getByTestId('provider-card-google')).toBeInTheDocument();
    expect(screen.getByTestId('provider-card-deepseek')).toBeInTheDocument();
  });

  it('step 1 shows an OAuth badge for the openai card', () => {
    renderWizard();
    const openaiCard = screen.getByTestId('provider-card-openai');
    expect(openaiCard.textContent).toMatch(/oauth/i);
  });

  it('step 1 auto-selects the first popular provider', () => {
    renderWizard();
    const openai = screen.getByTestId('provider-card-openai');
    expect(openai.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a card selects it (aria-pressed=true)', () => {
    renderWizard();
    const deepseek = screen.getByTestId('provider-card-deepseek');
    fireEvent.click(deepseek);
    expect(deepseek.getAttribute('aria-pressed')).toBe('true');
    const openai = screen.getByTestId('provider-card-openai');
    expect(openai.getAttribute('aria-pressed')).toBe('false');
  });

  it('Siguiente advances to step 2 when a provider is selected', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(screen.getByText(/connect your account/i)).toBeInTheDocument());
  });

  // ── STEP 2: Auth — API key branch ──────────────────────────────────────

  it('step 2 shows the API key input for non-OAuth providers', async () => {
    renderWizard();
    // Switch to deepseek
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-2-body'));
    expect(screen.getByTestId('api-key-input')).toBeInTheDocument();
  });

  it('step 2 shows the OAuth branch for openai', async () => {
    renderWizard();
    // openai is auto-selected
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-2-body'));
    expect(screen.getByTestId('wizard-oauth-branch')).toBeInTheDocument();
    expect(screen.queryByTestId('api-key-input')).toBeNull();
    expect(screen.getByTestId('wizard-codex-button')).toBeInTheDocument();
  });

  it('API key input is initially empty on step 2', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('Siguiente is disabled in step 2 when API key is empty (non-OAuth)', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-2-body'));
    const next = screen.getByTestId('wizard-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('Siguiente enables after typing an API key', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-test-1234' } });
    await waitFor(() => expect(input.value).toBe('sk-test-1234'));
    const next = screen.getByTestId('wizard-next') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
  });

  it('clicking Siguiente on step 2 with a key advances to step 3', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-real' } });
    await waitFor(() => expect(input.value).toBe('sk-real'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(screen.getByText(/verify the connection/i)).toBeInTheDocument());
  });

  it('clicking Conectar con ChatGPT Plus calls handleCodexStart', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-codex-button'));
    fireEvent.click(screen.getByTestId('wizard-codex-button'));
    await waitFor(() => expect(mockHandleCodexStart).toHaveBeenCalledTimes(1));
  });

  it('Avanzado toggle expands baseURL and headers inputs', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-2-body'));
    expect(screen.queryByTestId('advanced-baseurl')).toBeNull();
    fireEvent.click(screen.getByTestId('toggle-advanced'));
    expect(screen.getByTestId('advanced-baseurl')).toBeInTheDocument();
    expect(screen.getByTestId('advanced-headers')).toBeInTheDocument();
  });

  it('Atrás goes back to step 1 with the provider still selected', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-step-2-body'));
    fireEvent.click(screen.getByTestId('wizard-back'));
    await waitFor(() =>
      expect(screen.getByText(/choose your first provider/i)).toBeInTheDocument()
    );
    const deepseek = screen.getByTestId('provider-card-deepseek');
    expect(deepseek.getAttribute('aria-pressed')).toBe('true');
  });

  // ── STEP 3: Validate ────────────────────────────────────────────────────

  it('step 3 shows the Verificar conexión button by default', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ok' } });
    await waitFor(() => expect(input.value).toBe('sk-ok'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-validate-button'));
    expect(screen.getByTestId('wizard-validate-button')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-skip-validation')).toBeInTheDocument();
  });

  it('clicking Verificar calls testConnection with provider and key', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-check' } });
    await waitFor(() => expect(input.value).toBe('sk-check'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-validate-button'));
    fireEvent.click(screen.getByTestId('wizard-validate-button'));
    await waitFor(() => expect(mockTestConnection).toHaveBeenCalledWith('deepseek', 'sk-check'));
  });

  it('successful validation shows success message and enables Siguiente', async () => {
    mockTestConnection.mockResolvedValueOnce({ success: true });
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ok' } });
    await waitFor(() => expect(input.value).toBe('sk-ok'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-validate-button'));
    fireEvent.click(screen.getByTestId('wizard-validate-button'));
    await waitFor(() => screen.getByTestId('wizard-validation-success'));
    const next = screen.getByTestId('wizard-next') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
  });

  it('failed validation shows error with retry and skip options', async () => {
    mockTestConnection.mockRejectedValueOnce(new Error('Invalid API key'));
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-bad' } });
    await waitFor(() => expect(input.value).toBe('sk-bad'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-validate-button'));
    fireEvent.click(screen.getByTestId('wizard-validate-button'));
    await waitFor(() => screen.getByTestId('wizard-validation-error'));
    expect(screen.getByTestId('wizard-validation-error')).toHaveTextContent('Invalid API key');
    expect(screen.getByTestId('wizard-retry-validation')).toBeInTheDocument();
  });

  it('clicking Saltar (then Siguiente) advances to step 4 without successful validation', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-skip' } });
    await waitFor(() => expect(input.value).toBe('sk-skip'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));
    // After Saltar, the Siguiente button is enabled (validationResult === "success").
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(screen.getByText(/choose your default model/i)).toBeInTheDocument());
  });

  // ── STEP 4: Default model ───────────────────────────────────────────────

  it('step 4 auto-selects the first model of the connected provider', async () => {
    renderWizard();
    // Walk through steps quickly with skip validation
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ok' } });
    await waitFor(() => expect(input.value).toBe('sk-ok'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-model-select'));
    const select = screen.getByTestId('wizard-model-select') as HTMLSelectElement;
    expect(select.value).toBe('deepseek-chat');
  });

  it('step 4 shows the empty state when no models for the provider', async () => {
    // Override useModels to return empty. Use mockReturnValue (not once)
    // because useModels is called on every render of the wizard; the
    // once-variant would be consumed by an earlier render.
    mockUseModels.mockReturnValue({
      models: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
      searchModels: vi.fn(),
    });
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ok' } });
    await waitFor(() => expect(input.value).toBe('sk-ok'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-no-models'));
    const finish = screen.getByTestId('wizard-finish') as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
  });

  it('clicking Empezar a chatear calls onCompleted and onClose', async () => {
    const onCompleted = vi.fn();
    renderWizard({ onCompleted });
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-final' } });
    await waitFor(() => expect(input.value).toBe('sk-final'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-model-select'));
    fireEvent.click(screen.getByTestId('wizard-finish'));
    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledWith('deepseek', 'deepseek-chat');
    });
  });

  it('Empezar a chatear calls handleConnect (non-OAuth path)', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-final' } });
    await waitFor(() => expect(input.value).toBe('sk-final'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-model-select'));
    fireEvent.click(screen.getByTestId('wizard-finish'));
    await waitFor(() => expect(mockHandleConnect).toHaveBeenCalledTimes(1));
    expect(mockHandleConnect).toHaveBeenCalledWith('deepseek', 'sk-final', undefined);
  });
});

// ─── Wizard step 3 → step 4 transition connects the provider ──────────────
// (2026-06-14 fix: previously handleConnect was called from
//  `handleFinish` in step 4, but step 4's model list comes from
//  useModels — which is empty before the provider is connected.
//  The fix: connect at the step 3 → 4 transition so the model list
//  is populated when step 4 mounts.)

describe('OnboardingWizard — connect on step 3 → 4 transition', () => {
  it('step 3 Siguiente calls handleConnect with the typed API key', async () => {
    renderWizard();
    // Walk to step 3 quickly
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-transition' } });
    await waitFor(() => expect(input.value).toBe('sk-transition'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));

    // The moment we click Siguiente on step 3, handleConnect is called.
    mockHandleConnect.mockClear();
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(mockHandleConnect).toHaveBeenCalledTimes(1));
    expect(mockHandleConnect).toHaveBeenCalledWith('deepseek', 'sk-transition', undefined);
  });

  it('step 3 Siguiente advances to step 4 after handleConnect resolves', async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ok' } });
    await waitFor(() => expect(input.value).toBe('sk-ok'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-model-select'));
  });

  it("step 3 Siguiente shows 'Conectando…' while handleConnect is in-flight", async () => {
    // Make handleConnect a never-resolving promise so we can check
    // the intermediate loading state.
    mockHandleConnect.mockImplementationOnce(() => new Promise<never>(() => {}));
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-loading' } });
    await waitFor(() => expect(input.value).toBe('sk-loading'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    // While in-flight, the button text changes to "Connecting…"
    await waitFor(() => expect(screen.getByTestId('wizard-next')).toHaveTextContent('Connecting…'));
  });

  it('step 3 Siguiente stays on step 3 and shows error when handleConnect fails', async () => {
    mockHandleConnect.mockRejectedValueOnce(new Error('API key rejected'));
    renderWizard();
    fireEvent.click(screen.getByTestId('provider-card-deepseek'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const input = (await screen.findByTestId('api-key-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-bad' } });
    await waitFor(() => expect(input.value).toBe('sk-bad'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-skip-validation'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    // The step 3 still has the verify UI; submit error appears.
    await waitFor(() => expect(screen.getByText(/API key rejected/i)).toBeInTheDocument());
    // Did NOT advance to step 4.
    expect(screen.queryByTestId('wizard-model-select')).toBeNull();
  });
});
