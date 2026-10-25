import { DayPoint } from "./forecast";
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

// What-if: cook pct% less (all days, or one weekday). Savings are capped at average waste so servings are not cut.
export function simulate(points: DayPoint[], o: { costPerKg: number; co2ePerKg: number; pct: number; weekday?: number | undefined }) {
  const sel = o.weekday === undefined ? points : points.filter((p) => new Date(p.date + "T00:00:00Z").getUTCDay() === o.weekday);
  const perWeek = o.weekday === undefined ? 7 : 1;
  const cooked = mean(sel.map((p) => p.cooked)) * perWeek, waste = mean(sel.map((p) => p.waste)) * perWeek;
  const kg = Math.min((cooked * o.pct) / 100, waste);
  return {
    kgPerWeek: r1(kg), costInr: Math.round(kg * o.costPerKg), co2eKg: r1(kg * o.co2ePerKg),
    factors: { costPerKg: o.costPerKg, co2ePerKg: o.co2ePerKg },
    assumption: "Savings are capped at average waste, so servings are not reduced.",
  };
}
