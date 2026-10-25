import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import passport from "passport";
import cookieParser from "cookie-parser";
import cors from "cors";
import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { env } from "./config/env";
import authRoutes from "./routes/authRoutes";
import adminRoutes from "./routes/adminRoute";
import foodRoutes from "./routes/foodRoute";
import claimRoutes from "./routes/claimRoutes";
import adminDashboardRoutes from "./routes/adminDashboardRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import kitchenRoutes from "./routes/kitchenRoutes";
import { errorHandler } from "./middlewares/errorMiddleware";
import { sanitizeBody } from "./middlewares/sanitize";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { message: "Too many requests, try again later" } }));
app.use("/api/kitchen/waste/analyze", express.json({ limit: "12mb" })); // photo uploads; everything else is capped at 100 kB
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(sanitizeBody);
app.use(passport.initialize());

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: env.FRONTEND_URL, credentials: true } });
// Sockets must be authenticated, and each user only receives their own events.
io.use((socket, next) => {
  try {
    const cookie = /(?:^|;\s*)token=([^;]+)/.exec(socket.handshake.headers.cookie ?? "")?.[1];
    const token = (socket.handshake.auth?.token as string | undefined) ?? cookie;
    if (!token) return next(new Error("unauthorized"));
    const u = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as { id: string };
    socket.join(`user:${u.id}`);
    next();
  } catch { next(new Error("unauthorized")); }
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/foods", foodRoutes);
app.use("/api/claims", claimRoutes);
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/kitchen", kitchenRoutes);
app.use((_req, res) => res.status(404).json({ message: "Not found" }));
app.use(errorHandler); // must come after the routes to catch their errors

export { server };
export default app;
