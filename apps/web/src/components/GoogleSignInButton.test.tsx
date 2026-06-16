import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GoogleSignInButton from "./GoogleSignInButton";
import { IS_NEW_KEY } from "../lib/onboarding-helpers";

// ─── In-memory storage stub ───────────────────────────────────────────────────

const { storeRef, storageStub } = vi.hoisted(() => {
  let currentStore: Map<string, string> = new Map();

  const ref = {
    reset: () => { currentStore = new Map(); },
    get: (k: string): string | null => currentStore.get(k) ?? null,
    set: (k: string, v: string) => { currentStore.set(k, v); },
    remove: (k: string) => { currentStore.delete(k); },
  };

  const stub = {
    get: (k: string) => ref.get(k),
    set: (k: string, v: string) => ref.set(k, v),
    remove: (k: string) => ref.remove(k),
  };

  return { storeRef: ref, storageStub: stub };
});

vi.mock("../lib/storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/storage")>();
  return { ...original, storage: storageStub };
});

// ─── Mock navigate ────────────────────────────────────────────────────────────

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => mockNavigate };
});

// ─── Mock apiPost ─────────────────────────────────────────────────────────────

const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock("../lib/api-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/api-client")>();
  return { ...original, apiPost: mockApiPost };
});

// ─── Mock @react-oauth/google so we can trigger handleCredential directly ─────
// GoogleSignInButton renders <GoogleLogin onSuccess={...} />, but in tests we
// just need to call the internal handleCredential. We intercept via the mock.

let capturedOnSuccess: ((cred: { credential?: string }) => void) | null = null;

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: (props: { onSuccess: (cred: { credential?: string }) => void; onError: () => void }) => {
    capturedOnSuccess = props.onSuccess;
    return null;
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function triggerCredential(credential = "google-id-token") {
  capturedOnSuccess?.({ credential });
  // Wait a tick for the async handleCredential to run
  await new Promise((r) => setTimeout(r, 0));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GoogleSignInButton — onboarding flag", () => {
  beforeEach(() => {
    storeRef.reset();
    mockNavigate.mockReset();
    mockApiPost.mockReset();
    capturedOnSuccess = null;
    // Enable the button (needs a client ID env var)
    (import.meta.env as Record<string, string>).VITE_GOOGLE_CLIENT_ID = "test-client-id";
  });

  afterEach(() => {
    delete (import.meta.env as Record<string, string | undefined>).VITE_GOOGLE_CLIENT_ID;
    vi.restoreAllMocks();
  });

  it("sets IS_NEW_KEY='1' when backend returns created: true", async () => {
    mockApiPost.mockResolvedValueOnce({ token: "tok-google", created: true });

    render(
      <MemoryRouter>
        <GoogleSignInButton />
      </MemoryRouter>,
    );

    await triggerCredential();

    expect(storageStub.get("token")).toBe("tok-google");
    expect(storageStub.get(IS_NEW_KEY)).toBe("1");
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("does NOT set IS_NEW_KEY when backend returns created: false", async () => {
    mockApiPost.mockResolvedValueOnce({ token: "tok-google-existing", created: false });

    render(
      <MemoryRouter>
        <GoogleSignInButton />
      </MemoryRouter>,
    );

    await triggerCredential();

    expect(storageStub.get("token")).toBe("tok-google-existing");
    expect(storageStub.get(IS_NEW_KEY)).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
