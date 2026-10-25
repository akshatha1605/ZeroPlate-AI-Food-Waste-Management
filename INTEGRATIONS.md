# Enabling Google sign-in, Google Maps and Groq photo analysis

Edit `backend/.env`, save, then restart the backend (type `rs` in the nodemon terminal). Use your own backend port in place of 5001.

## 1. Groq photo analysis (Measure tab)
1. Create a key at https://console.groq.com/keys.
2. Add `GROQ_API_KEY=gsk_...` to `.env`. Leave `VISION_PROVIDER=auto` (Groq is used when its key is set).
3. Default model is `qwen/qwen3.8-27b`. Groq changes its model list; if you see a "model not found" message, pick a current vision model from https://console.groq.com/docs/vision and set `GROQ_VISION_MODEL`.
4. Check: on Measure, analyze a food photo. Real results show no "placeholder" note. If Groq fails, an amber message shows the reason and the page falls back to the placeholder estimator.

## 2. Google Maps distances (Surplus tab)
Uses the **Routes API** (the older Distance Matrix API is legacy and unavailable to new projects).
1. In Google Cloud Console, create or choose a project and enable billing (Maps has a free monthly allowance).
2. Enable **Routes API** under APIs & Services > Library.
3. Create an API key under Credentials and restrict it to Routes API.
4. Add `GOOGLE_MAPS_API_KEY=...` to `.env`.
5. Check: list a surplus. The server's `/api/kitchen/surplus` response shows `"source":"google-maps"` for each NGO, and travel times come from real roads. If the key or API is wrong, the server logs "Google Routes API failed" and uses straight-line estimates.

## 3. Google sign-in
1. Google Cloud Console > APIs & Services > OAuth consent screen (also called Google Auth Platform): set an app name and support email, choose External, and add your own Google account as a test user.
2. Credentials > Create credentials > OAuth client ID > Web application.
3. Authorized redirect URI (must match exactly): `http://localhost:5001/api/auth/google/callback`.
4. Add to `.env`:
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   OAUTH_CALLBACK_URL=http://localhost:5001/api/auth/google/callback
   ```
5. Check: on the login page click **Continue with Google**. A new Google user is asked to choose a role once (donor, receiver or volunteer) and can never become admin. After signing in, set a location with `PUT /api/auth/location` (receivers without one are never matched).
