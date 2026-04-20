"""Pure normalization primitives for vendor canonicalization.

Used by scripts 46b/c/d. Unit-tested in tests/test_vendor_norm.py.

Deliberately has no DB/IO dependencies so it can be imported cheaply and
tested in isolation. Every function is pure.
"""
from __future__ import annotations

import re

# Corporate suffixes to strip from the END of a name only.
# Order matters: longer forms first so "INCORPORATED" matches before "INC".
_CORP_SUFFIXES = [
    "INCORPORATED", "CORPORATION", "COMPANY", "LIMITED", "HOLDINGS",
    "TRUST", "INC", "LLC", "L L C", "LTD", "CORP", "CO", "LP", "L P",
    "LLP", "PLLC", "PLC", "PA", "PC",
]

_SUFFIX_RE = re.compile(
    r"(?:\s+(?:" + "|".join(re.escape(s) for s in _CORP_SUFFIXES) + r"))+$"
)

_NON_ALPHANUM = re.compile(r"[^A-Z0-9 ]")
_WHITESPACE = re.compile(r"\s+")

# Parser-artifact prefix: leading "INC " or "INC. " (the corp suffix
# ended up at the front due to "NAME, INC" parsing going wrong).
_LEAD_INC = re.compile(r"^(INC|LLC|CORP|CORPORATION)\s+", re.IGNORECASE)

# Trailing web/domain markers to strip.
_TRAILING_WEB = re.compile(r"\s+(COM|ORG|NET|IO|COM\*?.*)$")


def _swap_leading_inc(s: str) -> str:
    """Move leading 'INC '/'LLC '/'CORP ' token to end, then re-strip suffix.

    Handles parser artifacts like 'INC ANEDOT' → 'ANEDOT'.
    """
    m = _LEAD_INC.match(s)
    if not m:
        return s
    return s[m.end():].strip()


def _strip_trailing_web(s: str) -> str:
    """Strip trailing ' COM' / ' ORG' / ' NET' that come from URL normalization."""
    return _TRAILING_WEB.sub("", s).strip()


def normalize(name: str | None) -> str:
    """Return the canonical normalized form of a vendor name.

    Rules (in order):
      1. Uppercase.
      2. Replace '&' with ' AND '.
      3. Replace all non-alphanumeric (except space) with a space.
      4. Collapse whitespace, trim.
      5. Strip trailing corporate suffixes (repeat until stable — "INC LLC" → "").

    Returns empty string for None, empty, or non-alphanumeric-only inputs.
    Those are considered un-canonicalizable and the caller should drop them.
    """
    if name is None:
        return ""
    s = str(name).upper()
    s = s.replace("&", " AND ")
    s = _NON_ALPHANUM.sub(" ", s)
    s = _WHITESPACE.sub(" ", s).strip()
    if not s:
        return ""

    # Handle parser artifacts: 'INC ANEDOT' or 'INC. ANEDOT' → 'ANEDOT'.
    s = _swap_leading_inc(s)

    # Strip trailing web-domain markers ('FACEBOOK COM' → 'FACEBOOK').
    s = _strip_trailing_web(s)

    # Repeatedly strip suffixes so "FOO INC LLC" → "FOO".
    while True:
        new = _SUFFIX_RE.sub("", s).strip()
        if new == s:
            break
        s = new

    # One more web-strip pass in case suffix-strip revealed it.
    s = _strip_trailing_web(s)

    return s


def compact_form(normalized: str) -> str:
    """Normalized name with all internal spaces removed.

    Used as a secondary exact-match key so 'PAYPAL' and 'PAY PAL' collide,
    as do 'ACTBLUE' and 'ACT BLUE'. Applied as Pass 1.5 in the clusterer
    (after exact-normalized match, before fuzzy trigram).

    Returns empty string for empty input.
    """
    if not normalized:
        return ""
    return normalized.replace(" ", "")


def first_token(normalized: str) -> str:
    """First whitespace-separated token, or '' for empty input.

    Used as a cheap guard against cross-brand merges:
    'AMERICAN EXPRESS' and 'AMERICAN AIRLINES' share no other strong signal
    but have the same first token, so we require first_token match as a
    *necessary* condition for fuzzy merge — not sufficient.
    """
    if not normalized:
        return ""
    return normalized.split(" ", 1)[0]


def is_probable_government(normalized: str) -> bool:
    """Heuristic: does this look like a government entity?

    Used to exempt from aggressive suffix stripping. Not authoritative —
    authoritative flagging lives in vendor_entities.is_government, set by
    hand or by future corp_match pass.
    """
    if not normalized:
        return False
    tokens = set(normalized.split())
    gov_markers = {
        "USPS", "IRS", "SEC", "DOT", "FAA", "FBI",
        "POSTAL", "TREASURY", "REVENUE",
        "STATE", "COUNTY", "CITY", "MUNICIPAL",
        "DEPARTMENT", "BUREAU", "AGENCY", "AUTHORITY",
        "SHERIFF", "CLERK", "COURT",
    }
    return bool(tokens & gov_markers)


def is_probable_franchise(normalized: str) -> bool:
    """Heuristic: trailing geographic token suggests a location-specific franchise.

    "MARRIOTT ORLANDO" / "MARRIOTT TAMPA" — same brand, different locations,
    shouldn't auto-merge. We won't treat them as same entity.
    """
    if not normalized:
        return False
    fl_cities = {
        "TAMPA", "ORLANDO", "MIAMI", "JACKSONVILLE", "TALLAHASSEE",
        "GAINESVILLE", "PENSACOLA", "SARASOTA", "NAPLES", "OCALA",
        "LAKELAND", "CLEARWATER", "ST PETERSBURG", "FORT LAUDERDALE",
        "BOCA RATON", "WEST PALM BEACH", "KEY WEST", "DAYTONA",
        "BRADENTON", "MELBOURNE", "KISSIMMEE", "BONITA SPRINGS",
    }
    tokens = normalized.split()
    if len(tokens) < 2:
        return False
    # Check last 1-2 tokens as a franchise marker.
    last_one = tokens[-1]
    last_two = " ".join(tokens[-2:])
    return last_one in fl_cities or last_two in fl_cities
