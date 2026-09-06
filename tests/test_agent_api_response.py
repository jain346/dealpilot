from agent_api import AgentResponse


def test_response_payload_supports_markdown_and_links():
    payload = {
        "text": "Check https://example.com for details & updates.",
        "markdown": "Check [Example](https://example.com) for details & updates.",
        "links": ["https://example.com"],
    }

    result = AgentResponse(session_id="abc123", response=payload)

    assert result.session_id == "abc123"
    assert result.response["links"] == ["https://example.com"]
    assert result.response["markdown"].startswith("Check [Example]")
