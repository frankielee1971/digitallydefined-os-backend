"""
DigitallyDefined FastAPI backend.

Exposes HTTP endpoints that Hermes can call as external tools:

    POST /niche/score          -> services/niche.py
    POST /roadmap/generate     -> services/roadmap.py
    POST /validation/check     -> services/validation.py
    POST /content/rewrite      -> services/content.py

Run locally from this folder:

    pip install -r requirements.txt
    uvicorn main:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services import content, niche, roadmap, validation
from utils.models import (
    ContentRewriteRequest,
    ContentRewriteResponse,
    NicheScoreRequest,
    NicheScoreResponse,
    RoadmapGenerateRequest,
    RoadmapGenerateResponse,
    ValidationCheckRequest,
    ValidationCheckResponse,
)

app = FastAPI(
    title="DigitallyDefined FastAPI Backend",
    description="External tools for Hermes: niche scoring, roadmap generation, "
    "validation checks, and content rewriting.",
    version="1.0.0",
)

# Allow the frontend + Hermes to call these endpoints cross-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """Simple health check so Hermes can confirm the server is up."""
    return {
        "service": "DigitallyDefined FastAPI backend",
        "status": "ok",
        "endpoints": [
            "/niche/score",
            "/roadmap/generate",
            "/validation/check",
            "/content/rewrite",
        ],
    }


@app.post("/niche/score", response_model=NicheScoreResponse)
def score_niche(payload: NicheScoreRequest):
    """Score a niche for demand, competition, and opportunity."""
    return niche.score_niche(payload)


@app.post("/roadmap/generate", response_model=RoadmapGenerateResponse)
def generate_roadmap(payload: RoadmapGenerateRequest):
    """Generate a step-by-step faceless roadmap."""
    return roadmap.generate_roadmap(payload)


@app.post("/validation/check", response_model=ValidationCheckResponse)
def check_validation(payload: ValidationCheckRequest):
    """Validate a business idea."""
    return validation.check_validation(payload)


@app.post("/content/rewrite", response_model=ContentRewriteResponse)
def rewrite_content(payload: ContentRewriteRequest):
    """Rewrite supplied content."""
    return content.rewrite_content(payload)