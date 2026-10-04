from typing import Annotated, Optional

from pydantic import BaseModel, EmailStr, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]


class ContactRequest(BaseModel):
    """
    "Request a Technical Conversation" submission from the public
    landing/marketing page.

    Length caps mirror the form's client-side validation. `website` is a
    honeypot: the field is visually hidden on the form, so only bots fill it in.
    """

    first_name: Name
    last_name: Name
    email: EmailStr
    company: Optional[ShortText] = None
    role: Optional[ShortText] = None
    environment: Optional[LongText] = None
    website: Optional[str] = None
