#!/usr/bin/env bash
# Test: YAML frontmatter validation
# Verifies all .md files with frontmatter have valid structure and required fields

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/../plugin" && pwd)"
PASS=0
FAIL=0

pass() { ((PASS++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); echo "  FAIL: $1"; }

# Extract frontmatter (content between first pair of --- delimiters)
extract_frontmatter() {
    local file="$1"
    sed -n '/^---$/,/^---$/p' "$file" | sed '1d;$d'
}

# Check if file has frontmatter
has_frontmatter() {
    local file="$1"
    head -1 "$file" | grep -q '^---$'
}

# Validate simple YAML frontmatter (key: value pairs)
# Returns key=value lines. No external deps needed — frontmatter is simple.
validate_yaml() {
    local yaml_content="$1"
    local valid=true
    while IFS= read -r line; do
        # Skip empty lines
        [ -z "$line" ] && continue
        # Each line should be "key: value" or "key: \"value\""
        if echo "$line" | grep -qE '^[a-zA-Z_-]+:'; then
            key=$(echo "$line" | sed 's/:.*//')
            value=$(echo "$line" | sed 's/^[^:]*: *//' | sed 's/^"//' | sed 's/"$//')
            echo "${key}=${value}"
        else
            echo "ERROR: invalid line: $line"
            valid=false
        fi
    done <<< "$yaml_content"
    [ "$valid" = true ]
}

echo "=== Frontmatter Tests ==="

# Agent: browser-automation.md
echo ""
echo "--- Agent: browser-automation.md ---"
agent_file="$PLUGIN_DIR/agents/browser-automation.md"
if [ -f "$agent_file" ]; then
    if has_frontmatter "$agent_file"; then
        pass "Agent has frontmatter"
        fm=$(extract_frontmatter "$agent_file")
        if output=$(validate_yaml "$fm" 2>&1); then
            pass "Agent frontmatter is valid YAML"
            # Check required fields
            if echo "$output" | grep -q "^name="; then
                pass "Agent has 'name' field"
            else
                fail "Agent missing 'name' field"
            fi
            if echo "$output" | grep -q "^description="; then
                pass "Agent has 'description' field"
            else
                fail "Agent missing 'description' field"
            fi
            if echo "$output" | grep -q "^model="; then
                pass "Agent has 'model' field"
            else
                fail "Agent missing 'model' field"
            fi
            if echo "$output" | grep -q "^color="; then
                pass "Agent has 'color' field"
            else
                fail "Agent missing 'color' field"
            fi
        else
            fail "Agent frontmatter invalid YAML: $output"
        fi
    else
        fail "Agent file missing frontmatter"
    fi
else
    fail "Agent file does not exist"
fi

# Skill: SKILL.md
echo ""
echo "--- Skill: browser-relay/SKILL.md ---"
skill_file="$PLUGIN_DIR/skills/browser-relay/SKILL.md"
if [ -f "$skill_file" ]; then
    if has_frontmatter "$skill_file"; then
        pass "Skill has frontmatter"
        fm=$(extract_frontmatter "$skill_file")
        if output=$(validate_yaml "$fm" 2>&1); then
            pass "Skill frontmatter is valid YAML"
            if echo "$output" | grep -q "^name="; then
                pass "Skill has 'name' field"
            else
                fail "Skill missing 'name' field"
            fi
            if echo "$output" | grep -q "^description="; then
                pass "Skill has 'description' field"
            else
                fail "Skill missing 'description' field"
            fi
        else
            fail "Skill frontmatter invalid YAML: $output"
        fi
    else
        fail "Skill file missing frontmatter"
    fi
else
    fail "Skill file does not exist"
fi

# Commands
echo ""
echo "--- Commands ---"
for cmd_file in "$PLUGIN_DIR"/commands/*.md; do
    cmd_name=$(basename "$cmd_file")
    if has_frontmatter "$cmd_file"; then
        pass "Command '$cmd_name' has frontmatter"
        fm=$(extract_frontmatter "$cmd_file")
        if output=$(validate_yaml "$fm" 2>&1); then
            pass "Command '$cmd_name' has valid YAML"
            if echo "$output" | grep -q "^description="; then
                pass "Command '$cmd_name' has 'description' field"
            else
                fail "Command '$cmd_name' missing 'description' field"
            fi
        else
            fail "Command '$cmd_name' invalid YAML: $output"
        fi
    else
        fail "Command '$cmd_name' missing frontmatter"
    fi
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
