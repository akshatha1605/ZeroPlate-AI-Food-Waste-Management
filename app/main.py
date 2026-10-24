
import base64
import json
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from pydantic import BaseModel, Field


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

load_dotenv(PROJECT_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()

MAX_IMAGE_MB = max(1, int(os.getenv("MAX_IMAGE_MB", "5")))
MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024

DEFAULT_DB_PATH = PROJECT_DIR / "zeroPlate_waste.db"
DATABASE_PATH = Path(
    os.getenv("DATABASE_PATH", str(DEFAULT_DB_PATH))
).expanduser()

if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = PROJECT_DIR / DATABASE_PATH

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


# ---------------------------------------------------------
# Database and schema migration
# ---------------------------------------------------------

def get_connection():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(DATABASE_PATH))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    """Create the table and add compatible columns to older databases."""

    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS waste_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dish_name TEXT NOT NULL,
                estimated_grams REAL NOT NULL,
                confidence REAL NOT NULL,
                category TEXT NOT NULL DEFAULT 'Leftover food',
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                analysis_source TEXT NOT NULL DEFAULT 'unknown',
                image_filename TEXT NOT NULL DEFAULT ''
            )
        """)

        existing_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(waste_records)"
            ).fetchall()
        }

        # Safe additive migrations: existing records are preserved.
        migrations = {
            "description": "TEXT NOT NULL DEFAULT ''",
            "analysis_source": "TEXT NOT NULL DEFAULT 'unknown'",
            "image_filename": "TEXT NOT NULL DEFAULT ''",
        }

        for column, definition in migrations.items():
            if column not in existing_columns:
                connection.execute(
                    f"ALTER TABLE waste_records "
                    f"ADD COLUMN {column} {definition}"
                )

        connection.commit()

    print(f"ZeroPlate database: {DATABASE_PATH}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


# ---------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------

app = FastAPI(
    title="ZeroPlate - Food Waste Detection",
    description="AI-powered food waste estimation and tracking.",
    version="1.1.0",
    lifespan=lifespan,
)

STATIC_DIR = BASE_DIR / "static"

if STATIC_DIR.exists():
    app.mount(
        "/static",
        StaticFiles(directory=str(STATIC_DIR)),
        name="static",
    )


@app.get("/", include_in_schema=False)
def home():
    index_file = STATIC_DIR / "index.html"

    if not index_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Frontend file app/static/index.html was not found.",
        )

    return FileResponse(index_file)


# ---------------------------------------------------------
# Health check
# ---------------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "ZeroPlate Waste Detection",
        "model": GEMINI_MODEL,
        "ai_configured": bool(GEMINI_API_KEY),
        "database": "SQLite",
        "database_path": str(DATABASE_PATH),
    }


# ---------------------------------------------------------
# Gemini image analysis
# ---------------------------------------------------------

def analyze_food_image(
    image_bytes: bytes,
    mime_type: str,
    dish_name: str = "",
) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "Gemini API key is missing. Add GEMINI_API_KEY "
                "to your .env file and restart the backend."
            ),
        )

    prompt = f"""
You are analysing a food image for ZeroPlate, a food-waste
monitoring system.

User-provided dish name: {dish_name.strip() or "Not specified"}

Analyse the actual uploaded image. Estimate the quantity of
visible leftover edible food in grams. Identify the dish when
possible, provide a confidence score from 0.0 to 1.0, and
describe the visible food and uncertainty.

Rules:
- Estimate only the food visible in the image.
- The estimate is visual, not a measured weight.
- Return 0 grams if no food is visible.
- Do not invent a dish name if identification is uncertain.
- Do not infer food safety from appearance.
- Return only a valid JSON object.

Use this structure:
{{
  "dish_name": "identified dish or Unknown",
  "estimated_grams": 250,
  "confidence": 0.75,
  "category": "leftover",
  "description": "Brief description of the visible food"
}}
"""

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        interaction = client.interactions.create(
            model=GEMINI_MODEL,
            input=[
                {"type": "text", "text": prompt},
                {
                    "type": "image",
                    "data": base64.b64encode(image_bytes).decode("utf-8"),
                    "mime_type": mime_type,
                },
            ],
        )

        response_text = (interaction.output_text or "").strip()

        if not response_text:
            raise ValueError("Gemini returned an empty response.")

        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[-1]
            response_text = response_text.rsplit("```", 1)[0].strip()

        if not response_text.startswith("{"):
            start = response_text.find("{")
            end = response_text.rfind("}")

            if start == -1 or end <= start:
                raise ValueError("Gemini did not return a JSON object.")

            response_text = response_text[start:end + 1]

        result = json.loads(response_text)

        estimated_grams = float(result["estimated_grams"])
        confidence = float(result["confidence"])

        if not 0 <= estimated_grams <= 1_000_000:
            raise ValueError("Estimated quantity is outside the allowed range.")

        if not 0 <= confidence <= 1:
            raise ValueError("Confidence must be between 0 and 1.")

        identified_dish = str(result.get("dish_name") or "").strip()
        if not identified_dish:
            identified_dish = dish_name.strip() or "Unknown"

        return {
            "dish_name": identified_dish,
            "estimated_grams": round(estimated_grams, 1),
            "confidence": round(confidence, 2),
            "category": str(result.get("category") or "leftover").strip(),
            "description": str(result.get("description") or "").strip(),
            "analysis_source": "gemini",
            "image_filename": "",
            "mode": "ai",
            "is_demo": False,
            "reason": str(result.get("description") or "").strip(),
        }

    except HTTPException:
        raise

    except Exception as exc:
        print(
            f"Gemini image analysis failed: "
            f"{type(exc).__name__}: {exc}"
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "AI image analysis failed. Check the backend terminal, "
                "API key, model availability, and internet connection."
            ),
        ) from exc


@app.post("/api/waste/analyze")
async def analyze_waste(
    image: UploadFile = File(...),
    dish_name: str = Form(""),
):
    mime_type = (image.content_type or "").lower().strip()

    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Upload a JPG, PNG, or WEBP image.",
        )

    image_bytes = await image.read(MAX_IMAGE_BYTES + 1)

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty.",
        )

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image size must not exceed {MAX_IMAGE_MB} MB.",
        )

    result = analyze_food_image(
        image_bytes=image_bytes,
        mime_type=mime_type,
        dish_name=dish_name,
    )

    # Both nested and top-level fields are returned for frontend compatibility.
    return {
        "success": True,
        "message": "Image analysed successfully.",
        "result": result,
        **result,
    }


# ---------------------------------------------------------
# Save corrected estimate
# ---------------------------------------------------------

class WasteRecordInput(BaseModel):
    dish_name: str = Field(min_length=1, max_length=200)
    estimated_grams: float = Field(ge=0, le=1_000_000)
    confidence: float = Field(ge=0, le=1)
    category: str = Field(default="leftover", max_length=100)
    description: str = Field(default="", max_length=1000)
    analysis_source: str = Field(default="unknown", max_length=100)
    image_filename: str = Field(default="", max_length=255)


def row_to_dict(row: sqlite3.Row) -> dict:
    record = dict(row)
    record["estimated_grams"] = float(record["estimated_grams"])
    record["confidence"] = float(record["confidence"])
    return record


@app.post("/api/waste/records")
def save_waste_record(record: WasteRecordInput):
    dish_name = record.dish_name.strip()

    if not dish_name:
        raise HTTPException(
            status_code=422,
            detail="Dish name cannot be empty.",
        )

    created_at = datetime.now(timezone.utc).isoformat()

    # Always supply non-null values for required database fields.
    analysis_source = record.analysis_source.strip() or "unknown"
    image_filename = record.image_filename.strip()
    description = record.description.strip()
    category = record.category.strip() or "leftover"

    try:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO waste_records (
                    dish_name,
                    estimated_grams,
                    confidence,
                    category,
                    description,
                    created_at,
                    analysis_source,
                    image_filename
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    dish_name,
                    record.estimated_grams,
                    record.confidence,
                    category,
                    description,
                    created_at,
                    analysis_source,
                    image_filename,
                ),
            )

            record_id = cursor.lastrowid
            connection.commit()

            saved = connection.execute(
                "SELECT * FROM waste_records WHERE id = ?",
                (record_id,),
            ).fetchone()

        saved_record = row_to_dict(saved)

        # Keep id at the top level for the existing frontend.
        return {
            "success": True,
            "message": "Waste record saved successfully.",
            "id": record_id,
            "record": saved_record,
        }

    except sqlite3.Error as exc:
        print(f"Database save failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Database save failed: {exc}",
        ) from exc


# ---------------------------------------------------------
# Retrieve recent records
# ---------------------------------------------------------

@app.get("/api/waste/records")
def get_waste_records(limit: int = 50):
    limit = max(1, min(limit, 500))

    try:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT * FROM waste_records
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        records = [row_to_dict(row) for row in rows]

        return {
            "success": True,
            "records": records,
            "count": len(records),
        }

    except sqlite3.Error as exc:
        print(f"Database read failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Could not retrieve waste records.",
        ) from exc


# ---------------------------------------------------------
# Waste trends
# ---------------------------------------------------------

@app.get("/api/waste/trends")
def get_waste_trends():
    try:
        with get_connection() as connection:
            summary = connection.execute(
                """
                SELECT
                    COUNT(*) AS total_records,
                    COALESCE(SUM(estimated_grams), 0) AS total_grams,
                    COALESCE(AVG(estimated_grams), 0) AS average_grams
                FROM waste_records
                """
            ).fetchone()

            daily_rows = connection.execute(
                """
                SELECT
                    substr(created_at, 1, 10) AS date,
                    COUNT(*) AS record_count,
                    SUM(estimated_grams) AS total_grams
                FROM waste_records
                GROUP BY substr(created_at, 1, 10)
                ORDER BY date DESC
                LIMIT 30
                """
            ).fetchall()

            dish_rows = connection.execute(
                """
                SELECT
                    dish_name,
                    COUNT(*) AS record_count,
                    SUM(estimated_grams) AS total_grams,
                    AVG(estimated_grams) AS average_grams
                FROM waste_records
                GROUP BY dish_name
                ORDER BY total_grams DESC
                LIMIT 10
                """
            ).fetchall()

        total_grams = float(summary["total_grams"] or 0)

        by_dish = [
            {
                **dict(row),
                "total_grams": round(float(row["total_grams"] or 0), 1),
                "average_grams": round(float(row["average_grams"] or 0), 1),
            }
            for row in dish_rows
        ]

        return {
            "success": True,
            "total_records": int(summary["total_records"]),
            "total_grams": round(total_grams, 1),
            "total_kg": round(total_grams / 1000, 3),
            "average_grams": round(
                float(summary["average_grams"] or 0), 1
            ),
            "daily": [
                {
                    **dict(row),
                    "total_grams": round(float(row["total_grams"] or 0), 1),
                }
                for row in reversed(daily_rows)
            ],
            # The frontend expects trends; keep by_dish for other clients.
            "trends": by_dish,
            "by_dish": by_dish,
        }

    except sqlite3.Error as exc:
        print(f"Database trends query failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Could not retrieve waste trends.",
        ) from exc


# ---------------------------------------------------------
# Delete a record
# ---------------------------------------------------------

@app.delete("/api/waste/records/{record_id}")
def delete_waste_record(record_id: int):
    try:
        with get_connection() as connection:
            cursor = connection.execute(
                "DELETE FROM waste_records WHERE id = ?",
                (record_id,),
            )
            connection.commit()

            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Waste record not found.",
                )

        return {
            "success": True,
            "message": "Waste record deleted successfully.",
            "id": record_id,
        }

    except HTTPException:
        raise

    except sqlite3.Error as exc:
        print(f"Database delete failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Could not delete the waste record.",
        ) from exc
