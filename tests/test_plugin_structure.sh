#!/usr/bin/env bash
# Test: Plugin structure validation
# Verifies all required files and directories exist with correct properties

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/../plugin" && pwd)"
PASS=0
FAIL=0

pass() { ((PASS++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); echo "  FAIL: $1"; }

echo "=== Plugin Structure Tests ==="

# plugin.json exists and is valid JSON
echo ""
echo "--- plugin.json ---"
if [ -f "$PLUGIN_DIR/.claude-plugin/plugin.json" ]; then
    pass "plugin.json exists"
else
    fail "plugin.json missing"
fi

if command -v python3 &>/dev/null; then
    if python3 -c "import json; json.load(open('$PLUGIN_DIR/.claude-plugin/plugin.json'))" 2>/dev/null; then
        pass "plugin.json is valid JSON"
    else
        fail "plugin.json is not valid JSON"
    fi

    # Check required fields
    name=$(python3 -c "import json; print(json.load(open('$PLUGIN_DIR/.claude-plugin/plugin.json')).get('name',''))")
    if [ -n "$name" ]; then
        pass "plugin.json has 'name' field: $name"
    else
        fail "plugin.json missing 'name' field"
    fi

    version=$(python3 -c "import json; print(json.load(open('$PLUGIN_DIR/.claude-plugin/plugin.json')).get('version',''))")
    if [ -n "$version" ]; then
        pass "plugin.json has 'version' field: $version"
    else
        fail "plugin.json missing 'version' field"
    fi

    desc=$(python3 -c "import json; print(json.load(open('$PLUGIN_DIR/.claude-plugin/plugin.json')).get('description',''))")
    if [ -n "$desc" ]; then
        pass "plugin.json has 'description' field"
    else
        fail "plugin.json missing 'description' field"
    fi
fi

# Required directories
echo ""
echo "--- Required Directories ---"
for dir in agents commands skills scripts; do
    if [ -d "$PLUGIN_DIR/$dir" ]; then
        pass "Directory '$dir/' exists"
    else
        fail "Directory '$dir/' missing"
    fi
done

# Required files
echo ""
echo "--- Required Files ---"
expected_files=(
    "agents/browser-automation.md"
    "commands/browse.md"
    "commands/browse-status.md"
    "skills/browser-relay/SKILL.md"
    "skills/browser-relay/references/shadow-dom-patterns.md"
    "skills/browser-relay/references/cdp-commands.md"
    "scripts/relay_health.sh"
    "scripts/browse-cli.sh"
    "README.md"
)

for f in "${expected_files[@]}"; do
    if [ -f "$PLUGIN_DIR/$f" ]; then
        pass "File '$f' exists"
    else
        fail "File '$f' missing"
    fi
done

# Scripts are executable
echo ""
echo "--- Script Permissions ---"
for script in scripts/relay_health.sh scripts/browse-cli.sh; do
    if [ -x "$PLUGIN_DIR/$script" ]; then
        pass "'$script' is executable"
    else
        fail "'$script' is not executable"
    fi
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
