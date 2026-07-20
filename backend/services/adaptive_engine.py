from datetime import datetime, timedelta, timezone
from typing import Optional

from models.student import StudentState, ConceptMastery


def sm2_schedule(
    quality: int, repetitions: int, ease_factor: float, interval: int
) -> tuple[int, float, int]:
    """
    Classic SM-2 spaced repetition algorithm.

    Args:
        quality: 0-5 rating (0=complete fail, 5=perfect recall)
        repetitions: number of consecutive correct reviews
        ease_factor: current ease factor (>= 1.3)
        interval: current interval in days

    Returns:
        (new_interval, new_ease_factor, new_repetitions)
    """
    if quality >= 3:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)
        new_repetitions = repetitions + 1
    else:
        new_interval = 1
        new_repetitions = 0

    new_ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ease_factor = max(1.3, new_ease_factor)

    return new_interval, new_ease_factor, new_repetitions


def answer_to_quality(correct: bool, confidence: int = 3) -> int:
    """Convert a correct/incorrect answer to SM-2 quality rating."""
    if correct:
        return 5
    else:
        return 2


def update_mastery(
    mastery: ConceptMastery, correct: bool, confidence: int = 3
) -> ConceptMastery:
    """Update concept mastery after an answer using SM-2 with persisted ease_factor."""
    quality = answer_to_quality(correct, confidence)

    # Compute interval: if no previous review, default to 1 day
    interval = 1
    if mastery.next_review and mastery.last_reviewed:
        interval = max(1, (mastery.next_review - mastery.last_reviewed).days)

    new_interval, new_ease, new_reps = sm2_schedule(
        quality,
        mastery.consecutive_correct,
        mastery.ease_factor,
        interval,
    )

    mastery.total_attempts += 1
    if correct:
        mastery.correct_attempts += 1
        mastery.consecutive_correct = new_reps
    else:
        mastery.consecutive_correct = 0

    # Beta prior: (correct + 1) / (total + 2) so a single wrong answer doesn't pin to 0
    mastery.score = (mastery.correct_attempts + 1) / (mastery.total_attempts + 2) if mastery.total_attempts > 0 else 0.5
    now = datetime.now(timezone.utc)
    mastery.last_reviewed = now
    mastery.next_review = now + timedelta(days=new_interval)
    mastery.stability = new_interval
    mastery.ease_factor = new_ease

    return mastery


def get_current_difficulty(state: StudentState) -> str:
    """Determine the next question difficulty based on recent accuracy."""
    if len(state.recent_accuracy) < 3:
        return "medium"

    recent = state.recent_accuracy[-10:]
    accuracy = sum(recent) / len(recent)

    if accuracy > 0.8:
        return "hard"
    elif accuracy > 0.5:
        return "medium"
    else:
        return "easy"


def get_weakest_concepts(state: StudentState, n: int = 3) -> list[str]:
    """Get the N weakest concepts based on mastery score."""
    if not state.concept_mastery:
        return []
    sorted_concepts = sorted(
        state.concept_mastery.items(), key=lambda x: x[1].score
    )
    return [name for name, _ in sorted_concepts[:n]]


def get_due_concepts(state: StudentState, now: Optional[datetime] = None) -> list[str]:
    """Get concepts whose next_review is None or <= now, sorted by most overdue."""
    if now is None:
        now = datetime.now(timezone.utc)
    due = []
    for name, mastery in state.concept_mastery.items():
        if mastery.next_review is None or mastery.next_review <= now:
            due.append(name)
    # Sort by most overdue (earliest next_review first)
    due.sort(key=lambda n: state.concept_mastery[n].next_review or datetime.min.replace(tzinfo=timezone.utc))
    return due


def record_answer(state: StudentState, concept: str, correct: bool, confidence: int = 3) -> StudentState:
    """Record an answer and update student state."""
    # Update recent accuracy (keep last 20)
    state.recent_accuracy.append(correct)
    if len(state.recent_accuracy) > 20:
        state.recent_accuracy = state.recent_accuracy[-20:]

    # Update totals
    state.total_questions_attempted += 1
    if correct:
        state.total_correct += 1

    # Update concept mastery
    if concept not in state.concept_mastery:
        state.concept_mastery[concept] = ConceptMastery(concept=concept)
    state.concept_mastery[concept] = update_mastery(state.concept_mastery[concept], correct, confidence)

    return state
