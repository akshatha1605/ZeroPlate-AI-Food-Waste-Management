import express, { Request, Response } from "express";
import passport from "../services/authService";
import { generateToken } from "../utils/generateToken";
import { signup, login, updateUserRole, updateLocation, session } from "../controllers/authController";
import { authLimiter, verifyToken } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { signupSchema, loginSchema, selfRoleSchema, locationUpdateSchema } from "../validation/schemas";
import { IUser } from "../models/userModel";
import { cookieOptions } from "../utils/cookies";
import { env, googleEnabled } from "../config/env";

const router = express.Router();

router.post("/signup", authLimiter, validate(signupSchema), signup);
router.post("/login", authLimiter, validate(loginSchema), login);
router.get("/session", verifyToken, session);
router.put("/location", verifyToken, validate(locationUpdateSchema), updateLocation);
router.put("/update-role", verifyToken, validate(selfRoleSchema), updateUserRole);

const needGoogle = (_req: Request, res: Response, next: express.NextFunction) =>
  googleEnabled ? next() : res.status(503).json({ message: "Google sign-in is not configured" });

router.get("/google", needGoogle, passport.authenticate("google", { scope: ["profile", "email"], session: false }));
router.get("/google/callback", needGoogle, passport.authenticate("google", { session: false, failureRedirect: `${env.FRONTEND_URL}/auth/login` }),
  (req: Request, res: Response) => {
    const user = req.user as IUser;
    const token = generateToken(user.email, user.role, user._id.toString());
    res.cookie("token", token, cookieOptions);
    const info = encodeURIComponent(JSON.stringify({
      _id: user._id, name: user.name, email: user.email, role: user.role, provider: user.provider,
      isNewUser: user.isNewUser || !user.roleChosen,
    }));
    res.redirect(`${env.FRONTEND_URL}/auth/google/callback?user=${info}`);
  }
);
export default router;
