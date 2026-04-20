"""Unit tests for scripts/_vendor_norm.py.

Run: .venv/bin/python -m pytest tests/test_vendor_norm.py -v
"""
import importlib.util
from pathlib import Path

import pytest

# scripts/_vendor_norm.py has a leading underscore → can't import as `scripts._vendor_norm`
# without a package __init__. Load it by path to sidestep naming rules.
_SPEC = importlib.util.spec_from_file_location(
    "vendor_norm",
    Path(__file__).resolve().parent.parent / "scripts" / "_vendor_norm.py",
)
vn = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(vn)


class TestNormalize:
    @pytest.mark.parametrize("raw,expected", [
        ("FACEBOOK", "FACEBOOK"),
        ("FACEBOOK INC", "FACEBOOK"),
        ("Facebook, Inc.", "FACEBOOK"),
        ("FACEBOOK INCORPORATED", "FACEBOOK"),
        ("FACEBOOK, INC", "FACEBOOK"),
        ("FACEBOOK LLC", "FACEBOOK"),
        ("facebook inc llc", "FACEBOOK"),
    ])
    def test_facebook_variants_collapse(self, raw, expected):
        assert vn.normalize(raw) == expected

    @pytest.mark.parametrize("raw,expected", [
        ("AT&T", "AT AND T"),
        ("AT & T", "AT AND T"),
        ("AT AND T", "AT AND T"),
    ])
    def test_ampersand_handling(self, raw, expected):
        assert vn.normalize(raw) == expected

    @pytest.mark.parametrize("raw,expected", [
        ("U.S. POSTAL SERVICE", "U S POSTAL SERVICE"),
        ("USPS", "USPS"),
        ("United States Postal Service", "UNITED STATES POSTAL SERVICE"),
    ])
    def test_punctuation_stripped(self, raw, expected):
        assert vn.normalize(raw) == expected

    @pytest.mark.parametrize("raw", [None, "", "   ", "!!!", ",,,"])
    def test_garbage_returns_empty(self, raw):
        assert vn.normalize(raw) == ""

    def test_suffix_not_stripped_mid_name(self):
        # "INC" in the middle of a name shouldn't be stripped.
        assert vn.normalize("RESEARCH INC GROUP") == "RESEARCH INC GROUP"

    def test_leading_inc_swapped(self):
        # Parser artifact: "INC ANEDOT" and "INC. ANEDOT" → "ANEDOT".
        # Tradeoff: legitimate names starting with "INC " (rare in vendor data)
        # will lose the prefix. Accepted for this domain.
        assert vn.normalize("INC ANEDOT") == "ANEDOT"
        assert vn.normalize("INC. ANEDOT") == "ANEDOT"

    def test_trailing_web_stripped(self):
        assert vn.normalize("FACEBOOK.COM") == "FACEBOOK"
        assert vn.normalize("ANEDOT.COM") == "ANEDOT"
        assert vn.normalize("AMAZON.COM") == "AMAZON"

    def test_whitespace_collapsed(self):
        assert vn.normalize("FOO    BAR") == "FOO BAR"
        assert vn.normalize("  FOO BAR  ") == "FOO BAR"

    def test_repeated_suffix_strip(self):
        # "FOO INC LLC" → "FOO"
        assert vn.normalize("FOO INC LLC") == "FOO"
        assert vn.normalize("FOO HOLDINGS INC") == "FOO"

    def test_idempotent(self):
        # normalize(normalize(x)) == normalize(x)
        for raw in ["FACEBOOK INC", "AT&T", "U.S. POSTAL SERVICE", "Marriott Orlando"]:
            once = vn.normalize(raw)
            twice = vn.normalize(once)
            assert once == twice, f"not idempotent: {raw!r} → {once!r} → {twice!r}"


class TestCompactForm:
    @pytest.mark.parametrize("a,b", [
        ("PAYPAL", "PAY PAL"),
        ("ACTBLUE", "ACT BLUE"),
        ("FACEBOOK", "FACE BOOK"),
    ])
    def test_known_compact_matches(self, a, b):
        na, nb = vn.normalize(a), vn.normalize(b)
        assert vn.compact_form(na) == vn.compact_form(nb)

    @pytest.mark.parametrize("a,b", [
        ("AMERICAN EXPRESS", "AMERICAN AIRLINES"),
        ("BANK OF AMERICA", "BANK OF FLORIDA"),
    ])
    def test_distinct_stay_distinct_compact(self, a, b):
        # Removing spaces shouldn't accidentally collide distinct brands.
        na, nb = vn.normalize(a), vn.normalize(b)
        assert vn.compact_form(na) != vn.compact_form(nb)

    def test_empty(self):
        assert vn.compact_form("") == ""


class TestFirstToken:
    def test_basic(self):
        assert vn.first_token("FACEBOOK INC") == "FACEBOOK"
        assert vn.first_token("AMERICAN EXPRESS") == "AMERICAN"
        assert vn.first_token("") == ""
        assert vn.first_token("ONEWORD") == "ONEWORD"


class TestGovernmentDetection:
    @pytest.mark.parametrize("name", [
        "USPS",
        "U S POSTAL SERVICE",
        "FLORIDA DEPARTMENT OF STATE",
        "HILLSBOROUGH COUNTY CLERK",
        "CITY OF TAMPA",
    ])
    def test_detects_gov(self, name):
        assert vn.is_probable_government(vn.normalize(name))

    @pytest.mark.parametrize("name", [
        "FACEBOOK",
        "JOHN SMITH CONSULTING",
        "MARRIOTT ORLANDO",
    ])
    def test_rejects_non_gov(self, name):
        assert not vn.is_probable_government(vn.normalize(name))


class TestFranchiseDetection:
    @pytest.mark.parametrize("name", [
        "MARRIOTT ORLANDO",
        "HILTON TAMPA",
        "COURTYARD BY MARRIOTT MIAMI",
    ])
    def test_detects_franchise(self, name):
        assert vn.is_probable_franchise(vn.normalize(name))

    @pytest.mark.parametrize("name", [
        "FACEBOOK",
        "USPS",
        "ORLANDO",  # single token — ambiguous, treat as non-franchise
    ])
    def test_rejects_non_franchise(self, name):
        assert not vn.is_probable_franchise(vn.normalize(name))


class TestCrossBrandSafety:
    """Regression tests: these pairs must NOT normalize to the same string."""

    @pytest.mark.parametrize("a,b", [
        ("AMERICAN EXPRESS", "AMERICAN AIRLINES"),
        ("MARRIOTT ORLANDO", "MARRIOTT TAMPA"),
        ("SMITH CONSULTING", "JONES CONSULTING"),
        ("BANK OF AMERICA", "BANK OF FLORIDA"),
    ])
    def test_distinct_brands_stay_distinct(self, a, b):
        assert vn.normalize(a) != vn.normalize(b)


class TestKnownCollisions:
    """These pairs SHOULD normalize to the same string (exact-pass merge)."""

    @pytest.mark.parametrize("a,b", [
        ("FACEBOOK INC", "FACEBOOK, INC."),
        ("FACEBOOK INC", "FACEBOOK LLC"),
        ("FACEBOOK", "Facebook, Inc."),
        ("AT&T", "AT & T"),
        ("PAYPAL INC", "PAYPAL"),
        ("GOOGLE LLC", "Google, Inc."),
    ])
    def test_known_same_entity(self, a, b):
        na, nb = vn.normalize(a), vn.normalize(b)
        assert na == nb, f"expected match: {a!r} → {na!r} vs {b!r} → {nb!r}"
