import json
import uuid
from typing import Optional

from services.llm_client import call_llm, strip_json_fence


def _format_reference_questions(refs: list[dict]) -> str:
    """Format reference questions as text, truncated to 2000 chars."""
    parts = []
    total_len = 0
    for r in refs:
        text = f"Q: {r.get('content', '')}\nA: {r.get('answer', '')}\n"
        if total_len + len(text) > 2000:
            remaining = 2000 - total_len
            if remaining > 50:
                parts.append(text[:remaining])
            break
        parts.append(text)
        total_len += len(text)
    return "\n---\n".join(parts)


async def generate_question(
    topic: str,
    difficulty: str,
    question_type: str,
    exam_style_description: str = "",
    context: str = "",
    reference_questions: Optional[list[dict]] = None,
) -> dict:
    """Generate a new question based on topic, difficulty, and type.

    If reference_questions are provided (up to 2000 chars), they are included
    as few-shot examples so the LLM matches the course's exam style.
    """

    system_prompt = """You are an exam question generator. Create a high-quality exam question based on the given parameters.

Return a JSON object with:
- "content": the question text (use $...$ for inline LaTeX, $$...$$ for display LaTeX)
- "question_type": the question type
- "difficulty": the difficulty level
- "topic": the topic
- "options": list of options (for MCQ only, null otherwise)
- "answer": the correct answer
- "explanation": detailed explanation of the solution

Rules:
- Make the question realistic and exam-worthy
- Use proper LaTeX for any mathematical expressions
- For MCQ, make distractors plausible
- Match the difficulty level: easy (direct recall), medium (application), hard (analysis/synthesis)
- Return ONLY valid JSON, no markdown code blocks"""

    if reference_questions:
        ref_text = _format_reference_questions(reference_questions)
        if ref_text:
            system_prompt += f"""

Here are example questions from the course's past exams that match this topic.
Study their style, wording, and depth:
{ref_text}

Generate a new question in the same style."""

    user_prompt = f"""Generate a question with these parameters:
- Topic: {topic}
- Difficulty: {difficulty}
- Question type: {question_type}
- Exam style: {exam_style_description}
- Context from course material: {context[:2000] if context else 'N/A'}"""

    result = await call_llm(system_prompt, user_prompt, temperature=0.8)
    result = strip_json_fence(result)

    try:
        question = json.loads(result)
        question["id"] = str(uuid.uuid4())[:8]
        return question
    except json.JSONDecodeError:
        return None
