"""Raw JSON-RPC client for digitalbrain-mcp, for sessions whose MCP client failed at start.

Usage (from any directory):
  python docs/superpowers/loop/mcp.py tools
  python docs/superpowers/loop/mcp.py neurons_context
  python docs/superpowers/loop/mcp.py neurons_search '{"query": "calculator"}'
  python docs/superpowers/loop/mcp.py neurons_call '{"contract": "DigitalBrain.Apps.IApp", "key": "owner/apps/calculator", "method": "Request", "arguments": "[\"add\", \"2+3\"]"}'
  python docs/superpowers/loop/mcp.py --brain owner neurons_list '{}'

Each call runs initialize -> notifications/initialized -> the request on one session and prints the
result (the text content when the tool returns text). Exit code 1 when the tool reports isError.
The server answers as the local owner in the Open development posture; no credentials are used.
"""
import json
import os
import sys
import urllib.request

BASE = os.environ.get("DIGITALBRAIN_MCP", "http://localhost:5081")


def post(url, payload, session=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if session:
        headers["Mcp-Session-Id"] = session
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=120) as response:
        session = response.headers.get("Mcp-Session-Id") or session
        body = response.read().decode("utf-8", errors="replace")
    if not body.strip():
        return None, session
    if body.lstrip().startswith("{"):
        return json.loads(body), session
    message = None
    for line in body.splitlines():
        if line.startswith("data:"):
            data = line[5:].strip()
            if data:
                candidate = json.loads(data)
                if "result" in candidate or "error" in candidate:
                    message = candidate
    return message, session


def main(argv):
    brain = None
    if len(argv) >= 2 and argv[0] == "--brain":
        brain, argv = argv[1], argv[2:]
    if not argv:
        print(__doc__)
        return 2
    url = f"{BASE}/brains/{brain}/mcp" if brain else f"{BASE}/mcp"
    init = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                       "clientInfo": {"name": "forking-loop", "version": "1"}}}
    _, session = post(url, init)
    post(url, {"jsonrpc": "2.0", "method": "notifications/initialized"}, session)
    if argv[0] == "tools":
        message, _ = post(url, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, session)
        for tool in message["result"]["tools"]:
            print(f"{tool['name']}: {tool.get('description', '')[:300]}")
            print("  input:", json.dumps(tool.get("inputSchema", {}).get("properties", {}))[:600])
        return 0
    arguments = json.loads(argv[1]) if len(argv) > 1 else {}
    message, _ = post(url, {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                            "params": {"name": argv[0], "arguments": arguments}}, session)
    if message is None:
        print("no response")
        return 1
    if "error" in message:
        print(json.dumps(message["error"], indent=2))
        return 1
    result = message["result"]
    for part in result.get("content", []):
        if part.get("type") == "text":
            text = part["text"]
            try:
                print(json.dumps(json.loads(text), indent=2))
            except (ValueError, TypeError):
                print(text)
        else:
            print(json.dumps(part))
    if "structuredContent" in result and not result.get("content"):
        print(json.dumps(result["structuredContent"], indent=2))
    return 1 if result.get("isError") else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
