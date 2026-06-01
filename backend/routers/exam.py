import random
import uuid

from fastapi import APIRouter
from pydantic import BaseModel

from services.ingestion import get_course_profile
from services.llm_client import grade_answer
from services.question_generator import generate_question
from services.store import questions_table

router = APIRouter(prefix="/api/exam", tags=["exam"])


class ExamRequest(BaseModel):
    course_id: str
    num_questions: int | None = 10
    time_limit_minutes: int | None = 60


class ExamAnswer(BaseModel):
    question_id: str
    answer: str


class ExamSubmission(BaseModel):
    course_id: str
    answers: list[ExamAnswer]


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


@router.post("/submit")
async def submit_exam(submission: ExamSubmission):
    """Grade all exam answers and return results."""
    all_questions = questions_table.load()
    results = []
    correct_count = 0

    for ans in submission.answers:
        question = next(
            (q for q in all_questions if q.get("id") == ans.question_id),
            None,
        )
        if not question:
            results.append({
                "question_id": ans.question_id,
                "correct": False,
                "feedback": "Question not found.",
                "correct_answer": "",
                "explanation": "",
            })
            continue

        qtype = question.get("question_type", "")
        if qtype == "mcq":
            correct = ans.answer.strip().upper() == question.get("answer", "").strip().upper()
            feedback = ""
        elif qtype == "true_false":
            correct = ans.answer.strip().lower() == question.get("answer", "").strip().lower()
            feedback = ""
        else:
            grading = await grade_answer(
                question_content=question.get("content", ""),
                correct_answer=question.get("answer", ""),
                student_answer=ans.answer,
                explanation=question.get("explanation", ""),
            )
            correct = grading["correct"]
            feedback = grading["feedback"]

        if correct:
            correct_count += 1

        results.append({
            "question_id": ans.question_id,
            "correct": correct,
            "feedback": feedback,
            "correct_answer": question.get("answer", ""),
            "explanation": question.get("explanation", ""),
        })

    total = len(submission.answers)
    return {
        "total": total,
        "correct_count": correct_count,
        "accuracy": correct_count / total if total > 0 else 0,
        "results": results,
    }
