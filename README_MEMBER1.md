# ZeroPlate — Member 1: AI Waste Detection

This is a standalone implementation of Member 1's module: food-image upload, preliminary waste estimation, human review/manual correction, SQLite record storage, recent records, and per-dish waste trends.

## Requirements

- Python 3.10+
- Internet connection for Gemini image analysis
- Optional Gemini API key (the app still runs without one in clearly labelled demo mode)

## Run on Windows PowerShell

From the extracted project folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

To enable actual Gemini image analysis, open `.env` and set `GEMINI_API_KEY` to your own key. Keep `.env` private; do not commit it. Without a key, the app uses a placeholder demo estimate based on file size. That is **not AI image recognition** and must not be represented as a real estimate.

Start the server:

```powershell
python -m uvicorn app.main:app --reload --port 8001
```

Open <http://127.0.0.1:8001>. API documentation is at <http://127.0.0.1:8001/docs>.

## API endpoints

- `GET /api/health` — service health and AI/demo mode.
- `POST /api/waste/analyze` — multipart form with `image` and optional `dish_name`.
- `POST /api/waste/records` — save a reviewed/corrected waste record.
- `GET /api/waste/records` — list recent records.
- `GET /api/waste/trends` — group records by dish and calculate total/average waste.
- `DELETE /api/waste/records/{record_id}` — delete a record.

## Important accuracy note

A single image without a known-size reference or scale cannot reliably measure food mass. Gemini's result is an estimate and must be reviewed and corrected by a human before it is saved. The confidence value is model-reported, not a calibrated probability. Do not use this prototype to make food-safety decisions.

## Integration notes for Member 4

The module exposes REST/JSON endpoints under `/api/waste/*`. It runs on port `8001` to avoid conflicting with other local services. The database is local SQLite by default; for the integrated application, replace the persistence layer with the team's chosen shared database.

## Current scope

Implemented: image upload, Gemini image analysis when configured, manual correction, record saving, recent-record list, and per-dish waste trends. No image file is permanently stored; only the original filename and reviewed measurement metadata are saved.
