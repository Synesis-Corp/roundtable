import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OnboardingConnectModal } from "./OnboardingConnectModal";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUseProviders = vi.hoisted(() =>
  vi.fn(() => ({
    providers: [],
    popularProviders: [
      { id: "openai", name: "OpenAI", npm: "@ai-sdk/openai", doc: "", env: [], modelCount: 10, popular: true, models: [] },
      { id: "anthropic", name: "Anthropic", npm: "@ai-sdk/anthropic", doc: "", env: [], modelCount: 5, popular: true, models: [] },
      { id: "google", name: "Google", npm: "@ai-sdk/google", doc: "", env: [], modelCount: 4, popular: true, models: [] },
      { id: "deepseek", name: "DeepSeek", npm: "@ai-sdk/openai-compatible", doc: "", env: [], modelCount: 2, popular: true, models: [] },
    ],
    otherProviders: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
);

const mockHandleConnect = vi.hoisted(() => vi.fn());
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
    testConnection: vi.fn(),
    handleConnect: mockHandleConnect,
    requestDisconnect: vi.fn(),
    handleDisconnectConfirmed: vi.fn(),
    setPendingDisconnect: vi.fn(),
    handleCodexStart: vi.fn(),
    setSaveMessages: vi.fn(),
    setCodexNotice: vi.fn(),
  })),
);

vi.mock("../hooks/useProviders", () => ({ useProviders: mockUseProviders }));
vi.mock("../hooks/useSettings", () => ({ useSettings: mockUseSettings }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderModal(open = true) {
  const onClose = vi.fn();
  const result = render(<OnboardingConnectModal open={open} onClose={onClose} />);
  return { ...result, onClose };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("OnboardingConnectModal", () => {
  beforeEach(() => {
    mockUseProviders.mockClear();
    mockUseSettings.mockClear();
    mockHandleConnect.mockReset();
    mockHandleConnect.mockResolvedValue(undefined);
    localStorage.setItem("token", "test-token");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // ── Render gating ────────────────────────────────────────────────────────

  it("renders nothing when open=false", () => {
    renderModal(false);
    expect(screen.queryByTestId("onboarding-connect-modal")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog with header and action buttons when open=true", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: /conectar proveedor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-connect-submit")).toBeInTheDocument();
  });

  // ── Backdrop and cancel ──────────────────────────────────────────────────

  it("calls onClose when the user clicks the backdrop", () => {
    const { onClose } = renderModal();
    // The dialog itself stops propagation; clicking on the outer wrapper
    // (data-testid) closes.
    fireEvent.click(screen.getByTestId("onboarding-connect-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the user clicks the Cancelar button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Provider picker ──────────────────────────────────────────────────────

  it("lists the popular providers as selectable chips", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "OpenAI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anthropic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DeepSeek" })).toBeInTheDocument();
  });

  it("selects the first popular provider by default on open", () => {
    renderModal();
    const openai = screen.getByRole("button", { name: "OpenAI" });
    const anthropic = screen.getByRole("button", { name: "Anthropic" });
    expect(openai.getAttribute("aria-pressed")).toBe("true");
    expect(anthropic.getAttribute("aria-pressed")).toBe("false");
  });

  it("selecting a different provider updates aria-pressed", () => {
    renderModal();
    const anthropic = screen.getByRole("button", { name: "Anthropic" });
    fireEvent.click(anthropic);
    expect(anthropic.getAttribute("aria-pressed")).toBe("true");
    const openai = screen.getByRole("button", { name: "OpenAI" });
    expect(openai.getAttribute("aria-pressed")).toBe("false");
  });

  // ── API key input ────────────────────────────────────────────────────────

  it("API key input starts empty on each open", () => {
    renderModal();
    const input = screen.getByTestId("api-key-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.type).toBe("password");
  });

  it("toggles the API key input type when clicking the show/hide button", async () => {
    renderModal();
    const input = screen.getByTestId("api-key-input") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: /mostrar api key/i }));
    await waitFor(() => expect(input.type).toBe("text"));
    fireEvent.click(screen.getByRole("button", { name: /ocultar api key/i }));
    await waitFor(() => expect(input.type).toBe("password"));
  });

  it("typing in the input updates the state", async () => {
    renderModal();
    const input = screen.getByTestId("api-key-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-test-1234" } });
    await waitFor(() => expect(input.value).toBe("sk-test-1234"));
  });

  // ── Submit ───────────────────────────────────────────────────────────────

  it("submit with empty API key shows inline error and does NOT call handleConnect", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("onboarding-connect-submit"));
    expect(screen.getByTestId("onboarding-connect-error")).toBeInTheDocument();
    expect(mockHandleConnect).not.toHaveBeenCalled();
  });

  it("submit calls handleConnect with providerId and trimmed apiKey", async () => {
    renderModal();
    // Switch to DeepSeek
    fireEvent.click(screen.getByRole("button", { name: "DeepSeek" }));
    const input = screen.getByTestId("api-key-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  sk-real-key  " } });
    fireEvent.click(screen.getByTestId("onboarding-connect-submit"));
    await waitFor(() => expect(mockHandleConnect).toHaveBeenCalledTimes(1));
    expect(mockHandleConnect).toHaveBeenCalledWith("deepseek", "sk-real-key");
  });

  it("successful submit calls onClose", async () => {
    const { onClose } = renderModal();
    const input = screen.getByTestId("api-key-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-ok" } });
    fireEvent.click(screen.getByTestId("onboarding-connect-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("failed submit shows the error message inline and keeps modal open", async () => {
    mockHandleConnect.mockRejectedValueOnce(new Error("Invalid API key"));
    const { onClose } = renderModal();
    const input = screen.getByTestId("api-key-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-bad" } });
    fireEvent.click(screen.getByTestId("onboarding-connect-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-connect-error")).toHaveTextContent("Invalid API key")
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("changing provider clears the error", async () => {
    mockHandleConnect.mockRejectedValueOnce(new Error("Invalid API key"));
    renderModal();
    const input = screen.getByTestId("api-key-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-bad" } });
    fireEvent.click(screen.getByTestId("onboarding-connect-submit"));
    await waitFor(() => screen.getByTestId("onboarding-connect-error"));
    // Switch provider
    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }));
    expect(screen.queryByTestId("onboarding-connect-error")).toBeNull();
  });

  // ── Reset on reopen ──────────────────────────────────────────────────────

  it("reopening the modal after a failed submit clears the state", async () => {
    mockHandleConnect.mockRejectedValueOnce(new Error("nope"));
    const onClose = vi.fn();
    const { rerender } = render(<OnboardingConnectModal open={true} onClose={onClose} />);
    const input = screen.getByTestId("api-key-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-bad" } });
    await waitFor(() => expect(input.value).toBe("sk-bad"));
    fireEvent.click(screen.getByTestId("onboarding-connect-submit"));
    await waitFor(() => screen.getByTestId("onboarding-connect-error"));

    // Close and reopen
    rerender(<OnboardingConnectModal open={false} onClose={onClose} />);
    expect(screen.queryByTestId("onboarding-connect-modal")).toBeNull();

    rerender(<OnboardingConnectModal open={true} onClose={onClose} />);
    const input2 = screen.getByTestId("api-key-input") as HTMLInputElement;
    await waitFor(() => expect(input2.value).toBe(""));
    expect(screen.queryByTestId("onboarding-connect-error")).toBeNull();
    // First popular should be selected again.
    expect(screen.getByRole("button", { name: "OpenAI" }).getAttribute("aria-pressed")).toBe("true");
  });
});
