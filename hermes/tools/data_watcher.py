"""
DigitallyDefined Data Watcher — Hermes MCP skill.

Reads live Supabase analytics (events, leads, sessions, funnels,
assets, products) via the `analytics` Edge Function, analyzes trends
and bottlenecks, identifies high-performing content, recommends next
steps for scaling, and pushes tasks into Linear automatically.
"""

import os
from typing import Any, Dict, List, Optional

import requests

SUPABASE_URL = os.getenv(
    "SUPABASE_URL", "https://dijjlppdljpcgyoakdnq.supabase.co"
).rstrip("/")
API_KEY = os.getenv("DASHBOARD_API_KEY", "DigitallyDefined-OS-2026")
ANALYTICS_ENDPOINT = f"{SUPABASE_URL}/functions/v1/analytics"

LINEAR_API_URL = "https://api.linear.app/graphql"


def _post(action: str, days: int = 30) -> Dict[str, Any]:
    response = requests.post(
        ANALYTICS_ENDPOINT,
        headers={"x-api-key": API_KEY, "Content-Type": "application/json"},
        json={"action": action, "days": days},
        timeout=90,
    )
    response.raise_for_status()
    return response.json()


# ------------------------------------------------------------------
# Read
# ------------------------------------------------------------------
def read_analytics(days: int = 30) -> Dict[str, Any]:
    """Full overview of traffic, leads, conversions, engagement, assets, products."""
    data = _post("overview", days)
    if not data.get("ok"):
        raise RuntimeError(f"analytics error: {data}")
    return data


def read_traffic(days: int = 30) -> Dict[str, Any]:
    return _post("traffic", days)


def read_funnels(days: int = 30) -> Dict[str, Any]:
    return _post("funnels", days)


def read_assets(days: int = 30) -> Dict[str, Any]:
    return _post("assets", days)


def read_products(days: int = 30) -> Dict[str, Any]:
    return _post("products", days)


# ------------------------------------------------------------------
# Analyze
# ------------------------------------------------------------------
def analyze_trends(data: Optional[Dict[str, Any]] = None, days: int = 30) -> Dict[str, Any]:
    """Deterministic trend + bottleneck detection over live analytics."""
    data = data or read_analytics(days)
    traffic = data.get("traffic", {})
    leads = data.get("leads", {})
    conv = data.get("conversions", {})
    quiz = data.get("funnels", {}).get("quiz", {})
    per_day = leads.get("per_day", [])

    trend_direction = "flat"
    if len(per_day) >= 4:
        half = len(per_day) // 2
        first_half = sum(d["count"] for d in per_day[:half])
        second_half = sum(d["count"] for d in per_day[half:])
        if second_half > first_half * 1.2:
            trend_direction = "accelerating"
        elif first_half > second_half * 1.2:
            trend_direction = "declining"

    bottlenecks: List[str] = []
    bounce = traffic.get("bounce_rate", 0)
    if bounce > 0.65 and traffic.get("unique_sessions", 0) >= 10:
        bottlenecks.append(
            f"Bounce rate {bounce:.0%} is high — landing pages may not match visitor intent."
        )
    v2l = conv.get("visitor_to_lead_rate", 0)
    if 0 < v2l < 0.01:
        bottlenecks.append(
            f"Visitor→lead rate {v2l:.2%} is weak — CTAs or lead magnets need strengthening."
        )
    completion = quiz.get("completion_rate", 0)
    if quiz.get("started", 0) >= 5 and completion < 0.5:
        bottlenecks.append(
            f"Quiz completion {completion:.0%} ({quiz.get('completed')}/{quiz.get('started')}) "
            "— funnel drops mid-quiz; shorten or re-sequence questions."
        )
    scroll = data.get("engagement", {}).get("avg_scroll_depth_pct", 0)
    if scroll and scroll < 40:
        bottlenecks.append(
            f"Avg scroll depth only {scroll}% — key content sits below the fold."
        )

    high_performers = [
        a["asset_name"]
        for a in sorted(data.get("assets", []), key=lambda x: x.get("views", 0), reverse=True)[:3]
        if a.get("views", 0) > 0
    ]
    hot_products = [
        p["product_name"]
        for p in data.get("products", [])[:3]
        if p.get("interest_count", 0) > 0
    ]

    return {
        "period_days": days,
        "trend_direction": trend_direction,
        "bottlenecks": bottlenecks,
        "high_performing_content": high_performers,
        "high_interest_products": hot_products,
        "summary_metrics": {
            "page_views": traffic.get("page_views", 0),
            "sessions": traffic.get("unique_sessions", 0),
            "leads": leads.get("total", 0),
            "visitor_to_lead_rate": v2l,
            "quiz_completion_rate": completion,
        },
    }

def recommend_next_steps(days: int = 30) -> Dict[str, Any]:
    """
    AI-powered scaling recommendations from the analytics Edge Function
    (Hermes system prompt runs server-side over the live snapshot).
    Falls back to deterministic analysis when no AI provider is configured.
    """
    try:
        result = _post("recommend", days)
        return {
            "source": "ai",
            "provider": result.get("provider"),
            "model": result.get("model"),
            "analysis": result.get("analysis"),
        }
    except Exception as exc:  # noqa: BLE001 - graceful degradation
        return {
            "source": "deterministic",
            "error": str(exc),
            "analysis": analyze_trends(days=days),
        }


# ------------------------------------------------------------------
# Linear
# ------------------------------------------------------------------
LINEAR_PRIORITY_MAP = {"urgent": 1, "high": 2, "medium": 3, "low": 4, "no priority": 0}


def push_linear_task(
    title: str,
    description: str = "",
    priority: str = "medium",
    team_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create an issue in Linear via the GraphQL API."""
    api_key = os.getenv("LINEAR_API_KEY")
    if not api_key:
        return {"ok": False, "error": "LINEAR_API_KEY not configured. Set it in ~/.hermes/.env"}

    team_id = team_id or os.getenv("LINEAR_TEAM_ID")
    if not team_id:
        return {"ok": False, "error": "LINEAR_TEAM_ID not configured."}

    mutation = """
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
    """
    issue_input: Dict[str, Any] = {
        "teamId": team_id,
        "title": title,
        "description": description,
        "priority": LINEAR_PRIORITY_MAP.get(priority.lower(), 3),
    }
    if project_id or os.getenv("LINEAR_PROJECT_ID"):
        issue_input["projectId"] = project_id or os.getenv("LINEAR_PROJECT_ID")

    response = requests.post(
        LINEAR_API_URL,
        headers={"Authorization": api_key, "Content-Type": "application/json"},
        json={"query": mutation, "variables": {"input": issue_input}},
        timeout=30,
    )
    payload = response.json()
    if payload.get("errors"):
        return {"ok": False, "error": payload["errors"]}
    created = payload["data"]["issueCreate"]
    if not created.get("success"):
        return {"ok": False, "error": "Linear rejected the issue"}
    return {"ok": True, **created["issue"]}

def push_recommendations_to_linear(days: int = 30) -> Dict[str, Any]:
    """Analyze live data and auto-create Linear tasks for the next build steps."""
    recs = recommend_next_steps(days)
    analysis = recs.get("analysis")

    tasks: List[Dict[str, str]] = []
    if isinstance(analysis, dict):
        # Deterministic fallback shape
        tasks = [
            {"title": b, "description": b, "priority": "high"} for b in analysis.get("bottlenecks", [])
        ]
    elif isinstance(analysis, str):
        # AI JSON shape — best-effort parse of linear_tasks
        import json

        try:
            parsed = json.loads(analysis.replace("```json", "").replace("```", "").strip())
            tasks = parsed.get("linear_tasks", [])
        except (json.JSONDecodeError, AttributeError):
            tasks = []

    results = []
    for t in tasks[:10]:
        results.append(
            push_linear_task(
                t.get("title", "Scaling task"),
                t.get("description", ""),
                t.get("priority", "medium"),
            )
        )
    return {
        "analyzed": bool(analysis),
        "tasks_created": sum(1 for r in results if r.get("ok")),
        "results": results,
    }


# ------------------------------------------------------------------
# MCP skill registration
# ------------------------------------------------------------------
SKILL_NAME = "DigitallyDefined Data Watcher"

def get_data_watcher_tools() -> Dict[str, Any]:
    """Tool surface exposed to the Hermes MCP server."""
    return {
        "read_analytics": read_analytics,
        "read_traffic": read_traffic,
        "read_funnels": read_funnels,
        "read_assets": read_assets,
        "read_products": read_products,
        "analyze_trends": analyze_trends,
        "recommend_next_steps": recommend_next_steps,
        "push_linear_task": push_linear_task,
        "push_recommendations_to_linear": push_recommendations_to_linear,
    }