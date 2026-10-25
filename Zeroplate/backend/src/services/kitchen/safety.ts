// Food-safety clock rules (SRS FR-SFC). Defaults are conservative and configurable per dish.
export type Storage = "hot" | "chill" | "amb";
export interface SafeHours { hotHours: number; chillHours: number; ambHours: number }
export const BUFFER_MIN = 30;

export const windowHours = (d: SafeHours, s: Storage): number => ({ hot: d.hotHours, chill: d.chillHours, amb: d.ambHours }[s]);
// Time the food stops being safe, given how long ago it was prepared.
export const expiresAt = (hoursAgo: number, windowHrs: number, now = Date.now()): number => now + (windowHrs - hoursAgo) * 3600000;
export const remainingMinutes = (expiry: number | Date, now = Date.now()): number => Math.floor((new Date(expiry).getTime() - now) / 60000);
// A batch may only be offered if it will still be safe after pickup and delivery plus a buffer.
export const canOffer = (remainingMin: number, etaMin: number, bufferMin = BUFFER_MIN): boolean => remainingMin - etaMin - bufferMin > 0;
export const urgency = (remainingMin: number): "high" | "medium" | "low" => (remainingMin < 90 ? "high" : remainingMin < 240 ? "medium" : "low");
