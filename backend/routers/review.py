from collections import defaultdict

from fastapi import APIRouter, Depends, Query

from routers.deps import get_user_id
from services.store import practice_history_table

router = APIRouter(prefix="/api/review", tags=["review"])


@router.get("/wrong")
async def list_wrong(course_id: str = Query(...), user_id: str = Depends(get_user_id)):
    """Wrong answers from practice (action=submit, correct=false)."""
    history = [
        h for h in practice_history_table.load()
        if h.get("course_id") == course_id and h.get("user_id", "public") in (user_id, "public")
    ]
    wrong = [
        h for h in history
        if h.get("action") == "submit" and h.get("correct") is False
    ]
    wrong.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"wrong": wrong, "total": len(wrong)}


@router.get("/history")
async def list_history(course_id: str = Query(...), user_id: str = Depends(get_user_id)):
    """Full practice history timeline (submit actions only)."""
    history = [
        h for h in practice_history_table.load()
        if h.get("course_id") == course_id and h.get("user_id", "public") in (user_id, "public")
    ]
    history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"history": history, "total": len(history)}


@router.get("/stats")
async def review_stats(course_id: str = Query(...), user_id: str = Depends(get_user_id)):
    """Aggregated practice stats: accuracy over time, per-topic accuracy."""
    history = [
        h for h in practice_history_table.load()
        if h.get("course_id") == course_id and h.get("user_id", "public") in (user_id, "public")
    ]
    submitted = [h for h in history if h.get("action") == "submit" and h.get("correct") is not None]

    # Daily accuracy series for the chart.
    by_day: dict[str, list[bool]] = defaultdict(list)
    for h in submitted:
        day = (h.get("created_at") or "")[:10]
        by_day[day].append(bool(h["correct"]))
    daily = [
        {"date": day, "accuracy": sum(v) / len(v), "count": len(v)}
        for day, v in sorted(by_day.items())
    ]

    # Per-topic accuracy.
    by_topic: dict[str, list[bool]] = defaultdict(list)
    for h in submitted:
        by_topic[h.get("concept", "unknown")].append(bool(h["correct"]))
    topic_stats = [
        {"topic": t, "accuracy": sum(v) / len(v), "count": len(v)}
        for t, v in sorted(by_topic.items(), key=lambda x: sum(x[1]) / len(x[1]))
    ]

    return {
        "total_submitted": len(submitted),
        "total_correct": sum(1 for h in submitted if h["correct"]),
        "daily": daily,
        "topic_stats": topic_stats,
    }