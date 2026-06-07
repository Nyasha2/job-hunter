"""Build live screener/matcher instructions from job_profile.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_OFFICE_DIR = Path(__file__).resolve().parent
PROFILE_PATH = _OFFICE_DIR / "job_profile.json"


def _read_profile() -> dict[str, Any]:
    if not PROFILE_PATH.is_file():
        return {}
    try:
        return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def render_search_context() -> str:
    """Paragraph injected into Alex and Morgan prompts each office run."""
    profile = _read_profile()
    pref = profile.get("preferences") or {}
    focus = profile.get("search_focus") or {}
    lines: list[str] = []

    name = (profile.get("name") or "").strip()
    headline = (profile.get("headline") or "").strip()
    if name or headline:
        lines.append(f"Candidate: {name or 'Unknown'}" + (f" — {headline}" if headline else ""))

    instructions = (focus.get("instructions") or "").strip()
    if instructions:
        lines.append(f"Current search focus (from assistant — follow strictly):\n{instructions}")

    roles = pref.get("roles") or []
    if roles:
        lines.append(f"Target roles: {', '.join(roles)}")

    locations = pref.get("locations") or []
    if locations:
        remote = "yes" if pref.get("remote_ok", True) else "no"
        lines.append(f"Locations: {', '.join(locations)} (remote OK: {remote})")

    skills = profile.get("skills") or []
    if skills:
        lines.append(f"Key skills: {', '.join(skills[:20])}")

    kw_yes = pref.get("keywords_prioritize") or []
    kw_no = pref.get("keywords_reject") or []
    if kw_yes:
        lines.append(f"Prioritize keywords: {', '.join(kw_yes)}")
    if kw_no:
        lines.append(f"Reject keywords/themes: {', '.join(kw_no)}")

    avoid_roles = pref.get("roles_avoid") or []
    avoid_cos = pref.get("companies_avoid") or []
    if avoid_roles:
        lines.append(f"Avoid role types: {', '.join(avoid_roles)}")
    if avoid_cos:
        lines.append(f"Avoid companies: {', '.join(avoid_cos)}")

    constraints = profile.get("application_constraints") or {}
    if constraints.get("visa_sponsorship_needed"):
        lines.append("Requires visa sponsorship — flag roles that do not mention sponsorship as a concern.")

    if not lines:
        return (
            "No custom search focus yet. Use general new-grad / early-career software criteria "
            "from the base instructions."
        )
    return "\n".join(lines)
