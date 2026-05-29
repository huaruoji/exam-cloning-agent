from datetime import datetime
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
    title: str
    original_filename: str
    stored_filename: str
    file_path: str
    document_type: DocumentType
    status: DocumentStatus = DocumentStatus.UPLOADED
    detected_course_name: Optional[str] = None
    page_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    document_type: Optional[DocumentType] = None
