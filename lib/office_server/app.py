"""Minimal FastAPI server for DisDylab standalone apps (PyPI dissyslab + bundled office)."""

from __future__ import annotations

import asyncio
import json
import os
import queue
import signal
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from .sse import _expand_markdown_block_payload, format_sse, iter_stdout_sse_events

_running: dict[str, subprocess.Popen] = {}
_office_output_queues: dict[str, queue.Queue[str | None]] = {}


def _load_app_env(backend_dir: Path) -> None:
    """App ``backend/.env`` wins over stale shell exports."""
    load_dotenv(backend_dir / ".env", override=True)
    load_dotenv(Path.home() / ".dissyslab" / ".env", override=False)


def _anthropic_key_status(backend_dir: Path, *, verify: bool = False) -> dict[str, Any]:
    _load_app_env(backend_dir)
    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip().strip('"').strip("'")
    if not key:
        return {
            "configured": False,
            "valid": False,
            "message": "ANTHROPIC_API_KEY is not set. Add it to backend/.env",
        }
    if key.endswith("...") or "your-key" in key.lower():
        return {
            "configured": True,
            "valid": False,
            "message": "ANTHROPIC_API_KEY looks like a placeholder — paste a real key from console.anthropic.com",
        }
    if not key.startswith("sk-ant-"):
        return {
            "configured": True,
            "valid": False,
            "message": "ANTHROPIC_API_KEY must start with sk-ant-",
        }
    if not verify:
        return {"configured": True, "valid": None, "message": "format ok (not verified)"}
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=key)
        client.messages.create(
            model="claude-opus-4-5",
            max_tokens=1,
            messages=[{"role": "user", "content": "."}],
        )
        return {"configured": True, "valid": True, "message": "ok"}
    except ImportError:
        return {
            "configured": True,
            "valid": None,
            "message": "anthropic package not installed — cannot verify key",
        }
    except Exception as exc:
        name = type(exc).__name__
        if "Authentication" in name or "401" in str(exc):
            return {
                "configured": True,
                "valid": False,
                "message": (
                    "ANTHROPIC_API_KEY is invalid or revoked. "
                    "Create a new key at https://console.anthropic.com/settings/keys "
                    "and update backend/.env, then restart ./run_dev.sh"
                ),
            }
        return {"configured": True, "valid": False, "message": f"Anthropic check failed: {exc}"}


def is_office_running(name: str) -> bool:
    proc = _running.get(name)
    return bool(proc is not None and proc.poll() is None)


def _dissyslab_package_dir() -> Path:
    try:
        import dissyslab  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError(
            "dissyslab is not installed. Run the DisSysLab installer or: pip install dissyslab"
        ) from exc
    return Path(dissyslab.__file__).resolve().parent


def _venv_python(backend_dir: Path) -> Path | None:
    """Return ``backend/.venv/bin/python`` when the app venv exists."""
    for name in ("python", "python3"):
        candidate = backend_dir / ".venv" / "bin" / name
        if candidate.is_file():
            # Keep the venv shim path — resolving symlinks can point at system
            # Python and drop site-packages from this venv.
            return candidate
    return None


def _office_runner_python(backend_dir: Path) -> str:
    """Python used for ``dsl run`` subprocesses — prefer the app venv over conda/base."""
    venv_py = _venv_python(backend_dir)
    if venv_py is not None:
        return str(venv_py)
    return sys.executable


def _dissyslab_info_for_python(python: str) -> dict[str, str]:
    """Inspect dissyslab for a given interpreter (server or office runner)."""
    try:
        out = subprocess.check_output(
            [
                python,
                "-c",
                "import dissyslab, importlib.metadata as m; "
                "print(dissyslab.__file__); print(m.version('dissyslab'))",
            ],
            text=True,
            timeout=15,
        )
        pkg_path, version = out.strip().splitlines()[:2]
        return {"python": python, "dissyslab": pkg_path, "version": version}
    except (subprocess.SubprocessError, OSError, ValueError) as exc:
        return {"python": python, "dissyslab": "", "version": "", "error": str(exc)}


def _safe_path_under(base: Path, *relative_parts: str) -> Path | None:
    try:
        root = base.resolve()
        cand = root.joinpath(*relative_parts).resolve()
        cand.relative_to(root)
    except (OSError, ValueError):
        return None
    return cand if cand.is_file() else None


def _read_office(office_dir: Path) -> dict[str, Any]:
    office_md = office_dir / "office.md"
    if not office_md.is_file():
        raise FileNotFoundError(f"office.md not found in {office_dir}")
    roles: dict[str, str] = {}
    roles_dir = office_dir / "roles"
    if roles_dir.is_dir():
        for role_file in sorted(roles_dir.glob("*.md")):
            roles[role_file.stem] = role_file.read_text(encoding="utf-8")
    extra: dict[str, str] = {}
    for name in (
        "wardrobe_inventory.json",
        "wardrobe_run_config.json",
        "job_profile.json",
        "resume.md",
        "interests_profile.json",
        "conflict_rules.json",
        "calendar_config.json",
    ):
        p = office_dir / name
        if p.is_file():
            extra[name] = p.read_text(encoding="utf-8")
    return {
        "name": office_dir.name,
        "office_md": office_md.read_text(encoding="utf-8"),
        "roles": roles,
        "extra_files": extra,
    }


def _office_stdout_bridge(name: str, proc: subprocess.Popen, out_q: queue.Queue[str | None]) -> None:
    try:
        if proc.stdout is None:
            return
        while True:
            raw = proc.stdout.readline()
            if raw == "":
                break
            line = raw.rstrip("\n")
            print(f"[office:{name}] {line}", file=sys.stderr, flush=True)
            out_q.put(line)
    finally:
        out_q.put(None)


def _start_office_stdout_bridge(name: str, proc: subprocess.Popen) -> None:
    _office_output_queues.pop(name, None)
    out_q: queue.Queue[str | None] = queue.Queue()
    _office_output_queues[name] = out_q
    threading.Thread(
        target=_office_stdout_bridge,
        args=(name, proc, out_q),
        name=f"office-stdout-{name}",
        daemon=True,
    ).start()


def create_office_app(
    *,
    title: str,
    user_offices_dir: Path,
    backend_dir: Path,
    cors_origins: list[str] | None = None,
    extra_routers: list[Any] | None = None,
) -> FastAPI:
    """Build a FastAPI app scoped to offices under ``user_offices_dir``."""
    user_offices_dir = user_offices_dir.resolve()
    user_offices_dir.mkdir(parents=True, exist_ok=True)
    os.environ["APP_USER_OFFICES_DIR"] = str(user_offices_dir)

    load_dotenv(backend_dir / ".env", override=True)
    load_dotenv(Path.home() / ".dissyslab" / ".env", override=False)

    app = FastAPI(title=title)
    origins = cors_origins or [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if extra_routers:
        for router in extra_routers:
            app.include_router(router)

    def _find_office_dir(name: str) -> Path:
        candidate = user_offices_dir / name
        if candidate.is_dir() and (candidate / "office.md").is_file():
            return candidate.resolve()
        raise FileNotFoundError(f"Office '{name}' not found under {user_offices_dir}")

    @app.get("/api/offices")
    def list_offices():
        offices = []
        for d in sorted(user_offices_dir.iterdir()):
            if not d.is_dir() or d.name.startswith("."):
                continue
            if not (d / "office.md").is_file():
                continue
            readme = d / "README.md"
            description = ""
            if readme.is_file():
                for line in readme.read_text(encoding="utf-8", errors="replace").splitlines():
                    s = line.strip()
                    if s and not s.startswith("#"):
                        description = s[:280]
                        break
            offices.append({"name": d.name, "builtin": False, "description": description, "path": str(d)})
        return {"offices": offices}

    @app.get("/api/offices/{name}")
    def get_office(name: str):
        try:
            return _read_office(_find_office_dir(name))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/offices/{name}/media/{resource_path:path}")
    def get_office_media(name: str, resource_path: str):
        try:
            office_dir = _find_office_dir(name)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        media_root = (office_dir / "media").resolve()
        if not media_root.is_dir():
            raise HTTPException(status_code=404, detail="No media/ folder")
        parts = [p for p in resource_path.split("/") if p and p != ".."]
        safe = _safe_path_under(media_root, *parts)
        if safe is None:
            raise HTTPException(status_code=404, detail="Media file not found")
        return FileResponse(safe)

    @app.post("/api/offices/{name}/run")
    def run_office(name: str):
        if name in _running:
            proc = _running[name]
            if proc.poll() is None:
                raise HTTPException(status_code=409, detail=f"Office '{name}' is already running")
            del _running[name]
            _office_output_queues.pop(name, None)

        try:
            office_dir = _find_office_dir(name)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        anthropic = _anthropic_key_status(backend_dir, verify=True)
        if anthropic.get("valid") is False:
            raise HTTPException(status_code=400, detail=anthropic["message"])

        _load_app_env(backend_dir)
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["DISSYSLAB_APP_SSE"] = "1"
        env.setdefault("DSL_BACKEND", "anthropic")
        # Non-interactive runs from the web app (no TTY for "build connector?" prompts).
        env.setdefault("DISSYSLAB_NONINTERACTIVE", "1")

        cal_cfg = office_dir / "calendar_config.json"
        if cal_cfg.is_file():
            try:
                cfg = json.loads(cal_cfg.read_text(encoding="utf-8"))
                ics = cfg.get("ics_url") or cfg.get("calendar_ics_url")
                if ics:
                    env["CALENDAR_ICS_URL"] = str(ics)
                tz = cfg.get("timezone")
                if tz:
                    env["CALENDAR_TIMEZONE"] = str(tz)
            except (OSError, json.JSONDecodeError):
                pass

        runner_py = _office_runner_python(backend_dir)
        proc = subprocess.Popen(
            [runner_py, "-u", "-m", "dissyslab.cli", "run", str(office_dir)],
            cwd=str(office_dir.parent),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
            start_new_session=True,
        )
        _running[name] = proc
        _start_office_stdout_bridge(name, proc)
        return {"status": "started", "pid": proc.pid}

    @app.post("/api/offices/{name}/stop")
    def stop_office(name: str):
        proc = _running.get(name)
        if not proc or proc.poll() is not None:
            _running.pop(name, None)
            raise HTTPException(status_code=404, detail=f"Office '{name}' is not running")
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except Exception:
            proc.terminate()
        _running.pop(name, None)
        return {"status": "stopped"}

    @app.get("/api/offices/{name}/status")
    def office_status(name: str):
        proc = _running.get(name)
        if proc and proc.poll() is None:
            return {"running": True, "pid": proc.pid}
        _running.pop(name, None)
        _office_output_queues.pop(name, None)
        return {"running": False}

    @app.get("/api/offices/{name}/output")
    async def stream_output(name: str):
        async def event_generator() -> AsyncGenerator[str, None]:
            proc = _running.get(name)
            out_q = _office_output_queues.get(name)
            if not proc or out_q is None:
                yield format_sse("log", {"text": "[Office is not running]"})
                return
            loop = asyncio.get_event_loop()
            while True:
                line = await loop.run_in_executor(None, out_q.get)
                if line is None:
                    _running.pop(name, None)
                    _office_output_queues.pop(name, None)
                    yield format_sse("log", {"text": "[Process finished]"})
                    break
                for ev, payload in iter_stdout_sse_events(line):
                    if ev == "block" and payload.get("kind") == "markdown":
                        expanded = _expand_markdown_block_payload(payload)
                        if expanded:
                            for ev2, pl2 in expanded:
                                yield format_sse(ev2, pl2)
                        else:
                            yield format_sse(ev, payload)
                    else:
                        yield format_sse(ev, payload)

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    @app.get("/api/env")
    def get_env_keys():
        watched = ["ANTHROPIC_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "WEATHERAPI_KEY"]
        return {
            "set": {k: bool(os.environ.get(k)) for k in watched},
            "anthropic": _anthropic_key_status(backend_dir, verify=True),
        }

    @app.get("/api/health")
    def health():
        pkg = _dissyslab_package_dir()
        runner_py = _office_runner_python(backend_dir)
        runner = _dissyslab_info_for_python(runner_py)
        venv_py = _venv_python(backend_dir)
        using_venv_server = venv_py is not None and Path(sys.executable) == venv_py
        return {
            "status": "ok",
            "dissyslab": str(pkg),
            "offices_dir": str(user_offices_dir),
            "server_python": sys.executable,
            "office_runner_python": runner_py,
            "office_runner_dissyslab": runner.get("dissyslab") or runner.get("error", ""),
            "office_runner_version": runner.get("version", ""),
            "using_venv_server": using_venv_server,
        }

    @app.on_event("startup")
    def _warn_if_server_not_in_venv() -> None:
        venv_py = _venv_python(backend_dir)
        if venv_py is None:
            return
        if Path(sys.executable) != venv_py:
            print(
                f"[office_server] Warning: API server is {sys.executable!r} but "
                f"office runs use {venv_py!r}. Start with: "
                f"{venv_py.parent / 'uvicorn'} main:app --reload",
                file=sys.stderr,
                flush=True,
            )

    return app
