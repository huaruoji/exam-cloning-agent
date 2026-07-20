import asyncio
import json
import math
import random
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from models.compute import ModelRequestConfig
from routers.deps import get_model_request_config, get_user_id
from services.ingestion import get_course_profile
from services.grader import grade
from services.question_generator import generate_question
from services.compute import record_bank_reuse
from services.store import courses_table, exams_table, practice_history_table, questions_table, student_states_table

router = APIRouter(prefix="/api/exam", tags=["exam"])
_submission_lock = asyncio.Lock()

MAX_EXAM_QUESTIONS = 20
MAX_PROMPT_CHARS = 2_000
MAX_ANSWER_CHARS = 20_000


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _release_failed_submission(exam_id: str):
    """Return an interrupted grading attempt to a retryable state."""
    async with _submission_lock:
        exams = exams_table.load()
        stored_exam = next((item for item in exams if item.get("id") == exam_id), None)
        if stored_exam and stored_exam.get("status") == "grading":
            stored_exam["status"] = "in_progress"
            exams_table.save(exams)


class ExamQuestionSpec(BaseModel):
    question_type: str | None = None
    difficulty: str | None = None
    topic: str | None = None


class ExamRequest(BaseModel):
    course_id: str
    num_questions: int = Field(default=10, ge=1, le=MAX_EXAM_QUESTIONS)
    # Optional overrides; when null, derive from the course style profile.
    type_distribution: dict[str, float] | None = None
    difficulty_distribution: dict[str, float] | None = None
    topics: list[str] | None = Field(default=None, max_length=30)
    extra_prompt: str = Field(default="", max_length=MAX_PROMPT_CHARS)
    time_limit_minutes: int | None = Field(default=None, ge=1, le=24 * 60)
    bank_ratio: float = Field(default=0.8, ge=0.0, le=1.0)

    @field_validator("type_distribution", "difficulty_distribution")
    @classmethod
    def validate_distribution(cls, value: dict[str, float] | None):
        if value is None:
            return value
        if not value or len(value) > 20 or any(not key or len(key) > 100 for key in value):
            raise ValueError("distribution must contain 1-20 named entries")
        if any(not math.isfinite(weight) or weight < 0 for weight in value.values()) or sum(value.values()) <= 0:
            raise ValueError("distribution weights must be non-negative with a positive total")
        return value

    @field_validator("topics")
    @classmethod
    def validate_topics(cls, value: list[str] | None):
        if value is not None and any(not topic.strip() or len(topic) > 200 for topic in value):
            raise ValueError("topics must be non-empty and at most 200 characters")
        return value


class ExamAnswer(BaseModel):
    question_id: str
    answer: str = Field(max_length=MAX_ANSWER_CHARS)


class ExamSubmission(BaseModel):
    course_id: str
    exam_id: str
    answers: list[ExamAnswer] = Field(max_length=MAX_EXAM_QUESTIONS)
    elapsed_seconds: int = Field(default=0, ge=0, le=7 * 24 * 60 * 60)


class SaveAnswersRequest(BaseModel):
    answers: dict[str, str] = Field(max_length=MAX_EXAM_QUESTIONS)
    elapsed_seconds: int = Field(ge=0, le=7 * 24 * 60 * 60)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, value: dict[str, str]):
        if any(len(answer) > MAX_ANSWER_CHARS for answer in value.values()):
            raise ValueError(f"answers may not exceed {MAX_ANSWER_CHARS} characters")
        return value


def _pick(dist: dict[str, float] | None, fallback: dict[str, float]) -> str:
    d = dist or fallback or {"short_answer": 1.0}
    keys = list(d.keys())
    weights = list(d.values())
    return random.choices(keys, weights=weights, k=1)[0]


@router.post("/generate")
async def generate_exam(
    request: ExamRequest,
    user_id: str = Depends(get_user_id),
    model_config: ModelRequestConfig = Depends(get_model_request_config),
):
    """Stream exam generation with per-question progress (Server-Sent Events).

    Each event is a JSON line: {"type":"progress","done":3,"total":10}
    or {"type":"question","question":{...}} or {"type":"complete","exam_id":...}
    """
    course = next(
        (course for course in courses_table.load()
         if course.get("id") == request.course_id and course.get("user_id", "public") in (user_id, "public")),
        None,
    )
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    profile = get_course_profile(request.course_id)
    if not profile:
        raise HTTPException(status_code=400, detail="No course profile found. Upload and process course documents first.")

    style = profile.get("style_profile", {})
    knowledge = profile.get("knowledge_profile", {})
    bank_questions = [
        q for q in questions_table.load()
        if q.get("course_id") == request.course_id
        and q.get("user_id", "public") in (user_id, "public")
        and q.get("source_type") != "generated"
    ]

    type_dist = request.type_distribution or style.get("question_type_distribution", {"short_answer": 1.0})
    diff_dist = request.difficulty_distribution or style.get("difficulty_distribution", {"medium": 1.0})
    topics = request.topics or knowledge.get("topics", []) or style.get("key_topics", []) or ["general"]
    num = request.num_questions
    extra = (request.extra_prompt or "").strip()
    bank_ratio = max(0.0, min(1.0, request.bank_ratio))
    exam_id = uuid.uuid4().hex[:8]

    async def event_stream():
        generated = []

        # --- Phase 1: Build all specs first ---
        specs = []
        for i in range(num):
            q_type = _pick(request.type_distribution, type_dist)
            difficulty = _pick(request.difficulty_distribution, diff_dist)
            topic = random.choice(topics) if topics else "general"
            specs.append((q_type, difficulty, topic))

        # --- Sort specs deterministically ---
        type_order = {"mcq": 0, "true_false": 1, "short_answer": 2, "calculation": 3, "essay": 4}
        diff_order = {"easy": 0, "medium": 1, "hard": 2}
        specs.sort(key=lambda s: (type_order.get(s[0], 99), diff_order.get(s[1], 99), random.random()))

        # --- Build richer context ---
        course_context = ""
        topic_names = knowledge.get("topics", [])
        if topic_names:
            course_context = f"Course topics: {', '.join(topic_names[:15])}"
        style_desc = style.get("description", "")
        if style_desc:
            if course_context:
                course_context += "\n"
            course_context += f"Style: {style_desc[:500]}"

        if extra:
            if course_context:
                course_context += "\n"
            course_context += f"Additional instructions: {extra}"

        # --- Phase 2: Generate each question ---
        for i, (q_type, difficulty, topic) in enumerate(specs):
            # Try the bank first based on bank_ratio
            candidates = [
                q for q in bank_questions
                if q.get("question_type") == q_type and q.get("difficulty") == difficulty
            ]
            if candidates and random.random() < bank_ratio:
                question = dict(random.choice(candidates))
                # Each exam question needs a unique identity even if the same
                # source-bank question is sampled more than once.
                question["source_question_id"] = question.get("id")
                question["id"] = uuid.uuid4().hex[:10]
                await record_bank_reuse("exam")
            else:
                # Collect up to 3 reference questions matching (topic, difficulty, type)
                reference_questions = [
                    q for q in bank_questions
                    if q.get("topic") == topic
                    and q.get("difficulty") == difficulty
                    and q.get("question_type") == q_type
                ][:3]
                if not reference_questions:
                    reference_questions = None

                question = await generate_question(
                    topic=topic,
                    difficulty=difficulty,
                    question_type=q_type,
                    exam_style_description=style.get("description", ""),
                    context=course_context,
                    reference_questions=reference_questions,
                    model_config=model_config,
                )
                if question is None:
                    # Retry once
                    question = await generate_question(
                        topic=topic,
                        difficulty=difficulty,
                        question_type=q_type,
                        exam_style_description=style.get("description", ""),
                        context=course_context,
                        reference_questions=reference_questions,
                        model_config=model_config,
                    )
                if question is None:
                    # Skip this question entirely
                    yield json.dumps({"type": "progress", "done": i + 1, "total": num}) + "\n"
                    continue
                question["course_id"] = request.course_id
                question["source_type"] = "generated"
                question["user_id"] = user_id

            generated.append(question)
            yield json.dumps({"type": "progress", "done": i + 1, "total": num}) + "\n"

        # Persist the exam so it can be resumed and graded later.
        exam = {
            "id": exam_id,
            "course_id": request.course_id,
            "user_id": user_id,
            "title": f"Mock Exam ({len(generated)} questions)",
            "questions": generated,
            "style_profile": style,
            "status": "in_progress",
            "time_limit_minutes": request.time_limit_minutes,
            "created_at": _utcnow(),
        }
        exams_table.append(exam)
        yield json.dumps({"type": "complete", "exam_id": exam_id, "exam": exam}) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


@router.get("")
async def list_exams(course_id: str, user_id: str = Depends(get_user_id)):
    exams = [
        e for e in exams_table.load()
        if e.get("course_id") == course_id and e.get("user_id", "public") in (user_id, "public")
    ]
    exams.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    # Strip the heavy questions list for the list view.
    summary = [
        {
            "id": e["id"],
            "course_id": e["course_id"],
            "title": e["title"],
            "status": e.get("status", "in_progress"),
            "num_questions": len(e.get("questions", [])),
            "time_limit_minutes": e.get("time_limit_minutes"),
            "created_at": e.get("created_at"),
        }
        for e in exams
    ]
    return {"exams": summary}


@router.get("/styles")
async def list_styles(course_id: str, user_id: str = Depends(get_user_id)):
    course = next(
        (course for course in courses_table.load()
         if course.get("id") == course_id and course.get("user_id", "public") in (user_id, "public")),
        None,
    )
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    profile = get_course_profile(course_id)
    return {"profile": profile}


@router.get("/{exam_id}")
async def get_exam(exam_id: str, user_id: str = Depends(get_user_id)):
    exam = next((e for e in exams_table.load() if e["id"] == exam_id), None)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("user_id", "public") not in (user_id, "public"):
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


@router.delete("/{exam_id}")
async def delete_exam(exam_id: str, user_id: str = Depends(get_user_id)):
    exams = exams_table.load()
    exam = next((e for e in exams if e["id"] == exam_id), None)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("user_id", "public") not in (user_id, "public"):
        raise HTTPException(status_code=403, detail="Not allowed")
    new = [e for e in exams if e["id"] != exam_id]
    exams_table.save(new)
    return {"deleted": exam_id}


@router.post("/submit")
async def submit_exam(
    submission: ExamSubmission,
    user_id: str = Depends(get_user_id),
    model_config: ModelRequestConfig = Depends(get_model_request_config),
):
    """Grade all exam answers. Match exam by exam_id exactly."""
    async with _submission_lock:
        # Reserve the exam before awaiting graders so a second submit cannot race.
        exams = exams_table.load()
        exam = next((e for e in exams if e["id"] == submission.exam_id), None)
        if not exam or exam.get("user_id", "public") not in (user_id, "public"):
            raise HTTPException(status_code=404, detail="Exam not found")
        if exam.get("course_id") != submission.course_id:
            raise HTTPException(status_code=400, detail="Exam does not belong to the submitted course")
        if exam.get("status") != "in_progress":
            raise HTTPException(status_code=409, detail="Exam has already been submitted")

        exam_question_ids = [q.get("id") for q in exam.get("questions", [])]
        submitted_ids = [answer.question_id for answer in submission.answers]
        if len(submitted_ids) != len(set(submitted_ids)):
            raise HTTPException(status_code=400, detail="Each exam question may be submitted only once")
        if set(submitted_ids) != set(exam_question_ids) or len(submitted_ids) != len(exam_question_ids):
            raise HTTPException(status_code=400, detail="Submission must include every exam question exactly once")

        exam["status"] = "grading"
        exams_table.save(exams)

    # Build a lookup from the exam's own questions
    exam_questions = {q.get("id"): q for q in exam.get("questions", [])}

    results = []
    correct_count = 0

    for ans in submission.answers:
        question = exam_questions.get(ans.question_id)
        if not question:
            results.append({
                "question_id": ans.question_id,
                "correct": False,
                "feedback": "Question not found.",
                "correct_answer": "",
                "explanation": "",
                "missing_steps": [],
                "wrong_concepts": [],
                "suggestion": "",
            })
            continue

        if not ans.answer.strip():
            results.append({
                "question_id": ans.question_id,
                "correct": False,
                "feedback": "No answer submitted.",
                "correct_answer": question.get("answer", ""),
                "explanation": question.get("explanation", ""),
                "missing_steps": [],
                "wrong_concepts": [],
                "suggestion": "",
            })
            continue

        try:
            grading = await grade(
                question,
                ans.answer,
                user_api_key=model_config.api_key,
                model_config=model_config,
            )
            correct = grading["correct"]
            if correct:
                correct_count += 1
            results.append({
                "question_id": ans.question_id,
                "correct": correct,
                "grading_failed": grading.get("grading_failed", False),
                "feedback": grading["feedback"],
                "missing_steps": grading.get("missing_steps", []),
                "wrong_concepts": grading.get("wrong_concepts", []),
                "suggestion": grading.get("suggestion", ""),
                "correct_answer": question.get("answer", ""),
                "explanation": question.get("explanation", ""),
            })
        except Exception as exc:
            await _release_failed_submission(submission.exam_id)
            raise HTTPException(status_code=503, detail="Exam grading was interrupted; please retry") from exc

    total = len(exam_questions)
    # Mark the exam as completed.
    async with _submission_lock:
        exams = exams_table.load()
        stored_exam = next((e for e in exams if e["id"] == submission.exam_id), None)
        if stored_exam is None:
            raise HTTPException(status_code=404, detail="Exam not found")
        stored_exam["status"] = "completed"
        stored_exam["results"] = results
        stored_exam["saved_answers"] = {answer.question_id: answer.answer for answer in submission.answers}
        stored_exam["completed_at"] = _utcnow()
        stored_exam["duration_seconds"] = submission.elapsed_seconds
        exams_table.save(exams)

    return {
        "total": total,
        "correct_count": correct_count,
        "accuracy": correct_count / total if total > 0 else 0,
        "results": results,
    }


@router.patch("/{exam_id}/answers")
async def save_answers(
    exam_id: str,
    request: SaveAnswersRequest,
    user_id: str = Depends(get_user_id),
):
    """Auto-save answers during an exam."""
    exams = exams_table.load()
    exam = next((e for e in exams if e["id"] == exam_id), None)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("user_id", "public") not in (user_id, "public"):
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("status") != "in_progress":
        raise HTTPException(status_code=409, detail="Completed exams cannot be changed")

    question_ids = {question.get("id") for question in exam.get("questions", [])}
    if not set(request.answers).issubset(question_ids):
        raise HTTPException(status_code=400, detail="Answers contain a question outside this exam")

    exam["saved_answers"] = request.answers
    exam["elapsed_seconds"] = request.elapsed_seconds

    if exam.get("status") == "in_progress" and not exam.get("started_at"):
        exam["started_at"] = _utcnow()

    exams_table.save(exams)
    return {"status": "saved"}


@router.post("/{exam_id}/export-wrongs")
async def export_wrongs(
    exam_id: str,
    user_id: str = Depends(get_user_id),
):
    """Import wrong answers from a completed exam into practice history."""
    exams = exams_table.load()
    exam = next((e for e in exams if e["id"] == exam_id), None)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("user_id", "public") not in (user_id, "public"):
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("status") != "completed" or not exam.get("results"):
        raise HTTPException(status_code=400, detail="Exam is not completed or has no results")

    exam_questions = {q.get("id"): q for q in exam.get("questions", [])}
    now = _utcnow()
    imported = 0
    states = student_states_table.load()
    existing_imports = {
        record.get("question_id")
        for record in practice_history_table.load()
        if record.get("source_exam_id") == exam_id and record.get("user_id", "public") == user_id
    }

    for result in exam.get("results", []):
        if result.get("correct") is not False or result.get("grading_failed"):
            continue

        question_id = result.get("question_id", "")
        question = exam_questions.get(question_id)
        if not question:
            continue
        if question_id in existing_imports:
            continue

        concept = question.get("topic", "unknown")

        # Find the student's saved answer for this question
        saved_answers = exam.get("saved_answers", {})
        student_answer = saved_answers.get(question_id, "")

        record = {
            "id": uuid.uuid4().hex[:10],
            "course_id": exam["course_id"],
            "user_id": user_id,
            "question_id": question_id,
            "source_exam_id": exam_id,
            "action": "exam_import",
            "answer": student_answer,
            "correct": False,
            "concept": concept,
            "mastery_after": 0,
            "created_at": now,
            "question": {
                "content": question.get("content", ""),
                "question_type": question.get("question_type", ""),
                "difficulty": question.get("difficulty", ""),
                "topic": question.get("topic", ""),
                "options": question.get("options"),
                "answer": question.get("answer", ""),
                "explanation": question.get("explanation", ""),
            },
        }
        practice_history_table.append(record)

        # Touch student_state for concept
        state_found = False
        for entry in states:
            if entry.get("course_id") == exam["course_id"] and entry.get("user_id", "public") == user_id:
                state = entry["state"]
                cm = state.get("concept_mastery", {})
                if concept not in cm:
                    cm[concept] = {"concept": concept, "score": 0}
                else:
                    cm[concept]["score"] = cm[concept]["score"] / 2.0
                state["concept_mastery"] = cm
                state_found = True
                break
        if not state_found:
            states.append({
                "course_id": exam["course_id"],
                "user_id": user_id,
                "state": {
                    "concept_mastery": {concept: {"concept": concept, "score": 0}},
                    "total_questions_attempted": 0,
                    "total_correct": 0,
                    "recent_accuracy": [],
                },
            })

        imported += 1

    student_states_table.save(states)

    return {"imported": imported}
