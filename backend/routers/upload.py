import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from config import UPLOAD_DIR
from models.document import DocumentType
from routers.deps import get_user_id
from services.ingestion import enqueue_document_job, enqueue_text_job
from services.store import courses_table, documents_table

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


def _ensure_course(course_id: str | None, course_name: str | None, user_id: str) -> dict:
    courses = courses_table.load()
    if course_id:
        course = next((c for c in courses if c["id"] == course_id), None)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        return course

    clean_name = (course_name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="course_name is required when course_id is missing")

    existing = next((c for c in courses if c["name"].lower() == clean_name.lower()), None)
    if existing:
        return existing

    now = datetime.now(timezone.utc).isoformat()
    course = {
        "id": uuid.uuid4().hex[:10],
        "name": clean_name,
        "user_id": user_id,
        "auto_detected_name": None,
        "created_at": now,
        "updated_at": now,
    }
    courses.append(course)
    courses_table.save(courses)
    return course


@router.post("")
async def upload_document(
    file: UploadFile = File(...),
    document_type: DocumentType = Form(...),
    course_id: str | None = Form(default=None),
    course_name: str | None = Form(default=None),
    user_id: str = Depends(get_user_id),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    course = _ensure_course(course_id, course_name, user_id)

    document_id = uuid.uuid4().hex[:10]
    stored_filename = f"{document_id}_{os.path.basename(file.filename)}"
    file_path = os.path.join(UPLOAD_DIR, stored_filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())

    now = datetime.now(timezone.utc).isoformat()
    document = {
        "id": document_id,
        "course_id": course["id"],
        "user_id": user_id,
        "title": os.path.splitext(file.filename)[0],
        "original_filename": file.filename,
        "stored_filename": stored_filename,
        "file_path": file_path,
        "document_type": document_type.value,
        "status": "uploaded",
        "detected_course_name": None,
        "page_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    documents_table.append(document)
    job = enqueue_document_job(course["id"], document_id, user_id)

    return {
        "course": course,
        "document": document,
        "job": job,
    }


class TextUploadRequest(BaseModel):
    course_id: str | None = None
    course_name: str | None = None
    document_type: DocumentType
    title: str
    text: str


@router.post("/text")
async def upload_text(
    payload: TextUploadRequest,
    user_id: str = Depends(get_user_id),
):
    """Create a document from raw text (no file upload) and enqueue a parse job."""
    course = _ensure_course(payload.course_id, payload.course_name, user_id)

    document_id = uuid.uuid4().hex[:10]
    now = datetime.now(timezone.utc).isoformat()
    document = {
        "id": document_id,
        "course_id": course["id"],
        "user_id": user_id,
        "title": payload.title.strip(),
        "original_filename": "",
        "stored_filename": None,
        "file_path": None,
        "document_type": payload.document_type.value if hasattr(payload.document_type, "value") else payload.document_type,
        "status": "uploaded",
        "detected_course_name": None,
        "page_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    documents_table.append(document)
    job = enqueue_text_job(course["id"], document_id, payload.text, user_id)

    return {
        "course": course,
        "document": document,
        "job": job,
    }
