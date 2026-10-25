// Demand forecasting (SRS FR-DFR). Blend of 7-day average and same-weekday consumption, backtested on the last 7 days.
export interface DayPoint { date: string; cooked: number; waste: number; headcount?: number | undefined }
export interface Context { expectedHeadcount?: number | undefined; adjustPct?: number | undefined }
export const MIN_DAYS = 14;
export const MODEL_VERSION = "blend-v1";
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export const predictAt = (u: number[], i: number): number => {
  const avg = mean(u.slice(Math.max(0, i - 7), i));
  const same = i >= 7 ? u[i - 7] : undefined;
  return same === undefined ? avg : 0.5 * avg + 0.5 * same;
};

export const backtest = (u: number[]) => {
  const mm: number[] = [], nm: number[] = [], err: number[] = [];
  for (let i = Math.max(7, u.length - 7); i < u.length; i++) {
    const a = u[i] ?? 0;
    if (a <= 0) continue;
    const p = predictAt(u, i), naive = u[i - 7] ?? 0;
    err.push(a - p); mm.push(Math.abs(a - p) / a); nm.push(Math.abs(a - naive) / a);
  }
  return { mape: mean(mm) * 100, naiveMape: mean(nm) * 100, sd: Math.sqrt(mean(err.map((e) => e * e))), n: mm.length };
};

export type ForecastResult =
  | { ok: false; error: string }
  | { ok: true; recKg: number; lower: number; upper: number; prevCookedKg: number; expectedReductionKg: number; mape: number; naiveMape: number; modelVersion: string };

export function forecastDish(points: DayPoint[], ctx: Context = {}): ForecastResult {
  if (points.length < MIN_DAYS) return { ok: false, error: `Needs at least ${MIN_DAYS} days of data (have ${points.length})` };
  const u = points.map((p) => p.cooked - p.waste);
  const heads = points.slice(-7).map((p) => p.headcount).filter((h): h is number => typeof h === "number" && h > 0);
  const hf = ctx.expectedHeadcount && heads.length ? Math.min(1.5, Math.max(0.5, ctx.expectedHeadcount / mean(heads))) : 1;
  const factor = hf * (1 + (ctx.adjustPct ?? 0) / 100);
  const bt = backtest(u), rec = predictAt(u, u.length) * 1.08 * factor, prev = points[points.length - 1]?.cooked ?? 0;
  return {
    ok: true, recKg: r1(rec), lower: r1(Math.max(0, rec - 1.28 * bt.sd * factor)), upper: r1(rec + 1.28 * bt.sd * factor),
    prevCookedKg: prev, expectedReductionKg: r1(prev - rec), mape: r1(bt.mape), naiveMape: r1(bt.naiveMape), modelVersion: MODEL_VERSION,
  };
}
