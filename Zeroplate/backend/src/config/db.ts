import mongoose from "mongoose";
import { env } from "./env";

export const connectToDb = async () => {
  try {
    await mongoose.connect(env.DB_HOST);
    console.log("Connected to MongoDB successfully");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};
