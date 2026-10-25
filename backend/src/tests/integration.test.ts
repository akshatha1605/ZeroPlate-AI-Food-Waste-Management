import "./setup";
// Runs against a real MongoDB-compatible server: INTEGRATION_DB=mongodb://127.0.0.1:27017/zp_test npm run test:integration
if (process.env.INTEGRATION_DB) {
  process.env.DB_HOST = process.env.INTEGRATION_DB;
  process.env.ADMIN_EMAIL = "admin@zp.test"; process.env.ADMIN_PASSWORD = "AdminPass2026";
  process.env.AUTH_RATE_LIMIT = "1000";
}
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { io as ioc } from "socket.io-client";
import { server } from "../app";
import { bootstrapAdmin } from "../utils/bootstrapAdmin";
import { expireFoods } from "../cronJob";
import { FoodModel } from "../models/foodModel";
import { User } from "../models/userModel";
import { generateToken } from "../utils/generateToken";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 140 }, (_, i) => (i * 7) % 251)]).toString("base64");
let base = "";
const call = async (m: string, p: string, body?: unknown, t?: string) => {
  const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json", ...(t ? { authorization: "Bearer " + t } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { s: r.status, j: (await r.json().catch(() => ({}))) as any };
};
const pw = "LongPass12345";
const signup = (name: string, email: string, role: string, lat?: number, lng?: number) =>
  call("POST", "/api/auth/signup", { name, email, password: pw, role, ...(lat !== undefined ? { location: { type: "Point", coordinates: [lng, lat] } } : {}) });
const login = async (email: string, password = pw): Promise<string> => (await call("POST", "/api/auth/login", { email, password })).j.user?.token ?? "";

test("full flow against a real database", { skip: !process.env.INTEGRATION_DB }, async (t) => {
  await mongoose.connect(process.env.INTEGRATION_DB!);
  await mongoose.connection.dropDatabase();
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as any).port}`;
  t.after(async () => { server.close(); await mongoose.disconnect(); });

  let admin = "", donorA = "", donorB = "", r1 = "", r2 = "", dishId = "", foodId = "";

  await t.test("first admin is created from the environment and can log in", async () => {
    await bootstrapAdmin();
    admin = await login("admin@zp.test", "AdminPass2026");
    assert.ok(admin);
  });
  await t.test("signup stores the submitted location (original code discarded it)", async () => {
    assert.equal((await signup("Kitchen A", "a@zp.test", "donor", 12.9716, 77.5946)).s, 201);
    assert.equal((await signup("Kitchen B", "b@zp.test", "donor", 13.0, 77.6)).s, 201);
    assert.equal((await signup("Near NGO", "r1@zp.test", "receiver", 12.99, 77.61)).s, 201);
    assert.equal((await signup("Far NGO", "r2@zp.test", "receiver", 14.5, 78.9)).s, 201);
    assert.equal((await signup("No-location NGO", "r3@zp.test", "receiver")).s, 201);
    donorA = await login("a@zp.test"); donorB = await login("b@zp.test"); r1 = await login("r1@zp.test"); r2 = await login("r2@zp.test");
    const u = await User.findOne({ email: "r1@zp.test" });
    assert.deepEqual(u?.location.coordinates, [77.61, 12.99]);
  });
  await t.test("signup as admin is refused; duplicate email refused", async () => {
    assert.equal((await signup("Evil", "e@zp.test", "admin")).s, 400);
    assert.equal((await signup("Dup", "a@zp.test", "donor")).s, 400);
  });
  await t.test("kitchen: demo data, dishes, forecast with backtest", async () => {
    assert.equal((await call("POST", "/api/kitchen/demo-seed", {}, donorA)).s, 201);
    const d = await call("GET", "/api/kitchen/dishes", undefined, donorA);
    assert.equal(d.j.dishes.length, 5); dishId = d.j.dishes[0]._id;
    const f = await call("GET", "/api/kitchen/forecast", undefined, donorA);
    assert.equal(f.j.forecasts.length, 5);
    assert.ok(f.j.forecasts.every((x: any) => x.ok && x.recKg > 0 && x.mape < x.naiveMape), JSON.stringify(f.j.forecasts[0]));
    assert.equal((await call("POST", "/api/kitchen/forecast/decision", { dishId, decision: "accept" }, donorA)).s, 200);
  });
  await t.test("kitchen: photo analysis, save waste, fingerprint, impact, simulator", async () => {
    assert.equal((await call("POST", "/api/kitchen/waste/analyze", { image: Buffer.from("not an image ".repeat(20)).toString("base64"), mime: "image/jpeg" }, donorA)).s, 400);
    const a = await call("POST", "/api/kitchen/waste/analyze", { image: JPEG, mime: "image/jpeg" }, donorA);
    assert.equal(a.s, 200); assert.ok(a.j.items.length >= 1);
    const save = await call("POST", "/api/kitchen/waste", { items: a.j.items.map((i: any) => ({ dishId: i.dishId, grams: i.grams, confidence: i.confidence })), model: a.j.model }, donorA);
    assert.equal(save.s, 201);
    assert.equal((await call("POST", "/api/kitchen/waste", { items: [{ dishId, grams: 0 }] }, donorA)).s, 400);
    const fp = await call("GET", `/api/kitchen/waste/fingerprint/${dishId}`, undefined, donorA);
    assert.equal(fp.s, 200); assert.equal(fp.j.byWeekday.length, 7);
    const im = await call("GET", "/api/kitchen/impact?days=30", undefined, donorA);
    assert.ok(im.j.totalKg > 0 && im.j.dishes[0].syntheticRecords > 0 && im.j.trend.length > 0);
    const sim = await call("POST", "/api/kitchen/simulate", { dishId, pct: 10 }, donorA);
    assert.ok(sim.j.kgPerWeek > 0);
  });
  await t.test("kitchens are isolated from each other", async () => {
    assert.equal((await call("GET", "/api/kitchen/dishes", undefined, donorB)).j.dishes.length, 0);
    assert.equal((await call("GET", `/api/kitchen/waste/fingerprint/${dishId}`, undefined, donorB)).s, 404);
    assert.equal((await call("POST", "/api/kitchen/simulate", { dishId, pct: 10 }, donorB)).s, 404);
    assert.equal((await call("GET", "/api/kitchen/dishes", undefined, r1)).s, 403); // receivers have no kitchen
  });
  await t.test("surplus: checklist, safe window, and NGO eligibility by safety clock", async () => {
    const body = { dishId, kg: 8, storage: "hot", hoursAgo: 1, pickupLocation: "Gate 1", checklist: { covered: true, temperature: true, allergens: true } };
    assert.equal((await call("POST", "/api/kitchen/surplus", { ...body, checklist: { covered: true, temperature: true, allergens: false } }, donorA)).s, 400);
    assert.equal((await call("POST", "/api/kitchen/surplus", { ...body, hoursAgo: 5 }, donorA)).s, 400);
    const ok = await call("POST", "/api/kitchen/surplus", body, donorA);
    assert.equal(ok.s, 201); foodId = ok.j.food._id;
    assert.deepEqual(ok.j.recommendedNGOs.map((n: any) => n.name), ["Near NGO"]);
    const why = Object.fromEntries(ok.j.notEligible.map((n: any) => [n.name, n.reason]));
    assert.equal(why["Far NGO"], "Would expire before delivery");
    assert.equal(why["No-location NGO"], "Location not set");
    assert.ok(ok.j.remainingMinutes > 170 && ok.j.remainingMinutes <= 180);
  });
  await t.test("claim flow: atomic, one winner, owner notified over an authenticated socket", async () => {
    const noAuth = ioc(base, { transports: ["websocket"], reconnection: false });
    await new Promise<void>((res) => noAuth.on("connect_error", () => res())); noAuth.close();
    const sock = ioc(base, { auth: { token: donorA }, transports: ["websocket"] });
    await new Promise<void>((res) => sock.on("connect", () => res()));
    const got = new Promise<any>((res) => sock.on("claimCreated", res));
    const avail = await call("GET", "/api/foods/available", undefined, r1);
    assert.ok(avail.j.food.some((f: any) => f._id === foodId));
    const [c1, c2] = await Promise.all([call("POST", "/api/claims", { foodId }, r1), call("POST", "/api/claims", { foodId }, r2)]);
    assert.deepEqual([c1.s, c2.s].sort(), [201, 409]);
    assert.equal((await got).foodTitle, avail.j.food.find((f: any) => f._id === foodId).title);
    sock.close();
    assert.equal((await FoodModel.findById(foodId))?.status, "claimed");
  });
  await t.test("expiry sweep marks lapsed food and expired food cannot be claimed", async () => {
    const donor = await User.findOne({ email: "a@zp.test" });
    const f = await FoodModel.create({ title: "Old", quantity: 3, expirationDate: new Date(Date.now() - 1000), pickupLocation: "x", donor: donor!._id, status: "available" });
    await expireFoods();
    assert.equal((await FoodModel.findById(f._id))?.status, "expired");
    assert.equal((await call("POST", "/api/claims", { foodId: f.id }, r1)).s, 409);
  });
  await t.test("ownership: donors cannot edit others' listings or set status", async () => {
    assert.equal((await call("PATCH", `/api/foods/update-foodItem/${foodId}`, { title: "Hacked" }, donorB)).s, 404);
    const mine = await call("PATCH", `/api/foods/update-foodItem/${foodId}`, { title: "Renamed", status: "available", donor: "x".repeat(24) }, donorA);
    assert.equal(mine.s, 200);
    const after = await FoodModel.findById(foodId);
    assert.equal(after?.title, "Renamed"); assert.equal(after?.status, "claimed"); // status in the body is ignored
    assert.equal((await call("DELETE", `/api/foods/delete-foodItem/${foodId}`, undefined, donorB)).s, 404);
  });
  await t.test("role changes: admin only, and Google users choose once, never admin", async () => {
    assert.equal((await call("PUT", "/api/auth/update-role", { role: "admin" }, donorA)).s, 400);
    assert.equal((await call("PUT", "/api/auth/update-role", { role: "donor" }, donorA)).s, 403); // already chosen
    const g = await User.create({ name: "G", email: "g@zp.test", googleId: "g1", provider: "google", role: "receiver", roleChosen: false, location: { type: "Point", coordinates: [0, 0] } });
    const gt = generateToken(g.email, g.role, g.id);
    assert.equal((await call("PUT", "/api/auth/update-role", { role: "donor" }, gt)).s, 200);
    assert.equal((await call("PUT", "/api/auth/update-role", { role: "receiver" }, gt)).s, 403);
    assert.equal((await call("PUT", `/api/admin/role/${g.id}`, { role: "volunteer" }, donorA)).s, 403);
    assert.equal((await call("PUT", `/api/admin/role/${g.id}`, { role: "volunteer" }, admin)).s, 200);
    assert.equal((await call("PUT", "/api/auth/location", { lat: 12.9, lng: 77.5 }, gt)).s, 200);
  });
  await t.test("session endpoint hands the SPA its token (used after Google sign-in)", async () => {
    const r = await call("GET", "/api/auth/session", undefined, donorA);
    assert.equal(r.s, 200); assert.ok(r.j.user.token); assert.equal(r.j.user.role, "donor"); assert.equal(r.j.user.isNewUser, false);
  });
  await t.test("admin-only analytics are protected", async () => {
    assert.equal((await call("GET", "/api/analytics/getAnalytics", undefined, donorA)).s, 403);
    assert.notEqual((await call("GET", "/api/analytics/getAnalytics", undefined, admin)).s, 403);
  });
});
