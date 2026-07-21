# Design Decisions

## 1. PDF parsing: `pdfplumber` + LLM post-processing

- **Chosen**: extract plain text with `pdfplumber`, then ask the LLM to structure questions.
- **Why**: lowest implementation complexity for MVP, good enough for text-based exam PDFs.
- **Tradeoff**: scanned PDFs and complex layouts may need OCR or multimodal parsing later.

## 2. Storage: local JSON files

- **Chosen**: store questions, style profiles, and student state in `backend/data/*.json`.
- **Why**: no database setup, easy to inspect and debug during the competition.
- **How**: atomic writes (write to `.tmp` then `os.replace`), thread-safe mutations via `threading.Lock` and a `mutate()` helper.
- **Tradeoff**: not suitable for multi-user production deployment.

## 3. Adaptive engine: SM-2 with persisted ease + Beta prior + due-concept scheduling

- **Chosen**: lightweight mastery tracking with SM-2 spaced repetition, persisted `ease_factor`, Beta prior for cold-start scoring, and `get_due_concepts` for scheduling review.
- **Why**: reliable, explainable, and fast to ship.
- **Tradeoff**: less sophisticated than full BKT / IRT / FSRS-based learner modeling.

## 4. Frontend design: Claude / Anthropic-inspired editorial UI

- **Chosen**: warm ivory background, dark ink text, sparse coral accent, flat cards.
- **Why**: calmer and more distinctive than generic blue SaaS dashboards; fits a reading-heavy study tool.
- **Tradeoff**: stronger visual identity, but requires discipline to keep colors and spacing restrained.

## 5. Python dependency management: `uv`

- **Chosen**: manage backend dependencies with `uv` and `pyproject.toml`.
- **Why**: faster installs, simpler local setup, modern workflow.
- **Tradeoff**: slightly different from the more common `pip install -r requirements.txt` flow.

## 6. Mock exam design

- **Single mode**: no simulation/practice split. All exams auto-save progress and track elapsed time for reference (no forced submission).
- **Question ordering**: specifications are sorted by (type section → difficulty → random salt) before generation. MCQ → True/False → Short Answer → Calculation → Essay, each section Easy→Hard.
- **Distribution**: type and difficulty distributions start from the course profile's parse-time histogram, but users can adjust them via slider controls. Bank/AI generation ratio defaults to 80/20, also configurable.
- **Grading**: all question types (MCQ, true/false, short answer, calculation, essay) routed through LLM with a structured prompt that includes options (for MCQ), reference explanation, and instructions to produce deep diagnostic feedback.
- **Generation context**: when generating questions, up to 3 matching bank questions are included as few-shot examples in the prompt so the output mimics the course's real exam style.
- **Duration**: elapsed time tracked via periodic PATCH calls during the session, recorded on submission.
- **Wrong-answer import**: completed exam results can be one-click imported into practice history, making wrong exam questions reviewable and redoable in the adaptive practice flow.

## 7. Model routing and resource awareness

- **Chosen**: route objective grading to deterministic rules, reuse stored
  question-bank items, then try a selected compatible model endpoint with
  explicit fallback to trusted local or built-in providers.
- **Why**: the competition environment has variable resource availability;
  useful behavior must continue when no GPU or local model is available.
- **Security**: browser-supplied endpoints are restricted to public HTTP(S)
  destinations. Private and loopback services are administrator-managed by
  environment configuration. API keys are request-scoped and excluded from
  telemetry.
- **Tradeoff**: the demo telemetry is process-local and resets on restart;
  durable metrics require a later database/retention design.

## 8. Interface language

- **Chosen**: a small persistent Chinese/English catalog for navigation,
  settings,算力中心, critical actions, empty states, and status messages.
- **Tradeoff**: uploaded course/question content is not mechanically translated;
  browser translation remains a practical option for long source material.
