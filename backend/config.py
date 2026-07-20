import os
import json
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

# Optional administrator-managed inference endpoints.  This is deliberately
# separate from user supplied endpoints: administrators may point at loopback
# or private network services, while public API requests are SSRF checked.
# Example:
# MODEL_LOCAL_ENDPOINTS='[{"name":"ollama","base_url":"http://127.0.0.1:11434/v1","model":"qwen2.5:7b"}]'
MODEL_LOCAL_ENDPOINTS_RAW = os.getenv("MODEL_LOCAL_ENDPOINTS", "[]")
AUTO_DISCOVER_LOCAL_MODELS = os.getenv("AUTO_DISCOVER_LOCAL_MODELS", "true").lower() in {"1", "true", "yes"}


def _load_local_model_endpoints(raw: str) -> list[dict[str, str]]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    endpoints = []
    for item in value:
        if not isinstance(item, dict) or not str(item.get("base_url", "")).strip():
            continue
        endpoints.append(
            {
                "name": str(item.get("name") or "local-model")[:80],
                "base_url": str(item["base_url"]).rstrip("/"),
                "model": str(item.get("model") or "")[:160],
                "api_key": str(item.get("api_key") or ""),
            }
        )
    return endpoints


MODEL_LOCAL_ENDPOINTS = _load_local_model_endpoints(MODEL_LOCAL_ENDPOINTS_RAW)

# Storage dirs: prefer persistent /mydata on the competition devbox, fall back to local.
DATA_DIR = os.getenv("DATA_DIR", str(BACKEND_DIR / "data"))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "uploads"))

# Frontend static build to serve in single-process deployment.
FRONTEND_DIST = os.getenv("FRONTEND_DIST", str(PROJECT_ROOT / "frontend" / "dist"))

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
