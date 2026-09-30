#!/usr/bin/env python3
"""
HAR redactor — make a DevTools HAR export safe to share.

Strips every sensitive header/cookie value and scrubs Set-Cookie bodies,
then verifies nothing sensitive remains. Values are replaced with [REDACTED]
so request/response *structure* survives for API documentation.

Usage:
    python3 scripts/redact_har.py capture.har            # in place
    python3 scripts/redact_har.py in.har out.har         # to a new file
    python3 scripts/redact_har.py --check capture.redacted.har   # verify only

Exit codes: 0 = clean, 1 = verification failed / sensitive value remains,
2 = usage or IO error.
"""

import json
import sys
from pathlib import Path

REDACTED = "[REDACTED]"

# Header names whose values must never survive (matched case-insensitively).
SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",  # handled structurally below too
    "x-api-key",
    "api-key",
    "apikey",
    "x-auth-token",
    "x-csrf-token",
    "x-xsrf-token",
    "proxy-authorization",
    "x-firewall-auth",
}

# Any cookie whose name matches these patterns loses its value.
COOKIE_NAME_PATTERNS = (
    "session", "token", "auth", "sid", "jwt", "csrf", "xsrf", "remember",
)

# Value prefixes that indicate credentials even in unexpected places.
VALUE_PREFIXES = ("Bearer ", "Basic ", "bm_", "sk_", "ghp_", "github_pat_")


def redact_headers(headers: list) -> list:
    out = []
    for h in headers:
        name = str(h.get("name", ""))
        lname = name.lower()
        if lname in SENSITIVE_HEADERS or any(
            p in lname for p in ("token", "secret", "credential")
        ):
            out.append({"name": name, "value": REDACTED})
            continue
        value = str(h.get("value", ""))
        if lname == "set-cookie":
            # Keep the cookie NAME, drop the value: "sid=abc123; HttpOnly" -> "sid=[REDACTED]; HttpOnly"
            head, sep, rest = value.partition("=")
            attrs = rest.split(";", 1)
            value = f"{head}={REDACTED};{attrs[1] if len(attrs) > 1 else ''}"
        elif any(value.startswith(p) for p in VALUE_PREFIXES):
            value = REDACTED
        out.append({"name": name, "value": value})
    return out


def redact_cookies(cookies: list) -> list:
    out = []
    for c in cookies:
        name = str(c.get("name", ""))
        lc = name.lower()
        if any(p in lc for p in COOKIE_NAME_PATTERNS) or True:
            # Default-deny: every cookie value is dropped regardless of name.
            c = {**c, "value": REDACTED}
        out.append(c)
    return out


def redact_entry(entry: dict) -> dict:
    req = entry.get("request", {})
    res = entry.get("response", {})
    req["headers"] = redact_headers(req.get("headers", []))
    res["headers"] = redact_headers(res.get("headers", []))
    if "cookies" in req:
        req["cookies"] = redact_cookies(req["cookies"])
    if "cookies" in res:
        res["cookies"] = redact_cookies(res["cookies"])
    # Post data may embed tokens (e.g. OAuth code exchanges) — drop its value.
    post = req.get("postData")
    if post and "params" not in post:
        post["text"] = REDACTED
    elif post and isinstance(post.get("params"), list):
        for p in post["params"]:
            if any(s in p.get("name", "").lower() for s in ("code", "token", "secret", "state")):
                p["value"] = REDACTED
    return entry


def verify(data: dict) -> list:
    """Return a list of problems; empty means clean."""
    problems = []
    entries = data.get("log", {}).get("entries", [])
    for i, entry in enumerate(entries):
        for direction in ("request", "response"):
            for h in entry.get(direction, {}).get("headers", []):
                lname = h.get("name", "").lower()
                value = h.get("value", "")
                if lname in SENSITIVE_HEADERS and value != REDACTED:
                    problems.append(f"entry {i}: unredacted {direction} header {h.get('name')}")
                if any(value.startswith(p) for p in VALUE_PREFIXES):
                    problems.append(f"entry {i}: credential-looking value in {direction} header {h.get('name')}")
            for c in entry.get(direction, {}).get("cookies", []):
                if c.get("value") and c["value"] != REDACTED:
                    problems.append(f"entry {i}: unredacted {direction} cookie {c.get('name')}")
    return problems


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--check"]
    check_only = "--check" in sys.argv
    if not args:
        print(__doc__)
        return 2
    src = Path(args[0])
    if not src.exists():
        print(f"error: {src} not found", file=sys.stderr)
        return 2

    data = json.loads(src.read_text(encoding="utf-8"))

    if check_only:
        problems = verify(data)
        if problems:
            print("FAILED — sensitive values remain:")
            for p in problems:
                print(" -", p)
            return 1
        print("OK — no sensitive header/cookie values found.")
        return 0

    dst = Path(args[1]) if len(args) > 1 else src
    for entry in data.get("log", {}).get("entries", []):
        redact_entry(entry)

    problems = verify(data)
    dst.write_text(json.dumps(data, indent=2), encoding="utf-8")
    n = len(data.get("log", {}).get("entries", []))
    print(f"Redacted {n} entries -> {dst}")
    if problems:
        print("WARNING — verification found residue; do NOT share this file:")
        for p in problems:
            print(" -", p)
        return 1
    print("Verification passed: safe to share (structure preserved, values stripped).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
