"""
Niche scoring service for POST /niche/score.

Placeholder implementation: returns a deterministic, valid JSON response so
the endpoint can be wired into Hermes. Swap the internals for the real
niche-analysis agent (see src/lib/agents/nichePrompt.js) later.
"""

from __future__ import annotations

from utils.models import NicheScoreResponse


def score_niche(request) -> NicheScoreResponse:
    """Score a niche and return a valid, structured result."""
    topic = request.topic.strip() or "untitled niche"
    keywords = request.keywords or [topic.lower(), f"best {topic.lower()} tools"]

    # Deterministic placeholder scoring (0-100).
    demand_score = min(100, 40 + (len(topic) % 40))
    competition_score = min(100, 55 + (len(topic) % 30))

    # Seed keyword amplification.
    demand_score = min(100, demand_score + len(keywords) * 2)
    competition_score = min(100, competition_score + len(keywords))

    return NicheScoreResponse(
        niche=topic,
        keywords=keywords,
        demand_score=demand_score,
        competition_score=competition_score,
        niche_opportunities=[
            f"Underserved angle: {topic} for beginners",
            f"B2B variant of {topic}",
            f"Local / community edition of {topic}",
        ],
        risk_factors=[
            f"Signals of saturation in broad '{topic}' content",
            "Platform volatility if you rely on a single channel",
        ],
        validation_steps=[
            "Run a 3-day content test on one platform",
            "Check search intent with AnswerThePublic",
            "Validate demand with a micro lead-magnet",
        ],
        recommendation=(
            f"'{topic}' shows potential but needs validation. "
            f"Demand is moderate ({demand_score}/100) and competition is notable "
            f"({competition_score}/100). Start with the validation steps above."
        ),
    )