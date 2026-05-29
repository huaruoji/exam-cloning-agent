from datetime import datetime, timedelta
from models.student import StudentState, ConceptMastery


def sm2_schedule(
    quality: int, repetitions: int, ease_factor: float, interval: int
) -> tuple[int, float, int]:
    """
    SM-2 spaced repetition algorithm.

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
        return min(5, confidence)  # 3-5 depending on confidence
    else:
        return max(0, confidence - 3)  # 0-2


def update_mastery(
    mastery: ConceptMastery, correct: bool, confidence: int = 3
) -> ConceptMastery:
    """Update concept mastery after an answer."""
    quality = answer_to_quality(correct, confidence)

    new_interval, new_ease, new_reps = sm2_schedule(
        quality,
        mastery.total_attempts - mastery.correct_attempts if not correct else mastery.correct_attempts,
        mastery.difficulty / 10.0 * 2 + 1.3,  # map difficulty to ease
        max(1, (mastery.next_review - mastery.last_reviewed).days) if mastery.next_review and mastery.last_reviewed else 1,
    )

    mastery.total_attempts += 1
    if correct:
        mastery.correct_attempts += 1
    mastery.score = mastery.correct_attempts / mastery.total_attempts if mastery.total_attempts > 0 else 0.5
    mastery.last_reviewed = datetime.now()
    mastery.next_review = datetime.now() + timedelta(days=new_interval)
    mastery.stability = new_interval
    mastery.difficulty = max(1, min(10, (new_ease - 1.3) / 0.7 * 10))

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


def record_answer(state: StudentState, concept: str, correct: bool) -> StudentState:
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
    state.concept_mastery[concept] = update_mastery(state.concept_mastery[concept], correct)

    return state
