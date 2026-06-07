"""Turn raw matcher JSONL rows into UI-ready job cards."""

from __future__ import annotations

import hashlib
import re
from typing import Any
from urllib.parse import urlparse


RATING_SCORE = {"EXCELLENT": 92, "STRONG": 78, "GOOD": 64, "FAIR": 48}


def stable_job_id(url: str, title: str, index: int = 0) -> str:
    """Stable id safe for URL paths (never a raw application URL)."""
    if url:
        return hashlib.sha256(url.encode()).hexdigest()[:16]
    return f"job_{index}_{abs(hash(title)) % 10_000_000}"


def detect_platform(url: str) -> str:
    u = (url or "").lower()
    if "greenhouse.io" in u or "boards.greenhouse.io" in u:
        return "greenhouse"
    if "lever.co" in u:
        return "lever"
    if "ashbyhq.com" in u:
        return "ashby"
    if "myworkdayjobs.com" in u or "workday.com" in u:
        return "workday"
    if "python.org/jobs" in u:
        return "python_jobs"
    if "ycombinator.com" in u or "hnrss.org" in u:
        return "hacker_news"
    return "other"


def _first_url(text: str) -> str:
    for m in re.finditer(r"https?://[^\s\])\"']+", text or ""):
        return m.group(0).rstrip(".,)")
    return ""


def _parse_bullets(text: str) -> list[str]:
    bullets: list[str] = []
    in_resume = False
    for line in (text or "").splitlines():
        s = line.strip()
        if s.startswith("Resume Matches"):
            in_resume = True
            continue
        if s.startswith("Skills Match:"):
            in_resume = False
            bullets.append(s.replace("Skills Match:", "Skills:").strip())
            continue
        if s.startswith("Gaps:") or s.startswith("Apply:"):
            in_resume = False
            continue
        if in_resume and s.startswith("•"):
            bullets.append(s.lstrip("• ").strip())
        if len(bullets) >= 4:
            break
    return bullets[:4]


def _match_rating(row: dict[str, Any], text: str) -> str:
    rating = (row.get("match_rating") or "").strip().upper()
    if rating:
        return rating
    m = re.search(r"Match:\s*(EXCELLENT|STRONG|GOOD|FAIR)", text, re.I)
    return m.group(1).upper() if m else ""


def _gaps_text(row: dict[str, Any], text: str) -> str:
    gaps = (row.get("gaps") or "").strip()
    if gaps:
        return gaps
    m = re.search(r"Gaps:\s*(.+)", text, re.I)
    return m.group(1).strip() if m else ""


def _risk_flags(gaps: str) -> list[str]:
    if not gaps or gaps.lower() in ("none", "n/a", "—", "-"):
        return []
    parts = re.split(r"[;,•\n]+", gaps)
    return [p.strip() for p in parts if p.strip()][:5]


def _match_reasons(row: dict[str, Any], text: str, bullets: list[str]) -> list[str]:
    reasons: list[str] = []
    skills = (row.get("skills_match") or "").strip()
    if skills:
        reasons.append(f"Skills: {skills}")
    reasons.extend(bullets[:3])
    if not reasons and text:
        m = re.search(r"Match:\s*(EXCELLENT|STRONG|GOOD|FAIR)", text, re.I)
        if m:
            reasons.append(f"{m.group(1).title()} overall fit vs your profile")
    return reasons[:4]


def is_matched_job(row: dict[str, Any]) -> bool:
    """True when this JSONL row is a matcher hit (not screener discard noise)."""
    if row.get("send_to") == "discard":
        return False
    if row.get("send_to") == "matched_jobs":
        return True
    if row.get("match_rating"):
        return True
    text = row.get("text") or ""
    if re.search(r"Match:\s*(EXCELLENT|STRONG|GOOD|FAIR)", text, re.I):
        return True
    return False


def normalize_job_row(row: dict[str, Any], index: int = 0) -> dict[str, Any]:
    text = row.get("text") or ""
    if text.strip().startswith("{") and row.get("title"):
        pass  # nested screener payload — keep outer title

    title = (row.get("title") or "").strip()
    if not title:
        m = re.search(r"• Title:\s*(.+)", text)
        title = m.group(1).strip() if m else text[:80] or "Untitled role"

    company = (row.get("company") or "").strip()
    if not company:
        m = re.search(r"• Company:\s*(.+)", text)
        company = m.group(1).strip() if m else ""

    location = (row.get("location") or "").strip()
    if not location:
        m = re.search(r"• Location:\s*(.+)", text)
        location = m.group(1).strip() if m else ""

    salary = (row.get("salary") or "").strip()
    if not salary:
        m = re.search(r"• Salary:\s*(.+)", text)
        salary = m.group(1).strip() if m else "Not specified"

    url = (
        row.get("application_link")
        or row.get("url")
        or row.get("link")
        or _first_url(text)
        or ""
    ).strip()

    rating = _match_rating(row, text)
    bullets = _parse_bullets(text)
    gaps = _gaps_text(row, text)
    risk_flags = _risk_flags(gaps)
    match_reasons = _match_reasons(row, text, bullets)
    platform = detect_platform(url)
    match_score = RATING_SCORE.get(rating, 50 if rating else 0)

    parts = [p for p in (location, salary if salary != "Not specified" else "", f"{rating} match" if rating else "") if p]
    summary = " · ".join(parts) if parts else (company or "New match")

    job_id = stable_job_id(url, title, index)
    raw_id = row.get("id") or url
    if raw_id and str(raw_id) != job_id:
        job_id = str(raw_id) if not str(raw_id).startswith("http") else job_id

    return {
        "id": str(job_id),
        "title": title,
        "company": company,
        "location": location,
        "salary": salary,
        "match_rating": rating,
        "match_score": match_score,
        "url": url,
        "summary": summary,
        "bullets": bullets,
        "match_reasons": match_reasons,
        "risk_flags": risk_flags,
        "gaps": gaps,
        "platform": platform,
        "full_text": text,
        "source": row.get("source") or "",
        "domain": urlparse(url).netloc if url else "",
        "discovered_at": row.get("discovered_at") or row.get("timestamp") or "",
    }
