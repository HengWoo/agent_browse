#!/usr/bin/env python3
"""
Diagnose Meituan detection - capture error page and check fingerprint.
"""

from pathlib import Path
from patchright.sync_api import sync_playwright
import json


def main():
    print("[*] Diagnosing Meituan detection...")

    # Use fresh profile for clean test
    profile_dir = Path("./browser_profiles/meituan_diag")
    profile_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir.absolute()),
            channel="chrome",
            headless=False,
            no_viewport=True,
        )

        page = context.pages[0] if context.pages else context.new_page()

        # First, check fingerprint detection
        print("\n[1] Testing fingerprint at BrowserScan...")
        page.goto("https://www.browserscan.net/", timeout=30000)
        page.wait_for_timeout(5000)
        page.screenshot(path="diag_01_browserscan.png")
        print("[✓] Screenshot: diag_01_browserscan.png")

        # Check bot detection
        print("\n[2] Testing at bot detection site...")
        page.goto("https://bot.sannysoft.com/", timeout=30000)
        page.wait_for_timeout(3000)
        page.screenshot(path="diag_02_sannysoft.png", full_page=True)
        print("[✓] Screenshot: diag_02_sannysoft.png")

        # Now try Meituan
        print("\n[3] Testing Meituan POS...")
        page.goto("https://pos.meituan.com/", timeout=30000)
        page.wait_for_timeout(5000)

        # Capture URL and content
        print(f"[*] URL: {page.url}")
        page.screenshot(path="diag_03_meituan.png", full_page=True)
        print("[✓] Screenshot: diag_03_meituan.png")

        # Get page content for analysis
        content = page.content()
        with open("diag_03_meituan.html", "w") as f:
            f.write(content)
        print("[✓] HTML saved: diag_03_meituan.html")

        # Check for common block indicators
        text = page.inner_text("body").lower()
        indicators = {
            "captcha": "captcha" in text or "验证" in text,
            "blocked": "blocked" in text or "拒绝" in text or "禁止" in text,
            "robot": "robot" in text or "机器人" in text,
            "unusual": "unusual" in text or "异常" in text,
            "security": "security" in text or "安全" in text,
        }

        print("\n[*] Detection indicators found:")
        for name, found in indicators.items():
            status = "⚠️ YES" if found else "✓ No"
            print(f"    {name}: {status}")

        # Keep open for manual inspection
        print("\n[*] Browser open. Inspect the pages, then press Enter to close...")
        try:
            input()
        except KeyboardInterrupt:
            pass

        context.close()

    print("\n[*] Check the screenshot files to see what Meituan showed.")
    print("[*] If BrowserScan shows red items, Patchright isn't enough.")
    print("[*] Next step: Try Camoufox (C++ level patches).")


if __name__ == "__main__":
    main()
