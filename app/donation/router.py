import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from .database import (
    DONATION_DATABASE_PATH,
    get_donation_connection,
    initialize_donation_database,
)
from .models import (
    AssignBatchInput,
    BatchCreateInput,
    DonationStatusUpdateInput,
    NGOCreateInput,
)
from .services import (
    build_pickup_route,
    compute_expiry_timestamp,
    estimate_travel_metrics,
    evaluate_batch_safety,
    parse_iso_utc,
    rank_ngos_for_batch,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Initialize the Member 3 SQLite database when router module loads
initialize_donation_database()

router = APIRouter(tags=["Surplus Donation & Food Safety"])


@router.get("/donation", include_in_schema=False)
@router.get("/api/donation/ui", include_in_schema=False)
def donation_ui():
    html_file = STATIC_DIR / "donation.html"
    if not html_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Frontend file app/donation/static/donation.html was not found.",
        )
    return FileResponse(html_file)


@router.get("/api/donation/health")
def donation_health():
    with get_donation_connection() as conn:
        batch_count = conn.execute("SELECT COUNT(*) AS c FROM surplus_batches").fetchone()["c"]
        ngo_count = conn.execute("SELECT COUNT(*) AS c FROM ngos WHERE active = 1").fetchone()["c"]
        donation_count = conn.execute("SELECT COUNT(*) AS c FROM donations").fetchone()["c"]

    return {
        "status": "ok",
        "module": "Member 3 - Surplus Donation & Food Safety",
        "database": "SQLite",
        "database_path": str(DONATION_DATABASE_PATH),
        "counts": {
            "batches": batch_count,
            "active_ngos": ngo_count,
            "donations": donation_count,
        },
    }


def _sync_expired_batches(connection: sqlite3.Connection) -> None:
    """Automatically mark AVAILABLE batches whose expiry time has passed as EXPIRED."""
    now_iso = datetime.now(timezone.utc).isoformat()
    connection.execute(
        """
        UPDATE surplus_batches
        SET status = 'EXPIRED'
        WHERE status = 'AVAILABLE' AND expires_at <= ?
        """,
        (now_iso,),
    )
    connection.commit()


# ---------------------------------------------------------
# Deliverable 1 & 2: Surplus Batches & Safety Countdown
# ---------------------------------------------------------

@router.post("/api/donation/batches")
def register_surplus_batch(payload: BatchCreateInput):
    dish_name = payload.dish_name.strip()
    if not dish_name:
        raise HTTPException(status_code=422, detail="Dish name cannot be empty.")

    now_iso = datetime.now(timezone.utc).isoformat()
    prepared_iso = (
        parse_iso_utc(payload.prepared_at).isoformat()
        if payload.prepared_at
        else now_iso
    )

    try:
        expires_iso = compute_expiry_timestamp(
            prepared_at_iso=prepared_iso,
            storage_condition=payload.storage_condition,
            safe_hours=payload.safe_hours,
            explicit_expires_at=payload.expires_at,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid timestamp format: {exc}",
        ) from exc

    servings = (
        payload.servings
        if payload.servings is not None
        else max(1, int(round(payload.quantity_grams / 250.0)))
    )

    initial_status = (
        "EXPIRED"
        if parse_iso_utc(expires_iso) <= datetime.now(timezone.utc)
        else "AVAILABLE"
    )

    try:
        with get_donation_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO surplus_batches (
                    dish_name, quantity_grams, servings, dietary_type,
                    storage_condition, allergen_info, notes,
                    kitchen_name, kitchen_lat, kitchen_lng,
                    prepared_at, expires_at, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    dish_name,
                    payload.quantity_grams,
                    servings,
                    payload.dietary_type,
                    payload.storage_condition,
                    payload.allergen_info.strip(),
                    payload.notes.strip(),
                    payload.kitchen_name.strip() or "ZeroPlate Central Kitchen",
                    payload.kitchen_lat,
                    payload.kitchen_lng,
                    prepared_iso,
                    expires_iso,
                    initial_status,
                    now_iso,
                ),
            )
            batch_id = cursor.lastrowid
            conn.commit()

            row = conn.execute(
                "SELECT * FROM surplus_batches WHERE id = ?",
                (batch_id,),
            ).fetchone()

        batch_data = evaluate_batch_safety(row)
        return {
            "success": True,
            "message": (
                "Surplus batch registered and ready for NGO matching."
                if not batch_data["is_expired"]
                else "Batch registered, but its safety window has already expired (blocked from donation)."
            ),
            "id": batch_id,
            "batch": batch_data,
        }
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not save surplus batch: {exc}"
        ) from exc



@router.get("/api/donation/batches")
def list_surplus_batches(
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    try:
        with get_donation_connection() as conn:
            _sync_expired_batches(conn)
            if status:
                rows = conn.execute(
                    """
                    SELECT * FROM surplus_batches
                    WHERE UPPER(status) = UPPER(?)
                    ORDER BY id DESC LIMIT ?
                    """,
                    (status.strip(), limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM surplus_batches ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()

        batches = [evaluate_batch_safety(r) for r in rows]
        summary = {
            "total": len(batches),
            "safe_count": sum(1 for b in batches if b["safety_status"] == "SAFE"),
            "expiring_soon_count": sum(
                1 for b in batches if b["safety_status"] == "EXPIRING_SOON"
            ),
            "expired_count": sum(1 for b in batches if b["is_expired"]),
            "available_for_donation": sum(1 for b in batches if b["can_donate"]),
        }
        return {
            "success": True,
            "summary": summary,
            "batches": batches,
            "count": len(batches),
        }
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500, detail=f"Could not list surplus batches: {exc}"
        ) from exc


@router.get("/api/donation/batches/{batch_id}")
def get_surplus_batch(batch_id: int):
    with get_donation_connection() as conn:
        _sync_expired_batches(conn)
        row = conn.execute(
            "SELECT * FROM surplus_batches WHERE id = ?",
            (batch_id,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Surplus batch not found.")

    batch = evaluate_batch_safety(row)
    return {"success": True, "batch": batch}


@router.post("/api/donation/batches/{batch_id}/check-safety")
def check_batch_safety(batch_id: int):
    """Explicitly verify food-safety countdown and block expired batches."""
    with get_donation_connection() as conn:
        _sync_expired_batches(conn)
        row = conn.execute(
            "SELECT * FROM surplus_batches WHERE id = ?",
            (batch_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Surplus batch not found.")

        batch = evaluate_batch_safety(row)
        if batch["is_expired"] and row["status"] == "AVAILABLE":
            conn.execute(
                "UPDATE surplus_batches SET status = 'EXPIRED' WHERE id = ?",
                (batch_id,),
            )
            conn.commit()
            batch["status"] = "EXPIRED"

    return {
        "success": True,
        "batch_id": batch_id,
        "safety_status": batch["safety_status"],
        "is_expired": batch["is_expired"],
        "blocked": batch["is_expired"],
        "can_donate": batch["can_donate"],
        "remaining_seconds": batch["remaining_seconds"],
        "countdown_display": batch["countdown_display"],
        "batch": batch,
    }


@router.delete("/api/donation/batches/{batch_id}")
def delete_surplus_batch(batch_id: int):
    with get_donation_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM surplus_batches WHERE id = ?",
            (batch_id,),
        )
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Surplus batch not found.")

    return {
        "success": True,
        "message": "Surplus batch deleted successfully.",
        "id": batch_id,
    }


# ---------------------------------------------------------
# Deliverable 3: NGOs & Smart Matching
# ---------------------------------------------------------

@router.get("/api/donation/ngos")
def list_ngos():
    with get_donation_connection() as conn:
        rows = conn.execute("SELECT * FROM ngos ORDER BY id ASC").fetchall()

    ngos = [
        {
            **dict(r),
            "accepts_chilled": bool(r["accepts_chilled"]),
            "active": bool(r["active"]),
        }
        for r in rows
    ]
    return {"success": True, "ngos": ngos, "count": len(ngos)}

