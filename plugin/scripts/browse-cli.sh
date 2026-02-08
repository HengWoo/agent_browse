#!/usr/bin/env bash
# browse-cli.sh — CLI wrapper for the agent_browse relay server
# Provides subcommands for browser automation via curl

set -euo pipefail

BASE_URL="${AGENT_BROWSE_URL:-http://127.0.0.1:18800}"
DRY_RUN=false

# Check for --dry-run flag (remove it from args)
args=()
for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
        DRY_RUN=true
    else
        args+=("$arg")
    fi
done
set -- "${args[@]+"${args[@]}"}"

usage() {
    cat <<'EOF'
Usage: browse-cli.sh <command> [args...]

Commands:
  status                      Check relay server status
  tabs                        List all browser tabs
  attach <tabId>              Attach debugger to tab
  detach <tabId>              Detach debugger from tab
  navigate <tabId> <url>      Navigate tab to URL
  click <tabId> <x> <y>       Click at coordinates
  type <tabId> <text>         Type text into focused element
  screenshot <tabId>          Capture screenshot (base64)
  evaluate <tabId> <expr>     Evaluate JavaScript in tab
  pageinfo <tabId>            Get page URL, title, text
  cdp <tabId> <method> [json] Raw CDP command
  help                        Show this help

Options:
  --dry-run                   Print the curl command instead of executing

Environment:
  AGENT_BROWSE_URL            Override server URL (default: http://127.0.0.1:18800)

Examples:
  browse-cli.sh tabs
  browse-cli.sh attach 123456
  browse-cli.sh navigate 123456 "https://example.com"
  browse-cli.sh click 123456 100 200
  browse-cli.sh screenshot 123456
  browse-cli.sh cdp 123456 "DOM.getDocument" '{}'
EOF
}

validate_int() {
    if ! [[ "$1" =~ ^[0-9]+$ ]]; then
        echo "Error: '$1' is not a valid integer" >&2
        exit 1
    fi
}

json_escape() {
    python3 -c "import json,sys; sys.stdout.write(json.dumps(sys.argv[1]))" "$1"
}

do_get() {
    local endpoint="$1"
    if [ "$DRY_RUN" = true ]; then
        echo "curl -s ${BASE_URL}${endpoint}"
        return 0
    fi
    curl -s "${BASE_URL}${endpoint}"
}

do_post() {
    local endpoint="$1"
    local payload="$2"
    if [ "$DRY_RUN" = true ]; then
        echo "curl -s -X POST ${BASE_URL}${endpoint} -H 'Content-Type: application/json' -d '${payload}'"
        return 0
    fi
    curl -s -X POST "${BASE_URL}${endpoint}" \
        -H 'Content-Type: application/json' \
        -d "${payload}"
}

# No args → usage + error
if [ $# -eq 0 ]; then
    usage >&2
    exit 1
fi

command="$1"
shift

case "$command" in
    help)
        usage
        exit 0
        ;;
    status)
        do_get "/"
        ;;
    tabs)
        do_get "/tabs"
        ;;
    attach)
        [ $# -lt 1 ] && { echo "Error: attach requires <tabId>" >&2; exit 1; }
        validate_int "$1"
        do_post "/attach" "{\"tabId\": $1}"
        ;;
    detach)
        [ $# -lt 1 ] && { echo "Error: detach requires <tabId>" >&2; exit 1; }
        validate_int "$1"
        do_post "/detach" "{\"tabId\": $1}"
        ;;
    navigate)
        [ $# -lt 2 ] && { echo "Error: navigate requires <tabId> <url>" >&2; exit 1; }
        validate_int "$1"
        escaped_url=$(json_escape "$2")
        do_post "/navigate" "{\"tabId\": $1, \"url\": ${escaped_url}}"
        ;;
    click)
        [ $# -lt 3 ] && { echo "Error: click requires <tabId> <x> <y>" >&2; exit 1; }
        validate_int "$1"
        validate_int "$2"
        validate_int "$3"
        do_post "/click" "{\"tabId\": $1, \"x\": $2, \"y\": $3}"
        ;;
    type)
        [ $# -lt 2 ] && { echo "Error: type requires <tabId> <text>" >&2; exit 1; }
        validate_int "$1"
        escaped_text=$(json_escape "$2")
        do_post "/type" "{\"tabId\": $1, \"text\": ${escaped_text}}"
        ;;
    screenshot)
        [ $# -lt 1 ] && { echo "Error: screenshot requires <tabId>" >&2; exit 1; }
        validate_int "$1"
        do_post "/screenshot" "{\"tabId\": $1}"
        ;;
    evaluate)
        [ $# -lt 2 ] && { echo "Error: evaluate requires <tabId> <expression>" >&2; exit 1; }
        validate_int "$1"
        escaped_expr=$(json_escape "$2")
        do_post "/evaluate" "{\"tabId\": $1, \"expression\": ${escaped_expr}}"
        ;;
    pageinfo)
        [ $# -lt 1 ] && { echo "Error: pageinfo requires <tabId>" >&2; exit 1; }
        validate_int "$1"
        do_post "/pageInfo" "{\"tabId\": $1}"
        ;;
    cdp)
        [ $# -lt 2 ] && { echo "Error: cdp requires <tabId> <method> [params_json]" >&2; exit 1; }
        validate_int "$1"
        escaped_method=$(json_escape "$2")
        params="${3:-{}}"
        do_post "/cdp" "{\"tabId\": $1, \"method\": ${escaped_method}, \"params\": ${params}}"
        ;;
    *)
        echo "Error: Unknown command '$command'" >&2
        echo "" >&2
        usage >&2
        exit 1
        ;;
esac
