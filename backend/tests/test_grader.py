"""Unit tests for the grader (no LLM, no network)."""

from unittest.mock import patch

import pytest

from services.grader import grade


# --- async grade ---

@patch("services.grader.grade_answer")
async def test_grade_mcq_uses_deterministic_rule(mock_grade_answer):
    """MCQ grading saves a model call when both choices are unambiguous."""
    question = {
        "question_type": "mcq",
        "content": "What is 2+2?",
        "answer": "A",
        "options": ["1", "2", "3", "4"],
        "explanation": "Basic addition.",
    }
    result = await grade(question, "A")
    mock_grade_answer.assert_not_called()
    assert result["correct"] is True
    assert result["feedback"] == "Correct."


@patch("services.grader.grade_answer")
async def test_grade_mcq_wrong(mock_grade_answer):
    """grade() returns LLM result for mcq wrong answers."""
    mock_grade_answer.return_value = {
        "correct": False,
        "feedback": "Incorrect. The correct answer was A.",
        "missing_steps": [],
        "wrong_concepts": ["addition"],
        "suggestion": "Review basic arithmetic.",
    }
    question = {
        "question_type": "mcq",
        "content": "What is 2+2?",
        "answer": "A",
        "options": ["1", "2", "3", "4"],
        "explanation": "Basic addition.",
    }
    result = await grade(question, "B")
    assert result["correct"] is False
    assert "Incorrect" in result["feedback"]


@patch("services.grader.grade_answer")
async def test_grade_true_false_uses_deterministic_rule(mock_grade_answer):
    question = {
        "question_type": "true_false",
        "content": "The sky is blue.",
        "answer": "True",
    }
    result = await grade(question, "True")
    mock_grade_answer.assert_not_called()
    assert result["correct"] is True


@patch("services.grader.grade_answer")
async def test_grade_short_answer_calls_llm(mock_grade_answer):
    """grade() routes short_answer to grade_answer."""
    mock_grade_answer.return_value = {
        "correct": False,
        "feedback": "Missing key steps.",
        "missing_steps": ["Show your work"],
        "wrong_concepts": [],
        "suggestion": "Always show intermediate steps.",
    }
    question = {
        "question_type": "short_answer",
        "content": "Solve for x: 2x+3=11",
        "answer": "x=4",
        "explanation": "Subtract 3, then divide by 2.",
    }
    result = await grade(question, "x = 5")
    mock_grade_answer.assert_called_once_with(
        question_content="Solve for x: 2x+3=11",
        correct_answer="x=4",
        student_answer="x = 5",
        explanation="Subtract 3, then divide by 2.",
        options=None,
        question_type="short_answer",
        user_api_key=None,
        model_config=None,
    )
    assert result["correct"] is False


@patch("services.grader.grade_answer")
async def test_grade_calculation_calls_llm(mock_grade_answer):
    """grade() routes calculation to grade_answer."""
    mock_grade_answer.return_value = {
        "correct": True,
        "feedback": "Good work!",
        "missing_steps": [],
        "wrong_concepts": [],
        "suggestion": "",
    }
    question = {
        "question_type": "calculation",
        "content": "Integrate x^2 dx",
        "answer": "x^3/3 + C",
    }
    result = await grade(question, "x^3/3 + C")
    assert result["correct"] is True


@patch("services.grader.grade_answer")
async def test_grade_essay_calls_llm(mock_grade_answer):
    """grade() routes essay to grade_answer."""
    mock_grade_answer.return_value = {
        "correct": True,
        "feedback": "Well argued.",
        "missing_steps": [],
        "wrong_concepts": [],
        "suggestion": "",
    }
    question = {
        "question_type": "essay",
        "content": "Discuss the causes of WWI.",
        "answer": "A detailed essay...",
    }
    result = await grade(question, "My essay text...")
    assert result["correct"] is True


@patch("services.grader.grade_answer")
async def test_grade_unknown_type_calls_llm(mock_grade_answer):
    """grade() routes unknown types to grade_answer."""
    mock_grade_answer.return_value = {
        "correct": False,
        "feedback": "Unable to grade.",
        "missing_steps": [],
        "wrong_concepts": [],
        "suggestion": "",
    }
    question = {
        "question_type": "unknown_type",
        "content": "Test content",
        "answer": "Test answer",
    }
    result = await grade(question, "student answer")
    assert "correct" in result
    assert result["correct"] is False


@patch("services.grader.grade_answer")
async def test_grade_passes_user_api_key(mock_grade_answer):
    """grade() forwards user_api_key to grade_answer."""
    mock_grade_answer.return_value = {
        "correct": True,
        "feedback": "OK",
        "missing_steps": [],
        "wrong_concepts": [],
        "suggestion": "",
    }
    question = {
        "question_type": "short_answer",
        "content": "Test",
        "answer": "A",
    }
    await grade(question, "A", user_api_key="sk-test")
    _, kwargs = mock_grade_answer.call_args
    assert kwargs["user_api_key"] == "sk-test"
