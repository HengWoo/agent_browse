#!/usr/bin/env python3
"""
Test if saved Meituan session works.

Usage:
    uv run python test_session.py

This verifies that your login session was saved properly.
"""

from pathlib import Path
from patchright.sync_api import sync_playwright


def main():
    profile_dir = Path("./browser_profiles/meituan")

    if not profile_dir.exists():
        print("[!] Profile directory not found. Run launch_browser.py first.")
        return

    print(f"[*] Using profile: {profile_dir.absolute()}")
    print("[*] Launching browser with saved session...")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir.absolute()),
            channel="chrome",
            headless=False,
            no_viewport=True,
        )

        page = context.pages[0] if context.pages else context.new_page()

        print("[*] Navigating to Meituan POS...")
        page.goto("https://pos.meituan.com/web/operation/main#/", timeout=60000)

        # Wait a moment for redirects
        page.wait_for_timeout(3000)

        # Check current URL
        current_url = page.url
        print(f"[*] Current URL: {current_url}")

        # Try to detect if logged in
        # Meituan login page usually has different URL
        if "login" in current_url.lower() or "passport" in current_url.lower():
            print("[✗] NOT logged in - redirected to login page")
            print("[!] Session may have expired. Run launch_browser.py again.")
        else:
            print("[✓] Session appears valid - not redirected to login")

            # Take a snapshot of the page
            print("[*] Taking screenshot...")
            page.screenshot(path="meituan_test.png")
            print("[✓] Screenshot saved to meituan_test.png")

        # Keep open for inspection
        print("\n[*] Browser open for inspection. Press Enter to close...")
        try:
            input()
        except KeyboardInterrupt:
            pass

        context.close()

    print("[✓] Done.")


if __name__ == "__main__":
    main()
