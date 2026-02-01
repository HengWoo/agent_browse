#!/usr/bin/env python3
"""Take screenshot of current Meituan page"""

from patchright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    ctx = browser.contexts[0]
    page = ctx.pages[0]

    print(f"URL: {page.url}")

    # Quick screenshot without waiting for fonts
    page.screenshot(path="meituan_now.png", timeout=5000)
    print("Screenshot: meituan_now.png")
