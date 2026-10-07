import os
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

# Must be set before `app` is imported: ConfigDatabase() needs a database name
# at import time, and the CORS origins are read once when the app is built.
os.environ.setdefault("MONGO_DB", "test")
os.environ.setdefault("LANDING_ORIGINS", "https://aridnova.net")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.configdb import config_db_service  # noqa: E402

LEAD_ID = "652f0c0c0c0c0c0c0c0c0c0c"
CREATED_AT = datetime(2026, 10, 4, 12, 0, tzinfo=timezone.utc)

VALID_CONTACT = {
    "first_name": "Ada",
    "last_name": "Okafor",
    "email": "ada@company.com",
    "company": "Acme Cloud",
    "role": "Platform / Infrastructure engineer",
    "environment": "~120 Java microservices on Azure",
}


@pytest.fixture(autouse=True)
def no_acs_env(monkeypatch):
    for name in ("ACS_CONNECTION_STRING", "ACS_SENDER_ADDRESS", "CONTACT_NOTIFY_TO"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def client():
    # No `with` block on purpose: entering it runs the lifespan, whose
    # ensure_indexes() would try to reach the real MongoDB.
    return TestClient(app)


@pytest.fixture
def db(monkeypatch):
    mocks = SimpleNamespace(
        count_recent_contact_requests=AsyncMock(return_value=0),
        save_contact_request=AsyncMock(return_value=(LEAD_ID, CREATED_AT)),
        set_contact_email_status=AsyncMock(),
    )
    for name, mock in vars(mocks).items():
        monkeypatch.setattr(config_db_service, name, mock)
    return mocks


@pytest.fixture
def send(monkeypatch):
    mock = Mock(return_value="acs-message-id")
    monkeypatch.setattr("app.main.send_contact_notification", mock)
    return mock


def fake_collection(**async_methods):
    """A Motor collection stand-in whose named methods are AsyncMocks."""
    collection = Mock()
    for name, return_value in async_methods.items():
        setattr(collection, name, AsyncMock(return_value=return_value))
    return collection
