# Exam Cloner

AI-powered exam preparation tool: upload past exam PDFs, analyze exam style, and generate adaptive practice questions with spaced repetition.

## Features

- **Course workspaces** — Organize materials by course instead of mixing all uploads together
- **Async ingestion jobs** — Upload first, parse in the background, track progress in the UI
- **Typed materials** — Distinguish `past_exam`, `homework`, `slides`, and `reference_pdf`
- **Exam style cloning** — Build a style profile mainly from exams and homework
- **Adaptive practice** — Questions adjust difficulty based on your performance (SM-2 algorithm)
- **LLM grading** — All question types (MCQ, true/false, short answer, calculation, essay) graded by LLM with deep feedback, step-by-step reasoning
- **Mock exam** — Generate full mock exams that match the course profile, with auto-save, elapsed time tracking, and configurable type/difficulty distribution
- **Knowledge tracking** — Concept-level mastery tracking with spaced repetition scheduling

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS v4 |
| Backend | Python FastAPI + uv |
| LLM | DeepSeek API (deepseek-v4-flash) |
| PDF Parsing | pdfplumber + LLM |
| Spaced Repetition | SM-2 algorithm |
| Design | Claude/Anthropic-inspired (warm ivory, editorial) |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- DeepSeek API key

### Backend

```bash
cp .env.example .env
# edit .env and set DEEPSEEK_API_KEY / DEEPSEEK_MODEL

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

## Pages

- **Dashboard** — Overview of courses, recent activity, and learning stats
- **Materials / Upload** — Upload and manage course documents
- **Question Bank** — Browse, filter, and edit parsed questions
- **Practice** — Adaptive practice with SM-2 spaced repetition
- **Mock Exam** — Generate and take full mock exams with configurable type/difficulty distribution, auto-save, and elapsed time tracking
- **Review** — Review practice history, wrong answers, and topic mastery
- **Settings** — Configure API key and other preferences

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
| GET | `/api/health` | Health check |

## License

MIT
