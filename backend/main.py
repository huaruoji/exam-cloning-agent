import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from config import FRONTEND_DIST
from routers import (
    courses,
    demo,
    documents,
    exam,
    jobs,
    practice,
    questions,
    review,
    stats,
    topics,
    upload,
)
from services.ingestion import recover_stuck_jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    recover_stuck_jobs()
    yield


app = FastAPI(
    title="Exam Cloner",
    description="AI-powered exam preparation: upload past exams, generate style-matched practice questions.",
    version="0.5.2",
    lifespan=lifespan,
)

# CORS: read ALLOWED_ORIGINS from env (comma-separated), default * for dev
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*")
origins = [o.strip() for o in allowed_origins.split(",") if o.strip()] if allowed_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# The platform reverse-proxy forwards the full prefixed path, so
# /apps/exam-clone/api/... arrives as-is. Rewrite to /api/... so
# our API routes match.
@app.middleware("http")
async def rewrite_api_prefix(request: Request, call_next):
    path = request.url.path
    if path.startswith("/apps/exam-clone/api/"):
        request.scope["path"] = "/api/" + path[len("/apps/exam-clone/api/"):]
        request.scope["raw_path"] = request.scope["path"].encode()
    return await call_next(request)

app.include_router(upload.router)
app.include_router(courses.router)
app.include_router(documents.router)
app.include_router(jobs.router)
app.include_router(questions.router)
app.include_router(practice.router)
app.include_router(exam.router)
app.include_router(review.router)
app.include_router(stats.router)
app.include_router(topics.router)
app.include_router(demo.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# The platform reverse-proxy requests /apps/exam-clone (no trailing slash).
# StaticFiles doesn't auto-redirect directory requests without a slash,
# so handle it explicitly before the mounts.
@app.get("/apps/exam-clone")
async def redirect_to_slash(request: Request):
    return RedirectResponse(url="/apps/exam-clone/", status_code=307)


# Serve the frontend build as static files in single-process deployment.
# The platform requires the app to listen on port 3000 and serve everything
# from one process (no Docker / no separate nginx).
# The platform reverse-proxy forwards the full prefixed path without stripping,
# so we mount at both /apps/exam-clone (for static assets + SPA) and
# / (for the path-rewritten API routes and direct access).
_dist = Path(FRONTEND_DIST)
_index_html = _dist / "index.html" if _dist.exists() else None

if _dist.exists():
    app.mount("/apps/exam-clone", StaticFiles(directory=str(_dist), html=True), name="frontend-prefixed")
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
    # Note: API routes are declared before these mounts, so /api/* still wins.


# SPA fallback: any non-API, non-static path should return index.html so
# React Router can handle client-side routes like /settings, /practice, etc.
# StaticFiles returns 404 for these paths because there's no matching file.
# This catch-all runs AFTER the mounts, so it only handles 404s that fell through.
@app.exception_handler(404)
async def spa_fallback(request: Request, exc):
    path = request.url.path
    # Only serve index.html for non-API, non-asset GET requests.
    # Match API paths both with and without the /apps/exam-clone prefix.
    if "/api/" in path or path.endswith("/api"):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    # Don't intercept asset requests (they have file extensions) — let them 404.
    if "." in path.rsplit("/", 1)[-1]:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    if _index_html and _index_html.exists():
        return FileResponse(str(_index_html))
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=404, content={"detail": "Not found"})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "3000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
