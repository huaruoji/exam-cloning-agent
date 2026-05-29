from fastapi import APIRouter, HTTPException, Query

from services.store import jobs_table

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
async def list_jobs(course_id: str | None = Query(default=None)):
    jobs = jobs_table.load()
    if course_id:
        jobs = [job for job in jobs if job["course_id"] == course_id]
    jobs.sort(key=lambda item: item["created_at"], reverse=True)
    return {"jobs": jobs}


@router.get("/{job_id}")
async def get_job(job_id: str):
    job = next((item for item in jobs_table.load() if item["id"] == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
