import random
import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from services.ingestion import get_course_profile
from services.question_generator import generate_question
from services.store import questions_table

router = APIRouter(prefix="/api/exam", tags=["exam"])


class ExamRequest(BaseModel):
    course_id: str
    num_questions: int | None = 10
    time_limit_minutes: int | None = 60


@router.post("/generate")
async def generate_exam(request: ExamRequest):
    profile = get_course_profile(request.course_id)
    questions = [q for q in questions_table.load() if q.get("course_id") == request.course_id]
    if not profile:
        return {"error": "No course profile found. Upload and process course documents first."}

    style = profile.get("style_profile", {})
    knowledge = profile.get("knowledge_profile", {})
    num = min(request.num_questions or 10, 20)
    generated = []

    type_dist = style.get("question_type_distribution", {"short_answer": 1.0})
    diff_dist = style.get("difficulty_distribution", {"medium": 1.0})
    topics = knowledge.get("topics", []) or style.get("key_topics", []) or ["general"]

    for _ in range(num):
        q_type = random.choices(list(type_dist.keys()), weights=list(type_dist.values()), k=1)[0]
        difficulty = random.choices(list(diff_dist.keys()), weights=list(diff_dist.values()), k=1)[0]
        topic = random.choice(topics)

        candidates = [
            q
            for q in questions
            if q.get("question_type") == q_type and q.get("difficulty") == difficulty
        ]
        if candidates and random.random() < 0.6:
            generated.append(random.choice(candidates))
        else:
            new_q = await generate_question(
                topic=topic,
                difficulty=difficulty,
                question_type=q_type,
                exam_style_description=style.get("description", ""),
                context=f"Course topics: {', '.join(topics[:15])}",
            )
            new_q["course_id"] = request.course_id
            generated.append(new_q)

    return {
        "id": uuid.uuid4().hex[:8],
        "title": f"Mock Exam ({len(generated)} questions)",
        "style_profile": style,
        "questions": generated,
        "time_limit_minutes": request.time_limit_minutes,
    }


@router.get("/styles")
async def list_styles(course_id: str):
    profile = get_course_profile(course_id)
    return {"profile": profile}
