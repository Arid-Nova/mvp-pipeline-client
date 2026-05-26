from pydantic import BaseModel

class FeedbackRequest(BaseModel):
    rating: int
    comments: str