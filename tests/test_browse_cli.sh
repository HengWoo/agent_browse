#!/usr/bin/env bash
# Test: browse-cli.sh CLI wrapper
# Tests subcommand parsing, usage output, and JSON payload construction

set -euo pipefail

CLI="$(cd "$(dirname "$0")/../plugin/scripts" && pwd)/browse-cli.sh"
PASS=0
FAIL=0

pass() { ((PASS++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); echo "  FAIL: $1"; }

# Helper: capture output and exit code without failing the script
run_cli() {
    local output
    local exit_code
    output=$("$CLI" "$@" 2>&1) || exit_code=$?
    echo "$output"
    return "${exit_code:-0}"
}

echo "=== browse-cli.sh Tests ==="

# No args → usage + exit 1
echo ""
echo "--- No arguments ---"
if output=$(run_cli 2>&1); then
    fail "No args should exit non-zero"
else
    if echo "$output" | grep -qi "usage"; then
        pass "No args prints usage"
    else
        fail "No args should print usage, got: $output"
    fi
fi

# help → usage + exit 0
echo ""
echo "--- Help ---"
if output=$(run_cli help 2>&1); then
    if echo "$output" | grep -qi "usage"; then
        pass "'help' prints usage"
    else
        fail "'help' should print usage"
    fi
else
    fail "'help' should exit 0"
fi

# status subcommand → correct curl target
echo ""
echo "--- Status subcommand ---"
# Use --dry-run to see what command would be executed
if output=$(run_cli status --dry-run 2>&1); then
    if echo "$output" | grep -q "127.0.0.1:18800"; then
        pass "'status' targets correct server address"
    else
        fail "'status' should target 127.0.0.1:18800, got: $output"
    fi
else
    # Even if server is down, dry-run should work
    if echo "$output" | grep -q "127.0.0.1:18800"; then
        pass "'status' targets correct server address (non-zero exit ok)"
    else
        fail "'status' should target 127.0.0.1:18800"
    fi
fi

# tabs subcommand → correct endpoint
echo ""
echo "--- Tabs subcommand ---"
if output=$(run_cli tabs --dry-run 2>&1); then
    if echo "$output" | grep -q "/tabs"; then
        pass "'tabs' targets /tabs endpoint"
    else
        fail "'tabs' should target /tabs endpoint, got: $output"
    fi
else
    if echo "$output" | grep -q "/tabs"; then
        pass "'tabs' targets /tabs endpoint (non-zero exit ok)"
    else
        fail "'tabs' should target /tabs endpoint"
    fi
fi

# attach subcommand → correct JSON payload
echo ""
echo "--- Attach subcommand ---"
if output=$(run_cli attach 123 --dry-run 2>&1); then
    if echo "$output" | grep -q '"tabId"'; then
        pass "'attach' includes tabId in payload"
    else
        fail "'attach' should include tabId in payload, got: $output"
    fi
else
    if echo "$output" | grep -q '"tabId"'; then
        pass "'attach' includes tabId in payload (non-zero exit ok)"
    else
        fail "'attach' should include tabId"
    fi
fi

# navigate subcommand → correct JSON payload
echo ""
echo "--- Navigate subcommand ---"
if output=$(run_cli navigate 123 "https://example.com" --dry-run 2>&1); then
    if echo "$output" | grep -q '"url"'; then
        pass "'navigate' includes url in payload"
    else
        fail "'navigate' should include url in payload, got: $output"
    fi
else
    if echo "$output" | grep -q '"url"'; then
        pass "'navigate' includes url in payload (non-zero exit ok)"
    else
        fail "'navigate' should include url"
    fi
fi

# click subcommand → correct JSON payload
echo ""
echo "--- Click subcommand ---"
if output=$(run_cli click 123 100 200 --dry-run 2>&1); then
    if echo "$output" | grep -q '"x"' && echo "$output" | grep -q '"y"'; then
        pass "'click' includes x and y in payload"
    else
        fail "'click' should include x and y in payload, got: $output"
    fi
else
    if echo "$output" | grep -q '"x"' && echo "$output" | grep -q '"y"'; then
        pass "'click' includes x and y in payload (non-zero exit ok)"
    else
        fail "'click' should include x and y"
    fi
fi

# screenshot subcommand → correct JSON payload
echo ""
echo "--- Screenshot subcommand ---"
if output=$(run_cli screenshot 123 --dry-run 2>&1); then
    if echo "$output" | grep -q '"tabId"'; then
        pass "'screenshot' includes tabId in payload"
    else
        fail "'screenshot' should include tabId in payload, got: $output"
    fi
else
    if echo "$output" | grep -q '"tabId"'; then
        pass "'screenshot' includes tabId in payload (non-zero exit ok)"
    else
        fail "'screenshot' should include tabId"
    fi
fi

# Unknown subcommand → error
echo ""
echo "--- Unknown subcommand ---"
if output=$(run_cli nonexistent 2>&1); then
    fail "Unknown subcommand should exit non-zero"
else
    if echo "$output" | grep -qi "unknown\|invalid\|error\|usage"; then
        pass "Unknown subcommand shows error"
    else
        fail "Unknown subcommand should show error, got: $output"
    fi
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
