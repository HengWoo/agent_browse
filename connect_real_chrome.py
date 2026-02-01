#!/usr/bin/env python3
"""
Connect to your REAL Chrome browser (where you're already logged in).

STEP 1: Close Chrome completely, then relaunch with debugging:

    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
        --remote-debugging-port=9222

STEP 2: Login to Meituan manually in that Chrome

STEP 3: Run this script to connect and automate

This uses YOUR real browser - same fingerprint, same session, same everything.
"""

from patchright.sync_api import sync_playwright


def main():
    print("[*] Connecting to Chrome on port 9222...")
    print("[!] Make sure Chrome is running with --remote-debugging-port=9222")

    with sync_playwright() as p:
        try:
            # Connect to existing Chrome
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
            print("[✓] Connected to Chrome!")

            # List all open tabs
            contexts = browser.contexts
            print(f"[*] Found {len(contexts)} browser context(s)")

            for ctx_idx, ctx in enumerate(contexts):
                pages = ctx.pages
                print(f"\n[Context {ctx_idx}] {len(pages)} tab(s):")
                for page_idx, page in enumerate(pages):
                    print(f"  [{page_idx}] {page.url[:80]}...")

            # Find Meituan tab or use first page
            target_page = None
            for ctx in contexts:
                for page in ctx.pages:
                    if "meituan" in page.url.lower():
                        target_page = page
                        print(f"\n[✓] Found Meituan tab: {page.url}")
                        break
                if target_page:
                    break

            if not target_page:
                # Use first available page
                if contexts and contexts[0].pages:
                    target_page = contexts[0].pages[0]
                    print(f"\n[*] No Meituan tab found, using: {target_page.url}")
                else:
                    print("[!] No pages found. Open a tab in Chrome first.")
                    return

            # Now you can automate!
            print("\n[*] Ready to automate. Example actions:")
            print("    target_page.goto('https://pos.meituan.com/...')")
            print("    target_page.click('button')")
            print("    target_page.screenshot(path='test.png')")

            # Take a screenshot as proof
            target_page.screenshot(path="real_chrome_screenshot.png")
            print("\n[✓] Screenshot saved: real_chrome_screenshot.png")

            # Keep connection open for interactive use
            print("\n[*] Connection open. Press Enter to disconnect...")
            input()

        except Exception as e:
            if "9222" in str(e) or "connect" in str(e).lower():
                print(f"\n[!] Cannot connect to Chrome.")
                print("[!] Make sure Chrome is running with remote debugging:")
                print()
                print('    /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\')
                print('        --remote-debugging-port=9222')
                print()
            else:
                raise e


if __name__ == "__main__":
    main()
