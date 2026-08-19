"""
Roadmap generation service for POST /roadmap/generate.

Placeholder implementation: returns a deterministic, valid JSON roadmap so the
endpoint can be wired into Hermes. Swap the internals for the real
roadmap-generator agent later.
"""

from __future__ import annotations

from utils.models import RoadmapGenerateResponse, RoadmapStep


def generate_roadmap(request) -> RoadmapGenerateResponse:
    """Generate a step-by-step roadmap for a niche."""
    niche = request.niche.strip() or "your niche"
    weeks = request.timeframe_weeks

    steps = []
    for week in range(1, weeks + 1):
        steps.append(
            RoadmapStep(
                week=week,
                title=f"Week {week}: foundational build block",
                description=f"Focus on one asset or action for '{niche}'."
                if week == 1
                else f"Advance '{niche}' by shipping the next asset / test.",
                estimated_time="2-3 hours",
                tools=["Notion", "Canva", "Buffer"],
                next_action="Ship the build block for this week.",
            )
        )

    return RoadmapGenerateResponse(
        niche=niche,
        title=f"DigitallyDefined faceless roadmap — {niche}",
        total_weeks=weeks,
        steps=steps,
        summary=(
            f"A {weeks}-week faceless roadmap for '{niche}'. "
            f"Build one asset or run one test per week, staying consistent "
            "and tracking progress."
        ),
    )