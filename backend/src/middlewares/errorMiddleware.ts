import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || (err.type === "entity.too.large" ? 413 : 500);
  if (status >= 500) console.error("Error:", err);
  res.status(status).json({
    success: false,
    message: status >= 500 && env.NODE_ENV === "production" ? "Internal Server Error" : err.message || "Internal Server Error",
  });
};
