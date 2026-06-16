import { Router } from 'express';
import { prisma } from '../lib/db';
import { encrypt, maskKey } from '@chat/crypto';
import { getAllModels } from '@chat/router';
import { getModelsDevCache, getModelsDevFetchError } from '@chat/providers';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { getProvider } from '../lib/provider-registry';
import { resolveProviderCredential } from '../lib/provider-credentials';
import { providerHealthCache } from '../lib/provider-health';
import { filterActiveModels, validateActiveModelIds } from '../lib/active-models';
import { ProviderOptionsSchema } from '@chat/sdk';
import { generateOAuthState, generatePKCE, buildCodexAuthorizeUrl } from '../lib/codex-auth';
import { ensureCodexOAuthServer, pendingCodexOAuth } from '../lib/codex-oauth-server';
import {
  initCapabilityRegistry,
  getAvailableProviders,
  getModelEffortSpec,
  extractTopModels,
  type ModelInfo,
} from '../services/model-registry';

const router = Router();

// ── Boot ───────────────────────────────────────────────────────────────────

export const capabilityRegistryReady = initCapabilityRegistry().catch((err) => {
  logger.error({ err }, 'providers: capability registry init failed at boot');
  // Don't re-throw: the server can still serve degraded (DB-cached capabilities).
});

// ── Routes: public ─────────────────────────────────────────────────────────

router.get('/available', async (_req, res) => {
  try {
    const fetchError = getModelsDevFetchError();
    if (fetchError && !getModelsDevCache()) {
      res.status(503).json({
        error: 'Provider list unavailable',
        message: fetchError,
      });
      return;
    }

    const providers = getAvailableProviders();
    res.json({ providers, total: providers.length });
  } catch (err) {
    logger.error({ err }, 'providers: failed to fetch available providers');
    res.status(500).json({ error: 'Failed to fetch available providers' });
  }
});

router.get('/models', async (_req, res) => {
  try {
    const models = getAllModels();
    res.json({ models });
  } catch (err) {
    logger.error({ err }, 'providers: failed to fetch models');
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// ── Routes: authenticated ──────────────────────────────────────────────────

router.get(
  '/models/:provider/:modelId/variants',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { provider, modelId } = req.params;
      const providerConfig = await prisma.providerConfig.findUnique({
        where: {
          userId_providerId: {
            userId: req.userId!,
            providerId: provider,
          },
        },
        select: { isActive: true },
      });

      if (!providerConfig?.isActive) {
        res.status(404).json({ spec: null });
        return;
      }

      const spec = getModelEffortSpec(provider, modelId);
      res.json({ spec });
    } catch (err) {
      req.log.error({ err }, 'providers: failed to fetch model variants');
      res.status(500).json({ error: 'Failed to fetch model variants' });
    }
  }
);

router.get('/connected', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const fetchError = getModelsDevFetchError();
    if (fetchError && !getModelsDevCache()) {
      res.status(503).json({
        error: 'Provider list unavailable',
        message: fetchError,
      });
      return;
    }

    const connectedProviders = await prisma.providerConfig.findMany({
      where: { userId: req.userId, isActive: true },
      select: { providerId: true },
    });

    const connectedProviderIds = new Set(connectedProviders.map((p) => p.providerId));

    const modelsDevCache = getModelsDevCache();
    const models: ModelInfo[] = [];
    for (const providerId of connectedProviderIds) {
      const provider = modelsDevCache?.get(providerId);
      if (provider) {
        const topModels = extractTopModels(provider, 10);
        for (const model of topModels) {
          models.push(model);
        }
      }
    }

    // #1 — honor the per-provider "active models" allow-list so hidden models
    // disappear from every selector in the UI that reads /connected.
    const activeConfigs = await prisma.activeModelsConfig.findMany({
      where: { userId: req.userId },
      select: { providerId: true, modelIds: true },
    });
    const activeByProvider = new Map(activeConfigs.map((c) => [c.providerId, c.modelIds]));

    res.json({ models: filterActiveModels(models, activeByProvider) });
  } catch (err) {
    req.log.error({ err }, 'providers: failed to fetch connected providers');
    res.status(500).json({ error: 'Failed to fetch connected providers' });
  }
});

// ── Active models (#1): per-provider allow-list of which models the UI shows ──

// The user's saved allow-lists, as a { providerId: modelIds[] } map. A provider
// absent from the map shows ALL its models (the default).
router.get('/active-models', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const configs = await prisma.activeModelsConfig.findMany({
      where: { userId: req.userId },
      select: { providerId: true, modelIds: true },
    });
    const active: Record<string, string[]> = {};
    for (const c of configs) active[c.providerId] = c.modelIds;
    res.json({ active });
  } catch (err) {
    req.log.error({ err }, 'providers: failed to fetch active models');
    res.status(500).json({ error: 'Failed to fetch active models' });
  }
});

// Everything the modal needs for one provider: all of its selectable models
// (the same top-N /connected would surface) plus the currently active ids.
// `activeIds: []` means "all shown" (no saved allow-list).
router.get('/active-models/:providerId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { providerId } = req.params;
    const connected = await prisma.providerConfig.findUnique({
      where: { userId_providerId: { userId: req.userId!, providerId } },
      select: { isActive: true },
    });
    if (!connected?.isActive) {
      res.status(404).json({ error: 'Provider not connected' });
      return;
    }

    const provider = getModelsDevCache()?.get(providerId);
    const models = provider ? extractTopModels(provider, 10) : [];

    const config = await prisma.activeModelsConfig.findUnique({
      where: { userId_providerId: { userId: req.userId!, providerId } },
      select: { modelIds: true },
    });

    res.json({ models, activeIds: config?.modelIds ?? [] });
  } catch (err) {
    req.log.error({ err }, 'providers: failed to fetch provider active models');
    res.status(500).json({ error: 'Failed to fetch provider active models' });
  }
});

// Set the allow-list for a provider. An empty list resets to "show all" by
// deleting the row, so the default path stays config-free.
router.put('/active-models/:providerId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { providerId } = req.params;
    const result = validateActiveModelIds(req.body?.modelIds);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    const userId = req.userId!;
    if (result.modelIds.length === 0) {
      await prisma.activeModelsConfig.deleteMany({ where: { userId, providerId } });
      res.json({ activeIds: [] });
      return;
    }

    await prisma.activeModelsConfig.upsert({
      where: { userId_providerId: { userId, providerId } },
      update: { modelIds: result.modelIds },
      create: { userId, providerId, modelIds: result.modelIds },
    });
    res.json({ activeIds: result.modelIds });
  } catch (err) {
    req.log.error({ err }, 'providers: failed to save provider active models');
    res.status(500).json({ error: 'Failed to save provider active models' });
  }
});

// Live health of every connected provider. Each probe runs a minimal chat
// round-trip (which costs tokens), so results are cached ~60s per provider:
// hitting this on every Settings-tab open never re-bills inside the window.
router.get('/health', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const connected = await prisma.providerConfig.findMany({
      where: { userId: req.userId, isActive: true },
      select: { providerId: true },
    });
    const providerIds = connected.map((p) => p.providerId);
    const health = await providerHealthCache.checkMany(req.userId!, providerIds);
    res.json({ health });
  } catch (err) {
    req.log.error({ err }, 'providers: failed to compute provider health');
    res.status(500).json({ error: 'Failed to compute provider health' });
  }
});

router.post('/openai/codex/start', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    await ensureCodexOAuthServer();

    const pkce = generatePKCE();
    const state = generateOAuthState();
    pendingCodexOAuth.set(state, {
      userId: req.userId!,
      pkce,
      createdAt: Date.now(),
    });

    res.json({ authorizationUrl: buildCodexAuthorizeUrl(pkce, state) });
  } catch (err) {
    req.log.error({ err }, 'providers: failed to start Codex OAuth');
    res.status(500).json({ error: 'Failed to start Codex login' });
  }
});

// ── Routes: CRUD ───────────────────────────────────────────────────────────

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const providers = await prisma.providerConfig.findMany({
      where: { userId: req.userId },
      select: {
        id: true,
        providerId: true,
        maskedKey: true,
        isActive: true,
        options: true,
        createdAt: true,
      },
    });
    res.json(providers);
  } catch (err) {
    req.log.error({ err }, 'providers: failed to fetch providers');
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { providerId, apiKey, options } = req.body;
    if (!providerId || !apiKey) {
      res.status(400).json({ error: 'providerId and apiKey required' });
      return;
    }

    const modelsDevCache = getModelsDevCache();
    if (modelsDevCache && !modelsDevCache.has(providerId)) {
      res.status(400).json({ error: 'Unknown provider ID' });
      return;
    }

    const encryptedApiKey = encrypt(apiKey);
    const maskedKey = maskKey(apiKey);

    let optionsString: string | undefined;
    if (options) {
      try {
        const parsed = typeof options === 'string' ? JSON.parse(options) : options;
        const validated = ProviderOptionsSchema.parse(parsed);
        optionsString = JSON.stringify(validated);
      } catch (err: unknown) {
        if (err instanceof Error && 'issues' in err) {
          const zodErr = err as { issues: { message: string }[] };
          res.status(400).json({ error: zodErr.issues[0]?.message ?? 'Invalid options' });
        } else {
          res.status(400).json({
            error: 'Invalid options: ' + (err instanceof Error ? err.message : 'unknown error'),
          });
        }
        return;
      }
    }

    const config = await prisma.providerConfig.upsert({
      where: {
        userId_providerId: {
          userId: req.userId!,
          providerId,
        },
      },
      update: {
        encryptedApiKey,
        maskedKey,
        isActive: true,
        options: optionsString,
      },
      create: {
        userId: req.userId!,
        providerId,
        encryptedApiKey,
        maskedKey,
        isActive: true,
        options: optionsString,
      },
    });

    res.status(201).json({
      id: config.id,
      providerId: config.providerId,
      maskedKey: config.maskedKey,
      isActive: config.isActive,
      options: config.options,
    });
  } catch (err) {
    req.log.error({ err }, 'providers: failed to save provider');
    res.status(500).json({ error: 'Failed to save provider' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.providerConfig.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, 'providers: failed to delete provider');
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

// ── Routes: test connection ────────────────────────────────────────────────

router.post('/test-connection', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { providerId, apiKey } = req.body;
    if (!providerId) {
      res.status(400).json({ error: 'providerId required' });
      return;
    }

    let actualApiKey = apiKey;
    let options: Record<string, unknown> | undefined;

    if (!actualApiKey) {
      const config = await prisma.providerConfig.findUnique({
        where: {
          userId_providerId: {
            userId: req.userId!,
            providerId,
          },
        },
      });
      if (!config) {
        res
          .status(400)
          .json({ error: 'Provider not configured. Provide apiKey or save the provider first.' });
        return;
      }
      const credential = await resolveProviderCredential(config, prisma);
      actualApiKey = credential.apiKey;
      options = credential.options;
    }

    const provider = getProvider(providerId, options);
    if (!provider) {
      res.status(400).json({ error: 'Provider not available' });
      return;
    }

    await provider.chat(
      {
        messages: [{ role: 'user', content: 'Hi' }],
        model: provider.getCapabilities()[0]?.modelId ?? '',
      },
      actualApiKey
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, 'providers: test connection failed');
    const message = err instanceof Error ? err.message : 'Connection test failed';
    res.status(502).json({ success: false, error: message });
  }
});

export default router;
