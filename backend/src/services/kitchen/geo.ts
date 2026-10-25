export interface LatLng { lat: number; lng: number }
export const haversineKm = (a: LatLng, b: LatLng): number => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
// Straight-line fallback used when the Google Maps API is unavailable.
export const etaMinutes = (km: number): number => Math.round(8 + km * 4);
