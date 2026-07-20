import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from models.compute import ModelRequestConfig
from models.job import JobStatus
from routers import demo, exam, jobs, practice, upload
from services import ingestion
from services.store import (
    courses_table,
    documents_table,
    exams_table,
    jobs_table,
    practice_history_table,
    profiles_table,
    questions_table,
    student_states_table,
)


ALL_TABLES = (
    courses_table,
    documents_table,
    exams_table,
    jobs_table,
    practice_history_table,
    profiles_table,
    questions_table,
    student_states_table,
)


@pytest.fixture(autouse=True)
def isolated_tables(tmp_path, monkeypatch):
    for table in ALL_TABLES:
        monkeypatch.setattr(table, "path", tmp_path / table.path.name)
    monkeypatch.setattr(upload, "UPLOAD_DIR", str(tmp_path / "uploads"))
    (tmp_path / "uploads").mkdir()
    yield
    for task in list(ingestion.active_tasks.values()):
        task.cancel()
    ingestion.active_tasks.clear()


@pytest.mark.asyncio
async def test_demo_seed_remaps_ids_for_each_user():
    alice = await demo.seed_demo("alice")
    bob = await demo.seed_demo("bob")

    assert alice["course"]["id"] != bob["course"]["id"]
    alice_questions = [q for q in questions_table.load() if q["user_id"] == "alice"]
    bob_questions = [q for q in questions_table.load() if q["user_id"] == "bob"]
    assert len(alice_questions) == len(bob_questions) > 0
    assert {q["id"] for q in alice_questions}.isdisjoint({q["id"] for q in bob_questions})
    assert {q["course_id"] for q in alice_questions} == {alice["course"]["id"]}
    assert {q["course_id"] for q in bob_questions} == {bob["course"]["id"]}

    repeated = await demo.seed_demo("alice")
    assert repeated["status"] == "exists"
    assert len([q for q in questions_table.load() if q["user_id"] == "alice"]) == len(alice_questions)


def test_upload_course_lookup_enforces_owner_and_name_partition():
    courses_table.save([{"id": "alice-course", "name": "Calculus", "user_id": "alice"}])

    with pytest.raises(HTTPException) as error:
        upload._ensure_course("alice-course", None, "bob")
    assert error.value.status_code == 404

    bob_course = upload._ensure_course(None, "Calculus", "bob")
    assert bob_course["id"] != "alice-course"
    assert bob_course["user_id"] == "bob"


def test_upload_rejects_non_pdf_content(monkeypatch):
    monkeypatch.setattr(upload, "enqueue_document_job", lambda *args: {})
    app = FastAPI()
    app.include_router(upload.router)
    client = TestClient(app)

    response = client.post(
        "/api/uploads",
        headers={"X-User-Id": "alice"},
        data={"course_name": "Calculus", "document_type": "slides"},
        files={"file": ("notes.pdf", b"not a pdf", "application/pdf")},
    )
    assert response.status_code == 400
    assert "valid PDF" in response.json()["detail"]


def test_upload_rejects_files_over_limit(monkeypatch):
    monkeypatch.setattr(upload, "MAX_UPLOAD_BYTES", 8)
    monkeypatch.setattr(upload, "enqueue_document_job", lambda *args: {})
    app = FastAPI()
    app.include_router(upload.router)
    client = TestClient(app)

    response = client.post(
        "/api/uploads",
        headers={"X-User-Id": "alice"},
        data={"course_name": "Calculus", "document_type": "slides"},
        files={"file": ("notes.pdf", b"%PDF-more-than-eight", "application/pdf")},
    )
    assert response.status_code == 413


@pytest.mark.asyncio
async def test_text_retry_preserves_source_and_checks_owner(monkeypatch):
    async def no_op(*args, **kwargs):
        return None

    monkeypatch.setattr(ingestion, "process_text_job", no_op)
    failed_job = {
        "id": "failed-text",
        "course_id": "course-1",
        "document_id": "doc-1",
        "user_id": "alice",
        "source_type": "text",
        "source_text": "Question: 2 + 2?",
        "status": JobStatus.FAILED,
        "created_at": "2026-01-01T00:00:00Z",
    }
    jobs_table.save([failed_job])

    assert ingestion.retry_job("failed-text", "bob") is None
    retried = ingestion.retry_job("failed-text", "alice")
    assert retried is not None
    assert retried["source_type"] == "text"
    assert retried["source_text"] == failed_job["source_text"]

    app = FastAPI()
    app.include_router(jobs.router)
    response = TestClient(app).get(f"/api/jobs/{retried['id']}", headers={"X-User-Id": "alice"})
    assert response.status_code == 200
    assert "source_text" not in response.json()


def test_exam_styles_static_route_is_not_shadowed():
    courses_table.save([{"id": "course-1", "name": "Course", "user_id": "alice"}])
    profiles_table.save([{"course_id": "course-1", "style_profile": {"description": "style"}}])
    app = FastAPI()
    app.include_router(exam.router)
    client = TestClient(app)

    response = client.get("/api/exam/styles?course_id=course-1", headers={"X-User-Id": "alice"})
    assert response.status_code == 200
    assert response.json()["profile"]["style_profile"]["description"] == "style"


@pytest.mark.asyncio
async def test_practice_answer_rejects_other_users_question():
    questions_table.save([
        {"id": "q1", "course_id": "course-1", "user_id": "alice", "topic": "algebra", "answer": "4"}
    ])
    submission = practice.AnswerSubmission(course_id="course-1", question_id="q1", answer="4")

    with pytest.raises(HTTPException) as error:
        await practice.submit_answer(submission, user_id="bob", model_config=ModelRequestConfig())
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_selected_model_config_reaches_generation(monkeypatch):
    courses_table.save([{"id": "course-1", "name": "Course", "user_id": "alice"}])
    profiles_table.save([
        {
            "course_id": "course-1",
            "style_profile": {},
            "knowledge_profile": {"topics": ["algebra"]},
        }
    ])
    received = {}

    async def fake_generate(**kwargs):
        received.update(kwargs)
        return {
            "id": "generated-1",
            "content": "Question",
            "question_type": "short_answer",
            "difficulty": "medium",
            "topic": "algebra",
            "answer": "Answer",
        }

    monkeypatch.setattr(practice, "generate_question", fake_generate)
    config = ModelRequestConfig(
        base_url="https://models.example/v1", api_key="secret", model="custom-model", allow_fallback=False
    )
    response = await practice.get_next_question(
        practice.PracticeRequest(course_id="course-1"), user_id="alice", model_config=config
    )

    assert response["source"] == "generated"
    assert received["model_config"] is config


def _seed_exam(*, status="in_progress"):
    exams_table.save([
        {
            "id": "exam-1",
            "course_id": "course-1",
            "user_id": "alice",
            "status": status,
            "questions": [
                {"id": "q1", "topic": "algebra", "answer": "4", "question_type": "short_answer"},
                {"id": "q2", "topic": "geometry", "answer": "yes", "question_type": "short_answer"},
            ],
        }
    ])


@pytest.mark.asyncio
async def test_exam_submission_must_be_complete_is_single_use_and_saves_answers(monkeypatch):
    _seed_exam()
    received_configs = []

    async def correct_grade(question, answer, user_api_key=None, model_config=None):
        received_configs.append(model_config)
        return {
            "correct": answer == question["answer"],
            "grading_failed": False,
            "feedback": "ok",
            "missing_steps": [],
            "wrong_concepts": [],
            "suggestion": "",
        }

    monkeypatch.setattr(exam, "grade", correct_grade)
    incomplete = exam.ExamSubmission(
        course_id="course-1", exam_id="exam-1", answers=[{"question_id": "q1", "answer": "4"}]
    )
    with pytest.raises(HTTPException) as error:
        await exam.submit_exam(incomplete, user_id="alice", model_config=ModelRequestConfig())
    assert error.value.status_code == 400
    assert exams_table.load()[0]["status"] == "in_progress"

    complete = exam.ExamSubmission(
        course_id="course-1",
        exam_id="exam-1",
        answers=[{"question_id": "q1", "answer": "4"}, {"question_id": "q2", "answer": ""}],
    )
    selected_config = ModelRequestConfig(model="selected-model")
    result = await exam.submit_exam(complete, user_id="alice", model_config=selected_config)
    assert result["total"] == 2
    stored = exams_table.load()[0]
    assert stored["status"] == "completed"
    assert stored["saved_answers"] == {"q1": "4", "q2": ""}
    assert received_configs == [selected_config]

    with pytest.raises(HTTPException) as error:
        await exam.submit_exam(complete, user_id="alice", model_config=ModelRequestConfig())
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_interrupted_exam_grading_can_be_retried(monkeypatch):
    _seed_exam()

    async def broken_grade(*args, **kwargs):
        raise RuntimeError("internal detail must not be exposed")

    monkeypatch.setattr(exam, "grade", broken_grade)
    submission = exam.ExamSubmission(
        course_id="course-1",
        exam_id="exam-1",
        answers=[{"question_id": "q1", "answer": "4"}, {"question_id": "q2", "answer": "yes"}],
    )
    with pytest.raises(HTTPException) as error:
        await exam.submit_exam(submission, user_id="alice", model_config=ModelRequestConfig())

    assert error.value.status_code == 503
    assert "internal detail" not in error.value.detail
    assert exams_table.load()[0]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_wrong_export_is_idempotent_and_ignores_grading_failures():
    _seed_exam(status="completed")
    stored = exams_table.load()[0]
    stored["saved_answers"] = {"q1": "3", "q2": "maybe"}
    stored["results"] = [
        {"question_id": "q1", "correct": False, "grading_failed": False},
        {"question_id": "q2", "correct": None, "grading_failed": True},
    ]
    exams_table.save([stored])

    first = await exam.export_wrongs("exam-1", user_id="alice")
    second = await exam.export_wrongs("exam-1", user_id="alice")

    assert first == {"imported": 1}
    assert second == {"imported": 0}
    history = practice_history_table.load()
    assert len(history) == 1
    assert history[0]["question_id"] == "q1"
    assert history[0]["answer"] == "3"
    assert history[0]["source_exam_id"] == "exam-1"


def test_request_limits_are_validated():
    app = FastAPI()
    app.include_router(exam.router)
    app.include_router(upload.router)
    client = TestClient(app)

    too_many = client.post(
        "/api/exam/generate",
        headers={"X-User-Id": "alice"},
        json={"course_id": "course-1", "num_questions": 21},
    )
    assert too_many.status_code == 422

    too_much_text = client.post(
        "/api/uploads/text",
        headers={"X-User-Id": "alice"},
        json={
            "course_name": "Course",
            "document_type": "slides",
            "title": "Notes",
            "text": "x" * (upload.MAX_TEXT_CHARS + 1),
        },
    )
    assert too_much_text.status_code == 422

    with pytest.raises(ValidationError):
        exam.ExamRequest(course_id="course-1", extra_prompt="x" * (exam.MAX_PROMPT_CHARS + 1))
    with pytest.raises(ValidationError):
        exam.ExamSubmission(
            course_id="course-1",
            exam_id="exam-1",
            answers=[{"question_id": f"q{i}", "answer": ""} for i in range(exam.MAX_EXAM_QUESTIONS + 1)],
        )
