from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    PAST_EXAM = "past_exam"
    HOMEWORK = "homework"
    SLIDES = "slides"
    REFERENCE_PDF = "reference_pdf"


class DocumentStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Document(BaseModel):
    id: str
    course_id: str
    user_id: Optional[str] = None
    title: str
    original_filename: str
    stored_filename: Optional[str] = None
    file_path: Optional[str] = None
    document_type: DocumentType
    status: DocumentStatus = DocumentStatus.UPLOADED
    detected_course_name: Optional[str] = None
    page_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    document_type: Optional[DocumentType] = None
