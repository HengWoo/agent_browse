#!/usr/bin/env bash
# relay_health.sh — Health check for the agent_browse relay server
# Outputs JSON with server status, extension connection, and tab count

set -euo pipefail

BASE_URL="${AGENT_BROWSE_URL:-http://127.0.0.1:18800}"

# Try to reach the server (1 second timeout)
if response=$(curl -s --connect-timeout 1 --max-time 2 "${BASE_URL}/" 2>/dev/null); then
    # Server responded — parse its info
    if echo "$response" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
        # Valid JSON response, augment with our status
        echo "$response" | python3 -c "
import json, sys
data = json.load(sys.stdin)
data['server_url'] = '${BASE_URL}'
data['status'] = 'online'
print(json.dumps(data, indent=2))
"
    else
        # Server responded but not valid JSON
        echo "{\"server_url\": \"${BASE_URL}\", \"status\": \"online\", \"note\": \"unexpected response format\"}"
    fi
else
    # Server unreachable
    echo "{\"server_url\": \"${BASE_URL}\", \"status\": \"offline\", \"message\": \"Relay server not running. Start with: uv run python relay_server.py\"}"
fi
