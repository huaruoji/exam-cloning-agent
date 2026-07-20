import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from config import DATA_DIR


DATA_PATH = Path(DATA_DIR)


def _serialize(value: Any):
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value)} is not JSON serializable")


class JsonTable:
    def __init__(self, filename: str):
        self.path = DATA_PATH / filename
        self._lock = threading.Lock()

    def load(self) -> list[dict]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, items: list[dict]):
        tmp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2, default=_serialize)
        os.replace(str(tmp_path), str(self.path))

    def append(self, item: dict):
        with self._lock:
            items = self.load()
            items.append(item)
            self.save(items)

    def mutate(self, fn: Callable[[list[dict]], None]):
        """Load, call fn(list), save — all under lock."""
        with self._lock:
            items = self.load()
            fn(items)
            self.save(items)


courses_table = JsonTable("courses.json")
documents_table = JsonTable("documents.json")
jobs_table = JsonTable("jobs.json")
questions_table = JsonTable("questions.json")
profiles_table = JsonTable("course_profiles.json")
student_states_table = JsonTable("student_states.json")
practice_history_table = JsonTable("practice_history.json")
exams_table = JsonTable("exams.json")