# ZeroPlate — Member 3: Surplus Donation & Food Safety

This module registers surplus food batches, calculates a server-side safety deadline, matches batches with nearby NGOs, and tracks donation offers through pickup and delivery. It uses FastAPI, local SQLite, public OSRM routing when available, and a plain HTML frontend. It does not require a paid API or API key.

## Requirements

- Python 3.10+
- Internet access is optional for the API and donation workflow. The route endpoint uses the free public OSRM service when reachable; OpenStreetMap map tiles also require internet access.
- No Gemini key or other secret is required by this module.

## Run on Windows PowerShell

From the project folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Start the integrated FastAPI app:

```powershell
python -m uvicorn app.main:app --reload --port 8001
```

Open the donation module at <http://127.0.0.1:8001/donation>. Interactive API docs are at <http://127.0.0.1:8001/docs>. If port `8001` is already in use, select another port and use that port in the URL.

The module database defaults to `zeroPlate_donation.db` in the project root. `.env.example` includes `DONATION_DATABASE_PATH`, the Coimbatore kitchen location, and configurable safety windows. Copying the example file is optional; all settings have code defaults.

Run the focused tests with:

```powershell
python -m pytest tests/test_donation.py -q
```

## API Endpoints

- `GET /api/donation/health` — module health and database counts.
- `POST /api/donation/batches` — register a surplus batch.
- `GET /api/donation/batches` — list batches; supports `status` and `limit` query parameters.
- `GET /api/donation/batches/{batch_id}` — retrieve one batch and its countdown.
- `POST /api/donation/batches/{batch_id}/check-safety` — refresh the safety state and expiry block.
- `GET /api/donation/batches/{batch_id}/matches` — rank active NGOs for a batch. Returns an empty match list for expired batches.
- `DELETE /api/donation/batches/{batch_id}` — delete a batch.
- `GET /api/donation/ngos` — list active and inactive NGOs, including sample entries.
- `POST /api/donation/donations` — offer a batch to one eligible NGO.
- `GET /api/donation/donations` — list donations; supports `status` and `limit` query parameters.
- `GET /api/donation/donations/{donation_id}` — retrieve donation, batch, NGO, and status history.
- `POST /api/donation/donations/{donation_id}/accept` — accept a matched offer.
- `POST /api/donation/donations/{donation_id}/reject` — reject a matched offer; optional JSON body can include `status_notes`.
- `POST /api/donation/donations/{donation_id}/status` — advance to `PICKED_UP` or `DELIVERED`.
- `GET /api/donation/donations/{donation_id}/route` — get route geometry, distance, ETA, and safety margin.

## Example Requests

Register a batch. `category` must be `hot`, `chilled`, or `room_temp`; `prepared_time` is optional and defaults to current UTC time.

```json
{
  "dish_name": "Vegetable rice",
  "quantity_grams": 1200,
  "category": "hot",
  "dietary_type": "veg",
  "prepared_time": "2026-10-25T10:00:00Z",
  "allergen_info": "Contains peanuts"
}
```

The response includes the computed safety deadline and countdown:

```json
{
  "success": true,
  "id": 17,
  "batch": {
    "id": 17,
    "dish_name": "Vegetable rice",
    "category": "hot",
    "prepared_time": "2026-10-25T10:00:00+00:00",
    "safe_until": "2026-10-25T14:00:00+00:00",
    "seconds_remaining": 11900,
    "safety_state": "safe",
    "can_donate": true
  }
}
```

List matches with `GET /api/donation/batches/17/matches`. Each match contains an NGO, a numeric `score`, `eligible`, distance, pickup ETA, and a plain-English `reason`. For example:

```json
{
  "success": true,
  "batch_id": 17,
  "count": 6,
  "matches": [
    {
      "ngo": {
        "id": 6,
        "name": "SAMPLE - Coimbatore Food Share",
        "is_sample": true
      },
      "eligible": true,
      "score": 100.0,
      "distance_km": 0.0,
      "eta_minutes": 21,
      "pickup_feasible": true,
      "reason": "Accepts hot food; Can handle 1.2 kg; 0.0 km away by straight-line distance; Pickup is feasible in about 21 minutes."
    }
  ]
}
```

Offer the batch to an eligible NGO using `POST /api/donation/donations`:

```json
{
  "batch_id": 17,
  "ngo_id": 6,
  "volunteer_name": "Asha",
  "volunteer_phone": "+91-90000-00000",
  "notes": "Pickup from the east entrance"
}
```

The offer response contains the created donation and starts its history:

```json
{
  "success": true,
  "donation": {
    "id": 42,
    "batch_id": 17,
    "ngo_id": 6,
    "status": "MATCHED",
    "history": [
      {
        "status": "MATCHED",
        "note": "Pickup from the east entrance",
        "created_at": "2026-10-25T10:05:00+00:00"
      }
    ]
  }
}
```

Advance the donation in order. `POST /api/donation/donations/42/accept` and `/reject` need no body (rejection may optionally include `{"status_notes":"Reason"}`). Then use `POST /api/donation/donations/42/status`:

```json
{
  "status": "PICKED_UP",
  "volunteer_name": "Asha",
  "status_notes": "Collected in insulated containers"
}
```

After pickup, send `{"status":"DELIVERED"}` to the same status endpoint. `GET /api/donation/donations/42` returns the current state and the full timestamped history.

Get a donation route with `GET /api/donation/donations/42/route`. When OSRM responds, `routing_source` is `osrm_open_routing`, `is_estimate` is false, and the response includes OSRM geometry, road distance, and drive duration. If OSRM fails or returns no route geometry, the endpoint returns haversine straight-line distance and ETA at an assumed average speed, with `routing_source: "straight_line_estimate"`, `is_estimate: true`, and an `estimate_label`. This fallback is not a road route or turn-by-turn navigation.

## Assumptions And Accuracy Notes

- **Safety hours are placeholders.** Current defaults are 2.5 hours for room temperature, 4 hours for hot-held, and 12 hours for chilled food. They are configurable with `DONATION_MAX_SAFE_HOURS_ROOM_TEMP`, `DONATION_MAX_SAFE_HOURS_HOT`, and `DONATION_MAX_SAFE_HOURS_CHILLED`. These values must be confirmed against current FSSAI guidance or an NGO food-safety partner before real use. The app is a prototype, not a food-safety certification system.
- The server calculates `safe_until` from preparation time and the category window. It rejects future preparation times, invalid categories, non-positive quantities, expired matching, and expired offers/status changes. The browser countdown is display-only; server checks enforce eligibility.
- Six Coimbatore NGOs are seeded as **sample data** with example coordinates, categories, capacities, and opening hours. Existing legacy NGO entries may remain in an already-used database. Replace or verify all sample records before operational use.
- NGO matching uses accepted food-holding category, quantity bounds, haversine straight-line distance, estimated travel/response time, and configured opening hours. Match scores are a prototype ranking, not a validated service-level guarantee.
- Public OSRM and OpenStreetMap services are third-party public infrastructure with availability and usage policies. No key is required, but availability is not guaranteed. The straight-line fallback is explicitly labelled as an estimate.
- Donation data is stored in local SQLite for this prototype. It is not a shared multi-instance database and has no authentication or authorization; do not expose it publicly with real personal data.

## Integration Notes For Member 4

- The donation router is mounted by `app.main`; all API routes use the `/api/donation/*` prefix. The standalone page is `/donation`.
- The default kitchen origin is Coimbatore (`11.0168, 76.9558`). Configure `DEFAULT_KITCHEN_NAME`, `DEFAULT_KITCHEN_LAT`, and `DEFAULT_KITCHEN_LNG`, or pass `kitchen_name`, `kitchen_lat`, and `kitchen_lng` while registering a batch.
- For the workflow, fetch batches and matches, offer a batch to an NGO, then let the NGO accept/reject and report pickup/delivery. Valid donation states are `MATCHED → ACCEPTED → PICKED_UP → DELIVERED`; `REJECTED` ends a matched offer, and expiry can end an active donation as `EXPIRED`. Invalid transitions and expired offers return HTTP `409` with a detail message.
- The matching API returns ineligible entries too, with `eligible: false` and a reason, so clients can show why a partner was excluded. Only eligible matches can be offered.
- For the map, read `route.waypoints_latlng` as `[latitude, longitude]` pairs. `routing_source` and `is_estimate` distinguish road routes from fallback estimates.
- The module currently uses separate local SQLite storage (`zeroPlate_donation.db` by default); use a shared database and add authentication before a multi-user deployment.