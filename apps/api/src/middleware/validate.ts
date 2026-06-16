import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

/**
 * Returns middleware that validates `req.body` against a Zod schema. On failure
 * it responds 400 with the field errors and short-circuits — handlers downstream
 * can trust the shape of the body. The parsed (and narrowed) value replaces
 * req.body so coercions/defaults from the schema take effect.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
