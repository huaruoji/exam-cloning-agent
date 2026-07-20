import json
import random
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from routers.deps import get_user_id
from services.ingestion import get_course_profile
from services.grader import grade
from services.question_generator import generate_question
from services.store import exams_table, practice_history_table, questions_table, student_states_table

router = APIRouter(prefix="/api/exam", tags=["exam"])


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class ExamQuestionSpec(BaseModel):
    question_type: str | None = None
    difficulty: str | None = None
    topic: str | None = None


class ExamRequest(BaseModel):
    course_id: str
    num_questions: int = 10
    # Optional overrides; when null, derive from the course style profile.
    type_distribution: dict[str, float] | None = None
    difficulty_distribution: dict[str, float] | None = None
    topics: list[str] | None = None
    extra_prompt: str = ""
    time_limit_minutes: int | None = None
    bank_ratio: float = 0.8  # 0.0-1.0, fraction of questions sourced from bank vs AI


class ExamAnswer(BaseModel):
    question_id: str
    answer: str


class ExamSubmission(BaseModel):
    course_id: str
    exam_id: str
    answers: list[ExamAnswer]
    elapsed_seconds: int = 0


class SaveAnswersRequest(BaseModel):
    answers: dict[str, str]
    elapsed_seconds: int


def _pick(dist: dict[str, float] | None, fallback: dict[str, float]) -> str:
    d = dist or fallback or {"short_answer": 1.0}
    keys = list(d.keys())
    weights = list(d.values())
    return random.choices(keys, weights=weights, k=1)[0]


@router.post("/generate")
async def generate_exam(request: ExamRequest, user_id: str = Depends(get_user_id)):
    """Stream exam generation with per-question progress (Server-Sent Events).

    Each event is a JSON line: {"type":"progress","done":3,"total":10}
    or {"type":"question","question":{...}} or {"type":"complete","exam_id":...}
    """
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
    num = min(request.num_questions or 10, 20)
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
        for q_type, difficulty, topic in specs:
            # Try the bank first based on bank_ratio
            candidates = [
                q for q in bank_questions
                if q.get("question_type") == q_type and q.get("difficulty") == difficulty
            ]
            if candidates and random.random() < bank_ratio:
                question = dict(random.choice(candidates))
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


@router.get("/styles")
async def list_styles(course_id: str):
    profile = get_course_profile(course_id)
    return {"profile": profile}


@router.post("/submit")
async def submit_exam(
    submission: ExamSubmission,
    x_user_api_key: str | None = Header(default=None, alias="X-User-Api-Key"),
    user_id: str = Depends(get_user_id),
):
    """Grade all exam answers. Match exam by exam_id exactly."""
    # Find the exam by its exact id
    exams = exams_table.load()
    exam = next((e for e in exams if e["id"] == submission.exam_id), None)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.get("user_id", "public") not in (user_id, "public"):
        raise HTTPException(status_code=404, detail="Exam not found")

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

        grading = await grade(question, ans.answer, user_api_key=x_user_api_key)
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

    total = len(submission.answers)
    # Mark the exam as completed.
    exam["status"] = "completed"
    exam["results"] = results
    exam["completed_at"] = _utcnow()
    exam["duration_seconds"] = submission.elapsed_seconds
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

    for result in exam.get("results", []):
        if result.get("correct", True):
            continue

        question_id = result.get("question_id", "")
        question = exam_questions.get(question_id)
        if not question:
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
