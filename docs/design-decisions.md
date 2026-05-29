# Design Decisions

## 1. PDF parsing: `pdfplumber` + LLM post-processing

- **Chosen**: extract plain text with `pdfplumber`, then ask the LLM to structure questions.
- **Why**: lowest implementation complexity for MVP, good enough for text-based exam PDFs.
- **Tradeoff**: scanned PDFs and complex layouts may need OCR or multimodal parsing later.

## 2. Storage: local JSON files

- **Chosen**: store questions, style profiles, and student state in `backend/data/*.json`.
- **Why**: no database setup, easy to inspect and debug during the competition.
- **Tradeoff**: not suitable for multi-user production deployment.

## 3. Adaptive engine: simple SM-2-style scheduling

- **Chosen**: lightweight mastery tracking + recent-accuracy difficulty routing.
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
