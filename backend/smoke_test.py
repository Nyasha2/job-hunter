#!/usr/bin/env python3
"""Smoke test for Job Hunter backend + office wiring.

Run from job_hunter/backend after creating .venv and installing requirements:
    .venv/bin/python smoke_test.py
Optional — also hit a live API server:
    .venv/bin/python smoke_test.py --api http://127.0.0.1:8001
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
APP_ROOT = BACKEND_DIR.parent
OFFICE_DIR = APP_ROOT / "office" / "job_hunter"
PYTHON = BACKEND_DIR / ".venv" / "bin" / "python"
MIN_DISSYSLAB = (1, 4, 0)


def _fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def _ok(msg: str) -> None:
    print(f"OK: {msg}")


def _version_tuple(version: str) -> tuple[int, ...]:
    parts: list[int] = []
    for piece in version.strip().split("."):
        try:
            parts.append(int(piece))
        except ValueError:
            break
    return tuple(parts)


def _run_office_smoke() -> None:
    if not PYTHON.is_file():
        _fail(f"venv python not found at {PYTHON}")

    ver_out = subprocess.check_output(
        [str(PYTHON), "-c", "import importlib.metadata as m; print(m.version('dissyslab'))"],
        text=True,
    ).strip()
    if _version_tuple(ver_out) < MIN_DISSYSLAB:
        _fail(f"dissyslab {ver_out} in venv — need >= {'.'.join(map(str, MIN_DISSYSLAB))}")

    _ok(f"dissyslab {ver_out} in venv")

    build = subprocess.run(
        [str(PYTHON), "-m", "dissyslab.cli", "build", str(OFFICE_DIR)],
        capture_output=True,
        text=True,
    )
    if build.returncode != 0:
        _fail(f"dsl build failed:\n{build.stdout}\n{build.stderr}")
    _ok("dsl build")

    # Dynamic .py roles — verify ports after build
    port_check = subprocess.run(
        [
            str(PYTHON),
            "-c",
            f"import importlib.util; from pathlib import Path; "
            f"p=Path('{OFFICE_DIR}/roles/screener.py'); "
            f"spec=importlib.util.spec_from_file_location('screener', p); "
            f"m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); "
            f"assert list(m.role.out_ports)==['relevant','discard'], m.role.out_ports",
        ],
        capture_output=True,
        text=True,
    )
    if port_check.returncode != 0:
        _fail(f"screener role ports invalid: {port_check.stderr or port_check.stdout}")

    port_check2 = subprocess.run(
        [
            str(PYTHON),
            "-c",
            f"import importlib.util; from pathlib import Path; "
            f"p=Path('{OFFICE_DIR}/roles/matcher.py'); "
            f"spec=importlib.util.spec_from_file_location('matcher', p); "
            f"m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); "
            f"assert list(m.role.out_ports)==['matched_jobs','discard'], m.role.out_ports",
        ],
        capture_output=True,
        text=True,
    )
    if port_check2.returncode != 0:
        _fail(f"matcher role ports invalid: {port_check2.stderr or port_check2.stdout}")

    proc = subprocess.Popen(
        [str(PYTHON), "-u", "-m", "dissyslab.cli", "run", str(OFFICE_DIR)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env={**os.environ, "DISSYSLAB_NONINTERACTIVE": "1"},
    )
    assert proc.stdout is not None
    deadline = time.time() + 12
    saw_fetch = False
    while time.time() < deadline:
        line = proc.stdout.readline()
        if line == "" and proc.poll() is not None:
            break
        if not line:
            continue
        if "Errors found:" in line or "Compilation failed" in line or "dsl run failed" in line:
            proc.kill()
            _fail(f"office run error: {line.strip()}")
        if "undeclared status" in line:
            proc.kill()
            _fail(f"office run error: {line.strip()}")
        if "Fetching" in line or "entries from" in line:
            saw_fetch = True
            break
    proc.kill()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()

    if not saw_fetch:
        _fail("office run did not reach RSS fetch within 12s")
    _ok("office run started (RSS fetch seen)")


def _run_api_smoke(base: str) -> None:
    url = base.rstrip("/") + "/api/health"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError) as exc:
        _fail(f"health check failed: {exc}")

    runner = data.get("office_runner_python", "")
    version = data.get("office_runner_version", "")
    if not runner or not Path(runner).is_file():
        _fail(f"health missing office_runner_python: {data}")
    if _version_tuple(version) < MIN_DISSYSLAB:
        _fail(f"API office runner uses dissyslab {version!r} — need >= 1.4.0")
    _ok(f"API health (office runner dissyslab {version})")

    run_url = base.rstrip("/") + "/api/offices/job_hunter/run"
    req = urllib.request.Request(run_url, method="POST", data=b"")
    with urllib.request.urlopen(req, timeout=10) as resp:
        json.loads(resp.read().decode())
    _ok("POST /run")

    out_url = base.rstrip("/") + "/api/offices/job_hunter/output"
    try:
        proc = subprocess.run(
            ["curl", "-s", "-N", "--max-time", "8", out_url],
            capture_output=True,
            text=True,
            timeout=12,
        )
    except subprocess.TimeoutExpired:
        proc = None
    stop_url = base.rstrip("/") + "/api/offices/job_hunter/stop"
    try:
        urllib.request.urlopen(urllib.request.Request(stop_url, method="POST", data=b""), timeout=5)
    except urllib.error.HTTPError:
        pass

    stream = (proc.stdout if proc else "") + (proc.stderr if proc else "")
    if "Errors found" in stream or "matched_job' but role" in stream or "undeclared status" in stream:
        _fail("API office run reported validation errors in output stream")
    if proc and proc.returncode not in (0, 28):  # 28 = curl max-time
        _fail(f"output stream failed: {stream[:500]}")
    _ok("API office run (no validation errors in first output)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", help="Optional base URL for live API smoke (e.g. http://127.0.0.1:8001)")
    args = parser.parse_args()

    _run_office_smoke()
    if args.api:
        _run_api_smoke(args.api)
    print("\nAll smoke checks passed.")


if __name__ == "__main__":
    main()
