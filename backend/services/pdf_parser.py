import json
import os
import re
import uuid
from typing import Iterable

import pdfplumber

from services.llm_client import call_llm


def _strip_json_fence(result: str) -> str:
    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1] if "\n" in result else result[3:]
    if result.endswith("```"):
        result = result[:-3]
    result = result.strip()
    if result.startswith("json"):
        result = result[4:].strip()
    return result


async def extract_pages_from_pdf(pdf_path: str) -> list[str]:
    pages: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return pages


def detect_course_name(title: str, pages: list[str]) -> str | None:
    filename = os.path.basename(title)
    candidates = [filename]
    if pages:
        candidates.append(pages[0][:1000])

    patterns = [
        r"([A-Z]{2,6}\s?\d{2,4}[A-Z]?)",
        r"Course\s*[:\-]\s*([^\n]{3,80})",
        r"([A-Z][A-Za-z&\- ]{4,80}(?:Course|Systems|Analysis|Algebra|Probability|Learning))",
    ]

    for blob in candidates:
        for pattern in patterns:
            match = re.search(pattern, blob)
            if match:
                return match.group(1).strip()
    return None


async def parse_questions_from_text(
    text: str,
    source_pdf: str = "",
    source_document_id: str | None = None,
    course_id: str | None = None,
    source_type: str | None = None,
) -> list[dict]:
    system_prompt = """You are an educational document parser. Extract only actual practiceable questions from the text and return a JSON array.

Each question object must have:
- \"content\": the question text (preserve LaTeX formulas with $...$ for inline and $$...$$ for display)
- \"question_type\": one of \"mcq\", \"short_answer\", \"calculation\", \"true_false\", \"essay\"
- \"difficulty\": one of \"easy\", \"medium\", \"hard\"
- \"topic\": the main topic/concept being tested
- \"options\": list of option strings (for MCQ only, null otherwise)
- \"answer\": the correct answer if present or inferable, otherwise empty string
- \"explanation\": brief explanation or empty string

Rules:
- Ignore cover pages, instructions, grading policy, and purely explanatory slide text.
- If a document is slides, only extract explicit exercise/example problems.
- Return ONLY valid JSON array, no markdown code blocks."""

    user_prompt = f"Parse the following educational document text into structured questions:\n\n{text[:12000]}"
    result = await call_llm(system_prompt, user_prompt, temperature=0.2)
    result = _strip_json_fence(result)

    try:
        questions = json.loads(result)
    except json.JSONDecodeError:
        return []

    normalized: list[dict] = []
    for q in questions:
        q["id"] = str(uuid.uuid4())[:8]
        q["source_pdf"] = source_pdf
        q["source_document_id"] = source_document_id
        q["course_id"] = course_id
        q["source_type"] = source_type
        normalized.append(q)
    return normalized


async def parse_questions_from_pages(
    pages: list[str],
    source_pdf: str = "",
    source_document_id: str | None = None,
    course_id: str | None = None,
    source_type: str | None = None,
) -> list[dict]:
    chunk_size = 4
    questions: list[dict] = []

    for start in range(0, len(pages), chunk_size):
        chunk = pages[start : start + chunk_size]
        text = "\n\n--- PAGE BREAK ---\n\n".join(chunk)
        parsed = await parse_questions_from_text(
            text,
            source_pdf=source_pdf,
            source_document_id=source_document_id,
            course_id=course_id,
            source_type=source_type,
        )
        for q in parsed:
            q["source_page"] = start + 1
        questions.extend(parsed)
    return questions


async def analyze_exam_style(questions: list[dict]) -> dict:
    if not questions:
        return {
            "question_type_distribution": {"short_answer": 1.0},
            "difficulty_distribution": {"medium": 1.0},
            "key_topics": [],
            "total_questions": 0,
            "description": "No questions parsed yet.",
        }

    system_prompt = """You are an exam style analyzer. Given a list of questions, analyze the assessment style and return a JSON object with:
- \"question_type_distribution\": dict mapping question type to proportion
- \"difficulty_distribution\": dict mapping difficulty to proportion
- \"key_topics\": list of main topics covered
- \"total_questions\": total number of questions
- \"description\": a concise 1-2 sentence description of the style

Return ONLY valid JSON, no markdown code blocks."""
    user_prompt = f"Analyze the style of these questions:\n\n{json.dumps(questions, ensure_ascii=False)[:10000]}"
    result = await call_llm(system_prompt, user_prompt, temperature=0.2)
    result = _strip_json_fence(result)

    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {
            "question_type_distribution": {"short_answer": 1.0},
            "difficulty_distribution": {"medium": 1.0},
            "key_topics": list({q.get("topic", "general") for q in questions if q.get("topic")})[:10],
            "total_questions": len(questions),
            "description": "Style fallback generated from parsed questions.",
        }
