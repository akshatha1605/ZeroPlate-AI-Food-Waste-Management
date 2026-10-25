import math
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

STORAGE_DEFAULT_SAFE_HOURS = {
    "room_temp": 2.5,
    "hot": 4.0,
    "chilled": 12.0,
}

URBAN_SPEED_KMH = 24.0
HANDOVER_BUFFER_MINS = 8


def parse_iso_utc(iso_str: str) -> datetime:
    cleaned = iso_str.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    dt = datetime.fromisoformat(cleaned)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def compute_expiry_timestamp(
    prepared_at_iso: str,
    storage_condition: str,
    safe_hours: float | None = None,
    explicit_expires_at: str | None = None,
) -> str:
    if explicit_expires_at and explicit_expires_at.strip():
        return parse_iso_utc(explicit_expires_at).isoformat()

    prepared_dt = parse_iso_utc(prepared_at_iso)
    hours = (
        float(safe_hours)
        if safe_hours is not None
        else STORAGE_DEFAULT_SAFE_HOURS.get(storage_condition, 4.0)
    )
    return (prepared_dt + timedelta(hours=hours)).isoformat()


def evaluate_batch_safety(batch_row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    batch = dict(batch_row)
    now = datetime.now(timezone.utc)
    expires_dt = parse_iso_utc(batch["expires_at"])
    prepared_dt = parse_iso_utc(batch["prepared_at"])

    total_window_seconds = max(1.0, (expires_dt - prepared_dt).total_seconds())
    remaining_seconds = int((expires_dt - now).total_seconds())
    remaining_minutes = round(remaining_seconds / 60.0, 1)

    is_expired = remaining_seconds <= 0
    if is_expired:
        safety_status = "EXPIRED"
        safety_badge = "Expired — Blocked from Donation"
        remaining_seconds_clamped = 0
        freshness_pct = 0.0
    elif remaining_seconds <= 45 * 60:
        safety_status = "EXPIRING_SOON"
        safety_badge = "Urgent — Expiring inside 45 mins"
        remaining_seconds_clamped = remaining_seconds
        freshness_pct = round(min(100.0, (remaining_seconds / total_window_seconds) * 100.0), 1)
    else:
        safety_status = "SAFE"
        safety_badge = "Safe for Redistribution"
        remaining_seconds_clamped = remaining_seconds
        freshness_pct = round(min(100.0, (remaining_seconds / total_window_seconds) * 100.0), 1)

    if is_expired:
        overdue_mins = abs(remaining_seconds) // 60
        countdown_display = f"Expired {overdue_mins}m ago"
    else:
        hours_left = remaining_seconds // 3600
        mins_left = (remaining_seconds % 3600) // 60
        secs_left = remaining_seconds % 60
        if hours_left > 0:
            countdown_display = f"{hours_left}h {mins_left}m {secs_left}s remaining"
        else:
            countdown_display = f"{mins_left}m {secs_left}s remaining"

    effective_status = batch.get("status", "AVAILABLE")
    if is_expired and effective_status == "AVAILABLE":
        effective_status = "EXPIRED"

    can_donate = (not is_expired) and (effective_status == "AVAILABLE")

    return {
        **batch,
        "quantity_grams": round(float(batch["quantity_grams"]), 1),
        "quantity_kg": round(float(batch["quantity_grams"]) / 1000.0, 2),
        "status": effective_status,
        "safety_status": safety_status,
        "safety_badge": safety_badge,
        "is_expired": is_expired,
        "can_donate": can_donate,
        "remaining_seconds": remaining_seconds_clamped,
        "raw_remaining_seconds": remaining_seconds,
        "remaining_minutes": max(0.0, remaining_minutes),
        "freshness_percent": freshness_pct,
        "countdown_display": countdown_display,
    }


def haversine_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return radius_km * c


def estimate_travel_metrics(
    lat1: float, lng1: float, lat2: float, lng2: float
) -> dict[str, Any]:
    straight_km = haversine_distance_km(lat1, lng1, lat2, lng2)
    road_km = round(max(0.3, straight_km * 1.28), 2)
    drive_minutes = max(3, int(math.ceil((road_km / URBAN_SPEED_KMH) * 60.0)))
    total_eta_minutes = drive_minutes + HANDOVER_BUFFER_MINS
    return {
        "straight_distance_km": round(straight_km, 2),
        "distance_km": road_km,
        "drive_minutes": drive_minutes,
        "handover_buffer_minutes": HANDOVER_BUFFER_MINS,
        "eta_minutes": total_eta_minutes,
    }


def rank_ngos_for_batch(
    batch_enriched: dict[str, Any],
    ngo_rows: list[sqlite3.Row | dict[str, Any]],
) -> list[dict[str, Any]]:
    quantity_g = float(batch_enriched["quantity_grams"])
    dietary = str(batch_enriched["dietary_type"]).lower().strip()
    storage = str(batch_enriched["storage_condition"]).lower().strip()
    remaining_mins = float(batch_enriched["remaining_minutes"])
    k_lat = float(batch_enriched["kitchen_lat"])
    k_lng = float(batch_enriched["kitchen_lng"])

    matches: list[dict[str, Any]] = []

    for row in ngo_rows:
        ngo = dict(row)
        if not ngo.get("active", 1):
            continue

        accepted_diets = {
            d.strip().lower()
            for d in str(ngo.get("accepted_dietary", "")).split(",")
            if d.strip()
        }
        dietary_ok = dietary in accepted_diets
        storage_ok = True if storage != "chilled" else bool(ngo.get("accepts_chilled", 1))
        min_ok = quantity_g >= float(ngo.get("min_quantity_grams", 0))
        max_ok = quantity_g <= float(ngo.get("max_capacity_grams", 1_000_000))
        capacity_ok = min_ok and max_ok

        travel = estimate_travel_metrics(
            k_lat, k_lng, float(ngo["latitude"]), float(ngo["longitude"])
        )
        response_mins = int(ngo.get("avg_response_mins", 10))
        total_arrival_mins = travel["eta_minutes"] + response_mins
        safety_margin_mins = round(remaining_mins - total_arrival_mins, 1)
        time_feasible = (not batch_enriched["is_expired"]) and (safety_margin_mins >= 10.0)

        reasons: list[str] = []
        disqualifiers: list[str] = []

        if dietary_ok:
            reasons.append(f"Accepts {dietary.upper()} meals")
        else:
            disqualifiers.append(f"Does not accept {dietary.upper()} food")

        if storage_ok:
            reasons.append(f"Equipped for {storage} storage")
        else:
            disqualifiers.append("No cold-chain/chilled transport")

        if capacity_ok:
            reasons.append(
                f"Quantity ({round(quantity_g/1000, 1)} kg) fits NGO range "
                f"({round(float(ngo['min_quantity_grams'])/1000, 1)}–{round(float(ngo['max_capacity_grams'])/1000, 1)} kg)"
            )
        elif not min_ok:
            disqualifiers.append(
                f"Batch below NGO minimum ({round(float(ngo['min_quantity_grams'])/1000, 1)} kg)"
            )
        else:
            disqualifiers.append(
                f"Batch exceeds NGO max capacity ({round(float(ngo['max_capacity_grams'])/1000, 1)} kg)"
            )

        if time_feasible:
            reasons.append(f"+{int(safety_margin_mins)} min safety buffer before expiry")
        else:
            disqualifiers.append(
                "Insufficient time before food-safety expiry"
                if not batch_enriched["is_expired"]
                else "Batch has already expired"
            )

        eligible = dietary_ok and storage_ok and capacity_ok and time_feasible

        distance_score = max(0.0, 45.0 - (travel["distance_km"] * 3.5))
        margin_score = min(30.0, max(0.0, safety_margin_mins * 0.35))
        capacity_utilization = min(1.0, quantity_g / max(1.0, float(ngo["max_capacity_grams"])))
        capacity_score = 15.0 * (1.0 - abs(0.35 - capacity_utilization))
        response_score = max(0.0, 10.0 - (response_mins * 0.4))

        raw_score = distance_score + margin_score + capacity_score + response_score
        match_score = round(raw_score if eligible else min(35.0, raw_score * 0.4), 1)

        matches.append(
            {
                "ngo": {
                    **ngo,
                    "accepts_chilled": bool(ngo.get("accepts_chilled", 1)),
                    "active": bool(ngo.get("active", 1)),
                },
                "eligible": eligible,
                "match_score": match_score,
                "distance_km": travel["distance_km"],
                "drive_minutes": travel["drive_minutes"],
                "eta_minutes": travel["eta_minutes"],
                "total_collection_minutes": total_arrival_mins,
                "safety_margin_minutes": safety_margin_mins,
                "reasons": reasons,
                "disqualifiers": disqualifiers,
            }
        )

    matches.sort(
        key=lambda m: (
            1 if m["eligible"] else 0,
            m["match_score"],
            -m["distance_km"],
        ),
        reverse=True,
    )
    return matches


def build_pickup_route(
    kitchen_name: str,
    kitchen_lat: float,
    kitchen_lng: float,
    ngo_name: str,
    ngo_address: str,
    ngo_lat: float,
    ngo_lng: float,
    expires_at_iso: str,
    assigned_at_iso: str | None = None,
) -> dict[str, Any]:
    routing_source = "haversine_urban_model"
    geometry_coords: list[list[float]] = []
    steps: list[dict[str, Any]] = []

    fallback_metrics = estimate_travel_metrics(kitchen_lat, kitchen_lng, ngo_lat, ngo_lng)
    distance_km = fallback_metrics["distance_km"]
    drive_minutes = fallback_metrics["drive_minutes"]

    osrm_url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{kitchen_lng},{kitchen_lat};{ngo_lng},{ngo_lat}"
        f"?overview=full&geometries=geojson&steps=true"
    )
    try:
        with httpx.Client(timeout=2.5) as client:
            resp = client.get(osrm_url)
            if resp.status_code == 200:
                payload = resp.json()
                routes = payload.get("routes") or []
                if routes:
                    route0 = routes[0]
                    osrm_dist_km = round(float(route0.get("distance", 0.0)) / 1000.0, 2)
                    osrm_dur_mins = max(
                        3, int(math.ceil(float(route0.get("duration", 0.0)) / 60.0))
                    )
                    if osrm_dist_km > 0:
                        distance_km = osrm_dist_km
                        drive_minutes = osrm_dur_mins
                        routing_source = "osrm_open_routing"

                    geo = route0.get("geometry", {}).get("coordinates", [])
                    if geo:
                        geometry_coords = [[float(pt[1]), float(pt[0])] for pt in geo]

                    legs = route0.get("legs") or []
                    if legs and legs[0].get("steps"):
                        for idx, st in enumerate(legs[0]["steps"][:8], start=1):
                            maneuver = st.get("maneuver", {}).get("type", "continue")
                            modifier = st.get("maneuver", {}).get("modifier", "")
                            road_name = st.get("name") or "local road"
                            step_dist_m = int(round(float(st.get("distance", 0))))
                            instruction = f"{maneuver.capitalize()} {modifier} onto {road_name}".strip()
                            steps.append(
                                {
                                    "step": idx,
                                    "instruction": instruction,
                                    "distance_meters": step_dist_m,
                                }
                            )
    except Exception:
        pass

    if not geometry_coords:
        mid1_lat = kitchen_lat + (ngo_lat - kitchen_lat) * 0.33 + 0.0022
        mid1_lng = kitchen_lng + (ngo_lng - kitchen_lng) * 0.33 - 0.0018
        mid2_lat = kitchen_lat + (ngo_lat - kitchen_lat) * 0.68 - 0.0015
        mid2_lng = kitchen_lng + (ngo_lng - kitchen_lng) * 0.68 + 0.0020
        geometry_coords = [
            [kitchen_lat, kitchen_lng],
            [round(mid1_lat, 6), round(mid1_lng, 6)],
            [round(mid2_lat, 6), round(mid2_lng, 6)],
            [ngo_lat, ngo_lng],
        ]

    if not steps:
        steps = [
            {
                "step": 1,
                "instruction": f"Depart from {kitchen_name} loading bay and verify insulated containers",
                "distance_meters": int(distance_km * 250),
            },
            {
                "step": 2,
                "instruction": "Continue along main arterial corridor toward NGO collection zone",
                "distance_meters": int(distance_km * 550),
            },
            {
                "step": 3,
                "instruction": f"Arrive at {ngo_name} ({ngo_address}) and complete food-safety temperature check",
                "distance_meters": int(distance_km * 200),
            },
        ]

    eta_minutes = drive_minutes + HANDOVER_BUFFER_MINS
    now = datetime.now(timezone.utc)
    estimated_arrival_dt = now + timedelta(minutes=eta_minutes)
    expires_dt = parse_iso_utc(expires_at_iso)
    safety_margin_minutes = round((expires_dt - estimated_arrival_dt).total_seconds() / 60.0, 1)

    return {
        "routing_source": routing_source,
        "origin": {
            "name": kitchen_name,
            "latitude": kitchen_lat,
            "longitude": kitchen_lng,
        },
        "destination": {
            "name": ngo_name,
            "address": ngo_address,
            "latitude": ngo_lat,
            "longitude": ngo_lng,
        },
        "distance_km": distance_km,
        "drive_minutes": drive_minutes,
        "handover_buffer_minutes": HANDOVER_BUFFER_MINS,
        "eta_minutes": eta_minutes,
        "estimated_arrival_at": estimated_arrival_dt.isoformat(),
        "expires_at": expires_dt.isoformat(),
        "safety_margin_minutes": safety_margin_minutes,
        "arrives_before_expiry": safety_margin_minutes > 0,
        "waypoints_latlng": geometry_coords,
        "steps": steps,
    }
