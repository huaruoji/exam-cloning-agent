import os
import json
import uuid
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from config import DATA_DIR
from services.question_generator import generate_question

router = APIRouter(prefix="/api/exam", tags=["exam"])


def _load_questions() -> list[dict]:
    path = os.path.join(DATA_DIR, "questions.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return []


def _load_style_profiles() -> list[dict]:
    path = os.path.join(DATA_DIR, "style_profiles.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return []


class ExamRequest(BaseModel):
    num_questions: Optional[int] = 10
    time_limit_minutes: Optional[int] = 60


@router.post("/generate")
async def generate_exam(request: ExamRequest):
    """Generate a mock exam that clones the style of uploaded exams."""
    profiles = _load_style_profiles()
    existing = _load_questions()

    if not profiles:
        return {"error": "No exam style profiles found. Upload an exam PDF first."}

    style = profiles[0]["style"]
    style_desc = style.get("description", "")
    type_dist = style.get("question_type_distribution", {"short_answer": 1.0})
    diff_dist = style.get("difficulty_distribution", {"medium": 1.0})
    topics = style.get("key_topics", [])

    # Determine how many of each type
    num = min(request.num_questions or 10, 20)
    questions = []

    # Mix existing and generated
    import random

    for i in range(num):
        # Pick question type based on distribution
        r = random.random()
        cumulative = 0
        q_type = "short_answer"
        for t, p in type_dist.items():
            cumulative += p
            if r <= cumulative:
                q_type = t
                break

        # Pick difficulty based on distribution
        r = random.random()
        cumulative = 0
        difficulty = "medium"
        for d, p in diff_dist.items():
            cumulative += p
            if r <= cumulative:
                difficulty = d
                break

        topic = random.choice(topics) if topics else "general"

        # Try existing first
        candidates = [
            q for q in existing
            if q.get("question_type") == q_type and q.get("difficulty") == difficulty
        ]
        if candidates and random.random() < 0.5:
            questions.append(random.choice(candidates))
        else:
            q = await generate_question(
                topic=topic,
                difficulty=difficulty,
                question_type=q_type,
                exam_style_description=style_desc,
            )
            questions.append(q)

    exam = {
        "id": str(uuid.uuid4())[:8],
        "title": f"Mock Exam ({len(questions)} questions)",
        "style_profile": style,
        "questions": questions,
        "time_limit_minutes": request.time_limit_minutes,
    }

    return exam


@router.get("/styles")
async def list_styles():
    """List all uploaded exam style profiles."""
    profiles = _load_style_profiles()
    return {"profiles": profiles}
