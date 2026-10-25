import { Queue } from "bullmq";
import { env } from "../config/env";

export const redisConnection = { host: env.REDIS_HOST, port: env.REDIS_PORT };
const enabled = env.REDIS_ENABLED === "true";

// With REDIS_ENABLED=false the app runs without Redis: queue calls become harmless no-ops.
const make = (name: string) => (enabled ? new Queue(name, { connection: redisConnection }) : ({ add: async () => undefined } as unknown as Queue));

export const pickupQueue = make("pickupQueue");
export const expiryQueue = make("expiryQueue");
export const matchingEngineQueue = make("matchingEngineQueue");
