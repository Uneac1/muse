import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import Error, Page, TimeoutError, sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


ROUTES = [
    {
        "path": "/newspaper/read?url=https%3A%2F%2Fexample.com%2Farticle&source=Smoke&title=Smoke%20Article&titleZh=冒烟文章&summary=Smoke%20summary&summaryZh=冒烟摘要",
        "heading": "冒烟文章",
        "fallback_texts": ["双语阅读模式", "正文抓取失败，当前已自动降级为分模块阅读状态，不影响继续阅读。", "正文抓取失败，当前已自动降级为摘要模式"],
        "copilot": "报纸阅读器",
    },
    {
        "path": "/ai",
        "heading": "把 AI 账号、诊断、模型和对话全部拉到一个台面上",
        "fallback_texts": ["还没有 AI 账号，先添加一个开始。", "加载 AI 账号失败"],
    },
    {
        "path": "/linuxdo",
        "heading": "Linux.do 登录接入",
        "fallback_texts": ["当前授权身份", "会话状态"],
    },
    {
        "path": "/today",
        "heading": "Today",
        "fallback_texts": ["正在汇总你的下一步...", "加载失败"],
    },
    {
        "path": "/inbox",
        "heading": "Inbox",
        "fallback_texts": ["正在加载 Inbox...", "加载失败"],
    },
    {
        "path": "/newspaper",
        "heading": "报纸 / Signal Reader",
        "fallback_texts": ["报纸加载失败 / Load failed", "AI 总编台"],
        "copilot": "报纸",
    },
]

IGNORED_CONSOLE_ERRORS = (
    "Failed to load resource: the server responded with a status of 404",
)

IGNORED_REQUEST_FAILURES = (
    "ERR_ABORTED",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a browser smoke test against key Muse routes.")
    parser.add_argument("--base-url", default="http://127.0.0.1:3015", help="Base URL for the running Muse app.")
    parser.add_argument(
        "--artifacts-dir",
        default=str(Path(__file__).resolve().parents[1] / "artifacts" / "ui-smoke"),
        help="Directory to write failure screenshots into.",
    )
    parser.add_argument(
        "--route",
        action="append",
        default=[],
        help="Limit smoke checks to routes whose path starts with this value. Can be repeated.",
    )
    parser.add_argument(
        "--route-exact",
        action="append",
        default=[],
        help="Limit smoke checks to exact route paths. Can be repeated.",
    )
    parser.add_argument(
        "--debug-nav",
        action="store_true",
        help="Print navigation request/response events for route timeout debugging.",
    )
    return parser.parse_args()


def is_ignored_console_error(message: str) -> bool:
    return any(fragment in message for fragment in IGNORED_CONSOLE_ERRORS)


def is_ignored_request_failure(message: str) -> bool:
    return any(fragment in message for fragment in IGNORED_REQUEST_FAILURES)


def wait_for_main_ready(page: Page) -> None:
    page.locator("main").wait_for(state="visible", timeout=15000)
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except TimeoutError:
        page.wait_for_timeout(800)


def wait_for_app_ready(base_url: str, timeout_seconds: int = 30) -> None:
    deadline = time.time() + timeout_seconds
    last_error = "application did not become ready"

    while time.time() < deadline:
        try:
            with urlopen(f"{base_url}/api/auth/check", timeout=3) as response:
                if response.status == 200:
                    return
                last_error = f"unexpected status: {response.status}"
        except URLError as error:
            last_error = str(error)
        except OSError as error:
            last_error = str(error)
        time.sleep(0.5)

    raise TimeoutError(f"Timed out waiting for {base_url}/api/auth/check: {last_error}")


def expect_route_signal(page: Page, heading: str, fallback_texts: list[str]) -> str:
    main = page.locator("main")

    try:
        heading_locator = main.get_by_role("heading", name=heading, exact=True)
        heading_locator.first.wait_for(state="visible", timeout=2500)
        return heading
    except (TimeoutError, Error):
        pass

    deadline = time.time() + 15
    while time.time() < deadline:
        for text in fallback_texts:
            locator = main.get_by_text(text, exact=False).first
            try:
                if locator.is_visible(timeout=250):
                    return text
            except Error:
                continue
        time.sleep(0.25)

    raise AssertionError(f"Route did not expose expected UI signal. heading={heading!r} fallback_texts={fallback_texts!r}")


def take_failure_screenshot(page: Page, artifacts_dir: Path, path: str) -> str:
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]+", "_", path.strip("/").replace("/", "_")) or "root"
    target = artifacts_dir / f"{safe_name}-failure.png"
    try:
        page.screenshot(path=str(target), full_page=False, timeout=5000)
        return str(target)
    except Exception as error:
        return f"screenshot unavailable: {error}"


def verify_copilot(page: Page, section_title: str) -> str:
    button = page.get_by_role("button", name="区块 AI", exact=True).first
    button.wait_for(state="visible", timeout=5000)
    button.click()
    dialog = page.get_by_role("dialog")
    dialog.wait_for(state="visible", timeout=5000)
    dialog.get_by_text("Muse Copilot", exact=False).first.wait_for(state="visible", timeout=5000)
    dialog.get_by_role("heading", name=section_title, exact=True).wait_for(state="visible", timeout=5000)
    dialog.get_by_role("button", name="新对话", exact=True).wait_for(state="visible", timeout=5000)
    page.get_by_label("关闭 Muse Copilot").click()
    dialog.wait_for(state="hidden", timeout=5000)
    return section_title


def mock_api_route(route) -> None:
    parsed = urlparse(route.request.url)
    path = parsed.path

    data: Any
    if path == "/api/auth/check":
        data = {"required": False, "googleOAuthEnabled": False}
    elif path == "/api/ai/accounts":
        data = []
    elif path == "/api/newspaper/briefing":
        data = {
            "generatedAt": "2026-04-23T00:00:00.000Z",
            "cacheTtlMinutes": 15,
            "totalItems": 0,
            "totalSources": 0,
            "sections": [],
        }
    elif path == "/api/newspaper/health":
        data = {
            "ok": True,
            "featureVersion": "smoke",
            "generatedAt": "2026-04-23T00:00:00.000Z",
            "capabilities": {
                "briefing": True,
                "articleReader": True,
                "articleInsight": True,
                "briefingInsight": True,
                "images": True,
                "replies": True,
                "aiAccountPool": True,
            },
            "ai": {
                "activeAccountCount": 0,
                "defaultAccountId": None,
                "defaultAccountName": "",
                "defaultModel": "",
            },
        }
    elif path == "/api/newspaper/article":
        data = {
            "url": "https://example.com/article",
            "source": "Smoke",
            "domain": "example.com",
            "publishedAt": "2026-04-23T00:00:00.000Z",
            "title": "Smoke Article",
            "titleZh": "冒烟文章",
            "summary": "Smoke summary",
            "summaryZh": "冒烟摘要",
            "images": [],
            "originalContent": "Smoke Article\n\nSmoke summary",
            "translatedContent": "冒烟文章\n\n冒烟摘要",
            "replies": [],
            "replyCount": 0,
            "extractedAt": "2026-04-23T00:00:00.000Z",
            "translationMode": "fallback",
        }
    elif path == "/api/newspaper/insight":
        data = {
            "accountId": 0,
            "accountName": "Local fallback",
            "model": "fallback",
            "summary": "冒烟导读",
            "takeaways": ["信号"],
            "risks": ["风险"],
            "questions": ["问题"],
            "actions": ["动作"],
            "generatedAt": "2026-04-23T00:00:00.000Z",
        }
    elif path == "/api/oauth/status":
        data = {
            "googleConfigured": False,
            "openaiConfigured": False,
            "linuxDoConfigured": False,
            "googleClientId": "",
            "googleProjectId": "",
        }
    elif path == "/api/integrations/linuxdo":
        data = {
            "connected": False,
            "clientConfigured": False,
            "tokenMasked": "",
            "lastSyncAt": None,
            "expiresAt": None,
            "scopes": [],
            "user": None,
        }
    elif path == "/api/os/workspace":
        data = {
            "today": {
                "headline": "Today",
                "summary": "Smoke workspace",
                "questions": [],
                "priorities": [],
                "anomalies": [],
                "highlights": [],
            },
            "inbox": [],
            "alerts": [],
            "entities": [],
            "rules": [],
            "memory": [],
            "commandCenter": [],
            "stats": {
                "inboxCount": 0,
                "alertCount": 0,
                "entityCount": 0,
                "pinnedMemoryCount": 0,
                "ruleCount": 0,
            },
            "generatedAt": "2026-04-23T00:00:00.000Z",
        }
    else:
        data = {}

    route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({"code": 200, "message": "success", "data": data}, ensure_ascii=False),
    )


def fulfill_empty_asset(route) -> None:
    route.fulfill(status=204, body="")


def main() -> int:
    args = parse_args()
    artifacts_dir = Path(args.artifacts_dir)
    issues: list[dict[str, Any]] = []
    route_results: list[dict[str, Any]] = []
    current_route = {"path": "<boot>"}

    with sync_playwright() as playwright:
        wait_for_app_ready(args.base_url)

        def record_issue(kind: str, message: str, url: str | None = None) -> None:
            issues.append(
                {
                    "route": current_route["path"],
                    "kind": kind,
                    "message": message,
                    "url": url,
                }
            )

        selected_routes = [
            route
            for route in ROUTES
            if (
                (not args.route and not args.route_exact)
                or any(route["path"].startswith(prefix) for prefix in args.route)
                or route["path"] in args.route_exact
            )
        ]

        def open_session():
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 960})
            context.add_init_script(
                """
                window.requestIdleCallback = (callback) => window.setTimeout(
                  () => callback({ didTimeout: false, timeRemaining: () => 0 }),
                  60000
                );
                window.cancelIdleCallback = (id) => window.clearTimeout(id);
                """
            )
            page = context.new_page()
            page.set_default_timeout(15000)
            page.route(f"{args.base_url}/api/**", mock_api_route)
            page.route("https://fonts.googleapis.com/**", fulfill_empty_asset)
            page.route("https://fonts.gstatic.com/**", fulfill_empty_asset)
            page.on(
                "console",
                lambda msg: record_issue("console", msg.text, msg.location.get("url"))
                if msg.type == "error" and not is_ignored_console_error(msg.text)
                else None,
            )
            page.on("pageerror", lambda err: record_issue("pageerror", str(err)))
            page.on(
                "requestfailed",
                lambda request: record_issue("requestfailed", request.failure or "request failed", request.url)
                if request.url.startswith(args.base_url)
                and not is_ignored_request_failure(request.failure or "")
                else None,
            )
            if args.debug_nav:
                page.on(
                    "request",
                    lambda request: print(f"[ui-smoke:request] {current_route['path']} {request.method} {request.url} {request.resource_type}", flush=True)
                    if request.url.startswith(args.base_url)
                    else None,
                )
                page.on(
                    "response",
                    lambda response: print(f"[ui-smoke:response] {current_route['path']} {response.status} {response.url}", flush=True)
                    if response.url.startswith(args.base_url)
                    else None,
                )
            return browser, context, page

        browser, context, page = open_session()

        try:
            for route in selected_routes:
                current_route["path"] = route["path"]
                if route_results:
                    context.close()
                    browser.close()
                    browser, context, page = open_session()
                try:
                    if page.url != "about:blank":
                        page.goto("about:blank", wait_until="commit", timeout=10000)
                    page.goto(f"{args.base_url}{route['path']}", wait_until="commit", timeout=30000)
                    wait_for_main_ready(page)
                    visible_signal = expect_route_signal(page, route["heading"], route["fallback_texts"])
                    copilot_signal = verify_copilot(page, route["copilot"]) if route.get("copilot") else None
                    page.wait_for_timeout(500)
                    route_results.append(
                        {
                            "path": route["path"],
                            "signal": visible_signal,
                            "copilot": copilot_signal,
                            "title": page.title(),
                        }
                    )
                except Exception as error:
                    screenshot_path = take_failure_screenshot(page, artifacts_dir, route["path"])
                    record_issue("assertion", str(error), screenshot_path)
                    print(json.dumps({"ok": False, "routes": route_results, "issues": issues}, ensure_ascii=False, indent=2))
                    return 1
        finally:
            context.close()
            browser.close()

    ok = not issues
    print(
        json.dumps(
            {
                "ok": ok,
                "routes": route_results,
                "issues": issues,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
