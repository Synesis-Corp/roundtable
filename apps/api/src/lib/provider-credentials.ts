import { decrypt, encrypt } from "@chat/crypto";
import {
  CODEX_API_BASE_URL,
  createCodexCredential,
  isCodexCredential,
  refreshCodexAccessToken,
  type CodexCredential,
} from "./codex-auth";

interface ProviderConfigLike {
  id: string;
  providerId: string;
  encryptedApiKey: string;
  options?: string | null;
}

interface ProviderConfigStore {
  providerConfig: {
    update: (args: {
      where: { id: string };
      data: { encryptedApiKey: string; options?: string };
    }) => PromiseLike<unknown>;
  };
}

export interface RuntimeProviderCredential {
  apiKey: string;
  options?: Record<string, unknown>;
}

function parseOptions(options?: string | null): Record<string, unknown> {
  if (!options) return {};
  try {
    const parsed = JSON.parse(options);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function refreshIfNeeded(
  store: ProviderConfigStore | undefined,
  config: ProviderConfigLike,
  credential: CodexCredential
): Promise<CodexCredential> {
  const refreshAt = credential.expires - 60_000;
  if (Date.now() < refreshAt) return credential;

  const refreshed = createCodexCredential(await refreshCodexAccessToken(credential.refresh));
  const next = {
    ...refreshed,
    refresh: refreshed.refresh || credential.refresh,
    accountId: refreshed.accountId || credential.accountId,
  };

  await store?.providerConfig.update({
    where: { id: config.id },
    data: {
      encryptedApiKey: encrypt(JSON.stringify(next)),
      options: JSON.stringify({
        ...parseOptions(config.options),
        authType: "codex",
        baseURL: CODEX_API_BASE_URL,
      }),
    },
  });

  return next;
}

export async function resolveProviderCredential(
  config: ProviderConfigLike,
  store?: ProviderConfigStore
): Promise<RuntimeProviderCredential> {
  let decrypted: string;
  try {
    decrypted = decrypt(config.encryptedApiKey);
  } catch {
    throw new Error(
      `Stored credentials for provider "${config.providerId}" can no longer be decrypted. Reconnect this provider in Settings.`
    );
  }
  const options = parseOptions(config.options);

  try {
    const parsed = JSON.parse(decrypted);
    if (isCodexCredential(parsed)) {
      const credential = await refreshIfNeeded(store, config, parsed);
      return {
        apiKey: credential.access,
        options: {
          ...options,
          authType: "codex",
          baseURL: CODEX_API_BASE_URL,
          headers: {
            originator: "roundtable",
            "User-Agent": "Roundtable/1.0",
            ...(credential.accountId ? { "ChatGPT-Account-Id": credential.accountId } : {}),
          },
        },
      };
    }
  } catch {
    // Plain API keys are not JSON; fall through to the normal provider path.
  }

  return {
    apiKey: decrypted,
    options: Object.keys(options).length > 0 ? options : undefined,
  };
}
