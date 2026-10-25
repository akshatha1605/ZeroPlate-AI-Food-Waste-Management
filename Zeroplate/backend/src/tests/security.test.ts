import "./setup";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "http";
import { server } from "../app";

// Regression tests for the flaws found in the original repo. None of these requests reach the database.
let base = "";
before(async () => { await new Promise<void>((r) => server.listen(0, r)); base = `http://localhost:${(server.address() as any).port}`; });
after(() => { server.close(); });
const post = (p: string, body: unknown, method = "POST") => fetch(base + p, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("public signup cannot create an admin", async () => {
  const r = await post("/api/auth/signup", { name: "Mallory", email: "m@x.io", password: "LongPass12345", role: "admin" });
  assert.equal(r.status, 400);
});
test("update-role requires login (was unauthenticated)", async () => {
  assert.equal((await post("/api/auth/update-role", { role: "admin" }, "PUT")).status, 401);
});
test("admin role endpoint requires a token", async () => {
  assert.equal((await post("/api/admin/role/" + "a".repeat(24), { role: "admin" }, "PUT")).status, 401);
});
test("NoSQL operator in login is rejected", async () => {
  assert.equal((await post("/api/auth/login", { email: { $gt: "" }, password: { $gt: "" } })).status, 400);
});
test("kitchen and food routes require login", async () => {
  assert.equal((await fetch(base + "/api/kitchen/dishes")).status, 401);
  assert.equal((await fetch(base + "/api/foods")).status, 401);
});
test("security headers on, x-powered-by off, health ok, unknown route 404", async () => {
  const r = await fetch(base + "/healthz");
  assert.equal(r.status, 200);
  assert.ok(r.headers.get("x-content-type-options"));
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal((await fetch(base + "/nope")).status, 404);
});
test("Google sign-in reports 'not configured' instead of crashing", async () => {
  assert.equal((await fetch(base + "/api/auth/google", { redirect: "manual" })).status, 503);
});
test("session endpoint requires login", async () => {
  assert.equal((await fetch(base + "/api/auth/session")).status, 401);
});
test("errors are handled by the error middleware (registered after routes)", async () => {
  const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad json" });
  assert.equal(r.status, 400);
});
