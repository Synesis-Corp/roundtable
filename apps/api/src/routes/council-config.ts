import { Router } from "express";
import { CouncilConfigSchema } from "@chat/sdk";
import { prisma } from "../lib/db";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth";
import { validateBody } from "../middleware/validate";

const router = Router();

/**
 * GET /council/config
 * Returns the user's council configuration, or 204 if none exists.
 */
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const config = await prisma.councilConfig.findUnique({
      where: { userId: req.userId! },
    });

    if (!config) {
      res.status(204).send();
      return;
    }

    res.json({
      id: config.id,
      userId: config.userId,
      modelIds: config.modelIds,
      mode: config.mode,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "failed to fetch council config");
    res.status(500).json({ error: "Failed to fetch council config" });
  }
});

/**
 * PUT /council/config
 * Upserts the user's council configuration. Replaces the entire resource.
 */
router.put(
  "/",
  authMiddleware,
  validateBody(CouncilConfigSchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { modelIds, mode } = req.body;

      const config = await prisma.councilConfig.upsert({
        where: { userId: req.userId! },
        update: {
          modelIds,
          mode,
        },
        create: {
          userId: req.userId!,
          modelIds,
          mode,
        },
      });

      res.json({
        id: config.id,
        userId: config.userId,
        modelIds: config.modelIds,
        mode: config.mode,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      });
    } catch (err) {
      req.log.error({ err }, "failed to update council config");
      res.status(500).json({ error: "Failed to update council config" });
    }
  }
);

/**
 * DELETE /council/config
 * Removes the user's council configuration entirely.
 */
router.delete("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.councilConfig.deleteMany({
      where: { userId: req.userId! },
    });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "failed to delete council config");
    res.status(500).json({ error: "Failed to delete council config" });
  }
});

export default router;
