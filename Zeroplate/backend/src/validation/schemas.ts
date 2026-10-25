import { z } from "zod";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
const strongPassword = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password needs a letter")
  .regex(/\d/, "Password needs a number");

// Public signup can never create an admin. Admins come from ADMIN_EMAIL bootstrap or an admin.
export const PublicRole = z.enum(["donor", "receiver", "volunteer"]);

export const locationSchema = z.object({
  type: z.literal("Point").default("Point"),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]), // [longitude, latitude]
});
export const locationUpdateSchema = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: strongPassword,
  role: PublicRole.default("receiver"),
  location: locationSchema.optional(),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });
export const selfRoleSchema = z.object({ role: PublicRole });
export const adminRoleSchema = z.object({ role: z.enum(["donor", "receiver", "volunteer", "admin"]) });
export const idParam = z.object({ id: objectId });

export const foodSchema = z.object({
  title: z.string().trim().min(1).max(120),
  quantity: z.coerce.number().positive().max(100000),
  expirationDate: z.coerce.date().refine((d) => d.getTime() > Date.now(), "Expiry must be in the future"),
  pickupLocation: z.string().trim().min(1).max(300),
  type: z.string().trim().max(50).optional(),
});
export const foodUpdateSchema = foodSchema.partial();

export const dishSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).default("cooked"),
  portionG: z.coerce.number().positive().max(5000).default(250),
  costPerKg: z.coerce.number().min(0).max(100000),
  co2ePerKg: z.coerce.number().min(0).max(1000).default(1),
  hotHours: z.coerce.number().positive().max(72).default(4),
  chillHours: z.coerce.number().positive().max(168).default(24),
  ambHours: z.coerce.number().positive().max(24).default(2),
});
export const dishUpdateSchema = dishSchema.partial();

export const menuSchema = z.object({
  dishId: objectId,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  session: z.enum(["breakfast", "lunch", "dinner"]).default("lunch"),
  cookedKg: z.coerce.number().positive().max(100000),
  headcount: z.coerce.number().int().positive().max(100000).optional(),
});

export const analyzeSchema = z.object({
  image: z.string().min(100).max(14_000_000),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
export const wasteSaveSchema = z.object({
  items: z
    .array(
      z.object({
        dishId: objectId,
        grams: z.coerce.number().min(1).max(20000),
        category: z.enum(["plate-waste", "edible-surplus", "inedible"]).default("plate-waste"),
        confidence: z.coerce.number().min(0).max(100).default(100),
      })
    )
    .min(1)
    .max(50),
  model: z.string().max(60).default("manual"),
  session: z.enum(["breakfast", "lunch", "dinner"]).default("lunch"),
});

export const surplusSchema = z.object({
  dishId: objectId,
  kg: z.coerce.number().min(0.5).max(500),
  storage: z.enum(["hot", "chill", "amb"]),
  hoursAgo: z.coerce.number().min(0).max(48).default(0),
  diet: z.enum(["veg", "non-veg"]).default("veg"),
  allergens: z.string().trim().max(200).default(""),
  checklist: z.object({ covered: z.literal(true), temperature: z.literal(true), allergens: z.literal(true) }),
  pickupLocation: z.string().trim().min(1).max(300),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export const simulateSchema = z.object({
  dishId: objectId,
  pct: z.coerce.number().min(0).max(100),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
});
export const decisionSchema = z.object({
  dishId: objectId,
  decision: z.enum(["accept", "edit", "reject"]),
  finalKg: z.coerce.number().positive().optional(),
});
export const impactQuery = z.object({ days: z.coerce.number().int().min(1).max(730).default(30) });
