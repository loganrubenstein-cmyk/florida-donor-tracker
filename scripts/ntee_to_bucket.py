"""
NTEE (National Taxonomy of Exempt Entities) → 15-bucket mapping.

NTEE codes are 3 chars: 1 letter major category + 2 digits subcategory.
We map primarily by major letter, with overrides for political subcategories.

Buckets mirror scripts/naics_to_bucket.py / industry_classifier.py.
"""

# Major letter → bucket
_MAJOR = {
    "A": "Retail & Hospitality",          # Arts, Culture, Humanities
    "B": "Education",                     # Education
    "C": "Other",                         # Environment (no bucket fit)
    "D": "Other",                         # Animal-Related
    "E": "Healthcare",                    # Health Care
    "F": "Healthcare",                    # Mental Health
    "G": "Healthcare",                    # Diseases, Disorders
    "H": "Healthcare",                    # Medical Research
    "I": "Legal",                         # Crime, Legal-Related
    "J": "Business & Consulting",         # Employment
    "K": "Agriculture",                   # Food, Agriculture, Nutrition
    "L": "Real Estate",                   # Housing, Shelter
    "M": "Government & Public Service",   # Public Safety, Disaster Prep
    "N": "Retail & Hospitality",          # Recreation, Sports, Leisure
    "O": "Education",                     # Youth Development
    "P": "Government & Public Service",   # Human Services
    "Q": "Political / Lobbying",          # International Affairs (advocacy-heavy)
    "R": "Political / Lobbying",          # Civil Rights, Advocacy
    "S": "Political / Lobbying",          # Community Improvement, Capacity
    "T": "Political / Lobbying",          # Philanthropy, Voluntarism, Grantmaking
    "U": "Technology / Engineering",      # Science & Technology
    "V": "Education",                     # Social Science
    "W": "Political / Lobbying",          # Public, Society Benefit (527s often here)
    "X": "Other",                         # Religion-Related
    "Y": "Finance & Insurance",           # Mutual/Membership Benefit
    "Z": "Other",                         # Unknown
}

# 501(c) subsection → bucket fallback when NTEE missing
_SUBSECTION = {
    "03": "Other",                        # 501(c)(3) charities — too broad
    "04": "Political / Lobbying",         # 501(c)(4) social welfare
    "05": "Political / Lobbying",         # 501(c)(5) labor unions
    "06": "Political / Lobbying",         # 501(c)(6) business leagues
    "07": "Political / Lobbying",         # 501(c)(7) social clubs — but used by PACs sometimes
    "27": "Political / Lobbying",         # 527 political orgs (rarely in BMF, but just in case)
}


def classify_ntee(ntee_code, subsection=None) -> str:
    """Map NTEE code (and optional subsection) to a 15-bucket name.

    Priority:
      1. NTEE major letter (if present and valid)
      2. Subsection fallback (for orgs with no NTEE)
      3. 'Other'
    """
    c = str(ntee_code or "").strip().upper()
    if c and c[0] in _MAJOR:
        return _MAJOR[c[0]]
    if subsection:
        s = str(subsection).strip().zfill(2)
        if s in _SUBSECTION:
            return _SUBSECTION[s]
    return "Other"


if __name__ == "__main__":
    tests = [
        ("R20", None, "Political / Lobbying"),  # Civil Rights
        ("T20", None, "Political / Lobbying"),  # Private Foundations
        ("W20", None, "Political / Lobbying"),  # Govt & Public Admin (public affairs)
        ("B40", None, "Education"),
        ("E20", None, "Healthcare"),
        ("X20", None, "Other"),                 # Religion
        ("",    "04", "Political / Lobbying"),  # 501(c)(4) w/o NTEE
        ("",    "03", "Other"),                 # 501(c)(3) w/o NTEE — too broad
        (None,  None, "Other"),
    ]
    for ntee, sub, expected in tests:
        got = classify_ntee(ntee, sub)
        mark = "✓" if got == expected else "✗"
        print(f"  {mark} ntee={ntee!r:<6} sub={sub!r:<5} → {got} (expected {expected})")
