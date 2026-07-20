import json
import logging

import httpx
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

logger = logging.getLogger(__name__)


def _resolve_key(user_api_key: str | None) -> str:
    """User-provided key takes precedence; fall back to built-in demo key."""
    key = (user_api_key or "").strip() or DEEPSEEK_API_KEY
    if not key:
        raise RuntimeError("No API key available. Set DEEPSEEK_API_KEY or provide your own.")
    return key


async def call_llm(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.7,
    user_api_key: str | None = None,
) -> str:
    """Call DeepSeek API and return the response content."""
    api_key = _resolve_key(user_api_key)

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
                "thinking": {"type": "disabled"},
            },
        )
        if response.status_code != 200:
            logger.error("LLM API returned %s: %s", response.status_code, response.text[:500])
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


def strip_json_fence(result: str) -> str:
    """Remove markdown code fences and leading 'json' tag from LLM output."""
    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1] if "\n" in result else result[3:]
    if result.endswith("```"):
        result = result[:-3]
    result = result.strip()
    if result.startswith("json"):
        result = result[4:].strip()
    return result


async def grade_answer(
    question_content: str,
    correct_answer: str,
    student_answer: str,
    explanation: str = "",
    options: list[str] | None = None,
    question_type: str = "short_answer",
    user_api_key: str | None = None,
) -> dict:
    """Use LLM to grade a free-form answer.
    Returns structured dict: {correct, feedback, missing_steps, wrong_concepts, suggestion}."""
    system_prompt = """You are an exam grader. Evaluate the student's answer against the correct answer.

Return a JSON object with:
- "correct": boolean (true if substantially correct)
- "feedback": a detailed explanation (2-4 sentences). Explain WHY the answer is correct or incorrect, what the student missed or did well, and how to approach similar problems.
- "missing_steps": list of key steps or concepts the student omitted (empty list if none)
- "wrong_concepts": list of concepts the student seems to misunderstand (empty list if none)
- "suggestion": a brief, actionable tip for improvement ("Review the chain rule for composite functions")

Rules:
- Be lenient: accept equivalent phrasing, partial credit for key concepts present
- For math: accept equivalent expressions and different notation
- For proofs: accept valid alternative approaches
- For MCQ: the student selected the option text shown. The options are listed. Determine if the student's selection matches the correct answer. Accept options by letter ("A"), by partial text, or by full text.
- For true/false: the student's answer is their selection (text "True"/"False" or "T"/"F").
- If the student shows understanding of the core concept, mark correct
- Always provide substantive feedback even for correct answers (explain why it's right)
- Return ONLY valid JSON, no markdown code blocks"""

    # Build options text for MCQ
    options_text = ""
    if question_type == "mcq" and options:
        lines = []
        for i, opt in enumerate(options):
            letter = chr(ord("A") + i)
            lines.append(f"{letter}) {opt}")
        options_text = "Options:\n" + "\n".join(lines) + "\n\n"

    user_prompt = f"""Question type: {question_type}
{options_text}Question: {question_content}

Correct answer: {correct_answer}
Student's answer: {student_answer}

{f"Reference explanation: {explanation}" if explanation else ""}

Grade this answer."""

    try:
        result = await call_llm(system_prompt, user_prompt, temperature=0.2, user_api_key=user_api_key)
        result = strip_json_fence(result)
        parsed = json.loads(result)
        return {
            "correct": bool(parsed.get("correct", False)),
            "grading_failed": False,
            "feedback": parsed.get("feedback", ""),
            "missing_steps": parsed.get("missing_steps", []),
            "wrong_concepts": parsed.get("wrong_concepts", []),
            "suggestion": parsed.get("suggestion", ""),
        }
    except Exception:
        logger.exception("Failed to grade answer via LLM")
        return {
            "correct": None,
            "grading_failed": True,
            "feedback": "Grading unavailable right now. Please retry.",
            "missing_steps": [],
            "wrong_concepts": [],
            "suggestion": "",
        }