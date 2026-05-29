import json
from datetime import datetime
from pathlib import Path
from typing import Any

from config import DATA_DIR


DATA_PATH = Path(DATA_DIR)


def _serialize(value: Any):
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value)} is not JSON serializable")


class JsonTable:
    def __init__(self, filename: str):
        self.path = DATA_PATH / filename

    def load(self) -> list[dict]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, items: list[dict]):
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2, default=_serialize)

    def append(self, item: dict):
        items = self.load()
        items.append(item)
        self.save(items)


courses_table = JsonTable("courses.json")
documents_table = JsonTable("documents.json")
jobs_table = JsonTable("jobs.json")
questions_table = JsonTable("questions.json")
profiles_table = JsonTable("course_profiles.json")
student_states_table = JsonTable("student_states.json")
