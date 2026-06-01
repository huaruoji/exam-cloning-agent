import json
import httpx
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL


async def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    """Call DeepSeek API and return the response content."""
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
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
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def grade_answer(
    question_content: str,
    correct_answer: str,
    student_answer: str,
    explanation: str = "",
) -> dict:
    """Use LLM to grade a free-form answer. Returns {"correct": bool, "feedback": str}."""
    system_prompt = """You are an exam grader. Evaluate the student's answer against the correct answer.

Return a JSON object with:
- "correct": boolean (true if the student's answer is substantially correct)
- "feedback": a brief explanation of why the answer is correct or incorrect (1-2 sentences)

Rules:
- Be lenient: accept equivalent phrasing, partial credit for key concepts present
- For math: accept equivalent expressions, different notation
- For proofs: accept valid alternative approaches
- If the student shows understanding of the core concept, mark correct
- Return ONLY valid JSON, no markdown code blocks"""

    user_prompt = f"""Question: {question_content}

Correct answer: {correct_answer}
Student's answer: {student_answer}

{f"Reference explanation: {explanation}" if explanation else ""}

Grade this answer."""

    try:
        result = await call_llm(system_prompt, user_prompt, temperature=0.2)
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1] if "\n" in result else result[3:]
        if result.endswith("```"):
            result = result[:-3]
        result = result.strip()
        if result.startswith("json"):
            result = result[4:].strip()
        parsed = json.loads(result)
        return {"correct": bool(parsed.get("correct", False)), "feedback": parsed.get("feedback", "")}
    except Exception:
        return {"correct": False, "feedback": "Unable to grade automatically."}
