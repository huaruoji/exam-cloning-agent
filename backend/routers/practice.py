import random
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from models.compute import ModelRequestConfig
from models.student import StudentState
from routers.deps import get_model_request_config, get_user_id
from services.adaptive_engine import (
    get_current_difficulty,
    get_due_concepts,
    get_weakest_concepts,
    record_answer,
)
from services.ingestion import get_course_profile
from services.grader import grade
from services.question_generator import generate_question
from services.compute import record_bank_reuse
from services.store import courses_table, practice_history_table, questions_table, student_states_table

router = APIRouter(prefix="/api/practice", tags=["practice"])


def _load_state(course_id: str, user_id: str) -> StudentState:
    payload = next(
        (item for item in student_states_table.load()
         if item["course_id"] == course_id and item.get("user_id", "public") == user_id),
        None,
    )
    if payload:
        return StudentState(**payload["state"])
    return StudentState()


def _save_state(course_id: str, user_id: str, state: StudentState):
    rows = student_states_table.load()
    found = False
    for row in rows:
        if row["course_id"] == course_id and row.get("user_id", "public") == user_id:
            row["state"] = state.model_dump(mode="json")
            found = True
            break
    if not found:
        rows.append({"course_id": course_id, "user_id": user_id, "state": state.model_dump(mode="json")})
    student_states_table.save(rows)


def _log_history(course_id: str, user_id: str, question: dict | None, action: str, answer: str,
                 correct: bool | None, concept: str, mastery_after: float):
    """Log a practice action to history, denormalising the full question content.
    Only 'submit' actions are logged; other actions (next, reveal, report) are ephemeral.
    """
    if action != "submit":
        return  # only submit goes into history
    record = {
        "id": uuid.uuid4().hex[:10],
        "course_id": course_id,
        "user_id": user_id,
        "question_id": question.get("id") if question else "",
        "action": action,
        "answer": answer,
        "correct": correct,
        "concept": concept,
        "mastery_after": mastery_after,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Denormalise question content so the review page never shows "Question unavailable".
    if question:
        record["question"] = {
            "content": question.get("content", ""),
            "question_type": question.get("question_type", ""),
            "difficulty": question.get("difficulty", ""),
            "topic": question.get("topic", ""),
            "options": question.get("options"),
            "answer": question.get("answer", ""),
            "explanation": question.get("explanation", ""),
        }
    practice_history_table.append(record)


class PracticeRequest(BaseModel):
    course_id: str
    allow_ai: bool = True  # whether to generate new questions when the bank is empty
    topic: Optional[str] = None  # restrict to a specific topic


class AnswerSubmission(BaseModel):
    course_id: str
    question_id: str
    answer: str = Field(default="", max_length=20_000)
    concept: str | None = Field(default=None, max_length=200)
    correct: bool | None = None
    action: str = "submit"  # submit | reveal | report | next


@router.post("/next")
async def get_next_question(
    request: PracticeRequest,
    user_id: str = Depends(get_user_id),
    model_config: ModelRequestConfig = Depends(get_model_request_config),
):
    course_id = request.course_id
    course = next(
        (course for course in courses_table.load()
         if course.get("id") == course_id and course.get("user_id", "public") in (user_id, "public")),
        None,
    )
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    state = _load_state(course_id, user_id)

    # Filter bank questions by user and course
    all_bank = [
        q for q in questions_table.load()
        if q.get("course_id") == course_id
        and q.get("user_id", "public") in (user_id, "public")
        and q.get("source_type") != "generated"
    ]

    profile = get_course_profile(course_id)

    difficulty = get_current_difficulty(state)
    due_concepts = get_due_concepts(state)
    weak_concepts = get_weakest_concepts(state, n=3)

    question = None
    source = "bank"

    # Determine candidate pool: intersect due + weak, then optionally filter by topic
    priority_topics = list(dict.fromkeys(due_concepts + weak_concepts))  # ordered, no dupes

    # If request.topic is given, restrict to that
    topic_filter = request.topic
    if topic_filter:
        all_bank = [q for q in all_bank if q.get("topic") == topic_filter]

    # 1. Prefer: same difficulty + priority topic
    if priority_topics:
        candidates = [
            q for q in all_bank
            if q.get("difficulty") == difficulty and q.get("topic") in priority_topics
        ]
        if candidates:
            question = random.choice(candidates)

    # 2. Fall back: same difficulty, any topic
    if not question:
        candidates = [q for q in all_bank if q.get("difficulty") == difficulty]
        if candidates:
            question = random.choice(candidates)

    # 3. Fall back: any bank question
    if not question and all_bank:
        question = random.choice(all_bank)
        source = "bank"

    # 4. Generate (only if allow_ai)
    if not question and request.allow_ai:
        style = (profile or {}).get("style_profile", {})
        knowledge = (profile or {}).get("knowledge_profile", {})
        question_type = "short_answer"
        dist = style.get("question_type_distribution", {})
        if dist:
            question_type = max(dist, key=dist.get)
        gen_topics = priority_topics or knowledge.get("topics", []) or ["general"]
        if topic_filter:
            gen_topics = [topic_filter]
        question = await generate_question(
            topic=random.choice(gen_topics),
            difficulty=difficulty,
            question_type=question_type,
            exam_style_description=style.get("description", ""),
            context=f"Course topics: {', '.join(knowledge.get('topics', [])[:15])}",
            model_config=model_config,
        )
        if question is None:
            return {"source": None, "question": None}
        question["course_id"] = course_id
        question["user_id"] = user_id
        question["source_type"] = "generated"
        source = "generated"

        # Persist generated question so /answer can find it
        questions_table.append(question)

    if not question:
        return {"source": None, "question": None}

    if source == "bank":
        await record_bank_reuse("practice")

    return {"source": source, "question": question}


@router.post("/answer")
async def submit_answer(
    submission: AnswerSubmission,
    user_id: str = Depends(get_user_id),
    model_config: ModelRequestConfig = Depends(get_model_request_config),
):
    state = _load_state(submission.course_id, user_id)
    question = next(
        (q for q in questions_table.load()
         if q.get("id") == submission.question_id
         and q.get("course_id") == submission.course_id
         and q.get("user_id", "public") in (user_id, "public")),
        None,
    )
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    action = submission.action

    # Use the question's actual topic if concept isn't explicitly provided.
    concept = submission.concept or (question.get("topic") if question else None) or "unknown"

    correct: bool | None = None
    grading = {"grading_failed": False}
    feedback = ""
    explanation = question.get("explanation", "") if question else ""
    correct_answer = question.get("answer", "") if question else ""
    missing_steps: list[str] = []
    wrong_concepts: list[str] = []
    suggestion = ""

    if action == "submit":
        grading = await grade(
            question,
            submission.answer,
            user_api_key=model_config.api_key,
            model_config=model_config,
        )
        correct = grading["correct"]
        feedback = grading["feedback"]
        missing_steps = grading.get("missing_steps", [])
        wrong_concepts = grading.get("wrong_concepts", [])
        suggestion = grading.get("suggestion", "")

        # Update mastery on real attempts (pass confidence=3).
        if correct is not None:
            state = record_answer(state, concept, correct, confidence=3)
            _save_state(submission.course_id, user_id, state)

    elif action == "reveal":
        correct = None
        correct_answer = (question.get("answer") if question else "") or ""

    # report / next → no effect on state, no history entry.

    mastery_after = state.concept_mastery[concept].score if concept in state.concept_mastery else 0.5
    _log_history(submission.course_id, user_id, question, action, submission.answer, correct, concept, mastery_after)

    # Return the full question content for "reveal" so the frontend can show it.
    return {
        "correct": correct,
        "concept": concept,
        "feedback": feedback,
        "missing_steps": missing_steps,
        "wrong_concepts": wrong_concepts,
        "suggestion": suggestion,
        "explanation": explanation,
        "correct_answer": correct_answer,
        "mastery_score": mastery_after,
        "grading_failed": grading.get("grading_failed", False),
        "overall_accuracy": state.total_correct / state.total_questions_attempted if state.total_questions_attempted > 0 else 0,
    }
