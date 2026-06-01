# GOALS — Exam Cloning Agent

## Status: v0.3 bug fixes + polish complete

## Progress

- [x] Project structure created
- [x] GitHub repo initialized
- [x] Backend: FastAPI + all routers + services + models
- [x] Frontend: React + Vite + Tailwind v4 + Claude design system
- [x] Frontend: All 5 pages (Dashboard, Upload, QuestionBank, Practice, MockExam)
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
- [ ] Docker: Dockerfile + docker-compose.yml
- [ ] Deploy to GPUnion

## Design Decisions

- **LLM**: DeepSeek API with `deepseek-v4-flash`
- **PDF Parser**: pdfplumber for text extraction + LLM for structure parsing
- **Adaptive Algorithm**: SM-2 spaced repetition with consecutive correct tracking
- **Grading**: MCQ/TF by string match, free-form by LLM
- **Storage**: Local JSON files (no database dependency for MVP)
- **Design System**: Claude/Anthropic-inspired (warm ivory, editorial, flat geometry)
