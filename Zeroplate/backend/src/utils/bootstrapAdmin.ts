import { User } from "../models/userModel";
import { env } from "../config/env";
import { hashPassword } from "./encryptPassword";

// The only way to get the first admin: ADMIN_EMAIL and ADMIN_PASSWORD in the environment.
export const bootstrapAdmin = async () => {
  if (await User.exists({ role: "admin" })) return;
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) { console.warn("No admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD to create one."); return; }
  if (env.ADMIN_PASSWORD.length < 10 || !/[A-Za-z]/.test(env.ADMIN_PASSWORD) || !/\d/.test(env.ADMIN_PASSWORD)) throw new Error("ADMIN_PASSWORD needs 10+ characters with a letter and a number");
  await User.create({ name: "Administrator", email: env.ADMIN_EMAIL.toLowerCase(), password: await hashPassword(env.ADMIN_PASSWORD), role: "admin", provider: "local", location: { type: "Point", coordinates: [0, 0] } });
  console.log("Initial admin created");
};
