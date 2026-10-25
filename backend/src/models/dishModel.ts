import mongoose, { Schema } from "mongoose";

const dishSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "cooked" },
    portionG: { type: Number, default: 250 },
    costPerKg: { type: Number, required: true },
    co2ePerKg: { type: Number, default: 1 },
    hotHours: { type: Number, default: 4 },
    chillHours: { type: Number, default: 24 },
    ambHours: { type: Number, default: 2 },
  },
  { timestamps: true }
);
dishSchema.index({ owner: 1, name: 1 }, { unique: true });
export const Dish = mongoose.model("Dish", dishSchema);
