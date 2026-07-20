"""Topic re-clustering and per-question topic editing."""
import json
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from routers.deps import get_user_id
from services.llm_client import call_llm, strip_json_fence
from services.store import questions_table

router = APIRouter(prefix="/api/topics", tags=["topics"])


class TopicUpdate(BaseModel):
    topic: str


@router.post("/{course_id}/recluster")
async def recluster_topics(course_id: str, user_id: str = Depends(get_user_id)):
    """Use the LLM to merge similar/duplicate topics into a normalized set,
    then batch-update all questions' topic fields."""
    questions = [
        q for q in questions_table.load()
        if q.get("course_id") == course_id and q.get("user_id", "public") in (user_id, "public")
    ]
    raw_topics = sorted({q.get("topic", "") for q in questions if q.get("topic")})
    if not raw_topics:
        raise HTTPException(status_code=400, detail="No topics to recluster")

    counts = Counter(q.get("topic", "") for q in questions if q.get("topic"))

    system_prompt = """You are a topic taxonomy cleaner. Given a list of raw topic labels extracted from exam questions (some are duplicates, near-duplicates, or inconsistent), produce a clean normalized taxonomy.

Return a JSON object mapping each raw topic to its normalized form:
{"raw_topic_1": "Normalized Topic", "raw_topic_2": "Normalized Topic", ...}

Rules:
- Merge near-duplicates (e.g. "Eigenvalues" and "Eigenvalue Decomposition" -> "Eigenvalues")
- Use Title Case, concise (1-3 words)
- Keep distinct topics distinct
- Every raw topic must appear as a key
- Return ONLY valid JSON, no markdown"""

    user_prompt = f"Raw topics with their question counts:\n\n{json.dumps(dict(counts), ensure_ascii=False)}"

    mapping = None
    try:
        result = await call_llm(system_prompt, user_prompt, temperature=0.2)
        result = strip_json_fence(result)
        mapping = json.loads(result)
        if not isinstance(mapping, dict):
            mapping = None
    except Exception:
        mapping = None

    if not mapping:
        raise HTTPException(status_code=400, detail="Reclustering failed. Please try again.")

    # Apply the mapping to all questions.
    updated = 0
    def do_update(items):
        nonlocal updated
        for q in items:
            if q.get("course_id") != course_id:
                continue
            if q.get("user_id", "public") not in (user_id, "public"):
                continue
            old = q.get("topic", "")
            if old in mapping:
                new = mapping[old]
                if new and new != old:
                    q["topic"] = new
                    updated += 1
    questions_table.mutate(do_update)

    all_questions = questions_table.load()
    new_topics = sorted({q.get("topic", "") for q in all_questions if q.get("course_id") == course_id and q.get("user_id", "public") in (user_id, "public") and q.get("topic")})
    return {
        "status": "reclustered",
        "updated_questions": updated,
        "old_topic_count": len(raw_topics),
        "new_topic_count": len(new_topics),
        "topics": new_topics,
    }


@router.patch("/question/{question_id}")
async def update_question_topic(question_id: str, payload: TopicUpdate, user_id: str = Depends(get_user_id)):
    """Manually edit a single question's topic."""
    updated: dict = {}
    def do_update(all_questions):
        for q in all_questions:
            if q.get("id") == question_id:
                if q.get("user_id", "public") not in (user_id, "public"):
                    raise HTTPException(status_code=403, detail="Not allowed")
                q["topic"] = payload.topic.strip()
                updated.update({"question_id": question_id, "topic": q["topic"]})
                return
    questions_table.mutate(do_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Question not found")
    return updated