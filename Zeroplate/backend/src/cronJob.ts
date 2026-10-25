import cron from "node-cron";
import { FoodModel } from "./models/foodModel";
import { env } from "./config/env";


export const expireFoods = () => FoodModel.updateMany({ status: "available", expirationDate: { $lte: new Date() } }, { $set: { status: "expired" } });

export const startJobs = async () => {
  // Every minute: expire food whose safe time has run out. Runs server-side, no client needed (SRS NFR-REL-04).
  cron.schedule("* * * * *", async () => {
    try { await expireFoods(); }
    catch (e: any) { console.error("Expiry sweep failed:", e.message); }
  });

  if (env.REDIS_ENABLED !== "true") { console.log("Redis jobs disabled (REDIS_ENABLED!=true)."); return; }
  const { expiryQueue, matchingEngineQueue } = await import("./queues/queue");
  await import("./worker"); // start BullMQ workers
  cron.schedule("0 * * * *", async () => {
    const foods = await FoodModel.find({ status: "available" }); // fixed typo: was "avaialble", so this never matched
    foods.forEach((f) => expiryQueue.add("checkExpiry", { foodId: f.id }));
  });
  cron.schedule("*/15 * * * *", async () => {
    const foods = await FoodModel.find({ status: "available" });
    foods.forEach((f) => matchingEngineQueue.add("matchNGOs", { foodId: f.id }));
  });
};
