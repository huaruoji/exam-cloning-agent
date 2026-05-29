import json
import uuid
from services.llm_client import call_llm


async def generate_question(
    topic: str,
    difficulty: str,
    question_type: str,
    exam_style_description: str = "",
    context: str = "",
) -> dict:
    """Generate a new question based on topic, difficulty, and type."""

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

    user_prompt = f"""Generate a question with these parameters:
- Topic: {topic}
- Difficulty: {difficulty}
- Question type: {question_type}
- Exam style: {exam_style_description}
- Context from course material: {context[:2000] if context else 'N/A'}"""

    result = await call_llm(system_prompt, user_prompt, temperature=0.8)

    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1] if "\n" in result else result[3:]
    if result.endswith("```"):
        result = result[:-3]
    result = result.strip()
    if result.startswith("json"):
        result = result[4:].strip()

    try:
        question = json.loads(result)
        question["id"] = str(uuid.uuid4())[:8]
        return question
    except json.JSONDecodeError:
        return {
            "id": str(uuid.uuid4())[:8],
            "content": "Failed to generate question. Please try again.",
            "question_type": question_type,
            "difficulty": difficulty,
            "topic": topic,
            "options": None,
            "answer": "",
            "explanation": "",
        }
