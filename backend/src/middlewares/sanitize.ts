import { Request, Response, NextFunction } from "express";

// Blocks NoSQL operator injection ({"email": {"$gt": ""}}) by dropping "$" and "." keys.
// (express-mongo-sanitize is not compatible with Express 5's read-only req.query.)
const clean = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k.startsWith("$") || k.includes(".")) continue;
      out[k] = clean(val);
    }
    return out;
  }
  return v;
};
export const sanitizeBody = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) req.body = clean(req.body);
  next();
};
