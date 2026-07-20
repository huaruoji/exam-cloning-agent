"""One-click demo course seeding for competition demos."""
import copy
import json
import uuid
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

    # Every user gets a private copy.  Seed IDs are only template identifiers;
    # reusing them would make documents/questions collide across users.
    seed = copy.deepcopy(seed)
    course_id_map = {c["id"]: uuid.uuid4().hex[:10] for c in seed.get("courses", [])}
    document_id_map = {d["id"]: uuid.uuid4().hex[:10] for d in seed.get("documents", [])}

    # Course
    seeded_course = None
    already_existed = False
    for c in seed.get("courses", []):
        key = (c["name"].lower(), user_id)
        if key in existing_keys:
            seeded_course = next(ec for ec in existing_courses if ec["name"].lower() == c["name"].lower() and ec.get("user_id", "public") == user_id)
            already_existed = True
            continue
        c["id"] = course_id_map[c["id"]]
        c["user_id"] = user_id
        courses_table.append(c)
        seeded_course = c

    if already_existed:
        return {"status": "exists", "course": seeded_course, "message": "Demo course already loaded"}

    course_id = seeded_course["id"]

    # Documents
    for d in seed.get("documents", []):
        old_id = d["id"]
        d["id"] = document_id_map[old_id]
        d["course_id"] = course_id_map[d["course_id"]]
        d["user_id"] = user_id
        documents_table.append(d)

    # Questions
    new_qs = seed.get("questions", [])
    for q in new_qs:
        q["id"] = uuid.uuid4().hex[:10]
        q["course_id"] = course_id_map[q["course_id"]]
        source_document_id = q.get("source_document_id")
        if source_document_id in document_id_map:
            q["source_document_id"] = document_id_map[source_document_id]
        q["user_id"] = user_id
    questions_table.mutate(lambda questions: questions.extend(new_qs))

    # Profile
    for p in seed.get("course_profiles", []):
        p["course_id"] = course_id_map[p["course_id"]]
        p["user_id"] = user_id
        for document_profile in p.get("document_profiles", []):
            old_document_id = document_profile.get("document_id")
            if old_document_id in document_id_map:
                document_profile["document_id"] = document_id_map[old_document_id]
        profiles_table.append(p)

    return {
        "status": "seeded",
        "course": seeded_course,
        "questions_loaded": len(seed.get("questions", [])),
    }


@router.get("/status")
async def demo_status():
    return {"available": SEED_PATH.exists()}
