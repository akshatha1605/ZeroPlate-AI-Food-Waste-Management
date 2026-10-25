# ZeroPlate: security fixes and kitchen features

## Security and bug fixes (found by reading the original code)
| Problem | Fix |
|---|---|
| Signup accepted `role: "admin"` from the request body | Public signup allows donor, receiver, volunteer only. First admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. |
| `PUT /auth/update-role` had no authentication, so anyone could change any user's role | Requires login, applies to the caller only, only once for new Google users, never to admin |
| `PUT /admin/role/:id` had no `verifyToken` and no role validation | Added both, plus audit log entry |
| Passwords and hashes printed to the console on signup and login | Removed all credential and user logging |
| Zod installed but unused | Zod validates every request body and the new query inputs |
| NoSQL operator injection (`{"$gt": ""}`) possible | Body sanitizer plus Zod types |
| Error handler registered before routes, so it never ran | Registered last; hides internals in production |
| Socket.IO server never listened (attached to a different server) and trusted a client-supplied `userId` | Single server; sockets verify the JWT and users only receive their own events |
| Cookies `secure: true` broke local http; CORS fixed to localhost | Secure only in production; CORS from `FRONTEND_URL` |
| Login limiter allowed 80 tries per 15 minutes | 10 per 15 minutes on login and signup |
| Any donor could edit or delete any listing; PATCH accepted `status` and `donor` | Ownership checks and a field whitelist |
| Claiming was check-then-set (double claim possible) and could claim expired food | Atomic reservation; expired food rejected |
| Claim emails were sent to an ObjectId, not an address | Sends to the donor's email |
| Expiry cron filtered on `"avaialble"`, and cron and workers were never started | Fixed, started from `server.ts`; a minute-by-minute sweep marks expired food without Redis |
| Matching crashed without a Maps key, and reversed coordinates in place | Haversine fallback, no mutation, unlocated receivers marked ineligible |
| `npm start` ran `node dist/server.ts` | `node dist/server.js` |
| Signup ignored the location the form collects and stored `[0,0]` for everyone, so NGO matching could never work | Location is validated and stored; `PUT /api/auth/location` lets Google users set it |
| Redis was required even when unused; workers imported from the wrong path | `REDIS_ENABLED=false` runs without Redis; paths fixed; `REDIS_HOST` and `REDIS_PORT` supported |
| Google sign-in crashed the app when keys were missing; linked accounts by unverified email | Optional; links only verified Google emails |

## Integrations enabled (see INTEGRATIONS.md)
- **Groq photo analysis:** `GROQ_API_KEY`, default model `qwen/qwen3.8-27b` (JSON mode). Models are asked for dish names, which are mapped back to ids. If a provider fails the page shows why and falls back to the placeholder. Anthropic remains an option via `VISION_PROVIDER`.
- **Google Maps:** switched to the Routes API (`computeRouteMatrix`); the Distance Matrix API is legacy. Real road distance and time feed the safety-clock eligibility rule; each NGO reports `source: google-maps | estimate`.
- **Google sign-in:** the frontend callback needed a token in the URL, which the secure backend does not send. Added `GET /api/auth/session` (cookie-authenticated) and updated the callback page to use it.
- Not verified live (no keys or network access to these services here): the Groq call, the Routes call and the real Google consent flow. Parsing, request building, the redirect to Google and the session endpoint are covered by tests.

## ZeroPlate features added (donor = kitchen manager)
Backend `/api/kitchen/*`, Angular pages under `/donor/kitchen/*`:
- **Dishes** with cost, CO₂e and safe holding hours. Labeled synthetic demo data (non-production).
- **Measure waste:** photo to dish and gram estimate (Claude vision, or a labeled mock), review and edit, confidence flags, save.
- **Plan:** next-day cooking quantity with range and backtested error vs "same day last week"; accept or reject is logged; log cooked quantity and headcount.
- **Surplus with food-safety clock:** hygiene checklist required, safe window by storage, creates a normal listing that the existing claim flow uses. NGOs that cannot receive it in time are marked ineligible. Expiry is enforced server-side.
- **Impact:** period selector, trend, cost and CO₂e by dish with real vs synthetic counts, waste fingerprint (weekday and session), and a what-if simulator.
- Every kitchen query is scoped to the logged-in donor, so kitchens cannot see each other's data.

## How it was verified
- **Unit and HTTP tests:** `cd backend && npm test` runs the strict TypeScript compiler and 18 tests (forecast, safety clock, simulator, image signature, sanitizer, validation, and regressions for each security flaw). No database needed.
- **Integration test against a real database:** `INTEGRATION_DB=mongodb://127.0.0.1:27017/zp_test npm run test:integration` runs 12 end-to-end steps over HTTP: admin bootstrap, signup with location, demo data, forecast beating the baseline, photo analysis, waste save, fingerprint, impact, simulator, kitchen isolation, surplus with NGO eligibility by safety clock, an atomic double claim (one winner, one 409) with an authenticated socket notification, expiry sweep, ownership checks, and role rules. It passed against FerretDB 1.24 (a MongoDB-compatible server with a SQLite backend), because real MongoDB could not be installed in the sandbox. Please run it once against your own MongoDB.
- **Production boot:** the compiled server (`npm run build && npm start`) starts, creates the admin from the environment, rejects admin signup, and shuts down cleanly on SIGTERM.
- **Frontend:** `ng build` completes with no errors or warnings.

## Not verified (needs your environment)
Redis and the BullMQ workers, Google sign-in, Google Maps distances, SMTP email, and the live Anthropic vision call were not run. The Angular pages compile but were not clicked through in a browser.

## Known gaps
Volunteer role exists but has no pages. The frontend still keeps its JWT in localStorage (XSS-exposed); the httpOnly cookie is also set, so you can drop the localStorage token later. Photos are not stored. Receivers set their location at signup (or via `PUT /api/auth/location`); NGOs without one are never matched. Multi-kitchen means one donor account per kitchen. `EMAIL_PASS` is the variable the code reads, though the original README says `EMAIL_PASSWORD`.
