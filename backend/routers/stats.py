import os
import json
from fastapi import APIRouter
from config import DATA_DIR

router = APIRouter(prefix="/api/stats", tags=["stats"])

STATE_FILE = os.path.join(DATA_DIR, "student_state.json")


@router.get("")
async def get_stats():
    """Get learning statistics."""
    # Load student state
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            state = json.load(f)
    else:
        state = {}

    # Load questions count
    questions_path = os.path.join(DATA_DIR, "questions.json")
    total_questions = 0
    if os.path.exists(questions_path):
        with open(questions_path, "r") as f:
            total_questions = len(json.load(f))

    return {
        "total_questions_in_bank": total_questions,
        "total_attempted": state.get("total_questions_attempted", 0),
        "total_correct": state.get("total_correct", 0),
        "accuracy": (
            state.get("total_correct", 0) / state.get("total_questions_attempted", 1)
            if state.get("total_questions_attempted", 0) > 0
            else 0
        ),
        "concept_mastery": state.get("concept_mastery", {}),
        "recent_accuracy": state.get("recent_accuracy", []),
    }
