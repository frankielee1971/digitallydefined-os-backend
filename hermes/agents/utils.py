from ..mcp_server import tools


def fetch_trends(keyword: str):
    """Fetch trend data for a keyword using the MCP get_trends tool."""
    return tools["get_trends"](keyword)