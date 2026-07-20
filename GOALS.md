# GOALS — Exam Cloner

## Status: competition build complete locally

## Progress

- [x] Resource-aware OpenAI-compatible provider routing with explicit fallback
- [x] HTTP discovery for Ollama, LM Studio, vLLM, and configured local services
- [x] Safe user endpoint validation, per-provider concurrency limits, circuit breaker, and bounded telemetry
- [x] Deterministic objective grading and question-bank reuse counters
- [x] Compute Center with real provider state, routes, latency, savings, and simulated failover drill
- [x] Browser-configurable endpoint/model/API key; model credentials sent only with model-backed requests
- [x] SSH/local read-only compute capability probe
- [x] Persistent lightweight Chinese/English UI switch for critical paths
- [x] Competition correctness audit: ownership, retry, limits, route precedence, exam submission, and export idempotency

- [x] Project structure created
- [x] GitHub repo initialized
- [x] Backend: FastAPI + all routers + services + models
- [x] Frontend: React + Vite + Tailwind v4 + Claude design system
- [x] Frontend: All 7 pages (Dashboard, Materials/Upload, QuestionBank, Practice, MockExam, Review, Settings)
- [x] Frontend: MathRenderer (KaTeX), Layout with sidebar
- [x] Add course workspaces
- [x] Add document types and async parsing jobs
- [x] Refactor UI to lighter Anthropic-inspired sidebar
- [x] Backend: uv sync + test imports
- [x] Frontend: npm run build (verify no errors)
- [x] End-to-end test: upload a PDF and verify parsing
- [x] LLM grading for non-MCQ questions (short answer, calculation, essay)
- [x] Parse error handling with retry
- [x] CORS fix
- [x] SM-2 logic fix (consecutive_correct tracking)
- [x] Background job concurrency limit (Semaphore)
- [x] Mock exam grading with per-question results
- [x] Global toast notification system
- [x] Docker: Dockerfile + docker-compose.yml
- [x] Deploy to Campus AI (HKUST(GZ) AI+ competition)

### v0.5 fixes

- [x] Product rename: Exam Cloning Agent → Exam Cloner
- [x] User isolation: X-User-Id header, user_id on all records, filtering on read
- [x] Error handling: HTTPException instead of `{"error": ...}`, SSE error before streaming
- [x] Grading response shape: structured {correct, feedback, missing_steps, wrong_concepts, suggestion}
- [x] PATCH /api/questions/{question_id} — update selected fields
- [x] POST /api/uploads/text — create document from raw text
- [x] POST /api/jobs/{job_id}/retry — re-enqueue failed job
- [x] POST /api/practice/next — topic filter, persist generated questions, get_due_concepts
- [x] POST /api/exam/generate — time_limit_minutes, HTTPException before streaming
- [x] POST /api/exam/submit — match by exam_id exactly
- [x] SM-2 adaptive engine: persisted ease_factor, Beta-prior score, get_due_concepts
- [x] Store safety: atomic writes, threading.Lock, mutate helper
- [x] Upload safety: sanitize stored_filename with os.path.basename
- [x] Ingestion: dedup document_profiles by document_id, retry_job, user_id stamps
- [x] LLM client: structured JSON grading prompt, exception logging
- [x] PDF parser: break on non-list JSON (don't retry)
- [x] Lifespan context manager (instead of deprecated on_event)
- [x] Docker port: 3000 throughout
- [x] Tests: adaptive_engine and grader unit tests
- [x] Docs: updated README, GOALS, deployment, design-decisions

### v0.5.1 exam overhaul

- [x] All question types graded by LLM (MCQ, true/false, short answer, calculation, essay) with deep feedback
- [x] Exam question ordering: by type section → difficulty progressive → topic scattered
- [x] Configurable type/difficulty distribution sliders in exam generation panel
- [x] Configurable bank/AI generation ratio (default 80/20)
- [x] Richer context for question generation: few-shot reference questions from bank
- [x] Exam auto-save: PATCH /api/exam/{id}/answers, periodic + on question switch
- [x] Elapsed time tracking instead of countdown (no forced submit)
- [x] Import wrong exam answers to practice history (POST /export-wrongs)
- [x] Single exam mode (no simulation/practice split), progress auto-saved
- [x] Question content rendered as body text, not title heading
- [x] Mobile-responsive sidebar (hamburger menu + slide-out drawer)

### v0.5.2 stability & platform fixes

- [x] Fixed nginx.conf port (8000→3000) for Docker deployment
- [x] Practice MCQ correct option highlight (index→letter comparison)
- [x] Mock exam resume: restore saved answers and elapsed time (was losing data)
- [x] Submit exam: add user_id ownership check (security gap)
- [x] Topic edit + recluster: add user_id checks (was cross-user)
- [x] LLM grading failure: return correct:None + grading_failed flag instead of silent "wrong"
- [x] Question generation failure: return None instead of persisting placeholder question
- [x] export_wrongs: optimize state load/save (was loading + saving per iteration)
- [x] Store load-modify-save atomicity: use mutate() in courses, documents, questions, topics routers
- [x] Mock exam: fix type label key (true-false→true_false)
- [x] Mock exam: add submit confirmation dialog
- [x] Mock exam: allow retry on submission failure (don't mark submitted=true early)
- [x] Practice: remove non-functional "Report" button
- [x] Mock exam: fix "answered" counter (empty strings no longer counted)
- [x] Mock exam: "Review" button on completed exams shows stored results (not retake)
- [x] Dashboard: radar chart minimum 3 concepts threshold
- [x] Review page: useNavigate instead of window.location for SPA navigation
- [x] Review: rename "Practice all wrong" → "Practice weak topics"
- [x] Add global 404 route
- [x] Upload polling error handling: consistent silent catch
- [x] Deployment: fix platform prefix handling (SPA fallback, API path rewrite middleware, base URL)
- [x] Deployment: mobile responsive layout
- [x] Docs: fix SSE→NDJSON, redact internal info, add operations playbook

## Design Decisions

- **LLM**: DeepSeek API with `deepseek-v4-flash`
- **PDF Parser**: pdfplumber for text extraction + LLM for structure parsing
- **Adaptive Algorithm**: SM-2 spaced repetition with persisted ease_factor, Beta prior, due-concept scheduling
- **Grading**: All question types (MCQ, true/false, short answer, calculation, essay) graded by LLM with structured deep feedback (missing_steps, wrong_concepts, suggestion)
- **Storage**: Local JSON files with atomic writes and thread-safe mutations
- **Design System**: Claude/Anthropic-inspired (warm ivory, editorial, flat geometry)
