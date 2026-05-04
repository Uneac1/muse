import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return sock.getsockname()[1]


def wait_for_app_ready(base_url: str, server: subprocess.Popen, timeout_seconds: int = 30) -> None:
    deadline = time.time() + timeout_seconds
    last_error = "application did not become ready"

    while time.time() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f"UI smoke server exited early with code {server.returncode}")
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


def stop_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return

    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=8)


def tail_file(path: Path, line_count: int = 80) -> str:
    if not path.exists():
        return ""

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        lines = handle.readlines()
    return "".join(lines[-line_count:]).strip()


def cleanup_log_file(path: Path, attempts: int = 6, delay_seconds: float = 0.25) -> bool:
    for attempt in range(attempts):
        try:
            path.unlink(missing_ok=True)
            return True
        except PermissionError:
            if attempt == attempts - 1:
                return False
            time.sleep(delay_seconds)
    return False


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    python_exe = sys.executable
    start_script = repo_root / "scripts" / "start-ui-smoke-server.py"
    verify_script = repo_root / "scripts" / "verify-ui-smoke.py"
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    verify_args = sys.argv[1:]
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    log_dir = repo_root / "artifacts" / "ui-smoke"
    log_dir.mkdir(parents=True, exist_ok=True)
    fd, raw_log_path = tempfile.mkstemp(prefix="server-", suffix=".log", dir=log_dir)
    os.close(fd)
    log_file = Path(raw_log_path)
    log_handle = log_file.open("w", encoding="utf-8")
    server = subprocess.Popen(
        [python_exe, str(start_script), "--port", str(port)],
        cwd=repo_root,
        env=env,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
    )
    should_cleanup_log = False

    try:
        wait_for_app_ready(base_url, server)
        completed = subprocess.run(
            [python_exe, str(verify_script), "--base-url", base_url, *verify_args],
            cwd=repo_root,
            env=env,
        )
        if completed.returncode == 0:
            should_cleanup_log = True
        return completed.returncode
    except Exception as error:
        if not log_handle.closed:
            log_handle.flush()
            log_handle.close()
        excerpt = tail_file(log_file)
        print(f"[ui-smoke] {error}", file=sys.stderr)
        if excerpt:
            print("[ui-smoke] server log tail:", file=sys.stderr)
            print(excerpt, file=sys.stderr)
        print(f"[ui-smoke] full server log: {log_file}", file=sys.stderr)
        return 1
    finally:
        stop_process(server)
        if not log_handle.closed:
            log_handle.close()
        if should_cleanup_log:
            cleanup_log_file(log_file)


if __name__ == "__main__":
    raise SystemExit(main())
