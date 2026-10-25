import mongoose from "mongoose";

export interface FoodInterface extends mongoose.Document {
  title: string;
  quantity: number;
  status: "available" | "claimed" | "picked_up" | "expired";
  donor: mongoose.Schema.Types.ObjectId;
  pickupLocation: string;
  createdAt: Date;
  updatedAt: Date;
  type: string;
  expirationDate: Date;
  source?: "manual" | "surplus";
  dish?: mongoose.Types.ObjectId;
  storage?: string;
  diet?: string;
  allergens?: string;
  location: {
    type: string;
    coordinates: number[];
  }
}

const foodSchema = new mongoose.Schema<FoodInterface>({
    title: {
        type: String,
        required: true
    },
    type: {
        type: String
    },
    quantity: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["available", "claimed", "picked_up", "expired"],
        required: true,
        default: "available"
    },
    donor: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: "User"
    },
    expirationDate: {
        type: Date,
        required: true
    },
    pickupLocation: {
        type: String,
        required: true
    },
    source: { type: String, enum: ["manual", "surplus"], default: "manual" },
    dish: { type: mongoose.Schema.Types.ObjectId, ref: "Dish" },
    storage: { type: String },
    diet: { type: String },
    allergens: { type: String },
    location: {
        type: {
            type: String,
            enum: ["Point"],
            default: "Point"
        },
        coordinates: {
            type: [Number],
            default: [0, 0]
        },
    }
}, { timestamps: true });

// 2dsphere index for geo-matching near-NGO queries
foodSchema.index({ location: "2dsphere" });

export const FoodModel = mongoose.model<FoodInterface>("Food", foodSchema);