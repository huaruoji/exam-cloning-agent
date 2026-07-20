from pydantic import BaseModel
from typing import Optional
from .question import Question


class ExamStyleProfile(BaseModel):
    question_type_distribution: dict[str, float]
    difficulty_distribution: dict[str, float]
    key_topics: list[str]
    total_questions: int
    time_limit_minutes: Optional[int] = None
    description: str


class Exam(BaseModel):
    id: str
    title: str
    user_id: Optional[str] = None
    course_id: Optional[str] = None
    style_profile: ExamStyleProfile
    questions: list[Question]
    time_limit_minutes: Optional[int] = None
