import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

// Validates and replaces req.body (or exposes parsed query on res.locals.query; Express 5 query is read-only).
export const validate =
  (schema: ZodType, where: "body" | "query" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(where === "body" ? req.body : req.query);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (where === "body") req.body = result.data;
    else res.locals.query = result.data;
    next();
  };
