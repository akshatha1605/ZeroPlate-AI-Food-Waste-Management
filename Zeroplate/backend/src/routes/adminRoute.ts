import express, { Request, Response } from "express";
import { User } from "../models/userModel";
import { authorizeRoles } from "../middlewares/roleMiddleware";
import { verifyToken } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { adminRoleSchema } from "../validation/schemas";
import { logAudit } from "../utils/auditLogger";

const adminRoute = express.Router();

adminRoute.put("/role/:id", verifyToken, authorizeRoles("admin"), validate(adminRoleSchema), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!/^[a-f0-9]{24}$/i.test(id)) return res.status(400).json({ message: "Invalid id" });
  const user = await User.findById(id).exec();
  if (!user) return res.status(404).json({ message: "User not found" });
  user.role = req.body.role;
  user.roleChosen = true;
  await user.save();
  await logAudit({ userId: (req as any).user.id, action: "role_change", entity: "user", entityId: id, ipAddress: req.ip ?? "unknown" });
  res.json({ message: "User role updated successfully" });
});
export default adminRoute;
