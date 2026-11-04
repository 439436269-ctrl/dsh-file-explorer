"""Headless end-to-end check of dsh-file-explorer against a scratch profile.

Usage:
  python verify_ui.py <base-url-with-token> <screenshot-dir>
"""

import json
import sys

from playwright.sync_api import sync_playwright

if len(sys.argv) < 2:
    raise SystemExit("usage: python verify_ui.py <base-url-with-token> [screenshot-dir]")

URL = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "."

report = {"steps": [], "errors": [], "console": []}


def step(name, ok, detail=None):
    report["steps"].append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + ("" if detail is None else " :: " + str(detail)[:400]))
    return ok


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    context = browser.new_context(viewport={"width": 1500, "height": 940}, device_scale_factor=1)
    page = context.new_page()
    page.on("console", lambda message: report["console"].append(message.type + ": " + message.text))
    page.on("pageerror", lambda error: report["errors"].append(str(error)))

    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(6000)

    # A fresh profile greets with the preview notice; dismiss it so the rail is clickable.
    for label in ["继续", "Continue", "Got it"]:
        button = page.locator("button", has_text=label).first
        if button.count() > 0:
            button.click()
            page.wait_for_timeout(900)
            break
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    step("shell rendered", page.locator("body").inner_text().strip() != "", page.title())
    page.screenshot(path=OUT + r"\01-boot.png")

    bundle_injected = page.evaluate(
        "() => Array.from(document.scripts).some(s => (s.src || '').includes('dsh-file-explorer')) "
        "|| JSON.stringify(window.__DSH_BOOT__ || {}).includes('dsh-file-explorer')"
    )
    step("client bundle listed in boot graph", bundle_injected)

    buttons = page.evaluate(
        "() => Array.from(document.querySelectorAll('button,[role=button]')).map(el => ({"
        "  text: (el.textContent || '').trim().slice(0, 40),"
        "  title: el.getAttribute('title') || '',"
        "  aria: el.getAttribute('aria-label') || '',"
        "  cls: (el.className || '').toString().slice(0, 80)"
        "}))"
    )
    report["buttons"] = buttons[:60]

    target = None
    for index, item in enumerate(buttons):
        label = (item["aria"] + " " + item["title"] + " " + item["text"]).lower()
        if "文件浏览" in label or "explorer" in label:
            target = index
            break
    if not step("rail icon present", target is not None, [b for b in buttons if "文件" in (b["aria"] + b["title"] + b["text"])]):
        page.screenshot(path=OUT + r"\02-no-icon.png")
        print(json.dumps(report, ensure_ascii=False)[:4000])
        browser.close()
        sys.exit(2)

    page.locator("button,[role=button]").nth(target).click(force=True)
    page.wait_for_timeout(2500)
    step("panel mounted", page.locator("[data-fe-root]").count() == 1)
    page.screenshot(path=OUT + r"\02-panel.png")

    rows = page.eval_on_selector_all("[data-fe-root] .fe-row .fe-name", "els => els.map(e => e.textContent)")
    step("tree rows rendered", len(rows) > 0, rows[:12])

    api = page.evaluate(
        """async () => {
            const r = await fetch('/api/file-explorer?op=roots', { cache: 'no-store' });
            const body = await r.json();
            return { status: r.status, body };
        }"""
    )
    step("roots api answers", api["status"] == 200 and api["body"].get("ok") is True, api["body"].get("roots"))

    # Expand the project folder, then open package.json.
    folder = page.locator("[data-fe-root] .fe-row", has_text="dsh-file-explorer").first
    if folder.count() > 0:
        folder.click()
        page.wait_for_timeout(1200)
        page.screenshot(path=OUT + r"\03-expanded.png")

    target_file = page.locator("[data-fe-root] .fe-row", has_text="package.json").first
    if step("package.json reachable", target_file.count() > 0):
        target_file.click()
        page.wait_for_timeout(1800)
        code = page.eval_on_selector("[data-fe-root] .fe-code", "el => el.innerText") if page.locator("[data-fe-root] .fe-code").count() else ""
        step("text preview shows content", '"name": "@vfvrpq/dsh-file-explorer"' in code, code[:160])
        step("line numbers present", page.locator("[data-fe-root] .fe-ln").count() > 3, page.locator("[data-fe-root] .fe-ln").count())
        page.screenshot(path=OUT + r"\04-file-text.png")

    # Markdown preview.
    readme = page.locator("[data-fe-root] .fe-row", has_text="README.md").first
    if step("README.md reachable", readme.count() > 0):
        readme.click()
        page.wait_for_timeout(1800)
        has_heading = page.locator("[data-fe-root] .fe-md h1, [data-fe-root] .fe-md h2").count() > 0
        step("markdown preview rendered", has_heading, page.locator("[data-fe-root] .fe-md").count())
        inline_image = page.evaluate(
            """() => {
                const img = document.querySelector('[data-fe-root] .fe-md img');
                return img ? { w: img.naturalWidth, src: img.getAttribute('src') } : null;
            }"""
        )
        step("markdown relative image decoded", inline_image is not None and inline_image["w"] > 0, inline_image)
        page.screenshot(path=OUT + r"\05-markdown.png")

        source_toggle = page.locator("[data-fe-root] .fe-crumbs button", has_text="源码").first
        if source_toggle.count() > 0:
            source_toggle.click()
            page.wait_for_timeout(900)
            step("markdown source toggle works", page.locator("[data-fe-root] .fe-code").count() == 1)
            page.locator("[data-fe-root] .fe-crumbs button", has_text="预览").first.click()
            page.wait_for_timeout(700)

    # Image preview: a broken element counts as a broken preview, so read naturalWidth.
    dev_row = page.locator("[data-fe-root] .fe-row", has_text="dev").first
    if dev_row.count() > 0:
        dev_row.click()
        page.wait_for_timeout(1200)
        png = page.locator("[data-fe-root] .fe-row", has_text="02-panel.png").first
        if step("png reachable", png.count() > 0):
            png.click()
            page.wait_for_timeout(2000)
            image = page.evaluate(
                """() => {
                    const img = document.querySelector('[data-fe-root] .fe-image img');
                    if (!img) return null;
                    return { w: img.naturalWidth, h: img.naturalHeight, complete: img.complete, src: img.getAttribute('src') };
                }"""
            )
            step("image preview decoded", image is not None and image["w"] > 0, image)
            page.screenshot(path=OUT + r"\05b-image.png")

    # Breadcrumb + status bar follow the active tab.
    active_tab = page.eval_on_selector_all("[data-fe-root] .fe-tab.is-active .fe-tab-name", "els => els.map(e => e.textContent).join('')")
    status_text = page.eval_on_selector_all("[data-fe-root] .fe-status-path", "els => els.map(e => e.textContent).join(' ')")
    step("status bar follows the active file", active_tab != "" and active_tab in status_text, {"tab": active_tab, "status": status_text})

    # Search.
    search = page.locator("[data-fe-root] input[type=search]")
    if search.count() > 0:
        search.fill("client")
        page.wait_for_timeout(3600)
        hits = page.eval_on_selector_all("[data-fe-root] .fe-row .fe-name", "els => els.map(e => e.textContent)")
        step("search returns hits", len(hits) > 0, hits[:6])
        page.screenshot(path=OUT + r"\06-search.png")
        search.fill("")
        page.wait_for_timeout(800)

    # Escape hatch: reload keeps the panel working.
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(5000)
    step("survives reload", page.locator("body").inner_text().strip() != "")

    browser.close()

print("\n--- console tail ---")
for line in report["console"][-15:]:
    print(line)
print("--- page errors ---")
for line in report["errors"][:10]:
    print(line)
print("\nSUMMARY " + json.dumps({s["name"]: s["ok"] for s in report["steps"]}, ensure_ascii=False))
failures = [s for s in report["steps"] if not s["ok"]]
sys.exit(0 if not failures else 3)
