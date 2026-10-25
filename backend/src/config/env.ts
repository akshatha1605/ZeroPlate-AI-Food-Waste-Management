import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(5000),
  DB_HOST: z.string().min(1, "DB_HOST (MongoDB connection string) is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  FRONTEND_URL: z.string().default("http://localhost:4200"),
  TRUST_PROXY: z.coerce.number().default(0),
  AUTH_RATE_LIMIT: z.coerce.number().int().default(10),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  OAUTH_CALLBACK_URL: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  VISION_PROVIDER: z.enum(["auto", "groq", "anthropic", "mock"]).default("auto"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_VISION_MODEL: z.string().default("qwen/qwen3.8-27b"),
  GROQ_REASONING_EFFORT: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  VISION_MODEL: z.string().default("claude-sonnet-4-6"),
  REDIS_ENABLED: z.string().default("true"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${msg}`);
}
export const env = parsed.data;
if (env.NODE_ENV === "production" && env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be 32+ characters in production (openssl rand -hex 32)");
}
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.OAUTH_CALLBACK_URL);
