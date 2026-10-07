import os
from datetime import datetime
from typing import Optional

from azure.communication.email import EmailClient

MISSING = "—"


class NotifierNotConfigured(Exception):
    """ACS env vars are missing (e.g. local dev). The lead is still stored."""


def _settings() -> Optional[tuple[str, str, list[str]]]:
    connection_string = os.getenv("ACS_CONNECTION_STRING")
    sender = os.getenv("ACS_SENDER_ADDRESS")
    recipients = [
        address.strip()
        for address in os.getenv("CONTACT_NOTIFY_TO", "").split(",")
        if address.strip()
    ]
    if not (connection_string and sender and recipients):
        return None
    return connection_string, sender, recipients


def _one_line(value: str) -> str:
    # Collapse any line breaks/extra whitespace so user input can't reshape the subject.
    return " ".join(value.split())


def build_contact_message(lead: dict, lead_id: str, created_at: datetime,
                          sender: str, recipients: list[str]) -> dict:
    """
    Build the ACS email payload for a new contact request.

    Plain text only, so visitor input can't inject HTML. The visitor's address
    goes in `replyTo` (never `to`): the recipients are fixed by configuration,
    so the endpoint can't be used to email third parties.
    """
    full_name = _one_line(f"{lead['first_name']} {lead['last_name']}")
    company = lead.get("company")

    subject = f"Technical conversation request: {full_name}"
    if company:
        subject += f" ({_one_line(company)})"

    body = "\n".join([
        'New "Request a Technical Conversation" submission on aridnova.net.',
        "",
        f"Name:         {full_name}",
        f"Email:        {lead['email']}",
        f"Company:      {company or MISSING}",
        f"Role:         {lead.get('role') or MISSING}",
        "",
        "Environment:",
        lead.get("environment") or MISSING,
        "",
        f"Submitted:    {created_at.strftime('%Y-%m-%d %H:%M UTC')}",
        f"Lead ID:      {lead_id}",
        "",
        f"Reply to this email to respond to {_one_line(lead['first_name'])} directly.",
    ])

    return {
        "senderAddress": sender,
        "recipients": {"to": [{"address": address} for address in recipients]},
        "replyTo": [{"address": lead["email"], "displayName": full_name}],
        "content": {"subject": subject, "plainText": body},
    }


def send_contact_notification(lead: dict, lead_id: str, created_at: datetime) -> str:
    """
    Send the notification email and return the ACS message id.

    Synchronous on purpose: callers run it via `run_in_threadpool`, which avoids
    the extra aiohttp dependency the async ACS client needs.
    """
    settings = _settings()
    if settings is None:
        raise NotifierNotConfigured()
    connection_string, sender, recipients = settings

    client = EmailClient.from_connection_string(connection_string)
    message = build_contact_message(lead, lead_id, created_at, sender, recipients)
    result = client.begin_send(message).result()

    if result.get("status") != "Succeeded":
        raise RuntimeError(f"ACS send finished with status {result.get('status')}: {result.get('error')}")
    return result["id"]
