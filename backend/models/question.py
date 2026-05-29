from pydantic import BaseModel
from typing import Optional
from enum import Enum


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class QuestionType(str, Enum):
    MCQ = "mcq"
    SHORT_ANSWER = "short_answer"
    CALCULATION = "calculation"
    TRUE_FALSE = "true_false"
    ESSAY = "essay"


class Question(BaseModel):
    id: str
    course_id: Optional[str] = None
    source_document_id: Optional[str] = None
    source_type: Optional[str] = None
    content: str  # supports LaTeX with $...$ and $$...$$
    question_type: QuestionType
    difficulty: Difficulty
    topic: str
    options: Optional[list[str]] = None  # for MCQ
    answer: str
    explanation: str
    source_pdf: Optional[str] = None
    source_page: Optional[int] = None


class QuestionFilter(BaseModel):
    topic: Optional[str] = None
    difficulty: Optional[Difficulty] = None
    question_type: Optional[QuestionType] = None
