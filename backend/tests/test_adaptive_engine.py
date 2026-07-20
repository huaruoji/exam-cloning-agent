"""Unit tests for the adaptive engine (no LLM, no network)."""

from datetime import datetime, timedelta, timezone

from models.student import StudentState, ConceptMastery
from services.adaptive_engine import (
    sm2_schedule,
    answer_to_quality,
    update_mastery,
    get_current_difficulty,
    get_weakest_concepts,
    get_due_concepts,
    record_answer,
)


def test_sm2_schedule_correct_interval_grows():
    """Correct answers should increase the interval."""
    i1, ef1, r1 = sm2_schedule(5, 0, 2.5, 0)
    assert i1 == 1  # first correct -> interval 1
    assert r1 == 1  # reps = 1

    i2, ef2, r2 = sm2_schedule(5, 1, ef1, i1)
    assert i2 == 6  # second correct -> interval 6
    assert r2 == 2

    i3, ef3, r3 = sm2_schedule(5, 2, ef2, i2)
    assert i3 == round(6 * ef2)  # interval * ease
    assert r3 == 3


def test_sm2_schedule_incorrect_resets():
    """Incorrect answers should reset interval and repetitions."""
    i, ef, r = sm2_schedule(0, 3, 2.5, 10)
    assert i == 1
    assert r == 0


def test_sm2_schedule_ease_clamps_at_1_3():
    """Ease factor should never go below 1.3."""
    # Repeated very poor quality can drive ease down
    _, ef, _ = sm2_schedule(0, 0, 1.4, 0)
    assert ef >= 1.3

    # Starting from 1.3, it shouldn't go lower
    _, ef2, _ = sm2_schedule(0, 0, 1.3, 0)
    assert ef2 == 1.3


def test_answer_to_quality_correct():
    """Correct answer should return 5 regardless of confidence."""
    assert answer_to_quality(True) == 5
    assert answer_to_quality(True, confidence=1) == 5
    assert answer_to_quality(True, confidence=5) == 5


def test_answer_to_quality_incorrect():
    """Incorrect answer should return 2."""
    assert answer_to_quality(False) == 2
    assert answer_to_quality(False, confidence=1) == 2
    assert answer_to_quality(False, confidence=5) == 2


def test_update_mastery_persists_ease_factor():
    """update_mastery should store ease_factor back on the mastery."""
    mastery = ConceptMastery(concept="test", ease_factor=2.5)
    updated = update_mastery(mastery, correct=True, confidence=3)
    assert updated.ease_factor >= 1.3
    assert updated.ease_factor > 2.5 or abs(updated.ease_factor - 2.5) < 0.1  # should increase slightly for quality 5


def test_update_mastery_score_beta_prior():
    """Beta prior should keep score > 0 even after one wrong answer."""
    mastery = ConceptMastery(concept="test")
    # One wrong
    mastery = update_mastery(mastery, correct=False)
    # Beta prior: correct=0, total=1 -> (0+1)/(1+2) = 1/3
    assert mastery.score > 0
    assert mastery.score == 1/3

    # One correct after that
    mastery = update_mastery(mastery, correct=True)
    # Beta prior: correct=1, total=2 -> (1+1)/(2+2) = 2/4 = 0.5
    assert mastery.score == 0.5


def test_get_current_difficulty():
    """Test difficulty routing based on recent accuracy."""
    state = StudentState()
    assert get_current_difficulty(state) == "medium"

    # High accuracy -> hard
    state.recent_accuracy = [True] * 10
    assert get_current_difficulty(state) == "hard"

    # Low accuracy -> easy
    state.recent_accuracy = [False] * 10
    assert get_current_difficulty(state) == "easy"


def test_get_weakest_concepts():
    """Should return concepts sorted by score ascending."""
    state = StudentState()
    state.concept_mastery["a"] = ConceptMastery(concept="a", score=0.3)
    state.concept_mastery["b"] = ConceptMastery(concept="b", score=0.9)
    state.concept_mastery["c"] = ConceptMastery(concept="c", score=0.1)
    weakest = get_weakest_concepts(state, n=2)
    assert weakest == ["c", "a"]


def test_get_due_concepts():
    """Should return concepts past their review date, sorted by most overdue."""
    now = datetime.now(timezone.utc)
    state = StudentState()
    state.concept_mastery["due_soon"] = ConceptMastery(
        concept="due_soon",
        next_review=now - timedelta(hours=1),
    )
    state.concept_mastery["not_due"] = ConceptMastery(
        concept="not_due",
        next_review=now + timedelta(days=1),
    )
    state.concept_mastery["never_reviewed"] = ConceptMastery(
        concept="never_reviewed",
        next_review=None,
    )
    due = get_due_concepts(state, now=now)
    assert "due_soon" in due
    assert "not_due" not in due
    assert "never_reviewed" in due


def test_get_due_concepts_no_concepts():
    """Empty mastery should return empty list."""
    state = StudentState()
    assert get_due_concepts(state) == []


def test_record_answer_creates_mastery():
    """record_answer should create ConceptMastery for new concepts."""
    state = StudentState()
    state = record_answer(state, "new_concept", True, confidence=3)
    assert "new_concept" in state.concept_mastery
    assert state.total_questions_attempted == 1
    assert state.total_correct == 1


def test_record_answer_increments_totals():
    """record_answer should track total questions and correct counts."""
    state = StudentState()
    state = record_answer(state, "concept", True, confidence=3)
    assert state.total_questions_attempted == 1
    assert state.total_correct == 1

    state = record_answer(state, "concept", False, confidence=3)
    assert state.total_questions_attempted == 2
    assert state.total_correct == 1
