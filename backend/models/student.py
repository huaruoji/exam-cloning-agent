from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ConceptMastery(BaseModel):
    concept: str
    score: float = 0.5
    total_attempts: int = 0
    correct_attempts: int = 0
    consecutive_correct: int = 0
    last_reviewed: Optional[datetime] = None
    next_review: Optional[datetime] = None
    stability: float = 1.0
    difficulty: float = 5.0


class StudentState(BaseModel):
    concept_mastery: dict[str, ConceptMastery] = {}
    total_questions_attempted: int = 0
    total_correct: int = 0
    recent_accuracy: list[bool] = []
