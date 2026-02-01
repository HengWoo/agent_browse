#!/usr/bin/env python3
"""Quick test: connect to real Chrome and navigate to Meituan"""

from patchright.sync_api import sync_playwright

with sync_playwright() as p:
    print("[*] Connecting to Chrome on port 9222...")
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")

    # Get first context and page
    ctx = browser.contexts[0]
    page = ctx.pages[0] if ctx.pages else ctx.new_page()

    print(f"[*] Current URL: {page.url}")
    print("[*] Navigating to Meituan POS...")

    page.goto("https://pos.meituan.com/web/operation/main#/", timeout=30000)
    page.wait_for_timeout(3000)

    print(f"[*] Final URL: {page.url}")
    page.screenshot(path="real_chrome_meituan.png")
    print("[✓] Screenshot saved: real_chrome_meituan.png")

    # Check for block message
    try:
        text = page.inner_text("body")
        if "异常" in text or "拒绝" in text:
            print("[!] Block message detected in page")
        else:
            print("[✓] No obvious block message")
    except:
        pass
