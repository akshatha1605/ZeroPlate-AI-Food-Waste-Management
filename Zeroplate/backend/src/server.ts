import { server } from "./app";
import { env } from "./config/env";
import { connectToDb } from "./config/db";
import { bootstrapAdmin } from "./utils/bootstrapAdmin";
import { startJobs } from "./cronJob";
import mongoose from "mongoose";

(async () => {
  await connectToDb();
  await bootstrapAdmin();
  await startJobs();
  server.listen(env.PORT, () => console.log(`Server is running on port ${env.PORT}`));
})();

const shutdown = (sig: string) => {
  console.log(`${sig}: shutting down`);
  server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
["SIGTERM", "SIGINT"].forEach((s) => process.on(s, () => shutdown(s)));
