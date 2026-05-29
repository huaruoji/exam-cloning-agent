import os
import json
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from config import DATA_DIR

router = APIRouter(prefix="/api/questions", tags=["questions"])


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


@router.get("")
async def list_questions(
    topic: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
):
    """List all questions with optional filters."""
    questions = _load_questions()

    if topic:
        questions = [q for q in questions if topic.lower() in q.get("topic", "").lower()]
    if difficulty:
        questions = [q for q in questions if q.get("difficulty") == difficulty]
    if question_type:
        questions = [q for q in questions if q.get("question_type") == question_type]

    return {"questions": questions, "total": len(questions)}


@router.get("/{question_id}")
async def get_question(question_id: str):
    """Get a single question by ID."""
    questions = _load_questions()
    for q in questions:
        if q.get("id") == question_id:
            return q
    raise HTTPException(status_code=404, detail="Question not found")


@router.delete("/{question_id}")
async def delete_question(question_id: str):
    """Delete a question by ID."""
    questions = _load_questions()
    new_questions = [q for q in questions if q.get("id") != question_id]
    if len(new_questions) == len(questions):
        raise HTTPException(status_code=404, detail="Question not found")
    _save_questions(new_questions)
    return {"deleted": question_id}


@router.get("/topics/list")
async def list_topics():
    """Get all unique topics."""
    questions = _load_questions()
    topics = list(set(q.get("topic", "Unknown") for q in questions))
    return {"topics": sorted(topics)}
