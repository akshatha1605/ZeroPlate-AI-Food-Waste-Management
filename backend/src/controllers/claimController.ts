import { Request, Response } from "express";
import { ClaimModel } from "../models/claimModel";
import { FoodModel } from "../models/foodModel";
import { User } from "../models/userModel";
import { sendNotificationMail } from "../services/emailServices";
import { io } from "../app";
import { pickupQueue } from "../queues/queue";

const createClaim = async (req: Request, res: Response) => {
  try {
    const receiverId = (req as any).user.id;
    const foodId = String(req.body.foodId ?? "");
    if (!/^[a-f0-9]{24}$/i.test(foodId)) return res.status(400).json({ message: "Invalid food id" });
    if (await ClaimModel.findOne({ food: foodId, receiver: receiverId })) return res.status(400).json({ message: "You already have a claim for this food item" });

    // Atomic reservation: two receivers cannot both claim it, and expired food cannot be claimed.
    const foodItem = await FoodModel.findOneAndUpdate({ _id: foodId, status: "available", expirationDate: { $gt: new Date() } }, { $set: { status: "claimed" } }, { new: true });
    if (!foodItem) return res.status(409).json({ message: "Food item is not available" });

    let claim;
    try { claim = await ClaimModel.create({ food: foodId, receiver: receiverId }); }
    catch (e) { await FoodModel.updateOne({ _id: foodId }, { $set: { status: "available" } }); throw e; }

    const donor = await User.findById(foodItem.donor);
    if (donor?.email) {
      sendNotificationMail(donor.email, foodItem.title).catch((e) => console.warn("Email failed:", e.message));
      pickupQueue.add("sendPickupReminder", { email: donor.email, foodTitle: foodItem.title }, { delay: 60 * 60 * 1000 }).catch(() => {});
    }
    io.to(`user:${foodItem.donor}`).emit("claimCreated", { claimId: claim.id, foodId, foodTitle: foodItem.title });
    return res.status(201).json({ message: "Claim created successfully", claim });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getClaims = async (req: Request, res: Response) => {
  try {
    const claims = await ClaimModel.find({ receiver: (req as any).user.id }).populate("food").populate("receiver", "name email");
    res.status(200).json({ success: true, claims });
  } catch {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
export { createClaim, getClaims };
