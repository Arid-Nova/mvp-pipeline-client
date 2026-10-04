import asyncio
from datetime import datetime, timezone

from bson import ObjectId

from app.services.configdb import config_db_service

from conftest import LEAD_ID, VALID_CONTACT, fake_collection

VISITOR = "visitor-123"
ANSWERS = {
    "country": "United States",
    "state": "Arizona",
    "industry_category": "Software",
    "employment_level": "Senior",
    "years_of_experience": "5-10",
    "microservices_experience": True,
}


def run(coro):
    return asyncio.run(coro)


def upsert(monkeypatch, profile, visitor_id=VISITOR):
    collection = fake_collection(update_one=None, find_one={"visit_count": 1})
    monkeypatch.setattr(config_db_service, "demographics_collection", collection)
    run(config_db_service.upsert_demographics(visitor_id, profile, "203.0.113.9", {"country": "US"}))
    return collection


def update_doc(collection):
    query, update = collection.update_one.await_args.args
    assert query == {"visitor_id": VISITOR}
    assert collection.update_one.await_args.kwargs == {"upsert": True}
    return update


def empty_profile(**overrides):
    profile = {key: None for key in ANSWERS}
    profile["skipped"] = False
    return {**profile, **overrides}


# --- demographics: keep the latest answers --------------------------------------------------

def test_answered_visit_sets_answers(monkeypatch):
    update = update_doc(upsert(monkeypatch, {**ANSWERS, "skipped": False}))

    for key, value in ANSWERS.items():
        assert update["$set"][key] == value
    assert update["$set"]["skipped"] is False
    assert update["$set"]["answers_updated_at"].tzinfo is not None
    assert update["$setOnInsert"]["visitor_id"] == VISITOR
    assert update["$inc"] == {"visit_count": 1}


def test_skipped_visit_never_touches_answers(monkeypatch):
    update = update_doc(upsert(monkeypatch, empty_profile(skipped=True)))

    for key in ANSWERS:
        assert key not in update["$set"]
        assert key not in update["$setOnInsert"]
    assert "answers_updated_at" not in update["$set"]
    # Only recorded as skipped when the document is first created.
    assert update["$setOnInsert"]["skipped"] is True
    assert "skipped" not in update["$set"]


def test_partial_answer_only_sets_provided_fields(monkeypatch):
    update = update_doc(upsert(monkeypatch, empty_profile(industry_category="Finance")))

    assert update["$set"]["industry_category"] == "Finance"
    for key in ANSWERS.keys() - {"industry_category"}:
        assert key not in update["$set"]


def test_false_answer_is_kept_not_treated_as_missing(monkeypatch):
    update = update_doc(upsert(monkeypatch, empty_profile(microservices_experience=False)))

    assert update["$set"]["microservices_experience"] is False


def test_no_key_is_in_both_set_and_set_on_insert(monkeypatch):
    for profile in ({**ANSWERS, "skipped": False}, empty_profile(skipped=True)):
        update = update_doc(upsert(monkeypatch, profile))
        assert not (update["$set"].keys() & update["$setOnInsert"].keys())


def test_each_visit_entry_records_whether_it_was_skipped(monkeypatch):
    answered = update_doc(upsert(monkeypatch, {**ANSWERS, "skipped": False}))
    skipped = update_doc(upsert(monkeypatch, empty_profile(skipped=True)))

    assert answered["$push"]["visits"]["skipped"] is False
    assert skipped["$push"]["visits"]["skipped"] is True
    assert skipped["$push"]["visits"]["ip_address"] == "203.0.113.9"


def test_returns_visit_count(monkeypatch):
    collection = fake_collection(update_one=None, find_one={"visit_count": 3})
    monkeypatch.setattr(config_db_service, "demographics_collection", collection)

    result = run(config_db_service.upsert_demographics(VISITOR, {**ANSWERS, "skipped": False}, None, None))

    assert result == {"visitor_id": VISITOR, "visit_count": 3}


# --- contact requests ---------------------------------------------------------------------

def test_save_contact_request_document_shape(monkeypatch):
    collection = fake_collection(insert_one=type("Result", (), {"inserted_id": ObjectId(LEAD_ID)})())
    monkeypatch.setattr(config_db_service, "contact_collection", collection)

    lead_id, created_at = run(config_db_service.save_contact_request(VALID_CONTACT, "203.0.113.9"))

    document = collection.insert_one.await_args.args[0]
    assert document == {**VALID_CONTACT, "ip_address": "203.0.113.9",
                        "created_at": created_at, "email_status": "pending"}
    assert created_at.tzinfo is not None
    assert lead_id == LEAD_ID


def test_count_recent_contact_requests_filters_by_ip_and_time(monkeypatch):
    collection = fake_collection(count_documents=2)
    monkeypatch.setattr(config_db_service, "contact_collection", collection)
    since = datetime(2026, 10, 4, 11, 0, tzinfo=timezone.utc)

    count = run(config_db_service.count_recent_contact_requests("203.0.113.9", since))

    assert count == 2
    collection.count_documents.assert_awaited_once_with(
        {"ip_address": "203.0.113.9", "created_at": {"$gte": since}}
    )


def test_set_contact_email_status(monkeypatch):
    collection = fake_collection(update_one=None)
    monkeypatch.setattr(config_db_service, "contact_collection", collection)

    run(config_db_service.set_contact_email_status(LEAD_ID, "sent", message_id="msg-1"))

    query, update = collection.update_one.await_args.args
    assert query == {"_id": ObjectId(LEAD_ID)}
    fields = update["$set"]
    assert fields["email_status"] == "sent"
    assert fields["email_message_id"] == "msg-1"
    assert fields["email_error"] is None
    assert fields["email_updated_at"].tzinfo is not None


def test_ensure_indexes_adds_contact_rate_limit_index(monkeypatch):
    demographics = fake_collection(create_index=None)
    contacts = fake_collection(create_index=None)
    monkeypatch.setattr(config_db_service, "demographics_collection", demographics)
    monkeypatch.setattr(config_db_service, "contact_collection", contacts)

    run(config_db_service.ensure_indexes())

    demographics.create_index.assert_awaited_once_with("visitor_id", unique=True, sparse=True)
    contacts.create_index.assert_awaited_once_with([("ip_address", 1), ("created_at", -1)])
