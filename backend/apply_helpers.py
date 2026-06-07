"""Apply flow helpers — platform detection, profile autofill, question extraction."""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from html import unescape
from typing import Any

from job_normalize import detect_platform

AUTOFILL_PLATFORMS = frozenset({"greenhouse", "lever", "ashby"})


def profile_autofill_fields(profile: dict[str, Any]) -> list[dict[str, str]]:
    """Standard application fields mapped from the user profile."""
    linkedin = (profile.get("linkedin") or "").strip()
    if linkedin and not linkedin.startswith("http"):
        linkedin = f"https://www.linkedin.com/in/{linkedin.lstrip('/')}"

    github = (profile.get("github") or "").strip()
    if github and not github.startswith("http"):
        github = f"https://github.com/{github.lstrip('/')}"

    constraints = profile.get("application_constraints") or {}
    pref = profile.get("preferences") or {}

    fields: list[tuple[str, str]] = [
        ("Full name", profile.get("name") or ""),
        ("Email", profile.get("email") or ""),
        ("Phone", profile.get("phone") or ""),
        ("LinkedIn", linkedin),
        ("GitHub", github),
        ("Headline", profile.get("headline") or ""),
        ("Work authorization", constraints.get("work_authorization") or ""),
        ("Earliest start date", constraints.get("start_date") or ""),
    ]
    if pref.get("locations"):
        fields.append(("Preferred location", ", ".join(pref["locations"][:3])))
    if pref.get("min_salary"):
        fields.append(("Salary expectation", str(pref["min_salary"])))

    out: list[dict[str, str]] = []
    for label, value in fields:
        v = str(value or "").strip()
        if v:
            out.append({"field": label, "value": v})
    return out


def _strip_tags(html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(re.sub(r"\s+", " ", text))
    return text.strip()


def extract_questions_from_html(html: str, platform: str) -> list[str]:
    """Best-effort question labels from application page HTML."""
    questions: list[str] = []
    seen: set[str] = set()

    patterns: list[str] = []
    if platform == "greenhouse":
        patterns.extend(
            [
                r'class="[^"]*application-label[^"]*"[^>]*>([^<]+)<',
                r"<label[^>]*>([^<]{8,200})</label>",
            ]
        )
    elif platform == "lever":
        patterns.extend([r'class="[^"]*application-question[^"]*"[^>]*>([^<]+)<', r"<label[^>]*>([^<]{8,200})</label>"])
    else:
        patterns.append(r"<label[^>]*>([^<]{8,200})</label>")

    for pat in patterns:
        for m in re.finditer(pat, html, flags=re.I):
            q = _strip_tags(m.group(1))
            if len(q) < 8 or q.lower() in seen:
                continue
            if q.lower() in ("submit", "apply", "resume", "cover letter"):
                continue
            seen.add(q.lower())
            questions.append(q)

    # Textarea placeholders
    for m in re.finditer(r'<textarea[^>]*placeholder="([^"]{10,200})"', html, flags=re.I):
        q = m.group(1).strip()
        if q.lower() not in seen:
            seen.add(q.lower())
            questions.append(q)

    return questions[:25]


def fetch_application_page(url: str, timeout: int = 12) -> tuple[str | None, str | None]:
    """Fetch application URL HTML. Returns (html, error)."""
    if not url or not url.startswith("http"):
        return None, "Invalid URL"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; JobHunter/1.0; +https://localhost)",
            "Accept": "text/html",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(800_000)
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace"), None
    except urllib.error.HTTPError as exc:
        return None, f"HTTP {exc.code}"
    except Exception as exc:
        return None, str(exc)


def analyze_application_url(url: str) -> dict[str, Any]:
    platform = detect_platform(url)
    can_autofill = platform in AUTOFILL_PLATFORMS
    html, err = fetch_application_page(url) if url else (None, "No URL")
    questions: list[str] = []
    extract_error = err
    if html:
        questions = extract_questions_from_html(html, platform)
        if not questions and not err:
            extract_error = "Could not detect form questions — paste them manually."
    elif err:
        extract_error = err

    return {
        "platform": platform,
        "can_autofill": can_autofill,
        "autofill_mode": "assisted" if can_autofill else "manual",
        "extracted_questions": questions,
        "extract_error": extract_error,
    }
