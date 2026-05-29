import pdfplumber
import os
import json
import uuid
from typing import Optional
from services.llm_client import call_llm


async def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using pdfplumber."""
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n--- PAGE BREAK ---\n\n".join(text_parts)


async def parse_questions_from_text(text: str, source_pdf: str = "") -> list[dict]:
    """Use LLM to parse extracted text into structured questions."""
    system_prompt = """You are an exam question parser. Extract all questions from the given text and return them as a JSON array.

Each question object must have:
- "content": the question text (preserve LaTeX formulas with $...$ for inline and $$...$$ for display)
- "question_type": one of "mcq", "short_answer", "calculation", "true_false", "essay"
- "difficulty": one of "easy", "medium", "hard"
- "topic": the main topic/concept being tested
- "options": list of option strings (for MCQ only, null for other types)
- "answer": the correct answer
- "explanation": brief explanation of the answer

Rules:
- Preserve all LaTeX math notation exactly as written
- For MCQ, include all options (A, B, C, D, etc.)
- Estimate difficulty based on complexity
- Be precise with the topic extraction
- Return ONLY valid JSON array, no markdown code blocks"""

    user_prompt = f"Parse the following exam text into structured questions:\n\n{text[:8000]}"

    result = await call_llm(system_prompt, user_prompt, temperature=0.3)

    # Clean up the response - remove markdown code blocks if present
    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1] if "\n" in result else result[3:]
    if result.endswith("```"):
        result = result[:-3]
    result = result.strip()
    if result.startswith("json"):
        result = result[4:].strip()

    try:
        questions = json.loads(result)
    except json.JSONDecodeError:
        return []

    # Assign IDs
    for q in questions:
        q["id"] = str(uuid.uuid4())[:8]
        q["source_pdf"] = source_pdf

    return questions


async def analyze_exam_style(questions: list[dict]) -> dict:
    """Analyze the style of parsed questions to create an exam profile."""
    system_prompt = """You are an exam style analyzer. Given a list of exam questions, analyze the exam style and return a JSON object with:
- "question_type_distribution": dict mapping question type to proportion (e.g. {"mcq": 0.4, "short_answer": 0.3, "calculation": 0.3})
- "difficulty_distribution": dict mapping difficulty to proportion (e.g. {"easy": 0.3, "medium": 0.5, "hard": 0.2})
- "key_topics": list of main topics covered
- "total_questions": total number of questions
- "description": a natural language description of the exam style (2-3 sentences)

Return ONLY valid JSON, no markdown code blocks."""

    user_prompt = f"Analyze the style of these exam questions:\n\n{json.dumps(questions, ensure_ascii=False)[:6000]}"

    result = await call_llm(system_prompt, user_prompt, temperature=0.3)

    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1] if "\n" in result else result[3:]
    if result.endswith("```"):
        result = result[:-3]
    result = result.strip()
    if result.startswith("json"):
        result = result[4:].strip()

    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {
            "question_type_distribution": {"mcq": 0.5, "short_answer": 0.3, "calculation": 0.2},
            "difficulty_distribution": {"easy": 0.3, "medium": 0.5, "hard": 0.2},
            "key_topics": [],
            "total_questions": len(questions),
            "description": "Exam style could not be automatically determined.",
        }


async def process_pdf(pdf_path: str) -> tuple[list[dict], dict]:
    """Full pipeline: PDF -> text -> questions -> style profile."""
    filename = os.path.basename(pdf_path)
    text = await extract_text_from_pdf(pdf_path)
    questions = await parse_questions_from_text(text, source_pdf=filename)
    style = await analyze_exam_style(questions)
    return questions, style
