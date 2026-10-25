import { Request, Response } from "express";
import { Types } from "mongoose";
import { Dish } from "../models/dishModel";
import { MenuEntry, WasteRecord, ForecastDecision } from "../models/kitchenModels";
import { FoodModel } from "../models/foodModel";
import { User } from "../models/userModel";
import { env } from "../config/env";
import { findBestNGOsForFood } from "../services/matchingService";
import { analyzeImage, isRealImage } from "../services/kitchen/vision";
import { forecastDish, DayPoint } from "../services/kitchen/forecast";
import { simulate } from "../services/kitchen/simulate";
import { windowHours, expiresAt, remainingMinutes, urgency } from "../services/kitchen/safety";

// Every query is scoped by owner (the logged-in donor), so one kitchen can never see another's data.
const owner = (req: Request) => (req as any).user.id as string;
const day = (d: Date) => d.toISOString().slice(0, 10);
const THRESHOLD = 60;

async function ownedDish(req: Request, id: string) {
  const d = await Dish.findOne({ _id: id, owner: owner(req) });
  if (!d) throw Object.assign(new Error("Dish not found in your kitchen."), { status: 404 });
  return d;
}

export async function seriesFor(ownerId: string, dishId: unknown): Promise<DayPoint[]> {
  const menus = await MenuEntry.find({ owner: ownerId, dish: dishId }).sort({ date: 1 }).lean();
  if (!menus.length) return [];
  const waste = await WasteRecord.find({ owner: ownerId, dish: dishId, ts: { $gte: new Date(menus[0]!.date + "T00:00:00Z") } }).lean();
  const wByDay = new Map<string, number>();
  waste.forEach((w) => wByDay.set(day(w.ts), (wByDay.get(day(w.ts)) ?? 0) + w.grams / 1000));
  const byDate = new Map<string, DayPoint>();
  menus.forEach((m) => {
    const p = byDate.get(m.date) ?? { date: m.date, cooked: 0, waste: wByDay.get(m.date) ?? 0, headcount: undefined };
    p.cooked += m.cookedKg;
    if (m.headcount) p.headcount = (p.headcount ?? 0) + m.headcount;
    byDate.set(m.date, p);
  });
  return [...byDate.values()];
}

// ----- dishes -----
export const listDishes = async (req: Request, res: Response) => res.json({ dishes: await Dish.find({ owner: owner(req) }).sort({ name: 1 }) });
export const createDish = async (req: Request, res: Response) => {
  try { res.status(201).json({ dish: await Dish.create({ ...req.body, owner: owner(req) }) }); }
  catch (e: any) { if (e.code === 11000) return res.status(409).json({ message: "A dish with that name already exists." }); throw e; }
};
export const updateDish = async (req: Request, res: Response) => {
  const d = await Dish.findOneAndUpdate({ _id: req.params.id, owner: owner(req) }, { $set: req.body }, { new: true });
  if (!d) return res.status(404).json({ message: "Dish not found" });
  res.json({ dish: d });
};
export const deleteDish = async (req: Request, res: Response) => {
  const d = await Dish.findOneAndDelete({ _id: req.params.id, owner: owner(req) });
  if (!d) return res.status(404).json({ message: "Dish not found" });
  res.json({ ok: true });
};

// ----- menu / cooked quantity -----
export const saveMenu = async (req: Request, res: Response) => {
  const b = req.body;
  await ownedDish(req, b.dishId);
  const date = b.date ?? day(new Date());
  await MenuEntry.findOneAndUpdate({ owner: owner(req), dish: b.dishId, date, session: b.session }, { $set: { cookedKg: b.cookedKg, headcount: b.headcount } }, { upsert: true });
  res.json({ ok: true });
};

// ----- waste capture -----
export const analyze = async (req: Request, res: Response) => {
  const { image, mime } = req.body;
  if (!isRealImage(image)) return res.status(400).json({ message: "That file is not a valid JPEG, PNG or WebP image." });
  const dishes = (await Dish.find({ owner: owner(req) })).map((d) => ({ id: d.id as string, name: d.name }));
  if (!dishes.length) return res.status(400).json({ message: "Add dishes first." });
  const out = await analyzeImage(image, mime, dishes);
  res.json({ ...out, threshold: THRESHOLD, items: out.items.map((i) => ({ ...i, needsReview: i.confidence < THRESHOLD })) });
};
export const saveWaste = async (req: Request, res: Response) => {
  const { items, model, session } = req.body as { items: { dishId: string; grams: number; category: string; confidence: number }[]; model: string; session: string };
  const ids = [...new Set(items.map((i) => i.dishId))];
  const found = await Dish.countDocuments({ _id: { $in: ids }, owner: owner(req) });
  if (found !== ids.length) return res.status(404).json({ message: "A dish is not in your kitchen." });
  await WasteRecord.insertMany(items.map((i) => ({ owner: owner(req), dish: i.dishId, grams: i.grams, category: i.category, confidence: i.confidence, session, model, confirmedBy: owner(req) })));
  res.status(201).json({ saved: items.length });
};
export const fingerprint = async (req: Request, res: Response) => {
  const dish = await ownedDish(req, String(req.params.dishId));
  const recs = await WasteRecord.find({ owner: owner(req), dish: dish._id, ts: { $gte: new Date(Date.now() - 90 * 864e5) } }).lean();
  const byDay = new Map<string, number>(), bySession: Record<string, number> = {};
  recs.forEach((r) => { byDay.set(day(r.ts), (byDay.get(day(r.ts)) ?? 0) + r.grams / 1000); bySession[r.session] = (bySession[r.session] ?? 0) + r.grams / 1000; });
  const days = [...byDay.entries()].sort();
  const wd: number[][] = [[], [], [], [], [], [], []];
  days.forEach(([d, kg]) => wd[new Date(d + "T00:00:00Z").getUTCDay()]!.push(kg));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  res.json({
    byDay: days.slice(-14).map(([d, kg]) => ({ date: d, kg: r2(kg) })),
    byWeekday: wd.map((a, i) => ({ weekday: i, kg: r2(a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0) })),
    bySession: Object.entries(bySession).map(([session, kg]) => ({ session, kg: r2(kg) })),
  });
};

// ----- forecast -----
export const getForecast = async (req: Request, res: Response) => {
  const dishes = await Dish.find({ owner: owner(req) });
  const out = await Promise.all(dishes.map(async (d) => ({ dishId: d.id, name: d.name, ...forecastDish(await seriesFor(owner(req), d._id)) })));
  res.json({ forecasts: out });
};
export const decide = async (req: Request, res: Response) => {
  const b = req.body;
  const d = await ownedDish(req, b.dishId);
  const f = forecastDish(await seriesFor(owner(req), d._id));
  if (!f.ok) return res.status(400).json({ message: f.error });
  await ForecastDecision.create({ owner: owner(req), dish: d._id, targetDate: day(new Date(Date.now() + 864e5)), recKg: f.recKg, lower: f.lower, upper: f.upper, decision: b.decision, finalKg: b.finalKg ?? f.recKg, modelVersion: f.modelVersion });
  res.json({ ok: true });
};

// ----- surplus with food-safety clock -> creates a donor listing and ranks NGOs -----
export const createSurplus = async (req: Request, res: Response) => {
  const b = req.body;
  const dish = await ownedDish(req, b.dishId);
  const win = windowHours(dish as any, b.storage);
  const left = win - b.hoursAgo;
  if (left <= 0) return res.status(400).json({ message: "This food is past its safe window and cannot be listed. Send it to compost." });
  const user = await User.findById(owner(req));
  const c = user?.location?.coordinates ?? [0, 0];
  const lng = b.lng ?? c[0] ?? 0, lat = b.lat ?? c[1] ?? 0;
  const expiry = new Date(expiresAt(b.hoursAgo, win));
  const food = await FoodModel.create({
    title: dish.name, quantity: b.kg, expirationDate: expiry, pickupLocation: b.pickupLocation, type: b.diet, status: "available", donor: owner(req),
    source: "surplus", dish: dish._id, storage: b.storage, diet: b.diet, allergens: b.allergens, location: { type: "Point", coordinates: [lng, lat] },
  });
  let ranked: Awaited<ReturnType<typeof findBestNGOsForFood>> = [];
  try { ranked = await findBestNGOsForFood(food.id); } catch (e: any) { console.warn("Matching failed:", e.message); }
  const rem = remainingMinutes(expiry);
  res.status(201).json({
    food, remainingMinutes: rem, urgency: urgency(rem),
    recommendedNGOs: ranked.filter((n) => n.eligible).slice(0, 3), notEligible: ranked.filter((n) => !n.eligible).map((n) => ({ name: n.name, reason: n.reason })),
  });
};

// ----- impact + simulator -----
export const impact = async (req: Request, res: Response) => {
  const days = (res.locals.query?.days as number) ?? 30;
  const since = new Date(Date.now() - days * 864e5);
  const [dishes, recs, donated] = await Promise.all([
    Dish.find({ owner: owner(req) }), WasteRecord.find({ owner: owner(req), ts: { $gte: since } }).lean(),
    FoodModel.aggregate([{ $match: { donor: new Types.ObjectId(owner(req)), source: "surplus", status: { $in: ["claimed", "picked_up"] }, createdAt: { $gte: since } } }, { $group: { _id: null, kg: { $sum: "$quantity" } } }]),
  ]);
  const per = dishes.map((d) => {
    const mine = recs.filter((r) => String(r.dish) === d.id);
    const kg = mine.reduce((a, r) => a + r.grams / 1000, 0);
    return { dishId: d.id, name: d.name, kg: Math.round(kg * 10) / 10, costInr: Math.round(kg * d.costPerKg), co2eKg: Math.round(kg * d.co2ePerKg * 10) / 10, costPerKg: d.costPerKg, co2ePerKg: d.co2ePerKg, realRecords: mine.filter((r) => !r.synthetic).length, syntheticRecords: mine.filter((r) => r.synthetic).length };
  });
  const trend = new Map<string, number>();
  recs.forEach((r) => trend.set(day(r.ts), (trend.get(day(r.ts)) ?? 0) + r.grams / 1000));
  const donatedKg = donated[0]?.kg ?? 0;
  res.json({
    days, totalKg: Math.round(per.reduce((a, d) => a + d.kg, 0) * 10) / 10, totalCostInr: per.reduce((a, d) => a + d.costInr, 0), totalCo2eKg: Math.round(per.reduce((a, d) => a + d.co2eKg, 0) * 10) / 10,
    donatedKg, meals: Math.round((donatedKg * 1000) / 350), dishes: per.sort((a, b) => b.kg - a.kg), trend: [...trend.entries()].sort().map(([date, kg]) => ({ date, kg: Math.round(kg * 10) / 10 })),
  });
};
export const runSimulation = async (req: Request, res: Response) => {
  const b = req.body;
  const d = await ownedDish(req, b.dishId);
  res.json(simulate(await seriesFor(owner(req), d._id), { costPerKg: d.costPerKg, co2ePerKg: d.co2ePerKg, pct: b.pct, weekday: b.weekday }));
};

// ----- labeled synthetic demo data (disabled in production) -----
export const demoSeed = async (req: Request, res: Response) => {
  if (env.NODE_ENV === "production") return res.status(403).json({ message: "Demo data is disabled in production." });
  const o = owner(req);
  if (await Dish.exists({ owner: o })) return res.status(409).json({ message: "You already have dishes." });
  const D: [string, number, number, number, number][] = [["Steamed rice", 60, 2.7, 42, 6], ["Dal tadka", 90, 1.9, 30, 3.4], ["Paneer curry", 320, 5.4, 18, 2.8], ["Chapati", 70, 1.4, 40, 3.5], ["Fresh salad", 80, 0.7, 12, 2.8]];
  let rnd = 7; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  for (const [name, cost, co2, cooked, w] of D) {
    const dish = await Dish.create({ owner: o, name, costPerKg: cost, co2ePerKg: co2, chillHours: name === "Paneer curry" ? 12 : name === "Fresh salad" ? 6 : 24 });
    for (let i = 28; i >= 1; i--) {
      const t = Date.now() - i * 864e5, date = day(new Date(t)), wk = new Date(t).getUTCDay(), f = wk === 5 ? 1.18 : wk === 0 ? 0.85 : 1;
      await MenuEntry.create({ owner: o, dish: dish._id, date, cookedKg: +(cooked * (0.95 + R() * 0.1)).toFixed(1), headcount: 300 });
      await WasteRecord.create({ owner: o, dish: dish._id, grams: Math.round(w * f * (0.7 + R() * 0.6) * 1000), model: "synthetic", synthetic: true, ts: new Date(date + "T12:00:00Z") });
    }
  }
  res.status(201).json({ ok: true, note: "Synthetic demo data loaded. It is labeled as such in reports." });
};
