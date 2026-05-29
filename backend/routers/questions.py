from fastapi import APIRouter, HTTPException, Query

from services.store import questions_table

router = APIRouter(prefix="/api/questions", tags=["questions"])


@router.get("")
async def list_questions(
    course_id: str = Query(...),
    topic: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    question_type: str | None = Query(default=None),
    source_type: str | None = Query(default=None),
):
    questions = [q for q in questions_table.load() if q.get("course_id") == course_id]
    if topic:
        questions = [q for q in questions if topic.lower() in q.get("topic", "").lower()]
    if difficulty:
        questions = [q for q in questions if q.get("difficulty") == difficulty]
    if question_type:
        questions = [q for q in questions if q.get("question_type") == question_type]
    if source_type:
        questions = [q for q in questions if q.get("source_type") == source_type]

    return {"questions": questions, "total": len(questions)}


@router.get("/{question_id}")
async def get_question(question_id: str):
    question = next((q for q in questions_table.load() if q.get("id") == question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@router.get("/topics/list")
async def list_topics(course_id: str = Query(...)):
    questions = [q for q in questions_table.load() if q.get("course_id") == course_id]
    topics = sorted({q.get("topic", "Unknown") for q in questions if q.get("topic")})
    return {"topics": topics}
