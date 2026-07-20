import json
import logging

from config import DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from models.compute import ModelRequestConfig
from services.compute import Provider, builtin_provider, chat_completion, local_providers, provider_from_request

logger = logging.getLogger(__name__)


async def call_llm(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.7,
    user_api_key: str | None = None,
    model_config: ModelRequestConfig | None = None,
    operation: str = "completion",
) -> str:
    """Route a completion across a user endpoint, local service, then built-in.

    ``user_api_key`` remains supported for existing callers and means “use the
    built-in DeepSeek endpoint with this user-owned key”. New callers should
    pass ``model_config`` to select any public OpenAI-compatible endpoint.
    """
    config = model_config or ModelRequestConfig(api_key=user_api_key)
    candidates: list[Provider] = []
    primary = await provider_from_request(config)
    if primary:
        candidates.append(primary)
    elif config.api_key:
        candidates.append(
            Provider("User DeepSeek key", "user", DEEPSEEK_BASE_URL.rstrip("/"), config.model or DEEPSEEK_MODEL, config.api_key, True)
        )

    if not candidates or config.allow_fallback:
        candidates.extend(provider for provider in local_providers() if provider.model)
        built_in = builtin_provider()
        if built_in and all(p.identity != built_in.identity for p in candidates):
            candidates.append(built_in)

    if not candidates:
        raise RuntimeError("No usable model provider is configured")

    first_name = candidates[0].name
    last_error: Exception | None = None
    for index, provider in enumerate(candidates):
        try:
            return await chat_completion(
                provider,
                system_prompt,
                user_prompt,
                temperature,
                operation=operation,
                route_reason="user_preference" if index == 0 and primary else ("configured_route" if index == 0 else "automatic_fallback"),
                fallback_from=first_name if index else None,
            )
        except Exception as exc:
            last_error = exc
            logger.warning("Model provider %s failed; fallback=%s", provider.name, index + 1 < len(candidates))
    raise RuntimeError("All configured model providers failed") from last_error


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
    model_config: ModelRequestConfig | None = None,
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
        result = await call_llm(system_prompt, user_prompt, temperature=0.2, user_api_key=user_api_key, model_config=model_config, operation="grade")
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
