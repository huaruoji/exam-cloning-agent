"""Unified grading logic shared by practice and exam routers."""
from typing import Optional

from services.llm_client import grade_answer


async def grade(
    question: dict,
    student_answer: str,
    user_api_key: Optional[str] = None,
) -> dict:
    """Grade a single answer.

    Returns the structured shape:
    {correct: bool, feedback: str, missing_steps: list[str], wrong_concepts: list[str], suggestion: str}

    All question types are graded via LLM for consistent, high-quality feedback.
    """
    qtype = question.get("question_type", "")
    grading = await grade_answer(
        question_content=question.get("content", ""),
        correct_answer=question.get("answer", "") or "",
        student_answer=student_answer,
        explanation=question.get("explanation", ""),
        options=question.get("options"),
        question_type=qtype,
        user_api_key=user_api_key,
    )
    return grading
