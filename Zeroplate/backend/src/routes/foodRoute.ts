import express from "express";
import { authorizeRoles } from "../middlewares/roleMiddleware";
import { RegisterFood, GetAllFood, GetAllAvailableFood, UpdateFoodItem, DeleteFoodItem } from "../controllers/foodController";
import { verifyToken } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validate";
import { foodSchema, foodUpdateSchema } from "../validation/schemas";
const router = express.Router();

router.get("/", verifyToken, GetAllFood);
router.get("/available", verifyToken, GetAllAvailableFood);
router.post("/add-foodItem", verifyToken, authorizeRoles("donor", "admin"), validate(foodSchema), RegisterFood);
router.patch("/update-foodItem/:id", verifyToken, authorizeRoles("donor", "admin"), validate(foodUpdateSchema), UpdateFoodItem);
router.delete("/delete-foodItem/:id", verifyToken, authorizeRoles("donor", "admin"), DeleteFoodItem);
export default router;
