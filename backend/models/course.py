from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Course(BaseModel):
    id: str
    name: str
    auto_detected_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CourseCreate(BaseModel):
    name: str


class CourseUpdate(BaseModel):
    name: str
