import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import upload, questions, practice, exam, stats

app = FastAPI(
    title="Exam Cloning Agent",
    description="AI-powered exam cloning: upload past exams, generate style-matched practice questions.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(questions.router)
app.include_router(practice.router)
app.include_router(exam.router)
app.include_router(stats.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
