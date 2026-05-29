from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobStage(str, Enum):
    UPLOADED = "uploaded"
    EXTRACTING_TEXT = "extracting_text"
    PARSING_QUESTIONS = "parsing_questions"
    ANALYZING_STYLE = "analyzing_style"
    INDEXING_MATERIALS = "indexing_materials"
    COMPLETED = "completed"
    FAILED = "failed"


class Job(BaseModel):
    id: str
    course_id: str
    document_id: str
    status: JobStatus = JobStatus.QUEUED
    stage: JobStage = JobStage.UPLOADED
    progress: int = 0
    message: str = "Queued"
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
