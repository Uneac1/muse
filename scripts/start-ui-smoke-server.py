import argparse
import os
import signal
import subprocess
import sys
from pathlib import Path
from contextlib import suppress


def cleanup_server_processes(repo_root: Path) -> None:
    cleanup_script = repo_root / "scripts" / "cleanup-server-processes.js"
    with suppress(Exception):
        subprocess.run(
            ["node", str(cleanup_script), "--quiet"],
            cwd=repo_root,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the Muse server for UI smoke tests.")
    parser.add_argument("--port", type=int, default=3015, help="Port to bind the smoke test server to.")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    server_entry = repo_root / "server" / "dist" / "server.js"
    cleanup_server_processes(repo_root)

    env = os.environ.copy()
    env["PORT"] = str(args.port)
    env["ACCESS_PASSWORD"] = ""
    env["ADMIN_GOOGLE_CLIENT_ID"] = ""
    env["ADMIN_GOOGLE_CLIENT_SECRET"] = ""

    process = subprocess.Popen(
        ["node", str(server_entry)],
        cwd=repo_root,
        env=env,
    )

    def forward_shutdown(*_args) -> None:
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=8)
        cleanup_server_processes(repo_root)
        raise SystemExit(process.returncode or 0)

    signal.signal(signal.SIGTERM, forward_shutdown)
    if hasattr(signal, "SIGINT"):
        signal.signal(signal.SIGINT, forward_shutdown)

    try:
        raise SystemExit(process.wait())
    except KeyboardInterrupt:
        forward_shutdown()
    finally:
        cleanup_server_processes(repo_root)


if __name__ == "__main__":
    main()
