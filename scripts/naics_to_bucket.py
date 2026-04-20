"""
NAICS 6-digit → 15-bucket mapping for FL donor industry classification.

Buckets mirror scripts/industry_classifier.py. First-match rules:
1. 6-digit override (specific cases like 813910 Business Associations)
2. 3-digit prefix override (e.g. 813 civic/religious)
3. 2-digit sector fallback
"""

BUCKETS = [
    "Political / Lobbying", "Legal", "Real Estate", "Healthcare",
    "Finance & Insurance", "Agriculture", "Construction", "Education",
    "Technology / Engineering", "Retail & Hospitality",
    "Business & Consulting", "Government & Public Service",
    "Retired", "Not Employed", "Other",
]

_OVERRIDES_6 = {
    # Legal (Professional Services 541)
    "541110": "Legal", "541120": "Legal", "541191": "Legal",
    "541199": "Legal",
    # Accounting
    "541211": "Finance & Insurance", "541213": "Finance & Insurance",
    "541214": "Finance & Insurance", "541219": "Finance & Insurance",
    # Management consulting → Business & Consulting (already sector default)
    # Architecture / Engineering → Technology / Engineering
    "541310": "Technology / Engineering", "541320": "Technology / Engineering",
    "541330": "Technology / Engineering", "541340": "Technology / Engineering",
    "541350": "Technology / Engineering", "541360": "Technology / Engineering",
    "541370": "Technology / Engineering", "541380": "Technology / Engineering",
    # Computer systems design
    "541511": "Technology / Engineering", "541512": "Technology / Engineering",
    "541513": "Technology / Engineering", "541519": "Technology / Engineering",
    # Scientific R&D → Technology / Engineering
    "541713": "Technology / Engineering", "541714": "Technology / Engineering",
    "541715": "Technology / Engineering", "541720": "Technology / Engineering",
    # Advertising / PR → Business & Consulting (already default)
    # Political / civic (813 sector)
    "813910": "Political / Lobbying",  # Business Associations
    "813920": "Political / Lobbying",  # Professional Orgs
    "813930": "Political / Lobbying",  # Labor Unions
    "813940": "Political / Lobbying",  # Political Orgs
    "813211": "Political / Lobbying",  # Grantmaking Foundations
    "813212": "Political / Lobbying",  # Voluntary Health Orgs
    "813219": "Political / Lobbying",  # Other Grantmaking
    # Entertainment
    "711211": "Retail & Hospitality",  # Sports Teams
    "713210": "Retail & Hospitality",  # Casinos
    "713290": "Retail & Hospitality",  # Other Gambling (DraftKings etc.)
    # Utilities → Business & Consulting
    "221111": "Business & Consulting", "221112": "Business & Consulting",
    "221113": "Business & Consulting", "221114": "Business & Consulting",
    "221115": "Business & Consulting", "221116": "Business & Consulting",
    "221117": "Business & Consulting", "221118": "Business & Consulting",
    "221121": "Business & Consulting", "221122": "Business & Consulting",
    # Pharma → Healthcare
    "325411": "Healthcare", "325412": "Healthcare", "325413": "Healthcare",
    "325414": "Healthcare",
}

_OVERRIDES_3 = {
    "541": "Business & Consulting",  # Professional services default
    "621": "Healthcare", "622": "Healthcare", "623": "Healthcare",
    "624": "Healthcare",  # Social Assistance
    "811": "Retail & Hospitality",  # Repair
    "812": "Retail & Hospitality",  # Personal services
    "813": "Other",  # Religious/civic (except overridden above)
    "921": "Government & Public Service",
    "922": "Government & Public Service",
    "923": "Government & Public Service",
    "924": "Government & Public Service",
    "925": "Government & Public Service",
    "926": "Government & Public Service",
    "927": "Government & Public Service",
    "928": "Government & Public Service",
}

_SECTOR_MAP = {
    "11": "Agriculture",
    "21": "Business & Consulting",   # Mining/Oil/Gas
    "22": "Business & Consulting",   # Utilities
    "23": "Construction",
    "31": "Business & Consulting", "32": "Business & Consulting", "33": "Business & Consulting",  # Manufacturing
    "42": "Retail & Hospitality",    # Wholesale
    "44": "Retail & Hospitality", "45": "Retail & Hospitality",  # Retail
    "48": "Business & Consulting", "49": "Business & Consulting",  # Transportation/Warehousing
    "51": "Technology / Engineering",  # Information
    "52": "Finance & Insurance",
    "53": "Real Estate",
    "54": "Business & Consulting",   # Professional/Scientific (overridden above for specifics)
    "55": "Finance & Insurance",     # Management of Companies
    "56": "Business & Consulting",   # Admin/Support/Waste
    "61": "Education",
    "62": "Healthcare",
    "71": "Retail & Hospitality",    # Arts/Entertainment
    "72": "Retail & Hospitality",    # Accommodation/Food
    "81": "Other",                    # Other Services (overridden above)
    "92": "Government & Public Service",
}


def classify_naics(code) -> str:
    """Map a 6-digit NAICS code to one of the 15 buckets. Returns 'Other' for invalid codes."""
    if code is None:
        return "Other"
    c = str(code).strip()
    if len(c) < 2 or not c[:2].isdigit():
        return "Other"
    c6 = c[:6].ljust(6, "0") if len(c) >= 2 else c
    if c in _OVERRIDES_6:
        return _OVERRIDES_6[c]
    if c6 in _OVERRIDES_6:
        return _OVERRIDES_6[c6]
    c3 = c[:3]
    if c3 in _OVERRIDES_3:
        return _OVERRIDES_3[c3]
    c2 = c[:2]
    return _SECTOR_MAP.get(c2, "Other")


if __name__ == "__main__":
    tests = [
        ("111419", "Agriculture"),          # Trulieve (greenhouse)
        ("221122", "Business & Consulting"),  # FPL
        ("445110", "Retail & Hospitality"),  # Publix
        ("813910", "Political / Lobbying"),  # FL Realtors
        ("541110", "Legal"),
        ("541211", "Finance & Insurance"),
        ("622110", "Healthcare"),           # Hospitals
        ("713290", "Retail & Hospitality"), # DraftKings
        ("325412", "Healthcare"),           # Pharma
        ("523110", "Finance & Insurance"),
        ("999999", "Other"),
        (None, "Other"),
        ("", "Other"),
    ]
    for code, expected in tests:
        got = classify_naics(code)
        status = "✓" if got == expected else "✗"
        print(f"  {status} {code!r:>12} → {got} (expected {expected})")
