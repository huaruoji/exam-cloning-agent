import asyncio
import uuid
from collections import Counter
from datetime import datetime
from typing import Optional

from models.document import DocumentStatus, DocumentType
from models.job import JobStage, JobStatus
from services.pdf_parser import (
    analyze_exam_style,
    detect_course_name,
    extract_pages_from_pdf,
    parse_questions_from_pages,
)
from services.store import (
    documents_table,
    jobs_table,
    profiles_table,
    questions_table,
)

MAX_CONCURRENT_JOBS = 3
_job_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
active_tasks: dict[str, asyncio.Task] = {}


def _utcnow() -> str:
    return datetime.utcnow().isoformat()


def _update_job(job_id: str, **updates):
    jobs = jobs_table.load()
    for job in jobs:
        if job["id"] == job_id:
            job.update(updates)
            job["updated_at"] = _utcnow()
            break
    jobs_table.save(jobs)


def _update_document(document_id: str, **updates):
    documents = documents_table.load()
    for document in documents:
        if document["id"] == document_id:
            document.update(updates)
            document["updated_at"] = _utcnow()
            break
    documents_table.save(documents)


def _append_questions(new_questions: list[dict]):
    questions = questions_table.load()
    questions.extend(new_questions)
    questions_table.save(questions)


def _aggregate_course_profile(course_id: str):
    documents = [d for d in documents_table.load() if d["course_id"] == course_id and d["status"] == DocumentStatus.COMPLETED]
    questions = [q for q in questions_table.load() if q.get("course_id") == course_id]

    style_questions = [
        q
        for q in questions
        if q.get("source_type") in {DocumentType.PAST_EXAM.value, DocumentType.HOMEWORK.value}
    ]
    knowledge_questions = [
        q
        for q in questions
        if q.get("source_type")
        in {
            DocumentType.PAST_EXAM.value,
            DocumentType.HOMEWORK.value,
            DocumentType.SLIDES.value,
            DocumentType.REFERENCE_PDF.value,
        }
    ]

    if style_questions:
        type_counter = Counter(q.get("question_type", "short_answer") for q in style_questions)
        diff_counter = Counter(q.get("difficulty", "medium") for q in style_questions)
        total = len(style_questions)
        style_profile = {
            "question_type_distribution": {k: v / total for k, v in type_counter.items()},
            "difficulty_distribution": {k: v / total for k, v in diff_counter.items()},
            "key_topics": list({q.get("topic", "general") for q in style_questions if q.get("topic")})[:12],
            "total_questions": total,
            "description": f"Derived from {sum(1 for d in documents if d['document_type'] in {DocumentType.PAST_EXAM.value, DocumentType.HOMEWORK.value})} assessment documents.",
        }
    else:
        style_profile = {
            "question_type_distribution": {"short_answer": 1.0},
            "difficulty_distribution": {"medium": 1.0},
            "key_topics": [],
            "total_questions": 0,
            "description": "No assessment-style documents parsed yet.",
        }

    knowledge_profile = {
        "topics": list({q.get("topic", "general") for q in knowledge_questions if q.get("topic")})[:30],
        "document_counts": Counter(d["document_type"] for d in documents),
        "question_count": len(knowledge_questions),
    }

    profiles = profiles_table.load()
    existing = next((p for p in profiles if p["course_id"] == course_id), None)
    payload = {
        "course_id": course_id,
        "style_profile": style_profile,
        "knowledge_profile": knowledge_profile,
        "updated_at": _utcnow(),
    }
    if existing:
        existing.update(payload)
    else:
        profiles.append(payload)
    profiles_table.save(profiles)


async def process_document_job(job_id: str):
    async with _job_semaphore:
        jobs = jobs_table.load()
        job = next(j for j in jobs if j["id"] == job_id)
        document_id = job["document_id"]
        documents = documents_table.load()
        document = next(d for d in documents if d["id"] == document_id)

        try:
            _update_job(job_id, status=JobStatus.RUNNING, stage=JobStage.EXTRACTING_TEXT, progress=5, message="Opening PDF")
            _update_document(document_id, status=DocumentStatus.PROCESSING)

            pages = await extract_pages_from_pdf(document["file_path"])
            detected_name = detect_course_name(document["title"], pages)
            _update_document(document_id, detected_course_name=detected_name, page_count=len(pages))
            _update_job(job_id, progress=25, message=f"Extracted {len(pages)} pages")

            _update_job(job_id, stage=JobStage.PARSING_QUESTIONS, progress=35, message="Parsing question structure")
            parsed_questions = await parse_questions_from_pages(
                pages=pages,
                source_pdf=document["original_filename"],
                source_document_id=document_id,
                course_id=document["course_id"],
                source_type=document["document_type"],
            )

            _update_job(job_id, stage=JobStage.ANALYZING_STYLE, progress=70, message="Aggregating style profile")
            style_source_questions = [
                q for q in parsed_questions if document["document_type"] in {DocumentType.PAST_EXAM.value, DocumentType.HOMEWORK.value}
            ]
            style_profile = await analyze_exam_style(style_source_questions or parsed_questions)

            _append_questions(parsed_questions)

            # Warn if no questions were parsed
            warning = ""
            if not parsed_questions:
                warning = " Warning: 0 questions were extracted. The document may not contain parseable questions."

            _update_document(document_id, status=DocumentStatus.COMPLETED)
            _update_job(job_id, stage=JobStage.INDEXING_MATERIALS, progress=85, message="Updating course profile")
            _aggregate_course_profile(document["course_id"])

            profiles = profiles_table.load()
            for profile in profiles:
                if profile["course_id"] == document["course_id"]:
                    profile.setdefault("document_profiles", []).append(
                        {
                            "document_id": document_id,
                            "document_type": document["document_type"],
                            "style_profile": style_profile,
                        }
                    )
                    break
            profiles_table.save(profiles)
            _update_job(
                job_id,
                status=JobStatus.COMPLETED,
                stage=JobStage.COMPLETED,
                progress=100,
                message=f"Completed: {len(parsed_questions)} questions parsed{warning}",
            )
        except Exception as exc:
            _update_document(document_id, status=DocumentStatus.FAILED)
            _update_job(
                job_id,
                status=JobStatus.FAILED,
                stage=JobStage.FAILED,
                progress=100,
                message="Processing failed",
                error=str(exc),
            )
        finally:
            active_tasks.pop(job_id, None)


def enqueue_document_job(course_id: str, document_id: str) -> dict:
    job = {
        "id": uuid.uuid4().hex[:10],
        "course_id": course_id,
        "document_id": document_id,
        "status": JobStatus.QUEUED,
        "stage": JobStage.UPLOADED,
        "progress": 0,
        "message": "Queued",
        "error": None,
        "created_at": _utcnow(),
        "updated_at": _utcnow(),
    }
    jobs_table.append(job)
    task = asyncio.create_task(process_document_job(job["id"]))
    active_tasks[job["id"]] = task
    return job


def get_course_profile(course_id: str) -> Optional[dict]:
    return next((p for p in profiles_table.load() if p["course_id"] == course_id), None)
