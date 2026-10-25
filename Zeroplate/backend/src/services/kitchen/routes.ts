import axios from "axios";
import { env } from "../../config/env";
import { LatLng } from "./geo";

// Google Routes API (computeRouteMatrix). The older Distance Matrix API is legacy and unavailable to new projects.
export interface RouteLeg { km: number; minutes: number }
const ENDPOINT = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const wp = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

export const buildMatrixBody = (origin: LatLng, dests: LatLng[]) => ({ origins: [wp(origin)], destinations: dests.map(wp), travelMode: "DRIVE" });

// proto3 JSON omits zero values, so a missing destinationIndex means 0 and a missing status.code means OK.
export const parseMatrix = (data: unknown, n: number): (RouteLeg | null)[] => {
  const out: (RouteLeg | null)[] = Array.from({ length: n }, () => null);
  if (!Array.isArray(data)) return out;
  for (const el of data as any[]) {
    const i = el?.destinationIndex ?? 0;
    if (i < 0 || i >= n || el?.status?.code || (el?.condition && el.condition !== "ROUTE_EXISTS")) continue;
    const sec = parseFloat(String(el?.duration ?? "").replace("s", ""));
    if (!Number.isFinite(sec) || typeof el?.distanceMeters !== "number") continue;
    out[i] = { km: el.distanceMeters / 1000, minutes: sec / 60 };
  }
  return out;
};

export async function routeMatrix(origin: LatLng, dests: LatLng[]): Promise<(RouteLeg | null)[]> {
  if (!env.GOOGLE_MAPS_API_KEY || !dests.length) return dests.map(() => null);
  const out: (RouteLeg | null)[] = [];
  try {
    for (let i = 0; i < dests.length; i += 50) { // stay well inside the per-request element limit
      const chunk = dests.slice(i, i + 50);
      const r = await axios.post(ENDPOINT, buildMatrixBody(origin, chunk), {
        timeout: 8000,
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition" },
      });
      out.push(...parseMatrix(r.data, chunk.length));
    }
    return out;
  } catch (e: any) {
    console.warn("Google Routes API failed, using straight-line estimates:", e?.response?.data?.error?.message ?? e?.message);
    return dests.map(() => null);
  }
}
