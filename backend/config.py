import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

# Storage dirs: prefer persistent /mydata on the competition devbox, fall back to local.
DATA_DIR = os.getenv("DATA_DIR", str(BACKEND_DIR / "data"))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "uploads"))

# Frontend static build to serve in single-process deployment.
FRONTEND_DIST = os.getenv("FRONTEND_DIST", str(PROJECT_ROOT / "frontend" / "dist"))

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)