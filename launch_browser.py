#!/usr/bin/env python3
"""
Launch Patchright browser with persistent profile for Meituan login.

Usage:
    uv run python launch_browser.py

This will:
1. Open a real-looking Chrome browser (undetected by anti-bot)
2. Navigate to Meituan POS
3. You login manually
4. Session saves to ./browser_profiles/meituan/
5. Future runs = already logged in
"""

from pathlib import Path
from patchright.sync_api import sync_playwright


def main():
    profile_dir = Path("./browser_profiles/meituan")
    profile_dir.mkdir(parents=True, exist_ok=True)

    print(f"[*] Profile directory: {profile_dir.absolute()}")
    print("[*] Launching Patchright browser (undetected mode)...")
    print("[*] Please login to Meituan POS manually.")
    print("[*] Your session will be saved automatically.")
    print("[*] Press Ctrl+C when done, or close the browser.\n")

    with sync_playwright() as p:
        # Launch with stealth settings
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir.absolute()),
            channel="chrome",          # Use real Chrome, not Chromium
            headless=False,            # Must be visible for stealth
            no_viewport=True,          # Use native screen resolution
            args=[
                "--start-maximized",   # Full screen
            ],
            # Don't set custom user_agent - let it be natural
        )

        # Get the default page or create new one
        if context.pages:
            page = context.pages[0]
        else:
            page = context.new_page()

        # Navigate to Meituan
        target_url = "https://pos.meituan.com/web/operation/main#/"
        print(f"[*] Navigating to: {target_url}")

        try:
            page.goto(target_url, timeout=60000)
            print("[✓] Page loaded. Please login if needed.")
            print("[*] Browser will stay open. Close it when done.")

            # Keep browser open until user closes it
            page.wait_for_event("close", timeout=0)

        except KeyboardInterrupt:
            print("\n[*] Keyboard interrupt received.")
        except Exception as e:
            print(f"[!] Error: {e}")
            # Still keep browser open for debugging
            try:
                input("[*] Press Enter to close browser...")
            except KeyboardInterrupt:
                pass

        print("[*] Closing browser and saving profile...")
        context.close()

    print(f"[✓] Profile saved to: {profile_dir.absolute()}")
    print("[*] Next run will use the saved session.")


if __name__ == "__main__":
    main()
