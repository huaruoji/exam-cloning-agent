# GOALS — Exam Cloning Agent

## Status: v0.2 course-workspace refactor complete

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
- [ ] Docker: Dockerfile + docker-compose.yml
- [ ] End-to-end test: upload a PDF and verify parsing
- [ ] Polish: error handling, loading states, edge cases
- [ ] Deploy to GPUnion

## Design Decisions

- **LLM**: DeepSeek API with `deepseek-v4-flash`
- **PDF Parser**: pdfplumber for text extraction + LLM for structure parsing
- **Adaptive Algorithm**: SM-2 spaced repetition (simple, proven)
- **Storage**: Local JSON files (no database dependency for MVP)
- **Design System**: Claude/Anthropic-inspired (warm ivory, editorial, flat geometry)
