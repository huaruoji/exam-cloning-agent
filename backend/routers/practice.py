import os
import json
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from config import DATA_DIR
from services.question_generator import generate_question
from services.adaptive_engine import (
    get_current_difficulty,
    get_weakest_concepts,
    record_answer,
)
from models.student import StudentState

router = APIRouter(prefix="/api/practice", tags=["practice"])

STATE_FILE = os.path.join(DATA_DIR, "student_state.json")


def _load_state() -> StudentState:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return StudentState(**json.load(f))
    return StudentState()


def _save_state(state: StudentState):
    with open(STATE_FILE, "w") as f:
        json.dump(state.model_dump(), f, ensure_ascii=False, indent=2, default=str)


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


class AnswerSubmission(BaseModel):
    question_id: str
    answer: str
    concept: Optional[str] = None
    correct: Optional[bool] = None  # for manual grading of open-ended


@router.post("/next")
async def get_next_question():
    """Get the next adaptive practice question."""
    state = _load_state()
    questions = _load_questions()
    profiles = _load_style_profiles()

    # Determine difficulty and topic
    difficulty = get_current_difficulty(state)
    weak_concepts = get_weakest_concepts(state, n=3)

    # Try to find an existing question that matches
    import random

    candidates = [
        q for q in questions
        if q.get("difficulty") == difficulty
        and (not weak_concepts or q.get("topic") in weak_concepts)
    ]

    if candidates:
        question = random.choice(candidates)
        return {"source": "bank", "question": question}

    # Generate a new question
    topic = weak_concepts[0] if weak_concepts else "general"
    style_desc = profiles[0]["style"]["description"] if profiles else ""
    question_type = "short_answer"

    if profiles:
        dist = profiles[0]["style"].get("question_type_distribution", {})
        if dist:
            question_type = max(dist, key=dist.get)

    question = await generate_question(
        topic=topic,
        difficulty=difficulty,
        question_type=question_type,
        exam_style_description=style_desc,
    )

    return {"source": "generated", "question": question}


@router.post("/answer")
async def submit_answer(submission: AnswerSubmission):
    """Submit an answer and update student state."""
    state = _load_state()

    # Find the question to get its topic
    questions = _load_questions()
    question = next((q for q in questions if q.get("id") == submission.question_id), None)

    concept = submission.concept or (question.get("topic", "general") if question else "general")
    correct = submission.correct

    # For MCQ, auto-grade
    if correct is None and question:
        if question.get("question_type") == "mcq":
            correct = submission.answer.strip().upper() == question.get("answer", "").strip().upper()
        elif question.get("question_type") == "true_false":
            correct = submission.answer.strip().lower() == question.get("answer", "").strip().lower()
        else:
            correct = False  # default for ungraded

    if correct is None:
        correct = False

    state = record_answer(state, concept, correct)
    _save_state(state)

    return {
        "correct": correct,
        "concept": concept,
        "mastery_score": state.concept_mastery[concept].score if concept in state.concept_mastery else 0.5,
        "overall_accuracy": state.total_correct / state.total_questions_attempted if state.total_questions_attempted > 0 else 0,
    }
