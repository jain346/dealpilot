"""
Parallel AI MCP integration for the DealPilot Opportunity Agent.

Uses the Parallel Search MCP Server (https://search.parallel.ai/mcp) via
Google ADK's MCPToolset to provide real-time web search and content extraction
tools to the agent.

The Search MCP exposes two tools:
  - web_search: General-purpose web search for current information
  - web_fetch: Pull token-efficient markdown from specific URLs

See: https://docs.parallel.ai/integrations/mcp/search-mcp
"""

import os

from google.adk.tools.mcp_tool.mcp_toolset import McpToolset, StreamableHTTPConnectionParams



def get_parallel_mcp_tools() -> McpToolset:
    """
    Return an MCPToolset connected to the Parallel Search MCP server.

    If PARALLEL_API_KEY is set, it is sent as a Bearer token for higher
    rate limits. Otherwise the server is used in free/anonymous mode.
    """
    api_key = os.environ.get("PARALLEL_API_KEY")

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    connection_params = StreamableHTTPConnectionParams(
        url="https://search.parallel.ai/mcp",
        headers=headers,
    )

    return McpToolset(connection_params=connection_params)
