from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from routers.deps import get_user_id
from services.store import questions_table


class QuestionUpdate(BaseModel):
    content: Optional[str] = None
    answer: Optional[str] = None
    options: Optional[list[str]] = None
    explanation: Optional[str] = None
    difficulty: Optional[str] = None
    topic: Optional[str] = None
    question_type: Optional[str] = None


router = APIRouter(prefix="/api/questions", tags=["questions"])


@router.get("")
async def list_questions(
    course_id: str = Query(...),
    topic: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    question_type: str | None = Query(default=None),
    source_type: str | None = Query(default=None),
    include_generated: bool = Query(default=False),
    user_id: str = Depends(get_user_id),
):
    questions = [
        q for q in questions_table.load()
        if q.get("course_id") == course_id and q.get("user_id", "public") in (user_id, "public")
    ]
    # Exclude AI-generated questions from the bank by default (they are session-only).
    if not include_generated:
        questions = [q for q in questions if q.get("source_type") != "generated"]
    if topic:
        questions = [q for q in questions if topic.lower() in q.get("topic", "").lower()]
    if difficulty:
        questions = [q for q in questions if q.get("difficulty") == difficulty]
    if question_type:
        questions = [q for q in questions if q.get("question_type") == question_type]
    if source_type:
        questions = [q for q in questions if q.get("source_type") == source_type]

    return {"questions": questions, "total": len(questions)}


# IMPORTANT: /topics/list must be declared before /{question_id} to avoid
# the path param capturing "topics" as a question id.
@router.get("/topics/list")
async def list_topics(course_id: str = Query(...), user_id: str = Depends(get_user_id)):
    questions = [
        q for q in questions_table.load()
        if q.get("course_id") == course_id and q.get("user_id", "public") in (user_id, "public")
    ]
    topics = sorted({q.get("topic", "Unknown") for q in questions if q.get("topic")})
    return {"topics": topics}


@router.get("/{question_id}")
async def get_question(question_id: str, user_id: str = Depends(get_user_id)):
    question = next((q for q in questions_table.load() if q.get("id") == question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if question.get("user_id", "public") not in (user_id, "public"):
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@router.patch("/{question_id}")
async def update_question(question_id: str, payload: QuestionUpdate, user_id: str = Depends(get_user_id)):
    """Update selected fields of a question."""
    updated: dict = {}
    def do_update(all_questions):
        for q in all_questions:
            if q.get("id") == question_id:
                if q.get("user_id", "public") not in (user_id, "public"):
                    raise HTTPException(status_code=403, detail="Not allowed")
                if payload.content is not None:
                    q["content"] = payload.content
                if payload.answer is not None:
                    q["answer"] = payload.answer
                if payload.options is not None:
                    q["options"] = payload.options
                if payload.explanation is not None:
                    q["explanation"] = payload.explanation
                if payload.difficulty is not None:
                    q["difficulty"] = payload.difficulty
                if payload.topic is not None:
                    q["topic"] = payload.topic
                if payload.question_type is not None:
                    q["question_type"] = payload.question_type
                updated.update(q)
                return
    questions_table.mutate(do_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Question not found")
    return updated


@router.delete("/{question_id}")
async def delete_question(question_id: str, user_id: str = Depends(get_user_id)):
    """Remove a question (e.g. one with a bad LLM parse)."""
    found = False
    def do_delete(items):
        nonlocal found
        for q in items:
            if q.get("id") == question_id:
                if q.get("user_id", "public") not in (user_id, "public"):
                    raise HTTPException(status_code=403, detail="Not allowed")
                found = True
                break
        if found:
            items[:] = [q for q in items if q.get("id") != question_id]
    questions_table.mutate(do_delete)
    if not found:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"deleted": question_id}
