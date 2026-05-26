from typing import Optional
from pydantic import BaseModel


class DemographicsRequest(BaseModel):
    """
    Anonymized demographics submitted by a demo visitor from the public
    landing/marketing page.

    Every field except `skipped` is optional so the same payload covers a
    fully-filled form, a partially-filled form, and a skipped form. `visitor_id`
    is an anonymous identifier the landing page generates and persists in the
    browser, used to recognise (and count) repeat visitors without storing PII.
    """

    visitor_id: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    industry_category: Optional[str] = None
    employment_level: Optional[str] = None        # e.g. Junior / Middle / Senior / Executive
    years_of_experience: Optional[str] = None      # string to allow ranges, e.g. "3-5", "10+"
    microservices_experience: Optional[bool] = None
    skipped: bool = False
