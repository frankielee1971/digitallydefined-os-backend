"""
Pydantic request/response models for the DigitallyDefined FastAPI backend.

These models provide typed JSON validation for every endpoint. Field names
follow the existing DigitallyDefined domain shapes (see the JS agents:
nichePrompt.js, roadmapAgent, etc.) so Hermes and the frontend can share
consistent payloads.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Niche endpoints
# ---------------------------------------------------------------------------
class NicheScoreRequest(BaseModel):
    """Input for POST /niche/score."""

    topic: str = Field(..., description="The niche or topic to analyze.")
    keywords: List[str] = Field(default_factory=list, description="Optional seed keywords.")
    audience: Optional[str] = Field(None, description="Optional target audience description.")
    persona: Optional[str] = Field(None, description="Optional creator persona / strengths.")


class NicheScoreResponse(BaseModel):
    """Scored niche result matching the nichePrompt.js JSON schema."""

    niche: str
    keywords: List[str]
    demand_score: int = Field(..., ge=0, le=100)
    competition_score: int = Field(..., ge=0, le=100)
    niche_opportunities: List[str]
    risk_factors: List[str]
    validation_steps: List[str]
    recommendation: str
    ok: bool = True


# ---------------------------------------------------------------------------
# Roadmap endpoints
# ---------------------------------------------------------------------------
class RoadmapGenerateRequest(BaseModel):
    """Input for POST /roadmap/generate."""

    niche: str = Field(..., description="The niche the roadmap is built around.")
    superpower_type: Optional[str] = Field(None, description="e.g. 'creator', 'operator'.")
    goal: Optional[str] = Field(None, description="Primary goal for the roadmap.")
    timeframe_weeks: int = Field(4, ge=1, le=52, description="How many weeks the roadmap covers.")


class RoadmapStep(BaseModel):
    """A single step within a generated roadmap."""

    week: int
    title: str
    description: str
    estimated_time: Optional[str] = None
    tools: List[str] = Field(default_factory=list)
    next_action: Optional[str] = None


class RoadmapGenerateResponse(BaseModel):
    """Generated roadmap output."""

    niche: str
    title: str
    total_weeks: int
    steps: List[RoadmapStep]
    summary: str
    ok: bool = True


# ---------------------------------------------------------------------------
# Validation endpoints
# ---------------------------------------------------------------------------
class ValidationCheckRequest(BaseModel):
    """Input for POST /validation/check."""

    idea: str = Field(..., description="The business idea / product to validate.")
    audience: Optional[str] = Field(None, description="Target audience.")
    evidence: Optional[str] = Field(None, description="Any evidence or signals the user already has.")


class ValidationCheckResponse(BaseModel):
    """Validation verdict output."""

    idea: str
    verdict: str
    confidence: int = Field(..., ge=0, le=100)
    risks: List[str]
    tests: List[str]
    recommendation: Optional[str] = None
    ok: bool = True


# ---------------------------------------------------------------------------
# Content endpoints
# ---------------------------------------------------------------------------
class ContentRewriteRequest(BaseModel):
    """Input for POST /content/rewrite."""

    content: str = Field(..., description="The content to rewrite.")
    tone: Optional[str] = Field(None, description="e.g. 'direct, faceless, no hype'.")
    audience: Optional[str] = Field(None, description="Who the content is for.")
    length: Optional[str] = Field(None, description="e.g. 'short', 'medium', 'long'.")


class ContentRewriteResponse(BaseModel):
    """Rewritten content output."""

    original: str
    rewritten: str
    tone: Optional[str] = None
    notes: List[str]
    ok: bool = True