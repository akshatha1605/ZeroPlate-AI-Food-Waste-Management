import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
APP_DIR = BASE_DIR.parent
PROJECT_DIR = APP_DIR.parent

load_dotenv(PROJECT_DIR / ".env")

DEFAULT_DONATION_DB_PATH = PROJECT_DIR / "zeroPlate_donation.db"
DONATION_DATABASE_PATH = Path(
    os.getenv("DONATION_DATABASE_PATH", str(DEFAULT_DONATION_DB_PATH))
).expanduser()

if not DONATION_DATABASE_PATH.is_absolute():
    DONATION_DATABASE_PATH = PROJECT_DIR / DONATION_DATABASE_PATH

DEFAULT_KITCHEN_NAME = os.getenv("DEFAULT_KITCHEN_NAME", "ZeroPlate Central Kitchen")
DEFAULT_KITCHEN_LAT = float(os.getenv("DEFAULT_KITCHEN_LAT", "12.9716"))
DEFAULT_KITCHEN_LNG = float(os.getenv("DEFAULT_KITCHEN_LNG", "77.5946"))


def get_donation_connection() -> sqlite3.Connection:
    DONATION_DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(DONATION_DATABASE_PATH))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


SEED_NGOS = [
    ("Akshaya Community Trust", "Rohan Sharma", "+91-98450-11223", "Indiranagar 2nd Stage, Bengaluru", 12.9784, 77.6408, 1000, 50000, "veg,non-veg,vegan", 1, 10, 1),
    ("Robin Hood Hunger Relief", "Priya Nair", "+91-98801-44556", "MG Road / Shivajinagar, Bengaluru", 12.9815, 77.6036, 500, 25000, "veg,vegan", 1, 8, 1),
    ("Feeding Hands Foundation", "Karthik Raj", "+91-97312-77889", "Koramangala 4th Block, Bengaluru", 12.9352, 77.6245, 2000, 80000, "veg,non-veg,vegan", 1, 12, 1),
    ("Annapoorna Seva Sadan", "Meera Iyer", "+91-99002-33441", "Malleswaram 8th Cross, Bengaluru", 13.0031, 77.5643, 1500, 40000, "veg,vegan", 0, 15, 1),
    ("Uday Shelter & Night Kitchen", "Abdul Mateen", "+91-96114-55660", "Jayanagar 4th Block, Bengaluru", 12.9250, 77.5838, 800, 30000, "veg,non-veg,vegan", 1, 9, 1),
]


def initialize_donation_database() -> None:
    """Create tables for surplus batches, NGOs, and donations, and seed default NGOs."""
    with get_donation_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS surplus_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dish_name TEXT NOT NULL,
                quantity_grams REAL NOT NULL,
                servings INTEGER NOT NULL DEFAULT 1,
                dietary_type TEXT NOT NULL DEFAULT 'veg',
                storage_condition TEXT NOT NULL DEFAULT 'hot',
                allergen_info TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                kitchen_name TEXT NOT NULL DEFAULT 'ZeroPlate Central Kitchen',
                kitchen_lat REAL NOT NULL DEFAULT 12.9716,
                kitchen_lng REAL NOT NULL DEFAULT 77.5946,
                prepared_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'AVAILABLE',
                created_at TEXT NOT NULL
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ngos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                contact_person TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                min_quantity_grams REAL NOT NULL DEFAULT 500,
                max_capacity_grams REAL NOT NULL DEFAULT 50000,
                accepted_dietary TEXT NOT NULL DEFAULT 'veg,non-veg,vegan',
                accepts_chilled INTEGER NOT NULL DEFAULT 1,
                avg_response_mins INTEGER NOT NULL DEFAULT 10,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS donations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id INTEGER NOT NULL,
                ngo_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                volunteer_name TEXT NOT NULL DEFAULT '',
                volunteer_phone TEXT NOT NULL DEFAULT '',
                status_notes TEXT NOT NULL DEFAULT '',
                distance_km REAL NOT NULL DEFAULT 0.0,
                eta_minutes INTEGER NOT NULL DEFAULT 0,
                assigned_at TEXT NOT NULL,
                accepted_at TEXT,
                picked_up_at TEXT,
                delivered_at TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (batch_id) REFERENCES surplus_batches(id) ON DELETE CASCADE,
                FOREIGN KEY (ngo_id) REFERENCES ngos(id) ON DELETE CASCADE
            )
            """
        )

        ngo_count = connection.execute("SELECT COUNT(*) AS cnt FROM ngos").fetchone()["cnt"]
        if ngo_count == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            for ngo in SEED_NGOS:
                connection.execute(
                    """
                    INSERT INTO ngos (
                        name, contact_person, phone, address,
                        latitude, longitude, min_quantity_grams, max_capacity_grams,
                        accepted_dietary, accepts_chilled, avg_response_mins,
                        active, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (*ngo, now_iso),
                )

        connection.commit()

    print(f"ZeroPlate donation database: {DONATION_DATABASE_PATH}")
