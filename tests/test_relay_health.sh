#!/usr/bin/env bash
# Test: relay_health.sh health check
# Tests JSON output structure and offline handling

set -euo pipefail

HEALTH="$(cd "$(dirname "$0")/../plugin/scripts" && pwd)/relay_health.sh"
PASS=0
FAIL=0

pass() { ((PASS++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); echo "  FAIL: $1"; }

echo "=== relay_health.sh Tests ==="

# Output is valid JSON
echo ""
echo "--- JSON Output ---"
output=$("$HEALTH" 2>/dev/null) || true
if echo "$output" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
    pass "Output is valid JSON"
else
    fail "Output is not valid JSON: $output"
fi

# Has required keys
echo ""
echo "--- Required Keys ---"
for key in server_url status; do
    if echo "$output" | python3 -c "import json,sys; d=json.load(sys.stdin); assert '$key' in d" 2>/dev/null; then
        pass "Has key '$key'"
    else
        fail "Missing key '$key'"
    fi
done

# Status is either "online" or "offline"
echo ""
echo "--- Status Value ---"
status=$(echo "$output" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
if [ "$status" = "online" ] || [ "$status" = "offline" ]; then
    pass "Status is '$status' (valid value)"
else
    fail "Status should be 'online' or 'offline', got: $status"
fi

# server_url should be the relay address
echo ""
echo "--- Server URL ---"
url=$(echo "$output" | python3 -c "import json,sys; print(json.load(sys.stdin).get('server_url',''))" 2>/dev/null)
if echo "$url" | grep -q "127.0.0.1:18800"; then
    pass "server_url points to relay server"
else
    fail "server_url should contain 127.0.0.1:18800, got: $url"
fi

# When server is offline, extension_connected should be false or absent
echo ""
echo "--- Offline Behavior ---"
if [ "$status" = "offline" ]; then
    pass "Server is offline (expected in test environment)"
    ext=$(echo "$output" | python3 -c "import json,sys; print(json.load(sys.stdin).get('extension_connected','N/A'))" 2>/dev/null)
    if [ "$ext" = "N/A" ] || [ "$ext" = "False" ] || [ "$ext" = "false" ]; then
        pass "Offline: extension_connected is absent or false"
    else
        fail "Offline: extension_connected should be absent or false, got: $ext"
    fi
elif [ "$status" = "online" ]; then
    pass "Server is online (relay is running)"
    # When online, should have extension_connected field
    if echo "$output" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'extension_connected' in d" 2>/dev/null; then
        pass "Online: has 'extension_connected' key"
    else
        fail "Online: missing 'extension_connected' key"
    fi
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
