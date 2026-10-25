import { User } from "../models/userModel";
import { FoodModel } from "../models/foodModel";
import { env } from "../config/env";
import { haversineKm, etaMinutes } from "./kitchen/geo";
import { routeMatrix } from "./kitchen/routes";
import { canOffer, remainingMinutes } from "./kitchen/safety";

export interface NGOScore {
  ngoId: string; name: string; distance: number; etaMin: number;
  expiryUrgency: number; foodTypeScore: number; finalScore: number; eligible: boolean; source: "google-maps" | "estimate"; reason?: string;
}

// GeoJSON stores [lng, lat]. Reads without mutating the document (the old code reversed arrays in place).
const point = (c: number[] | undefined) => ({ lng: c?.[0] ?? 0, lat: c?.[1] ?? 0 });
const hasLocation = (p: { lat: number; lng: number }) => !(p.lat === 0 && p.lng === 0);

/** Ranks receivers by distance, expiry urgency and food type, and applies the food-safety rule (SRS FR-SFC-04). */
export const findBestNGOsForFood = async (foodId: string): Promise<NGOScore[]> => {
  const food = await FoodModel.findById(foodId);
  if (!food) throw new Error("Food not found");
  const origin = point(food.location?.coordinates);
  const ngos = await User.find({ role: "receiver" });
  const located = ngos.map((n) => ({ n, p: point(n.location?.coordinates) }));
  const legs = hasLocation(origin) ? await routeMatrix(origin, located.map((x) => x.p)) : located.map(() => null);
  const remaining = remainingMinutes(food.expirationDate);
  const urgencyWeight = remaining <= 360 ? 1.5 : remaining <= 720 ? 1.2 : 1;

  const results: NGOScore[] = located.map(({ n, p }, i) => {
    const known = hasLocation(origin) && hasLocation(p);
    const leg = known ? legs[i] ?? null : null;
    const km = known ? leg?.km ?? haversineKm(origin, p) : 0;
    const eta = known ? (leg ? Math.round(8 + leg.minutes) : etaMinutes(km)) : 0; // 8 min = loading and handover
    const typeMatch = ((n as any).preferences as string[] | undefined)?.includes(food.type) ? 1.2 : 1;
    let reason: string | undefined;
    if (!known) reason = "Location not set";
    else if (!canOffer(remaining, eta)) reason = "Would expire before delivery";
    return {
      ngoId: n.id.toString(), name: n.name, distance: Math.round(km * 10) / 10, etaMin: eta, expiryUrgency: urgencyWeight, foodTypeScore: typeMatch,
      finalScore: (1 / (km + 1)) * urgencyWeight * typeMatch, eligible: !reason, source: leg ? "google-maps" : "estimate", ...(reason ? { reason } : {}),
    };
  });
  return results.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.finalScore - a.finalScore);
};
