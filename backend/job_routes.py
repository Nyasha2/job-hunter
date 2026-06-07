"""Job Hunter API — profile, job feed, applications, answer assistant."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from apply_helpers import analyze_application_url, profile_autofill_fields
from job_normalize import detect_platform, is_matched_job, normalize_job_row, stable_job_id
from office_server.app import is_office_running
from office_server.sse import format_sse

_BACKEND_DIR = Path(__file__).resolve().parent

PROFILE_FILE = "job_profile.json"
APPLICATIONS_FILE = "applications.json"
MATCHED_JOBS_JSONL = "matched_jobs.jsonl"
RESUME_FILE = "resume.md"
SEARCH_RUNS_FILE = "search_runs.json"

APPLICATION_STATUSES = [
    "found",
    "saved",
    "applying",
    "applied",
    "in_progress",
    "recruiter_screen",
    "online_assessment",
    "technical_interview",
    "hiring_manager_interview",
    "final_round",
    "offer",
    "rejected",
    "withdrawn",
    "archived",
]

router = APIRouter(prefix="/api/offices/{name}/jobs", tags=["jobs"])


def _user_offices_root() -> Path:
    env = os.environ.get("APP_USER_OFFICES_DIR")
    if env:
        return Path(env).resolve()
    return (_BACKEND_DIR.parent / "office").resolve()


def _office_dir(name: str) -> Path:
    d = _user_offices_root() / name.strip()
    if not d.is_dir() or not (d / "office.md").is_file():
        raise HTTPException(status_code=404, detail=f"Office '{name}' not found")
    return d.resolve()


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def _read_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _call_claude(system: str, user: str) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")
    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user or "."}],
    )
    return "".join(b.text for b in resp.content if hasattr(b, "text")).strip()


def _parse_jobs_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    jobs: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s:
            continue
        try:
            row = json.loads(s)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            jobs.append(row)
    return jobs[-200:]


def _timeline_event(event_type: str, message: str) -> dict[str, Any]:
    return {"at": _now_iso(), "type": event_type, "message": message}


def _append_timeline(app: dict[str, Any], event_type: str, message: str) -> None:
    events = list(app.get("timeline_events") or [])
    events.append(_timeline_event(event_type, message))
    app["timeline_events"] = events[-100:]


def _status_label(status: str) -> str:
    return (status or "saved").replace("_", " ")


def _default_profile() -> dict[str, Any]:
    return {
        "version": 1,
        "name": "",
        "email": "",
        "headline": "",
        "preferences": {
            "roles": ["Software Engineer", "ML Engineer"],
            "locations": ["Remote", "Pasadena, CA"],
            "remote_ok": True,
            "min_salary": None,
            "industries": [],
            "job_type": "full-time",
            "keywords_prioritize": [],
            "keywords_reject": [],
            "companies_avoid": [],
            "roles_avoid": [],
        },
        "skills": [],
        "education": [],
        "experiences": [],
        "projects": [],
        "awards": [],
        "application_constraints": {
            "visa_sponsorship_needed": False,
            "work_authorization": "",
            "start_date": "",
            "max_applications_per_day": None,
        },
        "answer_style": {
            "tone": "professional",
            "length": "concise",
            "notes": "",
        },
        "automation_settings": {
            "auto_apply_enabled": False,
            "allowed_platforms": ["greenhouse", "lever"],
            "min_match_score": 70,
            "require_confirmation": True,
        },
        "search_focus": {
            "instructions": "",
            "updated_at": "",
        },
    }


def _default_applications() -> dict[str, Any]:
    return {"version": 1, "applications": []}


@router.get("/profile")
def get_profile(name: str) -> dict[str, Any]:
    office = _office_dir(name)
    profile = _read_json(office / PROFILE_FILE, _default_profile())
    resume = ""
    rp = office / RESUME_FILE
    if rp.is_file():
        resume = rp.read_text(encoding="utf-8")
    return {"office": name, "profile": profile, "resume_md": resume}


class ProfilePut(BaseModel):
    profile: dict[str, Any]
    resume_md: str = ""


@router.put("/profile")
def put_profile(name: str, payload: ProfilePut) -> dict[str, str]:
    office = _office_dir(name)
    _atomic_write_json(office / PROFILE_FILE, payload.profile)
    if payload.resume_md is not None:
        (office / RESUME_FILE).write_text(payload.resume_md, encoding="utf-8")
    return {"status": "saved"}


def _jobs_jsonl_candidates(office: Path) -> list[Path]:
    """JSONL may land in the office folder or its parent (dsl run cwd)."""
    return [
        office / MATCHED_JOBS_JSONL,
        office.parent / MATCHED_JOBS_JSONL,
        _BACKEND_DIR / MATCHED_JOBS_JSONL,
    ]


def _jobs_jsonl_paths(office: Path) -> list[Path]:
    return [p for p in _jobs_jsonl_candidates(office) if p.is_file()]


def _clear_matched_jobs_jsonl(office: Path) -> None:
    for path in _jobs_jsonl_candidates(office):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("", encoding="utf-8")


def _parse_all_jobs_jsonl(office: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in _jobs_jsonl_paths(office):
        rows.extend(_parse_jobs_jsonl(path))
    return rows


def _matched_jobs(office: Path) -> list[dict[str, Any]]:
    raw = _parse_all_jobs_jsonl(office)
    jobs: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for i, row in enumerate(raw):
        if not is_matched_job(row):
            continue
        job = normalize_job_row(row, i)
        key = job.get("url") or job["id"]
        if key in seen_urls:
            continue
        seen_urls.add(key)
        jobs.append(job)
    return jobs


def _tracking_maps(apps: list[dict[str, Any]]) -> tuple[dict[str, str], dict[str, str]]:
    """Map job URL and job_id → latest application status."""
    by_url: dict[str, str] = {}
    by_id: dict[str, str] = {}
    for app in apps:
        st = app.get("status") or "saved"
        url = (app.get("url") or "").strip()
        jid = (app.get("job_id") or "").strip()
        if url:
            by_url[url] = st
        if jid:
            by_id[jid] = st
    return by_url, by_id


@router.get("/dashboard")
def get_dashboard(name: str) -> dict[str, Any]:
    office = _office_dir(name)
    apps = _read_json(office / APPLICATIONS_FILE, _default_applications()).get("applications", [])
    jobs = _matched_jobs(office)
    by_status: dict[str, int] = {}
    for app in apps:
        st = app.get("status") or "saved"
        by_status[st] = by_status.get(st, 0) + 1

    recommended = [j for j in jobs if j.get("match_score", 0) >= 70]
    need_action = [
        a
        for a in apps
        if (a.get("status") or "") in ("saved", "applying", "in_progress", "recruiter_screen")
    ]

    return {
        "office": name,
        "search_running": is_office_running(name),
        "jobs_total": len(jobs),
        "jobs_recommended": len(recommended),
        "applications_total": len(apps),
        "applications_by_status": by_status,
        "applications_need_action": len(need_action),
        "recent_jobs": list(reversed(jobs[-8:])),
        "recent_applications": apps[:6],
        "statuses": APPLICATION_STATUSES,
    }


def _find_job(jobs: list[dict[str, Any]], job_id: str, url: str = "") -> dict[str, Any] | None:
    needle_id = (job_id or "").strip()
    needle_url = (url or "").strip()
    if needle_url and not needle_id:
        needle_id = stable_job_id(needle_url, "", 0)
    for job in jobs:
        if needle_id and (job["id"] == needle_id or job.get("url") == needle_id):
            return job
        if needle_url and job.get("url") == needle_url:
            return job
        if needle_id.startswith("http") and job.get("url") == needle_id:
            return job
        if needle_url and job["id"] == stable_job_id(needle_url, job.get("title", ""), 0):
            return job
    return None


@router.get("/detail")
def get_job_detail(
    name: str,
    job_id: str = Query(default=""),
    url: str = Query(default=""),
) -> dict[str, Any]:
    if not job_id.strip() and not url.strip():
        raise HTTPException(status_code=422, detail="job_id or url is required")
    office = _office_dir(name)
    jobs = _matched_jobs(office)
    job = _find_job(jobs, job_id, url)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    apps = _read_json(office / APPLICATIONS_FILE, _default_applications()).get("applications", [])
    tracking = None
    for a in apps:
        if a.get("url") == job.get("url") or a.get("job_id") == job["id"]:
            tracking = a
            break
    return {"office": name, "job": job, "application": tracking}


@router.get("/feed")
def get_feed(name: str) -> dict[str, Any]:
    office = _office_dir(name)
    apps = _read_json(office / APPLICATIONS_FILE, _default_applications()).get("applications", [])
    by_url, by_id = _tracking_maps(apps)

    feed: list[dict[str, Any]] = []
    for job in reversed(_matched_jobs(office)):
        url = job.get("url") or ""
        tracking = by_url.get(url) or by_id.get(job["id"]) or None
        if tracking == "rejected":
            continue
        feed.append(
            {
                **job,
                "tracking_status": tracking,
                "already_tracked": tracking in ("saved", "applied", "interview", "offer"),
            }
        )
    return {"office": name, "jobs": feed}


@router.get("/discover/progress")
def discover_progress(name: str) -> dict[str, Any]:
    """How far the current search run has gotten (from jsonl activity)."""
    office = _office_dir(name)
    raw = _parse_all_jobs_jsonl(office)
    matched = sum(1 for r in raw if is_matched_job(r))
    discarded = sum(1 for r in raw if r.get("send_to") == "discard")
    forwarded = sum(1 for r in raw if r.get("send_to") == "relevant")
    by_source: dict[str, int] = {}
    for row in raw:
        src = row.get("source") or "unknown"
        by_source[src] = by_source.get(src, 0) + 1
    return {
        "office": name,
        "search_running": is_office_running(name),
        "screened": len(raw),
        "matched": len(_matched_jobs(office)),
        "discarded": discarded,
        "pending_morgan": forwarded,
        "by_source": by_source,
    }


@router.get("/discover/cards")
def discover_cards(name: str) -> dict[str, Any]:
    """Matched jobs from the current search — not filtered by application status."""
    office = _office_dir(name)
    return {"office": name, "jobs": list(reversed(_matched_jobs(office)))}


@router.post("/discover/reset")
def reset_discover(name: str) -> dict[str, str]:
    """Clear matched_jobs.jsonl before a new search run."""
    office = _office_dir(name)
    _clear_matched_jobs_jsonl(office)
    return {"status": "cleared"}


@router.get("/discover/stream")
async def discover_stream(name: str):
    """SSE of structured job cards only — no raw agent logs."""

    async def event_generator():
        _office_dir(name)
        seen: set[str] = set()
        yield format_sse("status", {"phase": "searching", "text": "Searching job boards…"})
        while is_office_running(name):
            office = _office_dir(name)
            for job in _matched_jobs(office):
                key = job.get("url") or job["id"]
                if not key or key in seen:
                    continue
                seen.add(key)
                yield format_sse("job", job)
            await asyncio.sleep(1.5)
        yield format_sse("status", {"phase": "done", "text": "Search finished.", "count": len(seen)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/applications")
def get_applications(name: str) -> dict[str, Any]:
    office = _office_dir(name)
    data = _read_json(office / APPLICATIONS_FILE, _default_applications())
    return {
        "office": name,
        "applications": data.get("applications", []),
        "statuses": APPLICATION_STATUSES,
    }


class ApplicationCreate(BaseModel):
    job_id: str = ""
    title: str
    company: str = ""
    url: str = ""
    status: str = "saved"
    notes: str = ""
    auto_apply_eligible: bool = False


@router.post("/applications")
def create_application(name: str, payload: ApplicationCreate) -> dict[str, Any]:
    office = _office_dir(name)
    path = office / APPLICATIONS_FILE
    data = _read_json(path, _default_applications())
    apps = list(data.get("applications") or [])
    url = payload.url.strip()
    now = _now_iso()

    for a in apps:
        if url and a.get("url") == url:
            prev = a.get("status") or "saved"
            new_status = payload.status or "saved"
            a["status"] = new_status
            a["title"] = payload.title.strip() or a.get("title", "")
            a["company"] = payload.company.strip() or a.get("company", "")
            a["job_id"] = payload.job_id or a.get("job_id", "")
            a["auto_apply_eligible"] = payload.auto_apply_eligible or detect_platform(url) in (
                "greenhouse",
                "lever",
                "ashby",
            )
            if payload.notes.strip():
                a["stage_notes"] = payload.notes.strip()
            a["updated_at"] = now
            if prev != new_status:
                _append_timeline(a, "status_change", f"Status updated to {_status_label(new_status)}")
            data["applications"] = apps
            _atomic_write_json(path, data)
            return {"office": name, "application": a, "updated": True}

    auto = payload.auto_apply_eligible or detect_platform(url) in ("greenhouse", "lever", "ashby")
    entry = {
        "id": str(uuid.uuid4()),
        "job_id": payload.job_id,
        "title": payload.title.strip(),
        "company": payload.company.strip(),
        "url": url,
        "status": payload.status or "saved",
        "stage_notes": payload.notes.strip(),
        "auto_apply_eligible": auto,
        "answers": {},
        "timeline_events": [],
        "created_at": now,
        "updated_at": now,
    }
    st = entry["status"]
    if st == "saved":
        _append_timeline(entry, "saved", f"Saved “{entry['title']}”")
    elif st == "applied":
        _append_timeline(entry, "applied", f"Marked as applied — “{entry['title']}”")
    elif st == "rejected":
        _append_timeline(entry, "rejected", f"Rejected “{entry['title']}”")
    else:
        _append_timeline(entry, st, f"Application created with status {_status_label(st)}")
    apps.insert(0, entry)
    data["applications"] = apps[:500]
    _atomic_write_json(path, data)
    return {"office": name, "application": entry, "updated": False}


class ApplicationUpdate(BaseModel):
    status: str | None = None
    stage_notes: str | None = None
    answers: dict[str, Any] | None = None


@router.patch("/applications/{app_id}")
def update_application(name: str, app_id: str, payload: ApplicationUpdate) -> dict[str, Any]:
    office = _office_dir(name)
    path = office / APPLICATIONS_FILE
    data = _read_json(path, _default_applications())
    apps = list(data.get("applications") or [])
    found = None
    for a in apps:
        if a.get("id") == app_id:
            if payload.status is not None:
                prev = a.get("status")
                a["status"] = payload.status
                if prev != payload.status:
                    _append_timeline(
                        a,
                        "status_change",
                        f"Stage updated to {_status_label(payload.status)}",
                    )
            if payload.stage_notes is not None:
                a["stage_notes"] = payload.stage_notes
                if payload.stage_notes.strip():
                    _append_timeline(a, "note", payload.stage_notes.strip())
            if payload.answers is not None:
                a["answers"] = payload.answers
                if payload.answers.get("markdown"):
                    _append_timeline(a, "answers", "Generated tailored application answers")
            a["updated_at"] = _now_iso()
            found = a
            break
    if found is None:
        raise HTTPException(status_code=404, detail="Application not found")
    data["applications"] = apps
    _atomic_write_json(path, data)
    return {"office": name, "application": found}


class ApplyStartPayload(BaseModel):
    job_id: str = ""
    title: str
    company: str = ""
    url: str = ""


@router.post("/apply/start")
def start_apply(name: str, payload: ApplyStartPayload) -> dict[str, Any]:
    """Open apply flow: track as applying and return autofill + question hints."""
    office = _office_dir(name)
    profile = _read_json(office / PROFILE_FILE, _default_profile())
    url = payload.url.strip()
    now = _now_iso()
    path = office / APPLICATIONS_FILE
    data = _read_json(path, _default_applications())
    apps = list(data.get("applications") or [])
    analysis = analyze_application_url(url) if url else {
        "platform": "unknown",
        "can_autofill": False,
        "autofill_mode": "manual",
        "extracted_questions": [],
        "extract_error": "No application URL",
    }

    entry = None
    for a in apps:
        if url and a.get("url") == url:
            prev = a.get("status") or "saved"
            a["status"] = "applying"
            a["title"] = payload.title.strip() or a.get("title", "")
            a["company"] = payload.company.strip() or a.get("company", "")
            a["job_id"] = payload.job_id or a.get("job_id", "")
            a["auto_apply_eligible"] = analysis["can_autofill"]
            a["updated_at"] = now
            if prev != "applying":
                _append_timeline(a, "apply_start", f"Started applying to “{a['title']}”")
            entry = a
            break

    if entry is None:
        entry = {
            "id": str(uuid.uuid4()),
            "job_id": payload.job_id,
            "title": payload.title.strip(),
            "company": payload.company.strip(),
            "url": url,
            "status": "applying",
            "stage_notes": "",
            "auto_apply_eligible": analysis["can_autofill"],
            "answers": {},
            "timeline_events": [],
            "created_at": now,
            "updated_at": now,
        }
        _append_timeline(entry, "apply_start", f"Started applying to “{entry['title']}”")
        apps.insert(0, entry)
        data["applications"] = apps[:500]

    data["applications"] = apps
    _atomic_write_json(path, data)

    return {
        "office": name,
        "application": entry,
        "platform": analysis["platform"],
        "can_autofill": analysis["can_autofill"],
        "autofill_mode": analysis["autofill_mode"],
        "autofill_fields": profile_autofill_fields(profile),
        "extracted_questions": analysis["extracted_questions"],
        "extract_error": analysis.get("extract_error"),
    }


@router.delete("/applications/{app_id}")
def delete_application(name: str, app_id: str) -> dict[str, str]:
    office = _office_dir(name)
    path = office / APPLICATIONS_FILE
    data = _read_json(path, _default_applications())
    apps = [a for a in data.get("applications", []) if a.get("id") != app_id]
    data["applications"] = apps
    _atomic_write_json(path, data)
    return {"status": "deleted"}


class ApplicationEventCreate(BaseModel):
    event_type: str = "note"
    message: str = Field(..., min_length=1)


@router.post("/applications/{app_id}/events")
def add_application_event(name: str, app_id: str, payload: ApplicationEventCreate) -> dict[str, Any]:
    office = _office_dir(name)
    path = office / APPLICATIONS_FILE
    data = _read_json(path, _default_applications())
    apps = list(data.get("applications") or [])
    found = None
    for a in apps:
        if a.get("id") == app_id:
            _append_timeline(a, payload.event_type, payload.message.strip())
            a["updated_at"] = _now_iso()
            found = a
            break
    if found is None:
        raise HTTPException(status_code=404, detail="Application not found")
    data["applications"] = apps
    _atomic_write_json(path, data)
    return {"office": name, "application": found}


@router.get("/search_runs")
def get_search_runs(name: str) -> dict[str, Any]:
    office = _office_dir(name)
    data = _read_json(office / SEARCH_RUNS_FILE, {"version": 1, "runs": []})
    return {
        "office": name,
        "runs": data.get("runs", []),
        "search_running": is_office_running(name),
        "jobs_matched": len(_matched_jobs(office)),
    }


class AnswerPayload(BaseModel):
    questions: str = Field(..., min_length=1)
    job_title: str = ""
    company: str = ""
    extra_context: str = ""


PROFILE_UPDATE_MARKER = "<<<JOB_PROFILE_UPDATE>>>"


class AssistantMessage(BaseModel):
    role: str
    content: str


class AssistantPayload(BaseModel):
    messages: list[AssistantMessage]


def _extract_profile_update(text: str) -> tuple[str, dict[str, Any] | None]:
    if PROFILE_UPDATE_MARKER not in text:
        return text.strip(), None
    head, _, tail = text.partition(PROFILE_UPDATE_MARKER)
    try:
        blob = json.loads(tail.strip())
        if isinstance(blob, dict) and "profile" in blob:
            return head.strip(), blob
    except json.JSONDecodeError:
        pass
    return text.strip(), None


@router.post("/assistant")
def job_assistant_chat(name: str, payload: AssistantPayload) -> dict[str, Any]:
    office = _office_dir(name)
    profile = _read_json(office / PROFILE_FILE, _default_profile())
    resume = ""
    rp = office / RESUME_FILE
    if rp.is_file():
        resume = rp.read_text(encoding="utf-8")

    system = "\n".join(
        [
            "You are Job Hunter's friendly onboarding assistant. Warm, concise, professional.",
            "Help users set up their job search: paste resume, refine preferences, explain how tabs work.",
            "Never show raw JSON to the user — speak in plain English and Markdown.",
            "",
            "When the user changes what jobs they want (roles, tech stack, location, 'focus on backend only', etc.):",
            "1. Update profile.preferences (roles, keywords_prioritize, keywords_reject, etc.)",
            "2. Set profile.search_focus.instructions to a short, imperative paragraph Alex the screener "
            "and Morgan the matcher will follow on the next search run. Example: "
            "'Focus only on backend Python roles (FastAPI, Django). Reject pure frontend, DevRel, and senior titles.'",
            "3. Set profile.search_focus.updated_at to today's ISO date.",
            "",
            "When the user pastes a resume or gives enough info to build/update their profile, "
            f"end your reply with ONE line `{PROFILE_UPDATE_MARKER}` then compact JSON ONLY:",
            '{"profile":{...full job_profile object including search_focus...},"resume_md":"...optional..."}',
            "Omit the marker if you are not saving profile changes.",
            "Always include the full profile object when saving — merge with current profile, do not drop fields.",
            "",
            "Tell the user after a focus change: start a new search run for Alex to pick up the updated focus.",
            "### Current profile",
            json.dumps(profile, indent=2),
            "### Current resume",
            resume or "(empty)",
        ]
    )
    blocks = []
    for m in payload.messages[-20:]:
        role = m.role if m.role in ("user", "assistant") else "user"
        blocks.append(f"{role.upper()}: {m.content}")
    user = "\n\n".join(blocks) or "Hello"
    raw = _call_claude(system, user)
    reply, update = _extract_profile_update(raw)
    saved = False
    if update:
        prof = update.get("profile")
        if isinstance(prof, dict):
            merged = {**_default_profile(), **profile, **prof}
            merged["preferences"] = {
                **_default_profile()["preferences"],
                **(profile.get("preferences") or {}),
                **(prof.get("preferences") or {}),
            }
            merged["search_focus"] = {
                **_default_profile()["search_focus"],
                **(profile.get("search_focus") or {}),
                **(prof.get("search_focus") or {}),
            }
            if prof.get("search_focus", {}).get("instructions"):
                merged["search_focus"]["updated_at"] = _now_iso()
            _atomic_write_json(office / PROFILE_FILE, merged)
            saved = True
        rmd = update.get("resume_md")
        if isinstance(rmd, str) and rmd.strip():
            (office / RESUME_FILE).write_text(rmd.strip() + "\n", encoding="utf-8")
            saved = True
    return {"office": name, "reply": reply or raw, "profile_saved": saved}


@router.post("/answer")
def generate_answers(name: str, payload: AnswerPayload) -> dict[str, Any]:
    office = _office_dir(name)
    profile = _read_json(office / PROFILE_FILE, _default_profile())
    resume = ""
    rp = office / RESUME_FILE
    if rp.is_file():
        resume = rp.read_text(encoding="utf-8")

    system = "\n".join(
        [
            "You help a job candidate answer application questions concisely and honestly.",
            "Use ONLY facts from the profile and resume provided.",
            "Output Markdown: for each question, use ### Question then a bullet answer block.",
            "Keep answers paste-ready (no meta commentary).",
            "### Profile JSON",
            json.dumps(profile, indent=2),
            "### Resume",
            resume or "(no resume on file — use profile only)",
        ]
    )
    user = "\n".join(
        [
            f"Role: {payload.job_title or 'unspecified'} at {payload.company or 'unspecified'}",
            payload.extra_context.strip(),
            "### Application questions (answer each)",
            payload.questions.strip(),
        ]
    ).strip()
    md = _call_claude(system, user)
    return {"office": name, "markdown": md}
