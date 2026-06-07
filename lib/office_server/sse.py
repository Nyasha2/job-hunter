"""Parse office subprocess stdout into SSE events for React Activity panels."""

from __future__ import annotations

import ast
import json
import re
from typing import Any


APP_OUTPUT_PREFIX = "__DSLAPP__:"


def _looks_like_markdown_line(s: str) -> bool:
    t = s.strip()
    if len(t) < 2:
        return False
    if re.search(r"\x1b\[[0-9;]*m", s):
        return False
    if re.search(r"SITUATION ROOM|^[╔║╚═╠]", t):
        return False
    if t.startswith(("#", "- ", "* ", "+ ", "> ", "•", "\u2022")):
        return True
    if t.startswith("```"):
        return True
    if "**" in t[:160] and ("**" in t[3:] or t.count("**") >= 2):
        return True
    if re.match(r"^\d+\.\s", t):
        return True
    return False


def _unwrap_network_message_line(line: str) -> str:
    raw = line.rstrip("\n\r")
    m = re.match(r"^\s*\[\d+\]\s+", raw)
    if not m:
        return raw
    tail = raw[m.end() :].strip()
    if not (tail.startswith("{") and tail.endswith("}")):
        return raw
    try:
        obj = ast.literal_eval(tail)
    except (ValueError, SyntaxError, MemoryError):
        return raw
    if isinstance(obj, dict) and "text" in obj:
        return str(obj["text"])
    return raw


def _find_next_dslapp_marker(s: str, start: int) -> tuple[int, int]:
    i = s.find("__DSLAPP__:", start)
    j = s.find("DSLAPP:", start)
    candidates: list[tuple[int, int]] = []
    if i != -1:
        candidates.append((i, len("__DSLAPP__:")))
    if j != -1:
        if j >= 2 and s[j - 2 : j] == "__":
            start = j + 1
            return _find_next_dslapp_marker(s, start)
        candidates.append((j, len("DSLAPP:")))
    if not candidates:
        return -1, 0
    return min(candidates, key=lambda x: x[0])


def _dslapp_object_to_sse(obj: dict[str, Any], raw_fallback: str) -> tuple[str, dict[str, Any]]:
    t = obj.get("t") or obj.get("type")
    if t in ("markdown", "md"):
        body = obj.get("body") or obj.get("text") or ""
        return ("block", {"kind": "markdown", "body": str(body)})
    if t == "image":
        return (
            "block",
            {
                "kind": "image",
                "src": str(obj.get("src") or obj.get("url") or ""),
                "alt": str(obj.get("alt") or ""),
            },
        )
    if t == "log":
        return ("log", {"text": str(obj.get("body") or obj.get("text") or raw_fallback)})
    return ("block", {"kind": "json", "data": obj})


def _sanitize_wardrobe_display_markdown(md: str) -> str:
    if not md:
        return ""
    lines_out: list[str] = []
    for line in md.splitlines():
        s = line.strip()
        if not s:
            lines_out.append(line)
            continue
        if re.match(r"^(?:__)?DSLAPP__?:\s*", s, re.I):
            continue
        if "|" in s and "!" not in s and "`" not in s:
            if re.search(r"\bTops\b", s, re.I) and re.search(r"\bBottoms\b", s, re.I):
                continue
            if re.match(r"^[\s|:\-−—]+$", s):
                continue
            if re.match(r"^\|(?:\s*[-:]+[-\s:|]*)\|$", s):
                continue
        lines_out.append(line)
    text = "\n".join(lines_out)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _strip_inline_markdown_images(md: str) -> str:
    if not md:
        return ""
    without = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)
    without = re.sub(r"[ \t]+\n", "\n", without)
    return re.sub(r"\n{3,}", "\n\n", without).strip()


def _markdown_body_has_dslapp_marker(body: str) -> bool:
    pos, _ = _find_next_dslapp_marker(body, 0)
    return pos >= 0


def _expand_markdown_block_payload(payload: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    if payload.get("kind") != "markdown":
        return [("block", payload)]
    body = payload.get("body")
    if not isinstance(body, str) or not body.strip():
        return [("block", payload)]

    preserved = {k: v for k, v in payload.items() if k not in {"kind", "body"}}
    strip_imgs = _markdown_body_has_dslapp_marker(body)
    out: list[tuple[str, dict[str, Any]]] = []
    cursor = 0
    dec = json.JSONDecoder()
    s = body

    while True:
        pos, plen = _find_next_dslapp_marker(s, cursor)
        if pos < 0:
            tail = s[cursor:]
            chunk = _strip_inline_markdown_images(tail) if strip_imgs else tail
            sanitized = _sanitize_wardrobe_display_markdown(chunk)
            if sanitized.strip():
                out.append(("block", {"kind": "markdown", "body": sanitized, **preserved}))
            break
        head = s[cursor:pos]
        if head.strip():
            chunk = _strip_inline_markdown_images(head) if strip_imgs else head
            sanitized = _sanitize_wardrobe_display_markdown(chunk)
            if sanitized.strip():
                out.append(("block", {"kind": "markdown", "body": sanitized, **preserved}))
        j = pos + plen
        while j < len(s) and s[j] in " \t":
            j += 1
        try:
            obj, end = dec.raw_decode(s, j)
        except json.JSONDecodeError:
            cursor = pos + plen
            continue
        if isinstance(obj, dict):
            ev, pl = _dslapp_object_to_sse(obj, s[pos:end])
            if ev == "block" and pl.get("kind") == "markdown":
                out.extend(_expand_markdown_block_payload(pl))
            elif ev == "block":
                out.append((ev, pl))
            elif ev == "log":
                tx = pl.get("text", "")
                if tx.strip():
                    sanitized = _sanitize_wardrobe_display_markdown(tx)
                    if sanitized.strip():
                        out.append(("block", {**preserved, "kind": "markdown", "body": sanitized}))
        cursor = end

    if not out:
        chunk = _strip_inline_markdown_images(body) if strip_imgs else body
        sanitized = _sanitize_wardrobe_display_markdown(chunk)
        if sanitized.strip():
            return [("block", {"kind": "markdown", "body": sanitized, **preserved})]
        return []
    return out


def iter_stdout_sse_events(line: str) -> list[tuple[str, dict[str, Any]]]:
    raw = line.rstrip("\n\r")
    if not raw:
        return [("log", {"text": ""})]

    s = _unwrap_network_message_line(raw)
    out: list[tuple[str, dict[str, Any]]] = []
    cursor = 0
    dec = json.JSONDecoder()

    while True:
        pos, plen = _find_next_dslapp_marker(s, cursor)
        if pos < 0:
            tail = s[cursor:]
            if tail.strip():
                out.append(("log", {"text": tail}))
            break
        head = s[cursor:pos]
        if head.strip():
            out.append(("log", {"text": head}))
        j = pos + plen
        while j < len(s) and s[j] in " \t":
            j += 1
        try:
            obj, end = dec.raw_decode(s, j)
        except json.JSONDecodeError:
            out.append(("log", {"text": s[pos : pos + plen].strip() or "[Malformed DSLAPP JSON]"}))
            cursor = pos + plen
            continue
        if isinstance(obj, dict):
            out.append(_dslapp_object_to_sse(obj, s[pos:end]))
        else:
            out.append(("log", {"text": s[pos:end]}))
        cursor = end

    if not out:
        out.append(("log", {"text": raw}))

    if len(out) == 1 and out[0][0] == "log":
        t = out[0][1].get("text", "")
        if _looks_like_markdown_line(t):
            return [("block", {"kind": "markdown", "body": t, "source": "heuristic"})]
    return out


def format_sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
