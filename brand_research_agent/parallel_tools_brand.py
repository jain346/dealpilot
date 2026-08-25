import os

from google.adk.tools.mcp_tool.mcp_toolset import (
    McpToolset,
    StreamableHTTPConnectionParams,
)


def get_parallel_task_mcp_tools() -> McpToolset:
    """
    Return an MCP toolset connected to Parallel Task MCP.

    The Task MCP provides:
    - createDeepResearch
    - createTaskGroup
    - getStatus
    - getResultMarkdown
    """
    api_key = os.environ.get("PARALLEL_API_KEY")

    headers = {}

    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="https://task-mcp.parallel.ai/mcp",
            headers=headers,
        )
    )