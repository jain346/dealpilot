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
    Parallel Search MCP for opportunity discovery.

    Search behavior:
    - fast mode for lower-latency discovery
    - small result count to reduce duplicate/low-signal results

    objective and search_queries remain dynamic per web_search call.
    """
     
    api_key = os.environ.get("PARALLEL_API_KEY")

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    connection_params = StreamableHTTPConnectionParams(
        url=(
            "https://search-mcp.parallel.ai/mcp"
            "?mode=fast"
            "&advanced_settings.max_results=6"
        ),
        headers=headers,
    )

    return McpToolset(connection_params=connection_params)
