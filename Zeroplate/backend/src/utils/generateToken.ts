import jwt from "jsonwebtoken";
import { env } from "../config/env";

export const generateToken = (userMail: string, role: string, id: string) =>
  jwt.sign({ userMail, role, id }, env.JWT_SECRET, { expiresIn: "7d", algorithm: "HS256" });
