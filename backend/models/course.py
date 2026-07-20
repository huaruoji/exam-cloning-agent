from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class Course(BaseModel):
    id: str
    name: str
    user_id: Optional[str] = None
    auto_detected_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CourseCreate(BaseModel):
    name: str


class CourseUpdate(BaseModel):
    name: str
