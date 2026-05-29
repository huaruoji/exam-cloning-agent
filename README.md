# Exam Cloning Agent

AI-powered exam preparation tool: upload past exam PDFs, analyze exam style, and generate adaptive practice questions with spaced repetition.

## Features

- **Course workspaces** — Organize materials by course instead of mixing all uploads together
- **Async ingestion jobs** — Upload first, parse in the background, track progress in the UI
- **Typed materials** — Distinguish `past_exam`, `homework`, `slides`, and `reference_pdf`
- **Exam style cloning** — Build a style profile mainly from exams and homework
- **Adaptive practice** — Questions adjust difficulty based on your performance (SM-2 algorithm)
- **Mock exam** — Generate full mock exams that match the course profile
- **Knowledge tracking** — Concept-level mastery tracking with spaced repetition scheduling

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS v4 |
| Backend | Python FastAPI + uv |
| LLM | DeepSeek API |
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

## Project Structure

```
exam-cloning-agent/
├── frontend/           # React + Vite frontend
│   └── src/
│       ├── components/ # Reusable UI components
│       ├── pages/      # Dashboard, Upload, Questions, Practice, Exam
│       └── lib/        # API client, utilities
├── backend/            # FastAPI backend
│   ├── routers/        # API endpoints
│   ├── services/       # Business logic (PDF parser, LLM, adaptive engine)
│   ├── models/         # Pydantic data models
│   └── data/           # Local JSON storage
└── docs/               # Design decisions
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload PDF, parse questions |
| POST | `/api/uploads` | Upload a course document and queue background parsing |
| GET | `/api/courses` | List course workspaces |
| GET | `/api/documents` | List course documents |
| GET | `/api/jobs` | Poll background parsing jobs |
| GET | `/api/questions` | List course questions (with filters) |
| POST | `/api/practice/next` | Get next adaptive question for a course |
| POST | `/api/practice/answer` | Submit answer, update mastery |
| POST | `/api/exam/generate` | Generate mock exam |
| GET | `/api/stats` | Learning statistics |

## License

MIT
