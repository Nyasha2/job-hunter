"""Morgan — matcher with live brief from job_profile.json (assistant updates)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from dissyslab.office_v2 import nl_role

_ROLES_DIR = Path(__file__).resolve().parent
_OFFICE_DIR = _ROLES_DIR.parent


def _load_brief():
    path = _OFFICE_DIR / "agent_brief.py"
    if str(_OFFICE_DIR) not in sys.path:
        sys.path.insert(0, str(_OFFICE_DIR))
    spec = importlib.util.spec_from_file_location("job_hunter_agent_brief", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _matcher_prompt() -> str:
    base = (_ROLES_DIR / "_matcher_base.md").read_text(encoding="utf-8")
    brief = _load_brief().render_search_context()
    return f"{base.strip()}\n\n## Current candidate search brief\n\n{brief.strip()}\n"


role = nl_role(_matcher_prompt())
