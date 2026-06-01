import random

from fastapi import APIRouter
from pydantic import BaseModel

from models.student import StudentState
from services.adaptive_engine import (
    get_current_difficulty,
    get_weakest_concepts,
    record_answer,
)
from services.ingestion import get_course_profile
from services.llm_client import grade_answer
from services.question_generator import generate_question
from services.store import questions_table, student_states_table

router = APIRouter(prefix="/api/practice", tags=["practice"])


def _load_state(course_id: str) -> StudentState:
    payload = next((item for item in student_states_table.load() if item["course_id"] == course_id), None)
    if payload:
        return StudentState(**payload["state"])
    return StudentState()


def _save_state(course_id: str, state: StudentState):
    rows = student_states_table.load()
    found = False
    for row in rows:
        if row["course_id"] == course_id:
            row["state"] = state.model_dump(mode="json")
            found = True
            break
    if not found:
        rows.append({"course_id": course_id, "state": state.model_dump(mode="json")})
    student_states_table.save(rows)


class PracticeRequest(BaseModel):
    course_id: str


class AnswerSubmission(BaseModel):
    course_id: str
    question_id: str
    answer: str
    concept: str | None = None
    correct: bool | None = None


@router.post("/next")
async def get_next_question(request: PracticeRequest):
    course_id = request.course_id
    state = _load_state(course_id)
    questions = [q for q in questions_table.load() if q.get("course_id") == course_id]
    profile = get_course_profile(course_id)

    difficulty = get_current_difficulty(state)
    weak_concepts = get_weakest_concepts(state, n=3)

    candidates = [
        q
        for q in questions
        if q.get("difficulty") == difficulty
        and (not weak_concepts or q.get("topic") in weak_concepts)
    ]
    if candidates:
        question = random.choice(candidates)
        return {"source": "bank", "question": question}

    style = (profile or {}).get("style_profile", {})
    knowledge = (profile or {}).get("knowledge_profile", {})
    question_type = "short_answer"
    dist = style.get("question_type_distribution", {})
    if dist:
        question_type = max(dist, key=dist.get)

    topics = weak_concepts or knowledge.get("topics", []) or ["general"]
    question = await generate_question(
        topic=random.choice(topics),
        difficulty=difficulty,
        question_type=question_type,
        exam_style_description=style.get("description", ""),
        context=f"Course topics: {', '.join(knowledge.get('topics', [])[:15])}",
    )
    question["course_id"] = course_id
    question["source_type"] = "generated"

    # Persist generated question so it can be looked up later
    all_questions = questions_table.load()
    all_questions.append(question)
    questions_table.save(all_questions)

    return {"source": "generated", "question": question}


@router.post("/answer")
async def submit_answer(submission: AnswerSubmission):
    state = _load_state(submission.course_id)
    question = next(
        (
            q
            for q in questions_table.load()
            if q.get("id") == submission.question_id and q.get("course_id") == submission.course_id
        ),
        None,
    )

    concept = submission.concept or (question.get("topic", "general") if question else "general")
    correct = submission.correct
    feedback = ""

    if correct is None and question:
        qtype = question.get("question_type", "")
        if qtype == "mcq":
            correct = submission.answer.strip().upper() == question.get("answer", "").strip().upper()
        elif qtype == "true_false":
            correct = submission.answer.strip().lower() == question.get("answer", "").strip().lower()
        else:
            # LLM-based grading for short_answer, calculation, essay
            grading = await grade_answer(
                question_content=question.get("content", ""),
                correct_answer=question.get("answer", ""),
                student_answer=submission.answer,
                explanation=question.get("explanation", ""),
            )
            correct = grading["correct"]
            feedback = grading["feedback"]
    if correct is None:
        correct = False

    state = record_answer(state, concept, correct)
    _save_state(submission.course_id, state)

    return {
        "correct": correct,
        "concept": concept,
        "feedback": feedback,
        "explanation": question.get("explanation", "") if question else "",
        "correct_answer": question.get("answer", "") if question else "",
        "mastery_score": state.concept_mastery[concept].score if concept in state.concept_mastery else 0.5,
        "overall_accuracy": state.total_correct / state.total_questions_attempted if state.total_questions_attempted > 0 else 0,
    }
