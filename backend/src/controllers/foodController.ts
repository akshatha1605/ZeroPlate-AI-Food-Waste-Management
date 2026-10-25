import { Request, Response } from "express";
import { FoodModel } from "../models/foodModel";
import { findBestNGOsForFood } from "../services/matchingService";

const me = (req: Request) => (req as any).user as { id: string; role: string };
const WHITELIST = ["title", "quantity", "expirationDate", "pickupLocation", "type"] as const;

const RegisterFood = async (req: Request, res: Response) => {
  try {
    const food = await FoodModel.create({ ...req.body, status: "available", donor: me(req).id }); // status is never taken from the client
    let recommendedNGOs: unknown[] = [];
    try { recommendedNGOs = (await findBestNGOsForFood(food.id)).filter((n) => n.eligible).slice(0, 3); }
    catch (e: any) { console.warn("Matching failed:", e.message); } // a matching failure must not lose the listing
    return res.status(201).json({ success: true, message: "Food registered successfully", food, recommendedNGOs });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
};

const GetAllFood = async (_req: Request, res: Response) => {
  const food = await FoodModel.find().populate("donor", "name email").sort({ createdAt: -1 }).limit(200);
  return res.status(200).json({ food });
};

const GetAllAvailableFood = async (_req: Request, res: Response) => {
  const food = await FoodModel.find({ status: "available", expirationDate: { $gt: new Date() } }).populate("donor", "name email");
  return res.status(200).json({ food });
};

const UpdateFoodItem = async (req: Request, res: Response) => {
  const u = me(req);
  const updates: Record<string, unknown> = {};
  for (const k of WHITELIST) if (req.body[k] !== undefined) updates[k] = req.body[k]; // no mass assignment of status or donor
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (u.role !== "admin") filter.donor = u.id; // donors can only edit their own listings
  const food = await FoodModel.findOneAndUpdate(filter, { $set: updates }, { new: true });
  if (!food) return res.status(404).json({ message: "Food item not found" });
  return res.status(200).json({ message: "Food item updated successfully", food });
};

const DeleteFoodItem = async (req: Request, res: Response) => {
  const u = me(req);
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (u.role !== "admin") filter.donor = u.id;
  const food = await FoodModel.findOneAndDelete(filter);
  if (!food) return res.status(404).json({ message: "Food item not found" });
  return res.status(200).json({ message: "Food item deleted successfully" });
};
export { RegisterFood, GetAllFood, GetAllAvailableFood, UpdateFoodItem, DeleteFoodItem };
