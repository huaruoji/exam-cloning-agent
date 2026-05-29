import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from models.course import CourseCreate, CourseUpdate
from services.store import courses_table

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("")
async def list_courses():
    courses = sorted(courses_table.load(), key=lambda item: item["updated_at"], reverse=True)
    return {"courses": courses}


@router.post("")
async def create_course(payload: CourseCreate):
    now = datetime.utcnow().isoformat()
    course = {
        "id": uuid.uuid4().hex[:10],
        "name": payload.name.strip(),
        "auto_detected_name": None,
        "created_at": now,
        "updated_at": now,
    }
    courses_table.append(course)
    return course


@router.patch("/{course_id}")
async def update_course(course_id: str, payload: CourseUpdate):
    courses = courses_table.load()
    for course in courses:
        if course["id"] == course_id:
            course["name"] = payload.name.strip()
            course["updated_at"] = datetime.utcnow().isoformat()
            courses_table.save(courses)
            return course
    raise HTTPException(status_code=404, detail="Course not found")


@router.get("/{course_id}")
async def get_course(course_id: str):
    course = next((c for c in courses_table.load() if c["id"] == course_id), None)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course
