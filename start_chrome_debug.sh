#!/bin/bash
# Start Chrome with remote debugging enabled
# Uses YOUR existing Chrome profile (keeps your sessions!)

echo "=============================================="
echo "IMPORTANT: Close ALL Chrome windows first!"
echo "=============================================="
echo ""
echo "This will launch Chrome with:"
echo "  - Your existing profile (keeps Meituan session)"
echo "  - Remote debugging on port 9222"
echo ""
echo "After Chrome opens, run:"
echo "  uv run python connect_real_chrome.py"
echo ""
read -p "Press Enter when Chrome is fully closed..."

# Use default Chrome profile location
CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome"

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=9222 \
    --user-data-dir="$CHROME_PROFILE" \
    "https://pos.meituan.com/web/operation/main#/"
