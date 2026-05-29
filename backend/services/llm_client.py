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
