from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.donation import database
from app.donation.services import evaluate_batch_safety, rank_ngos_for_batch
from app.main import app


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    database_path = tmp_path / "donation-tests.sqlite3"
    monkeypatch.setattr(database, "DONATION_DATABASE_PATH", database_path)
    database.initialize_donation_database()
    with TestClient(app) as client:
        yield client


def _batch_row(expires_at: datetime, prepared_at: datetime | None = None) -> dict:
    prepared = prepared_at or (expires_at - timedelta(hours=4))
    return {
        "id": 1,
        "dish_name": "Test rice",
        "quantity_grams": 1200,
        "storage_condition": "hot",
        "prepared_at": prepared.isoformat(),
        "expires_at": expires_at.isoformat(),
        "status": "AVAILABLE",
    }


def _create_batch(client: TestClient, *, prepared_time: str | None = None) -> dict:
    payload = {
        "dish_name": "Test rice",
        "quantity_grams": 1200,
        "category": "hot",
    }
    if prepared_time:
        payload["prepared_time"] = prepared_time
    response = client.post("/api/donation/batches", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["batch"]


def _sample_ngo(client: TestClient) -> dict:
    response = client.get("/api/donation/ngos")
    assert response.status_code == 200, response.text
    return next(
        ngo
        for ngo in response.json()["ngos"]
        if ngo["name"] == "SAMPLE - Coimbatore Food Share"
    )


def _offer(client: TestClient, batch_id: int, ngo_id: int) -> dict:
    response = client.post(
        "/api/donation/donations",
        json={"batch_id": batch_id, "ngo_id": ngo_id},
    )
    return response.json()


def test_expiry_boundary_marks_deadline_as_expired():
    now = datetime.now(timezone.utc)
    at_deadline = evaluate_batch_safety(_batch_row(now))
    just_before_deadline = evaluate_batch_safety(
        _batch_row(now + timedelta(seconds=20), prepared_at=now - timedelta(hours=4))
    )
    urgent_boundary = evaluate_batch_safety(
        _batch_row(now + timedelta(minutes=59), prepared_at=now - timedelta(hours=3))
    )

    assert at_deadline["safety_state"] == "expired"
    assert at_deadline["seconds_remaining"] == 0
    assert at_deadline["can_donate"] is False
    assert just_before_deadline["safety_state"] in {"safe", "urgent"}
    assert just_before_deadline["is_expired"] is False
    assert urgent_boundary["safety_state"] == "urgent"


def test_matching_scores_category_capacity_distance_and_pickup():
    now = datetime.now(timezone.utc)
    batch = {
        "quantity_grams": 1200,
        "category": "hot",
        "storage_condition": "hot",
        "kitchen_lat": 11.0168,
        "kitchen_lng": 76.9558,
        "safe_until": (now + timedelta(hours=3)).isoformat(),
        "remaining_minutes": 180,
        "is_expired": False,
    }
    eligible_ngo = {
        "id": 1,
        "name": "Nearby open kitchen",
        "latitude": 11.0168,
        "longitude": 76.9558,
        "min_quantity_grams": 500,
        "max_capacity_grams": 5000,
        "accepted_categories": "hot,chilled",
        "open_time": "00:00",
        "close_time": "23:59",
        "avg_response_mins": 10,
        "active": 1,
    }
    wrong_category = {
        **eligible_ngo,
        "id": 2,
        "name": "Wrong category",
        "accepted_categories": "chilled",
    }
    insufficient_capacity = {
        **eligible_ngo,
        "id": 3,
        "name": "Insufficient capacity",
        "max_capacity_grams": 1000,
    }
    closed_at_pickup = {
        **eligible_ngo,
        "id": 4,
        "name": "Closed at pickup",
        "open_time": "00:00",
        "close_time": "00:01",
    }

    matches = rank_ngos_for_batch(
        batch,
        [wrong_category, insufficient_capacity, closed_at_pickup, eligible_ngo],
    )
    by_name = {match["ngo"]["name"]: match for match in matches}

    assert matches[0]["ngo"]["name"] == "Nearby open kitchen"
    assert by_name["Nearby open kitchen"]["eligible"] is True
    assert by_name["Nearby open kitchen"]["distance_km"] == 0
    assert by_name["Wrong category"]["eligible"] is False
    assert "Does not accept hot" in by_name["Wrong category"]["reason"]
    assert by_name["Insufficient capacity"]["eligible"] is False
    assert "Capacity is limited" in by_name["Insufficient capacity"]["reason"]
    assert by_name["Closed at pickup"]["pickup_feasible"] is False
    assert "closed" in by_name["Closed at pickup"]["reason"].lower()


def test_invalid_status_transition_is_rejected_without_history_change(api_client):
    batch = _create_batch(api_client)
    ngo = _sample_ngo(api_client)
    offer = _offer(api_client, batch["id"], ngo["id"])
    assert offer["donation"]["status"] == "MATCHED"
    donation_id = offer["donation"]["id"]

    response = api_client.post(
        f"/api/donation/donations/{donation_id}/status",
        json={"status": "PICKED_UP"},
    )
    assert response.status_code == 409
    assert "only allowed from: ACCEPTED" in response.json()["detail"]

    current = api_client.get(f"/api/donation/donations/{donation_id}").json()["donation"]
    assert current["status"] == "MATCHED"
    assert [event["status"] for event in current["history"]] == ["MATCHED"]


def test_expired_batch_cannot_be_offered_or_advanced(api_client):
    expired_time = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    expired_batch = _create_batch(api_client, prepared_time=expired_time)
    ngo = _sample_ngo(api_client)

    offer_response = api_client.post(
        "/api/donation/donations",
        json={"batch_id": expired_batch["id"], "ngo_id": ngo["id"]},
    )
    assert offer_response.status_code == 409
    assert "Expired batches cannot be offered" in offer_response.json()["detail"]

    active_batch = _create_batch(api_client)
    matched = _offer(api_client, active_batch["id"], ngo["id"])["donation"]
    with database.get_donation_connection() as connection:
        connection.execute(
            "UPDATE surplus_batches SET expires_at = ? WHERE id = ?",
            (expired_time, active_batch["id"]),
        )
        connection.commit()

    blocked_progress = api_client.post(
        f"/api/donation/donations/{matched['id']}/accept"
    )
    assert blocked_progress.status_code == 409
    assert "expired" in blocked_progress.json()["detail"].lower()
    current = api_client.get(
        f"/api/donation/donations/{matched['id']}"
    ).json()["donation"]
    assert current["status"] == "EXPIRED"
    assert [event["status"] for event in current["history"]] == ["MATCHED", "EXPIRED"]


def test_delivered_batch_stays_delivered_after_safe_until(api_client):
    batch = _create_batch(api_client)
    ngo = _sample_ngo(api_client)
    donation = _offer(api_client, batch["id"], ngo["id"])["donation"]
    donation_id = donation["id"]
    assert api_client.post(
        f"/api/donation/donations/{donation_id}/accept"
    ).status_code == 200
    assert api_client.post(
        f"/api/donation/donations/{donation_id}/status",
        json={"status": "PICKED_UP"},
    ).status_code == 200
    delivered = api_client.post(
        f"/api/donation/donations/{donation_id}/status",
        json={"status": "DELIVERED"},
    )
    assert delivered.status_code == 200

    passed_safe_until = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    with database.get_donation_connection() as connection:
        connection.execute(
            "UPDATE surplus_batches SET expires_at = ? WHERE id = ?",
            (passed_safe_until, batch["id"]),
        )
        connection.commit()

    listed = api_client.get("/api/donation/batches").json()["batches"]
    returned_batch = next(item for item in listed if item["id"] == batch["id"])
    assert returned_batch["status"] == "DELIVERED"
    assert returned_batch["safety_state"] == "delivered"
    assert returned_batch["seconds_remaining"] is None
    assert returned_batch["is_expired"] is False


def test_picked_up_batch_has_no_running_countdown(api_client):
    batch = _create_batch(api_client)
    ngo = _sample_ngo(api_client)
    donation = _offer(api_client, batch["id"], ngo["id"])["donation"]
    donation_id = donation["id"]
    assert api_client.post(
        f"/api/donation/donations/{donation_id}/accept"
    ).status_code == 200
    picked_up = api_client.post(
        f"/api/donation/donations/{donation_id}/status",
        json={"status": "PICKED_UP"},
    )
    assert picked_up.status_code == 200
    assert picked_up.json()["donation"]["picked_up_at"] is not None

    listed = api_client.get("/api/donation/batches").json()["batches"]
    returned_batch = next(item for item in listed if item["id"] == batch["id"])
    assert returned_batch["status"] == "PICKED_UP"
    assert returned_batch["safety_state"] == "picked_up"
    assert returned_batch["seconds_remaining"] is None
    assert returned_batch["countdown_display"] == "Picked Up"


def test_expired_available_batch_still_shows_expired(api_client):
    prepared_time = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    batch = _create_batch(api_client, prepared_time=prepared_time)

    listed = api_client.get("/api/donation/batches").json()["batches"]
    returned_batch = next(item for item in listed if item["id"] == batch["id"])
    assert returned_batch["status"] == "EXPIRED"
    assert returned_batch["safety_state"] == "expired"
    assert returned_batch["seconds_remaining"] == 0
    assert returned_batch["is_expired"] is True