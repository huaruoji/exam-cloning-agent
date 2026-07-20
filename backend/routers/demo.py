"""One-click demo course seeding for competition demos."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from routers.deps import get_user_id
from services.store import (
    courses_table,
    documents_table,
    profiles_table,
    questions_table,
)

router = APIRouter(prefix="/api/demo", tags=["demo"])

SEED_PATH = Path(__file__).resolve().parent.parent / "demo" / "seed.json"


@router.post("/seed")
async def seed_demo(user_id: str = Depends(get_user_id)):
    """Load the bundled AIAA 2711 demo course (idempotent by (course name, user_id))."""
    if not SEED_PATH.exists():
        raise HTTPException(status_code=400, detail="Seed data not found")

    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    existing_courses = courses_table.load()
    # Idempotency key: (name lower, user_id)
    existing_keys = {(c["name"].lower(), c.get("user_id", "public")) for c in existing_courses}

    # Course
    seeded_course = None
    already_existed = False
    for c in seed.get("courses", []):
        key = (c["name"].lower(), user_id)
        if key in existing_keys:
            seeded_course = next(ec for ec in existing_courses if ec["name"].lower() == c["name"].lower() and ec.get("user_id", "public") == user_id)
            already_existed = True
            continue
        c["user_id"] = user_id
        courses_table.append(c)
        seeded_course = c

    if already_existed:
        return {"status": "exists", "course": seeded_course, "message": "Demo course already loaded"}

    course_id = seeded_course["id"]

    # Documents (skip if already present by id)
    existing_doc_ids = {d["id"] for d in documents_table.load()}
    for d in seed.get("documents", []):
        if d["id"] not in existing_doc_ids:
            d["user_id"] = user_id
            documents_table.append(d)

    # Questions (skip if already present by id)
    existing_q_ids = {q["id"] for q in questions_table.load()}
    new_qs = [q for q in seed.get("questions", []) if q["id"] not in existing_q_ids]
    if new_qs:
        for q in new_qs:
            q["user_id"] = user_id
        all_qs = questions_table.load()
        all_qs.extend(new_qs)
        questions_table.save(all_qs)

    # Profile (skip if already present by course_id)
    profiles = profiles_table.load()
    existing_p_ids = {p["course_id"] for p in profiles}
    for p in seed.get("course_profiles", []):
        if p["course_id"] not in existing_p_ids:
            p["user_id"] = user_id
            profiles.append(p)
    profiles_table.save(profiles)

    return {
        "status": "seeded",
        "course": seeded_course,
        "questions_loaded": len(seed.get("questions", [])),
    }


@router.get("/status")
async def demo_status():
    return {"available": SEED_PATH.exists()}
