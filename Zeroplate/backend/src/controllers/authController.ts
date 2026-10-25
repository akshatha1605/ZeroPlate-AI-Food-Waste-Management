import { Request, Response } from "express";
import { generateToken } from "../utils/generateToken";
import { hashPassword, comparePassword } from "../utils/encryptPassword";
import { User } from "../models/userModel";
import { cookieOptions } from "../utils/cookies";
import { logAudit } from "../utils/auditLogger";

// Constant-ish time for unknown emails so login does not reveal which accounts exist.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4uYVl4o0q1mQ7sYvQmQn6cK3wV7K";

const publicUser = (u: any) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, provider: u.provider });

const signup = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, location } = req.body; // already validated by Zod; role can never be "admin"
    if (await User.findOne({ email })) return res.status(400).json({ message: "User already exists" });
    const user = await User.create({
      name, email, password: await hashPassword(password), role, provider: "local",
      location: location ?? { type: "Point", coordinates: [0, 0] },
    });
    await logAudit({ userId: user.id, action: "signup", entity: "user", entityId: user.id, ipAddress: req.ip ?? "unknown" });
    return res.status(201).json({ message: "User created successfully. Please login." });
  } catch (error: any) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    const ok = await comparePassword(password, (user?.password as string | undefined) || DUMMY_HASH);
    if (!user || !user.password || !ok) return res.status(400).json({ message: "Invalid email or password" });
    const token = generateToken(user.email, user.role, user.id);
    res.cookie("token", token, cookieOptions);
    return res.status(200).json({ message: "Login successful", user: { ...publicUser(user), token } });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Self-service role choice, for new Google users only, and never to admin.
const updateUserRole = async (req: Request, res: Response) => {
  try {
    const user = await User.findById((req as any).user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.roleChosen) return res.status(403).json({ message: "Role already chosen. Ask an admin to change it." });
    user.role = req.body.role;
    user.roleChosen = true;
    await user.save();
    const token = generateToken(user.email, user.role, user.id);
    res.cookie("token", token, cookieOptions);
    return res.status(200).json({ message: "Role updated successfully", user: { ...publicUser(user), token } });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Lets a user (for example a Google sign-in user) set where their kitchen or NGO is. Matching needs this.
const updateLocation = async (req: Request, res: Response) => {
  const user = await User.findByIdAndUpdate((req as any).user.id, { $set: { location: { type: "Point", coordinates: [req.body.lng, req.body.lat] } } }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.status(200).json({ message: "Location updated", location: user.location });
};

// Used right after Google sign-in: the httpOnly cookie proves who you are; this hands the SPA its session without putting a token in the URL.
const session = async (req: Request, res: Response) => {
  const user = await User.findById((req as any).user.id);
  if (!user) return res.status(401).json({ message: "Not authorized" });
  const token = generateToken(user.email, user.role, user.id);
  return res.status(200).json({ user: { ...publicUser(user), token, isNewUser: !user.roleChosen } });
};

export { signup, login, updateUserRole, updateLocation, session };
