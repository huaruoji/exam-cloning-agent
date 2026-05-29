from fastapi import APIRouter, Query

from services.ingestion import get_course_profile
from services.store import questions_table, student_states_table

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
async def get_stats(course_id: str = Query(...)):
    state_row = next((row for row in student_states_table.load() if row["course_id"] == course_id), None)
    state = (state_row or {}).get("state", {})
    questions = [q for q in questions_table.load() if q.get("course_id") == course_id]
    profile = get_course_profile(course_id) or {}

    attempted = state.get("total_questions_attempted", 0)
    correct = state.get("total_correct", 0)
    return {
        "total_questions_in_bank": len(questions),
        "total_attempted": attempted,
        "total_correct": correct,
        "accuracy": correct / attempted if attempted else 0,
        "concept_mastery": state.get("concept_mastery", {}),
        "recent_accuracy": state.get("recent_accuracy", []),
        "knowledge_topics": profile.get("knowledge_profile", {}).get("topics", []),
        "document_counts": profile.get("knowledge_profile", {}).get("document_counts", {}),
    }
