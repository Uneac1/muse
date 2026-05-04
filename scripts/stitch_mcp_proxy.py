#!/usr/bin/env python3
"""Stitch MCP stdio proxy that avoids Node child_process on Windows.

The published stitch-mcp package shells out to gcloud from Node to get an
access token. In the Codex Windows sandbox, Node child_process can be blocked
with EPERM, while Python subprocess still works. This server implements the
small MCP stdio surface needed by Codex and forwards Stitch tool requests to
https://stitch.googleapis.com/mcp.
"""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


STITCH_URL = "https://stitch.googleapis.com/mcp"
DEFAULT_PROJECT = "ymail-493905"
DEFAULT_CLOUDSDK = r"C:\Users\1\AppData\Local\Temp\CloudSDK\google-cloud-sdk\bin\gcloud.cmd"
DEFAULT_CLOUDSDK_CONFIG = r"C:\Users\1\AppData\Local\Temp\gcloud-config"
TIMEOUT_SECONDS = 180


def log(message: str) -> None:
    print(f"[stitch-python-mcp] {message}", file=sys.stderr, flush=True)


def write_message(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def success(request_id: Any, result: Any) -> None:
    write_message({"jsonrpc": "2.0", "id": request_id, "result": result})


def error(request_id: Any, code: int, message: str, data: Any | None = None) -> None:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    write_message({"jsonrpc": "2.0", "id": request_id, "error": err})


def command_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("CLOUDSDK_CONFIG", DEFAULT_CLOUDSDK_CONFIG)
    env.setdefault("GOOGLE_CLOUD_PROJECT", DEFAULT_PROJECT)
    sdk_bin = str(Path(DEFAULT_CLOUDSDK).parent)
    env["PATH"] = sdk_bin + os.pathsep + env.get("PATH", "")
    return env


def run_gcloud(args: list[str]) -> str:
    gcloud = os.environ.get("GCLOUD_CMD", DEFAULT_CLOUDSDK)
    completed = subprocess.run(
        [gcloud, *args],
        env=command_env(),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout).strip())
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def get_project_id() -> str:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")
    if project:
        return project
    project = run_gcloud(["config", "get-value", "project"])
    if project and project != "(unset)":
        return project
    raise RuntimeError("Project ID not found. Set GOOGLE_CLOUD_PROJECT.")


def get_access_token() -> str:
    token = os.environ.get("GOOGLE_OAUTH_ACCESS_TOKEN") or os.environ.get("STITCH_ACCESS_TOKEN")
    if token:
        return token
    return run_gcloud(["auth", "application-default", "print-access-token"])


def sanitize_schema(obj: Any) -> Any:
    if isinstance(obj, list):
        return [sanitize_schema(item) for item in obj]
    if isinstance(obj, dict):
        return {key: sanitize_schema(value) for key, value in obj.items() if not key.startswith("x-")}
    return obj


def http_json(url: str, body: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {payload}") from exc


def http_get(url: str) -> tuple[bytes, str]:
    request = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read(), response.headers.get("Content-Type", "application/octet-stream")


def call_stitch(method: str, params: dict[str, Any], project_id: str) -> dict[str, Any]:
    token = get_access_token()
    body = {"jsonrpc": "2.0", "method": method, "params": params, "id": int(time.time() * 1000)}
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Goog-User-Project": project_id,
        "Content-Type": "application/json",
    }
    return http_json(STITCH_URL, body, headers)


def find_first(obj: Any, predicate) -> Any | None:
    if predicate(obj):
        return obj
    if isinstance(obj, dict):
        for value in obj.values():
            found = find_first(value, predicate)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for value in obj:
            found = find_first(value, predicate)
            if found is not None:
                return found
    return None


def inject_download_content(obj: Any) -> None:
    if isinstance(obj, dict):
        url = obj.get("downloadUrl")
        if isinstance(url, str):
            try:
                payload, content_type = http_get(url)
                if content_type.startswith("text/") or b"\x00" not in payload[:2048]:
                    obj["content"] = payload.decode("utf-8", errors="replace")
            except Exception as exc:  # Best effort, keep original result.
                log(f"downloadUrl fetch skipped: {exc}")
        for value in obj.values():
            inject_download_content(value)
    elif isinstance(obj, list):
        for value in obj:
            inject_download_content(value)


CUSTOM_TOOLS: list[dict[str, Any]] = [
    {
        "name": "fetch_screen_code",
        "description": "Retrieves the actual HTML/code content of a Stitch screen.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": {"type": "string", "description": "The Stitch project ID."},
                "screenId": {"type": "string", "description": "The Stitch screen ID."},
            },
            "required": ["projectId", "screenId"],
        },
    },
    {
        "name": "fetch_screen_image",
        "description": "Retrieves the screenshot/preview image of a Stitch screen.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": {"type": "string", "description": "The Stitch project ID."},
                "screenId": {"type": "string", "description": "The Stitch screen ID."},
            },
            "required": ["projectId", "screenId"],
        },
    },
    {
        "name": "extract_design_context",
        "description": "Extracts reusable design tokens and component context from a Stitch screen.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "projectId": {"type": "string", "description": "The Stitch project ID."},
                "screenId": {"type": "string", "description": "The Stitch screen ID."},
            },
            "required": ["projectId", "screenId"],
        },
    },
]


def list_tools(project_id: str) -> dict[str, Any]:
    try:
        result = call_stitch("tools/list", {}, project_id)
        raw_tools = result.get("result", {}).get("tools", [])
        tools = []
        for tool in raw_tools:
            copied = dict(tool)
            if "inputSchema" in copied:
                copied["inputSchema"] = sanitize_schema(copied["inputSchema"])
            if "outputSchema" in copied:
                copied["outputSchema"] = sanitize_schema(copied["outputSchema"])
            tools.append(copied)
        return {"tools": [*tools, *CUSTOM_TOOLS]}
    except Exception as exc:
        log(f"tools/list failed; returning custom tools only: {exc}")
        return {"tools": CUSTOM_TOOLS}


def get_screen(project_id_arg: str, screen_id: str, server_project_id: str) -> dict[str, Any]:
    result = call_stitch(
        "tools/call",
        {"name": "get_screen", "arguments": {"projectId": project_id_arg, "screenId": screen_id}},
        server_project_id,
    )
    if "error" in result:
        raise RuntimeError(result["error"].get("message", json.dumps(result["error"])))
    return result.get("result", {})


def handle_custom_tool(name: str, args: dict[str, Any], server_project_id: str) -> dict[str, Any] | None:
    if name not in {"fetch_screen_code", "fetch_screen_image", "extract_design_context"}:
        return None

    project_id_arg = args.get("projectId")
    screen_id = args.get("screenId")
    if not project_id_arg or not screen_id:
        return {"content": [{"type": "text", "text": "projectId and screenId are required."}], "isError": True}

    try:
        screen = get_screen(project_id_arg, screen_id, server_project_id)

        if name == "fetch_screen_code":
            html_node = find_first(screen, lambda value: isinstance(value, dict) and value.get("htmlCode", {}).get("content"))
            if html_node:
                return {"content": [{"type": "text", "text": html_node["htmlCode"]["content"]}]}
            download_node = find_first(screen, lambda value: isinstance(value, dict) and isinstance(value.get("downloadUrl"), str))
            if not download_node:
                return {"content": [{"type": "text", "text": "No code download URL found."}], "isError": True}
            payload, _ = http_get(download_node["downloadUrl"])
            return {"content": [{"type": "text", "text": payload.decode("utf-8", errors="replace")}]}

        if name == "fetch_screen_image":
            def is_image_node(value: Any) -> bool:
                if not isinstance(value, dict):
                    return False
                url = value.get("downloadUrl") or value.get("uri")
                label = str(value.get("name", ""))
                return isinstance(url, str) and (
                    ".png" in url or ".jpg" in url or ".jpeg" in url or re.search(r"\.(png|jpe?g)", label, re.I)
                )

            image_node = find_first(screen, lambda value: isinstance(value, dict) and isinstance(value.get("screenshot"), dict) and value["screenshot"].get("downloadUrl"))
            image_url = image_node["screenshot"]["downloadUrl"] if image_node else None
            if not image_url:
                node = find_first(screen, is_image_node)
                image_url = node.get("downloadUrl") or node.get("uri") if node else None
            if not image_url:
                return {"content": [{"type": "text", "text": "No image URL found."}], "isError": True}
            payload, content_type = http_get(image_url)
            mime = content_type.split(";")[0] if content_type else "image/png"
            return {
                "content": [
                    {"type": "text", "text": f"Image fetched for screen {screen_id}."},
                    {"type": "image", "data": base64.b64encode(payload).decode("ascii"), "mimeType": mime},
                ]
            }

        html_node = find_first(screen, lambda value: isinstance(value, dict) and value.get("htmlCode", {}).get("content"))
        html = html_node["htmlCode"]["content"] if html_node else ""
        if not html:
            return {"content": [{"type": "text", "text": "HTML content not found in screen data."}], "isError": True}

        prompt = "Based on the following design system:\n\n"
        match = re.search(r"tailwind\.config\s*=\s*({[\s\S]*?})\s*</script>", html)
        if match:
            prompt += "### Design Tokens (Tailwind)\nUse these EXACT colors and fonts:\n```json\n"
            prompt += re.sub(r"\s+", " ", match.group(1)).strip()
            prompt += "\n```\n\n"
        sections = [
            ("Header/TopBar", r"<!--\s*TopAppBar\s*-->([\s\S]*?)<!--"),
            ("Bottom Navigation", r"<!--\s*BottomNavigation\s*-->([\s\S]*?)<!--"),
            ("Floating Action Button", r"<!--\s*Floating Action Button\s*-->([\s\S]*?)</div>"),
        ]
        found = 0
        for label, pattern in sections:
            section = re.search(pattern, html)
            if section:
                found += 1
                prompt += f"### {label} Style\nReplicate this structure:\n```html\n{section.group(1).strip()}\n```\n\n"
        if found == 0:
            prompt += "### UI Style\nNo explicit Header or Nav comments found. Refer to the screen for layout.\n"
        return {"content": [{"type": "text", "text": prompt}]}
    except Exception as exc:
        return {"content": [{"type": "text", "text": f"Error: {exc}"}], "isError": True}


def call_tool(name: str, args: dict[str, Any], project_id: str) -> dict[str, Any]:
    custom = handle_custom_tool(name, args, project_id)
    if custom is not None:
        return custom

    result = call_stitch("tools/call", {"name": name, "arguments": args or {}}, project_id)
    if "error" in result:
        return {"content": [{"type": "text", "text": f"API Error: {result['error'].get('message')}"}], "isError": True}
    payload = result.get("result", result)
    inject_download_content(payload)
    if isinstance(payload, dict) and isinstance(payload.get("content"), list):
        return payload
    return {"content": [{"type": "text", "text": json.dumps(payload, indent=2, ensure_ascii=False)}]}


def handle_request(message: dict[str, Any], project_id: str) -> None:
    request_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}

    if request_id is None:
        return

    try:
        if method == "initialize":
            success(
                request_id,
                {
                    "protocolVersion": params.get("protocolVersion", "2024-11-05"),
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "stitch-python-proxy", "version": "1.0.0"},
                },
            )
        elif method == "ping":
            success(request_id, {})
        elif method == "tools/list":
            success(request_id, list_tools(project_id))
        elif method == "tools/call":
            success(request_id, call_tool(params.get("name", ""), params.get("arguments") or {}, project_id))
        elif method == "resources/list":
            success(request_id, {"resources": []})
        elif method == "prompts/list":
            success(request_id, {"prompts": []})
        else:
            error(request_id, -32601, f"Method not found: {method}")
    except Exception as exc:
        log(traceback.format_exc())
        error(request_id, -32603, str(exc))


def main() -> int:
    try:
        project_id = get_project_id()
        token = get_access_token()
        if not token:
            raise RuntimeError("Could not obtain Google application-default access token.")
        log(f"ready for project {project_id}")
    except Exception as exc:
        log(f"fatal startup error: {exc}")
        return 1

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            handle_request(json.loads(line), project_id)
        except Exception as exc:
            log(f"bad input: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
