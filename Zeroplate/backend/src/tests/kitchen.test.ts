import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { forecastDish, backtest, DayPoint, MIN_DAYS } from "../services/kitchen/forecast";
import { windowHours, expiresAt, remainingMinutes, canOffer, urgency } from "../services/kitchen/safety";
import { simulate } from "../services/kitchen/simulate";
import { haversineKm, etaMinutes } from "../services/kitchen/geo";
import { isRealImage, mockEstimate, parseVisionJson, buildPrompt } from "../services/kitchen/vision";
import { parseMatrix, buildMatrixBody } from "../services/kitchen/routes";
import { sanitizeBody } from "../middlewares/sanitize";
import * as s from "../validation/schemas";

const series = (n: number): DayPoint[] =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), cooked: 40 + (i % 7), waste: 5 + (i % 3), headcount: 300 }));

test("forecast needs enough history", () => {
  const r = forecastDish(series(MIN_DAYS - 1));
  assert.equal(r.ok, false);
});
test("forecast returns a sensible quantity and range", () => {
  const r = forecastDish(series(28));
  assert.ok(r.ok);
  if (r.ok) { assert.ok(r.recKg > 30 && r.recKg < 60); assert.ok(r.lower <= r.recKg && r.recKg <= r.upper); assert.equal(r.modelVersion, "blend-v1"); }
});
test("forecast scales with expected headcount", () => {
  const a = forecastDish(series(28)), b = forecastDish(series(28), { expectedHeadcount: 450 });
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.ok(b.recKg > a.recKg);
});
test("forecast beats the naive baseline on noisy daily demand (averaged over 200 simulated kitchens)", () => {
  // Averaging smooths day-to-day noise. (On a perfectly periodic series the naive guess can win; that is expected.)
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let m = 0, n = 0;
  for (let k = 0; k < 200; k++) { const bt = backtest(Array.from({ length: 35 }, () => 40 + (rnd() - 0.5) * 8)); m += bt.mape; n += bt.naiveMape; }
  assert.ok(m < n, `model ${(m / 200).toFixed(2)}% vs naive ${(n / 200).toFixed(2)}%`);
});
test("safety clock: window, expiry and offer rule (AC-03)", () => {
  const d = { hotHours: 4, chillHours: 24, ambHours: 2 };
  assert.equal(windowHours(d, "hot"), 4);
  const now = 1_000_000_000_000, exp = expiresAt(1, 4, now);
  assert.equal(remainingMinutes(exp, now), 180);
  assert.equal(canOffer(42, 22), false); // 42 min left, 22 min trip, 30 min buffer
  assert.equal(canOffer(180, 22), true);
  assert.equal(urgency(60), "high"); assert.equal(urgency(200), "medium"); assert.equal(urgency(600), "low");
});
test("simulator caps savings at actual waste (AC-05)", () => {
  const pts = series(28);
  const r = simulate(pts, { costPerKg: 100, co2ePerKg: 2, pct: 10 });
  assert.ok(r.kgPerWeek > 0 && r.costInr === Math.round(r.kgPerWeek * 100));
  const big = simulate(pts, { costPerKg: 100, co2ePerKg: 2, pct: 100 });
  assert.ok(big.kgPerWeek <= (5 + 1) * 7); // cannot exceed average weekly waste
});
test("geo helpers", () => {
  assert.ok(Math.abs(haversineKm({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9716, lng: 77.5946 })) < 0.001);
  assert.equal(etaMinutes(10), 48);
});
test("image signature check rejects fake files", () => {
  assert.equal(isRealImage(Buffer.from("hello world, definitely not an image").toString("base64")), false);
  assert.equal(isRealImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(20).fill(1)]).toString("base64")), true);
  assert.ok(mockEstimate("abcdef".repeat(50), [{ id: "a" }, { id: "b" }, { id: "c" }]).length >= 1);
});
test("sanitizer strips NoSQL operator keys", () => {
  const req: any = { body: { email: { $gt: "" }, ok: "x", "a.b": 1 } };
  sanitizeBody(req, {} as any, () => {});
  assert.deepEqual(req.body, { email: {}, ok: "x" });
});
test("signup schema never allows admin and enforces password strength", () => {
  assert.equal(s.signupSchema.safeParse({ name: "A", email: "a@b.co", password: "LongPass12345", role: "admin" }).success, false);
  assert.equal(s.signupSchema.safeParse({ name: "A", email: "a@b.co", password: "short1", role: "donor" }).success, false);
  assert.equal(s.signupSchema.safeParse({ name: "A", email: "a@b.co", password: "LongPass12345", role: "donor" }).success, true);
});
test("surplus schema requires the full hygiene checklist", () => {
  const base = { dishId: "a".repeat(24), kg: 8, storage: "hot", pickupLocation: "Gate 1" };
  assert.equal(s.surplusSchema.safeParse({ ...base, checklist: { covered: true, temperature: true, allergens: false } }).success, false);
  assert.equal(s.surplusSchema.safeParse({ ...base, checklist: { covered: true, temperature: true, allergens: true } }).success, true);
});

const DISHES = [{ id: "a1", name: "Steamed rice" }, { id: "b2", name: "Dal tadka" }];
test("vision parser maps dish names to ids and clamps values", () => {
  const r = parseVisionJson('{"items":[{"dish":"steamed RICE","grams":180.4,"confidence":88},{"dish":"Dal tadka","grams":99999,"confidence":150}]}', DISHES);
  assert.deepEqual(r, [{ dishId: "a1", grams: 180, confidence: 88 }, { dishId: "b2", grams: 20000, confidence: 100 }]);
});
test("vision parser tolerates reasoning blocks, code fences and bare arrays", () => {
  const r = parseVisionJson('<think>let me look</think>\n```json\n[{"dish":"Dal tadka","grams":120,"confidence":70}]\n```', DISHES);
  assert.deepEqual(r, [{ dishId: "b2", grams: 120, confidence: 70 }]);
});
test("vision parser drops unknown dishes, bad grams and duplicates; throws on no JSON", () => {
  assert.deepEqual(parseVisionJson('{"items":[{"dish":"Pizza","grams":100},{"dish":"Dal tadka","grams":0},{"dish":"Dal tadka","grams":50},{"dish":"Dal tadka","grams":60}]}', DISHES).length, 1);
  assert.throws(() => parseVisionJson("I cannot see any food", DISHES));
  assert.ok(buildPrompt(DISHES).includes("Steamed rice, Dal tadka"));
});
test("Google Routes response parsing handles omitted zero fields, failures and unreachable routes", () => {
  const legs = parseMatrix([
    { distanceMeters: 2500, duration: "600s", status: {}, condition: "ROUTE_EXISTS" },                       // destinationIndex 0 is omitted by proto3 JSON
    { destinationIndex: 1, status: { code: 5 } },                                                              // not found
    { destinationIndex: 2, condition: "ROUTE_NOT_FOUND" },
    { destinationIndex: 3, distanceMeters: 12000, duration: "1500.5s", condition: "ROUTE_EXISTS" },
  ], 5);
  assert.deepEqual(legs[0], { km: 2.5, minutes: 10 });
  assert.equal(legs[1], null); assert.equal(legs[2], null);
  assert.equal(legs[3]?.km, 12); assert.ok(Math.abs((legs[3]?.minutes ?? 0) - 25.008) < 0.01);
  assert.equal(legs[4], null); assert.deepEqual(parseMatrix("oops", 2), [null, null]);
  const body = buildMatrixBody({ lat: 1, lng: 2 }, [{ lat: 3, lng: 4 }]);
  assert.equal(body.travelMode, "DRIVE"); assert.equal(body.destinations[0]!.waypoint.location.latLng.latitude, 3);
});
