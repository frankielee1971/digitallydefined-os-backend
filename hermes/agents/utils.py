from ..mcp_server import tools


def fetch_trends(keyword: str):
    """Fetch trend data for a keyword using the MCP get_trends tool."""
    return tools["get_trends"](keyword)


def save_trend(data: dict):
    """Store trend data using the MCP store_trend tool."""
    return tools["store_trend"](data)