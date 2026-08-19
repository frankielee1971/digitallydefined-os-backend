"""
Idea validation service for POST /validation/check.

Placeholder implementation: returns a deterministic, structured validation
verdict so the endpoint can be wired into Hermes.
"""

from __future__ import annotations

from utils.models import ValidationCheckResponse


def check_validation(request) -> ValidationCheckResponse:
    """Validate an idea and return a recommendation."""
    idea = request.idea.strip() or "your idea"

    # Deterministic placeholder confidence (0-100).
    confidence = min(100, 45 + (len(idea) % 45))

    return ValidationCheckResponse(
        idea=idea,
        verdict=(
            "Worth validating"
            if confidence >= 50
            else "Needs more evidence before building"
        ),
        confidence=confidence,
        risks=[
            "Broad positioning may be hard to defend without a niche angle",
            "No evidence of existing demand supplied",
        ],
        tests=[
            "Interview 5 people in your target audience",
            "Pre-sell with a landing page before building",
            "Publish one piece of content and measure engagement",
        ],
        recommendation=(
            "Validate demand before investing heavily. Run a light test "
            "and gather real audience signal first."
        ),
    )