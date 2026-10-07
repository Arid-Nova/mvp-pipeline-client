from unittest.mock import Mock, patch

import pytest

from app.services.notifier import (
    MISSING,
    NotifierNotConfigured,
    build_contact_message,
    send_contact_notification,
)

from conftest import CREATED_AT, LEAD_ID, VALID_CONTACT

SENDER = "DoNotReply@example.azurecomm.net"


def build(lead=None, recipients=("team@example.com",)):
    return build_contact_message(lead or VALID_CONTACT, LEAD_ID, CREATED_AT, SENDER, list(recipients))


@pytest.fixture
def acs_env(monkeypatch):
    monkeypatch.setenv("ACS_CONNECTION_STRING", "endpoint=https://x.communication.azure.com/;accesskey=k")
    monkeypatch.setenv("ACS_SENDER_ADDRESS", SENDER)
    monkeypatch.setenv("CONTACT_NOTIFY_TO", "team@example.com")


def fake_email_client(result):
    client = Mock()
    client.begin_send.return_value.result.return_value = result
    return client


def test_message_goes_to_configured_recipients_and_replies_to_visitor():
    message = build(recipients=["a@example.com", "b@example.com"])

    assert message["senderAddress"] == SENDER
    assert message["recipients"] == {"to": [{"address": "a@example.com"}, {"address": "b@example.com"}]}
    assert message["replyTo"] == [{"address": "ada@company.com", "displayName": "Ada Okafor"}]


def test_message_body_is_plain_text_with_every_field():
    content = build()["content"]

    assert set(content) == {"subject", "plainText"}
    body = content["plainText"]
    for value in ("Ada Okafor", "ada@company.com", "Acme Cloud",
                  "Platform / Infrastructure engineer", "~120 Java microservices on Azure",
                  "2026-10-04 12:00 UTC", LEAD_ID):
        assert value in body


def test_subject_includes_company_when_given():
    assert build()["content"]["subject"] == "Technical conversation request: Ada Okafor (Acme Cloud)"


def test_subject_omits_company_when_missing():
    lead = {**VALID_CONTACT, "company": None}

    assert build(lead)["content"]["subject"] == "Technical conversation request: Ada Okafor"


def test_subject_collapses_line_breaks_from_user_input():
    lead = {**VALID_CONTACT, "first_name": "Ada\r\nBcc: x@evil.example", "company": "Acme\nCloud"}

    subject = build(lead)["content"]["subject"]

    assert "\n" not in subject and "\r" not in subject
    assert subject == "Technical conversation request: Ada Bcc: x@evil.example Okafor (Acme Cloud)"


def test_missing_optional_fields_show_placeholder():
    lead = {**VALID_CONTACT, "company": None, "role": None, "environment": None}

    body = build(lead)["content"]["plainText"]

    assert f"Company:      {MISSING}" in body
    assert f"Role:         {MISSING}" in body
    assert f"Environment:\n{MISSING}" in body


@pytest.mark.parametrize("missing", ["ACS_CONNECTION_STRING", "ACS_SENDER_ADDRESS", "CONTACT_NOTIFY_TO"])
def test_send_requires_every_setting(acs_env, monkeypatch, missing):
    monkeypatch.delenv(missing)

    with patch("app.services.notifier.EmailClient") as email_client, pytest.raises(NotifierNotConfigured):
        send_contact_notification(VALID_CONTACT, LEAD_ID, CREATED_AT)
    email_client.from_connection_string.assert_not_called()


def test_blank_recipient_list_counts_as_not_configured(acs_env, monkeypatch):
    monkeypatch.setenv("CONTACT_NOTIFY_TO", " , ")

    with pytest.raises(NotifierNotConfigured):
        send_contact_notification(VALID_CONTACT, LEAD_ID, CREATED_AT)


def test_send_returns_message_id_on_success(acs_env, monkeypatch):
    monkeypatch.setenv("CONTACT_NOTIFY_TO", "a@example.com, b@example.com")
    client = fake_email_client({"id": "msg-1", "status": "Succeeded", "error": None})

    with patch("app.services.notifier.EmailClient.from_connection_string", return_value=client) as factory:
        message_id = send_contact_notification(VALID_CONTACT, LEAD_ID, CREATED_AT)

    assert message_id == "msg-1"
    factory.assert_called_once_with("endpoint=https://x.communication.azure.com/;accesskey=k")
    sent = client.begin_send.call_args.args[0]
    assert sent == build(recipients=["a@example.com", "b@example.com"])


def test_send_raises_when_acs_reports_failure(acs_env):
    client = fake_email_client({"id": "msg-1", "status": "Failed", "error": {"message": "bad"}})

    with patch("app.services.notifier.EmailClient.from_connection_string", return_value=client):
        with pytest.raises(RuntimeError, match="Failed"):
            send_contact_notification(VALID_CONTACT, LEAD_ID, CREATED_AT)
