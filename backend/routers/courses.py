import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from models.course import CourseCreate, CourseUpdate
from routers.deps import get_user_id
from services.store import courses_table

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("")
async def list_courses(user_id: str = Depends(get_user_id)):
    courses = courses_table.load()
    # include records where user_id matches requester, is "public", or is missing (treat as public)
    courses = [
        c for c in courses
        if c.get("user_id", "public") in (user_id, "public")
    ]
    courses.sort(key=lambda item: item["updated_at"], reverse=True)
    return {"courses": courses}


@router.post("")
async def create_course(payload: CourseCreate, user_id: str = Depends(get_user_id)):
    now = datetime.now(timezone.utc).isoformat()
    course = {
        "id": uuid.uuid4().hex[:10],
        "name": payload.name.strip(),
        "user_id": user_id,
        "auto_detected_name": None,
        "created_at": now,
        "updated_at": now,
    }
    courses_table.append(course)
    return course


@router.patch("/{course_id}")
async def update_course(course_id: str, payload: CourseUpdate, user_id: str = Depends(get_user_id)):
    updated: dict = {}
    def do_update(courses):
        for course in courses:
            if course["id"] == course_id:
                if course.get("user_id", "public") not in (user_id, "public"):
                    raise HTTPException(status_code=403, detail="Not allowed")
                course["name"] = payload.name.strip()
                course["updated_at"] = datetime.now(timezone.utc).isoformat()
                updated.update(course)
                return
    courses_table.mutate(do_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Course not found")
    return updated


@router.get("/{course_id}")
async def get_course(course_id: str, user_id: str = Depends(get_user_id)):
    course = next((c for c in courses_table.load() if c["id"] == course_id), None)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.get("user_id", "public") not in (user_id, "public"):
        raise HTTPException(status_code=404, detail="Course not found")
    return course
