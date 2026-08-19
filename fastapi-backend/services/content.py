"""
Content rewrite service for POST /content/rewrite.

Placeholder implementation: returns a deterministic, structured rewrite so the
endpoint can be wired into Hermes.
"""

from __future__ import annotations

from utils.models import ContentRewriteResponse


def rewrite_content(request) -> ContentRewriteResponse:
    """Rewrite content and return a structured result."""
    original = request.content.strip()
    tone = request.tone or "direct, faceless, no hype"

    rewritten = (
        f"{original.rstrip('.')}. This is a sharper, {tone} rewrite that "
        "keeps your core message while tightening the delivery for your "
        f"audience{(' of ' + request.audience) if request.audience else ''}."
    )

    return ContentRewriteResponse(
        original=original,
        rewritten=rewritten,
        tone=tone,
        notes=[
            "Tone adjusted to be direct and faceless.",
            "Trimmed filler and clarified the message.",
        ],
    )