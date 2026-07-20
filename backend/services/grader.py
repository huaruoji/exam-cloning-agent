"""Unified grading logic shared by practice and exam routers."""
from typing import Optional

from models.compute import ModelRequestConfig
from services.compute import record_rule_grade
from services.llm_client import grade_answer


async def grade(
    question: dict,
    student_answer: str,
    user_api_key: Optional[str] = None,
    model_config: ModelRequestConfig | None = None,
) -> dict:
    """Grade a single answer.

    Returns the structured shape:
    {correct: bool, feedback: str, missing_steps: list[str], wrong_concepts: list[str], suggestion: str}

    Unambiguous MCQ and true/false answers use deterministic local rules;
    free-form and ambiguous answers are delegated to the selected model.
    """
    qtype = question.get("question_type", "")
    rule_result = _grade_with_rules(question, student_answer)
    if rule_result is not None:
        await record_rule_grade(qtype, rule_result)
        return {
            "correct": rule_result,
            "grading_failed": False,
            "feedback": "Correct." if rule_result else "Incorrect. Review the reference answer.",
            "missing_steps": [],
            "wrong_concepts": [],
            "suggestion": "" if rule_result else "Compare your selection with the reference answer.",
            "provider": "rule",
        }
    grading = await grade_answer(
        question_content=question.get("content", ""),
        correct_answer=question.get("answer", "") or "",
        student_answer=student_answer,
        explanation=question.get("explanation", ""),
        options=question.get("options"),
        question_type=qtype,
        user_api_key=user_api_key,
        model_config=model_config,
    )
    return grading


def _normalize(value: str) -> str:
    return " ".join(str(value).strip().casefold().split())


def _mcq_value(value: str, options: list[str]) -> str | None:
    normalized = _normalize(value)
    if len(normalized) == 1 and "a" <= normalized <= "z":
        index = ord(normalized) - ord("a")
        return _normalize(options[index]) if index < len(options) else None
    for index, option in enumerate(options):
        option_value = _normalize(option)
        prefixed = f"{chr(ord('a') + index)}."
        if normalized == option_value or normalized.removeprefix(prefixed).strip() == option_value:
            return option_value
    return None


def _grade_with_rules(question: dict, student_answer: str) -> bool | None:
    qtype = question.get("question_type", "")
    expected = str(question.get("answer", ""))
    if qtype == "mcq":
        options = question.get("options") or []
        expected_value = _mcq_value(expected, options)
        student_value = _mcq_value(student_answer, options)
        return expected_value == student_value if expected_value is not None and student_value is not None else None
    if qtype == "true_false":
        truthy = {"true", "t", "yes", "1", "正确", "对", "是"}
        falsy = {"false", "f", "no", "0", "错误", "错", "否"}
        expected_value = _normalize(expected)
        student_value = _normalize(student_answer)
        if expected_value in truthy | falsy and student_value in truthy | falsy:
            return (expected_value in truthy) == (student_value in truthy)
    return None
