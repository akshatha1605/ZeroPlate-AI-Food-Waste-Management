import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Accept token from httpOnly cookie (Google OAuth flow) OR Authorization header (SPA flow)
    let token: string | undefined = req.cookies?.token;
    if (!token) {
      const h = req.headers.authorization;
      if (h && h.startsWith("Bearer ")) token = h.substring(7);
    }
    if (!token) return res.status(401).json({ message: "No token provided" });
    (req as any).user = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Brute-force protection for login and signup: 10 attempts per 15 minutes per IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts from this IP, please try again after 15 minutes" },
});
