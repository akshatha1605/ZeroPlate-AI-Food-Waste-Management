import "./setup";
process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.OAUTH_CALLBACK_URL = "http://localhost:5001/api/auth/google/callback";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { server } from "../app";

// With Google credentials present, the sign-in route must send the browser to Google with the right parameters.
let base = "";
before(async () => { await new Promise<void>((r) => server.listen(0, r)); base = `http://localhost:${(server.address() as any).port}`; });
after(() => { server.close(); });

test("GET /api/auth/google redirects to Google's consent screen", async () => {
  const r = await fetch(base + "/api/auth/google", { redirect: "manual" });
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get("location")!);
  assert.equal(loc.host, "accounts.google.com");
  assert.equal(loc.searchParams.get("client_id"), "test-client-id.apps.googleusercontent.com");
  assert.equal(loc.searchParams.get("redirect_uri"), "http://localhost:5001/api/auth/google/callback");
  assert.match(loc.searchParams.get("scope") ?? "", /profile/);
  assert.match(loc.searchParams.get("scope") ?? "", /email/);
});
