# Exam Cloner

Resource-aware AI exam preparation tool: upload course materials, clone exam style,
and generate adaptive practice while routing work across deterministic rules,
question-bank reuse, and compatible model services.

## Features

- **Course workspaces** — Organize materials by course instead of mixing all uploads together
- **Async ingestion jobs** — Upload first, parse in the background, track progress in the UI
- **Typed materials** — Distinguish `past_exam`, `homework`, `slides`, and `reference_pdf`
- **Exam style cloning** — Build a style profile mainly from exams and homework
- **Adaptive practice** — Questions adjust difficulty based on your performance (SM-2 algorithm)
- **LLM grading** — All question types (MCQ, true/false, short answer, calculation, essay) graded by LLM with deep feedback, step-by-step reasoning
- **Mock exam** — Generate full mock exams that match the course profile, with auto-save, elapsed time tracking, and configurable type/difficulty distribution
- **Knowledge tracking** — Concept-level mastery tracking with spaced repetition scheduling
- **Resource-aware routing** — Use a user-selected public OpenAI-compatible endpoint, administrator-managed local services, or the built-in provider with explicit fallback
- **Compute Center** — Inspect detected providers, real latency/success telemetry, saved model calls, circuit state, and a labeled failover drill
- **Bilingual shell** — Persistent Chinese/English navigation and critical controls; original course and question content is preserved

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS v4 |
| Backend | Python FastAPI + uv |
| LLM | OpenAI-compatible provider router (DeepSeek / Ollama / LM Studio / vLLM and compatible services) |
| PDF Parsing | pdfplumber + LLM |
| Spaced Repetition | SM-2 algorithm |
| Design | Claude/Anthropic-inspired (warm ivory, editorial) |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- A model API key or compatible local service is optional; demo, question-bank practice, and objective grading can run without one

### Backend

```bash
cp .env.example .env
# optionally set the built-in provider and/or MODEL_LOCAL_ENDPOINTS

cd backend
uv sync
uv run python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Docker

```bash
docker-compose up --build
```

### Production Build (for platform deployment)

When deploying behind a reverse proxy with a sub-path (e.g. `/apps/exam-clone/`):

```bash
cd frontend
VITE_BASE=/apps/exam-clone/ npm run build

# The backend serves the frontend build when run with:
cd backend
FRONTEND_DIST=../frontend/dist uv run python main.py
```

## Demo Flow

0. **Load demo course** — Seed the app with a sample AIAA 2711 Math for AI course
1. **Create a course** — Enter a course name (e.g., "AIAA 2711 Math for AI")
2. **Upload materials** — Upload past exams, homework, slides, or reference PDFs. Choose document type.
3. **Wait for parsing** — Background jobs parse questions asynchronously. Progress shown in UI.
4. **Review questions** — Browse parsed questions by topic, difficulty, or source type.
5. **Practice** — Start adaptive practice. Questions adjust to your mastery level. LLM grades free-form answers.
6. **Mock exam** — Generate a mock exam matching the exam style, with auto-save and elapsed time tracking. Adjust type/difficulty distribution and bank/AI ratio before generating.
7. **Review & import wrongs** — Review graded exam results, then import wrong answers to Practice for targeted redo.
8. **Show resource evidence** — Open Compute Center, answer an objective question, inspect saved calls, and run the explicitly simulated failover drill.

## Pages

- **Dashboard** — Overview of courses, recent activity, and learning stats
- **Materials / Upload** — Upload and manage course documents
- **Question Bank** — Browse, filter, and edit parsed questions
- **Practice** — Adaptive practice with SM-2 spaced repetition
- **Mock Exam** — Generate and take full mock exams with configurable type/difficulty distribution, auto-save, and elapsed time tracking
- **Review** — Review practice history, wrong answers, and topic mastery
- **Compute** — Provider health, routing evidence, resource savings, and failover drill
- **Settings** — Configure a browser-local OpenAI-compatible endpoint, model, key, and fallback preference

## Compute integration

User-configured endpoints must be public HTTP(S) URLs and are checked against
server-side request-forgery targets. Their credentials remain in browser
storage and are attached only to generation/grading requests. Administrators
can configure trusted private or localhost services with
`MODEL_LOCAL_ENDPOINTS`; local Ollama, LM Studio, and vLLM ports are also
auto-discovered by default. See [docs/compute-api.md](docs/compute-api.md).

For a truthful local or SSH capability report (CPU/cgroup limits, visible GPUs,
and known inference ports):

```bash
python scripts/probe_compute_node.py
python scripts/probe_compute_node.py --ssh user@example-host
```

## Project Structure

```
exam-cloner/
├── frontend/             # React + Vite frontend
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── pages/        # Dashboard, Upload, QuestionBank, Practice, MockExam
│       ├── hooks/        # Shared React hooks
│       └── lib/          # API client, utilities
├── backend/              # FastAPI backend
│   ├── routers/          # API endpoints
│   ├── services/         # Business logic (PDF parser, LLM, adaptive engine)
│   ├── models/           # Pydantic data models
│   ├── data/             # Local JSON storage
│   └── uploads/          # Uploaded PDF files
└── docs/                 # Design decisions, deployment guide
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/uploads` | Upload a course document and queue background parsing |
| POST | `/api/uploads/text` | Create a document from raw text and queue parsing |
| GET | `/api/courses` | List course workspaces |
| POST | `/api/courses` | Create a course |
| PATCH | `/api/courses/{id}` | Update a course |
| GET | `/api/courses/{id}` | Get a course |
| GET | `/api/documents` | List course documents |
| PATCH | `/api/documents/{id}` | Update a document |
| GET | `/api/jobs` | Poll background parsing jobs |
| GET | `/api/jobs/{id}` | Get a job |
| POST | `/api/jobs/{id}/retry` | Re-enqueue a failed job |
| GET | `/api/questions` | List course questions (with filters) |
| GET | `/api/questions/{id}` | Get a question |
| PATCH | `/api/questions/{id}` | Update selected fields of a question |
| DELETE | `/api/questions/{id}` | Delete a question |
| GET | `/api/questions/topics/list` | List unique topics for a course |
| POST | `/api/practice/next` | Get next adaptive question for a course |
| POST | `/api/practice/answer` | Submit answer (LLM-graded for all question types) |
| POST | `/api/exam/generate` | Generate mock exam (NDJSON stream) — supports bank_ratio, time_limit, type/difficulty overrides |
| GET | `/api/exam` | List exams for a course |
| GET | `/api/exam/{id}` | Get an exam with questions |
| PATCH | `/api/exam/{id}/answers` | Auto-save in-progress answers and elapsed time |
| POST | `/api/exam/{id}/export-wrongs` | Import wrong exam answers into practice history |
| DELETE | `/api/exam/{id}` | Delete an exam |
| POST | `/api/exam/submit` | Submit exam answers for grading — takes exam_id, elapsed_seconds |
| GET | `/api/exam/styles` | Get course style profile |
| GET | `/api/stats` | Learning statistics |
| GET | `/api/review/wrong` | Wrong answers from practice |
| GET | `/api/review/history` | Full practice history |
| GET | `/api/review/stats` | Aggregated practice stats |
| POST | `/api/topics/{course_id}/recluster` | Recluster topics via LLM |
| PATCH | `/api/topics/question/{question_id}` | Edit a question's topic |
| POST | `/api/demo/seed` | Load demo course data |
| GET | `/api/demo/status` | Check if demo seed data exists |
| GET | `/api/compute/status` | Observed provider and routing status |
| POST | `/api/compute/probe` | Probe a user-configured public model endpoint |
| POST | `/api/compute/failover-drill` | Run a labeled, no-cost simulated failover |
| GET | `/api/health` | Health check |

## License

MIT
