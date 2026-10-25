import mongoose, { Schema } from "mongoose";

const menuSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  dish: { type: Schema.Types.ObjectId, ref: "Dish", required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  session: { type: String, enum: ["breakfast", "lunch", "dinner"], default: "lunch" },
  cookedKg: { type: Number, required: true },
  headcount: { type: Number },
});
menuSchema.index({ owner: 1, dish: 1, date: 1, session: 1 }, { unique: true });
export const MenuEntry = mongoose.model("MenuEntry", menuSchema);

const wasteSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  dish: { type: Schema.Types.ObjectId, ref: "Dish", required: true },
  grams: { type: Number, required: true },
  category: { type: String, enum: ["plate-waste", "edible-surplus", "inedible"], default: "plate-waste" },
  confidence: { type: Number, default: 100 },
  session: { type: String, enum: ["breakfast", "lunch", "dinner"], default: "lunch" },
  model: { type: String, default: "manual" },
  synthetic: { type: Boolean, default: false },
  confirmedBy: { type: Schema.Types.ObjectId, ref: "User" },
  ts: { type: Date, default: Date.now },
});
wasteSchema.index({ owner: 1, ts: -1 });
wasteSchema.index({ dish: 1, ts: -1 });
export const WasteRecord = mongoose.model("WasteRecord", wasteSchema);

const decisionSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  dish: { type: Schema.Types.ObjectId, ref: "Dish", required: true },
  targetDate: String, recKg: Number, lower: Number, upper: Number,
  decision: { type: String, enum: ["accept", "edit", "reject"] },
  finalKg: Number, modelVersion: String,
}, { timestamps: true });
export const ForecastDecision = mongoose.model("ForecastDecision", decisionSchema);
