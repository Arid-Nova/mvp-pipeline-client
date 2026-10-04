from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.main import CONTACT_RATE_LIMIT_PER_HOUR
from app.services.notifier import NotifierNotConfigured

from conftest import CREATED_AT, LEAD_ID, VALID_CONTACT

EXPECTED_LEAD = {**VALID_CONTACT}


def test_valid_submission_saves_lead_then_sends_email(client, db, send):
    response = client.post("/users/contact", json=VALID_CONTACT)

    assert response.status_code == 200
    assert response.json() == {"message": "Received", "id": LEAD_ID}
    db.save_contact_request.assert_awaited_once_with(EXPECTED_LEAD, "testclient")
    send.assert_called_once_with(EXPECTED_LEAD, LEAD_ID, CREATED_AT)
    db.set_contact_email_status.assert_awaited_once_with(LEAD_ID, "sent", message_id="acs-message-id")


def test_optional_fields_can_be_omitted(client, db, send):
    minimal = {"first_name": "Ada", "last_name": "Okafor", "email": "ada@company.com"}

    response = client.post("/users/contact", json=minimal)

    assert response.status_code == 200
    saved_lead = db.save_contact_request.await_args.args[0]
    assert saved_lead == {**minimal, "company": None, "role": None, "environment": None}


def test_fields_are_trimmed(client, db, send):
    payload = {**VALID_CONTACT, "first_name": "  Ada  ", "company": " Acme Cloud "}

    client.post("/users/contact", json=payload)

    saved_lead = db.save_contact_request.await_args.args[0]
    assert saved_lead["first_name"] == "Ada"
    assert saved_lead["company"] == "Acme Cloud"


def test_honeypot_pretends_success_and_stores_nothing(client, db, send):
    response = client.post("/users/contact", json={**VALID_CONTACT, "website": "http://spam.example"})

    assert response.status_code == 200
    assert response.json() == {"message": "Received"}
    db.count_recent_contact_requests.assert_not_awaited()
    db.save_contact_request.assert_not_awaited()
    send.assert_not_called()


def test_empty_honeypot_is_ignored(client, db, send):
    response = client.post("/users/contact", json={**VALID_CONTACT, "website": ""})

    assert response.status_code == 200
    db.save_contact_request.assert_awaited_once()


@pytest.mark.parametrize("override", [
    {"first_name": None},
    {"first_name": "   "},
    {"first_name": "A" * 101},
    {"last_name": ""},
    {"email": "not-an-email"},
    {"company": "C" * 201},
    {"environment": "E" * 5001},
])
def test_invalid_payload_is_rejected_without_saving(client, db, send, override):
    payload = {key: value for key, value in {**VALID_CONTACT, **override}.items() if value is not None}

    response = client.post("/users/contact", json=payload)

    assert response.status_code == 422
    db.save_contact_request.assert_not_awaited()
    send.assert_not_called()


def test_rate_limit_rejects_at_the_limit(client, db, send):
    db.count_recent_contact_requests.return_value = CONTACT_RATE_LIMIT_PER_HOUR

    response = client.post("/users/contact", json=VALID_CONTACT)

    assert response.status_code == 429
    db.save_contact_request.assert_not_awaited()
    send.assert_not_called()


def test_rate_limit_allows_just_below_the_limit(client, db, send):
    db.count_recent_contact_requests.return_value = CONTACT_RATE_LIMIT_PER_HOUR - 1

    response = client.post("/users/contact", json=VALID_CONTACT)

    assert response.status_code == 200
    db.save_contact_request.assert_awaited_once()


def test_rate_limit_counts_the_last_hour(client, db, send):
    before = datetime.now(timezone.utc)

    client.post("/users/contact", json=VALID_CONTACT)

    ip_address, since = db.count_recent_contact_requests.await_args.args
    assert ip_address == "testclient"
    assert since.tzinfo is not None
    assert before - timedelta(hours=1, seconds=5) <= since <= datetime.now(timezone.utc) - timedelta(hours=1)


def test_client_ip_comes_from_first_forwarded_hop(client, db, send):
    client.post("/users/contact", json=VALID_CONTACT,
                headers={"X-Forwarded-For": "203.0.113.9, 10.0.0.1"})

    assert db.count_recent_contact_requests.await_args.args[0] == "203.0.113.9"
    assert db.save_contact_request.await_args.args[1] == "203.0.113.9"


def test_send_failure_still_returns_200_and_marks_failed(client, db, send):
    send.side_effect = RuntimeError("ACS unavailable")

    response = client.post("/users/contact", json=VALID_CONTACT)

    assert response.status_code == 200
    assert response.json()["id"] == LEAD_ID
    db.set_contact_email_status.assert_awaited_once_with(LEAD_ID, "failed", error="ACS unavailable")


def test_failure_error_text_is_truncated(client, db, send):
    send.side_effect = RuntimeError("x" * 600)

    client.post("/users/contact", json=VALID_CONTACT)

    assert len(db.set_contact_email_status.await_args.kwargs["error"]) == 500


def test_not_configured_marks_status(client, db, send):
    send.side_effect = NotifierNotConfigured()

    response = client.post("/users/contact", json=VALID_CONTACT)

    assert response.status_code == 200
    db.set_contact_email_status.assert_awaited_once_with(LEAD_ID, "not_configured")


def test_missing_acs_env_never_reaches_acs(client, db):
    # Real notifier, no ACS env vars (cleared by the autouse fixture).
    with patch("app.services.notifier.EmailClient") as email_client:
        response = client.post("/users/contact", json=VALID_CONTACT)

    assert response.status_code == 200
    email_client.from_connection_string.assert_not_called()
    db.set_contact_email_status.assert_awaited_once_with(LEAD_ID, "not_configured")


def test_cors_preflight_allows_landing_origin(client):
    response = client.options("/users/contact", headers={
        "Origin": "https://aridnova.net",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://aridnova.net"


def test_cors_preflight_rejects_unknown_origin(client):
    response = client.options("/users/contact", headers={
        "Origin": "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
