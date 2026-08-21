import os
import agentops
from tools.trends import get_trends
from tools.store_trend import store_trend
from tools.data_watcher import (
    get_data_watcher_tools,
    SKILL_NAME as DATA_WATCHER_SKILL_NAME,
)
from modules.omniroute import call_ai, call_ai_with_messages, get_client
from modules.prompts.hermes_system_prompt import HERMES_SYSTEM_PROMPT

# Initialize AgentOps for monitoring
AGENTOPS_API_KEY = os.getenv("AGENTOPS_API_KEY")
if AGENTOPS_API_KEY:
    agentops.init(api_key=AGENTOPS_API_KEY)
    print("✓ AgentOps initialized successfully")
else:
    print("⚠️  AgentOps API key not found in environment variables - running in demo mode")

# MCP tools dictionary with AgentOps monitoring
def wrapped_get_trends(*args, **kwargs):
    try:
        with agentops.start_trace("hermes_get_trends"):
            return get_trends(*args, **kwargs)
    except AttributeError:
        # Fallback for older AgentOps versions
        return get_trends(*args, **kwargs)

def wrapped_store_trend(*args, **kwargs):
    try:
        with agentops.start_trace("hermes_store_trend"):
            return store_trend(*args, **kwargs)
    except AttributeError:
        return store_trend(*args, **kwargs)

def wrapped_call_ai(*args, **kwargs):
    try:
        with agentops.start_trace("hermes_call_ai"):
            return call_ai(*args, **kwargs)
    except AttributeError:
        return call_ai(*args, **kwargs)

def wrapped_call_ai_with_messages(*args, **kwargs):
    try:
        with agentops.start_trace("hermes_call_ai_with_messages"):
            return call_ai_with_messages(*args, **kwargs)
    except AttributeError:
        return call_ai_with_messages(*args, **kwargs)

tools = {
    "get_trends": wrapped_get_trends,
    "store_trend": wrapped_store_trend,
    "call_ai": wrapped_call_ai,
    "call_ai_with_messages": wrapped_call_ai_with_messages,
    "get_omniroute_client": get_client,
    "get_hermes_system_prompt": lambda: HERMES_SYSTEM_PROMPT,
}

# ------------------------------------------------------------------
# Skill: DigitallyDefined Data Watcher
# Reads live Supabase analytics, analyzes trends/bottlenecks,
# recommends scaling steps, and pushes tasks into Linear.
# ------------------------------------------------------------------
tools.update(get_data_watcher_tools())
print(f"✓ MCP skill registered: {DATA_WATCHER_SKILL_NAME} "
      f"({len(tools)} tools available)")
