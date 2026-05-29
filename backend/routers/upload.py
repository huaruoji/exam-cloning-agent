import os
import json
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from services.pdf_parser import process_pdf
from config import UPLOAD_DIR, DATA_DIR

router = APIRouter(prefix="/api/upload", tags=["upload"])


def _load_questions() -> list[dict]:
    path = os.path.join(DATA_DIR, "questions.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return []


def _save_questions(questions: list[dict]):
    path = os.path.join(DATA_DIR, "questions.json")
    with open(path, "w") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)


def _load_style_profiles() -> list[dict]:
    path = os.path.join(DATA_DIR, "style_profiles.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return []


def _save_style_profiles(profiles: list[dict]):
    path = os.path.join(DATA_DIR, "style_profiles.json")
    with open(path, "w") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)


@router.post("")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF file and parse it into structured questions."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Save uploaded file
    file_id = str(uuid.uuid4())[:8]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        questions, style = await process_pdf(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")

    # Save questions
    existing = _load_questions()
    existing.extend(questions)
    _save_questions(existing)

    # Save style profile
    profiles = _load_style_profiles()
    profiles.append({
        "id": file_id,
        "filename": file.filename,
        "style": style,
        "question_count": len(questions),
    })
    _save_style_profiles(profiles)

    return {
        "file_id": file_id,
        "filename": file.filename,
        "questions_parsed": len(questions),
        "style_profile": style,
    }
