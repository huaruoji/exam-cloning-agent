from fastapi import APIRouter, Depends, HTTPException, Query

from routers.deps import get_user_id
from services.ingestion import retry_job
from services.store import jobs_table

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _public_job(job: dict) -> dict:
    """Do not echo persisted raw text sources in job polling responses."""
    return {key: value for key, value in job.items() if key != "source_text"}


@router.get("")
async def list_jobs(course_id: str | None = Query(default=None), user_id: str = Depends(get_user_id)):
    jobs = jobs_table.load()
    if course_id:
        jobs = [job for job in jobs if job["course_id"] == course_id]
    jobs = [
        j for j in jobs
        if j.get("user_id", "public") in (user_id, "public")
    ]
    jobs.sort(key=lambda item: item["created_at"], reverse=True)
    return {"jobs": [_public_job(job) for job in jobs]}


@router.get("/{job_id}")
async def get_job(job_id: str, user_id: str = Depends(get_user_id)):
    job = next((item for item in jobs_table.load() if item["id"] == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("user_id", "public") not in (user_id, "public"):
        raise HTTPException(status_code=404, detail="Job not found")
    return _public_job(job)


@router.post("/{job_id}/retry")
async def retry_job_endpoint(job_id: str, user_id: str = Depends(get_user_id)):
    """Re-enqueue a FAILED job as a new job."""
    new_job = retry_job(job_id, user_id)
    if not new_job:
        raise HTTPException(status_code=404, detail="Job not found or not in FAILED status")
    return _public_job(new_job)
