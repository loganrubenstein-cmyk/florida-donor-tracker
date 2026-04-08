"""
Industry classifier for FL campaign finance contributor occupations.

Maps free-text occupation strings to one of 15 industry buckets.
Designed for use in scripts 22, 27, or any other pipeline step.

Usage:
    from industry_classifier import classify_occupation
    industry = classify_occupation("REAL ESTATE DEVELOPER")  # → "Real Estate"
"""

# Rules checked in order — first match wins.
# Each rule is (bucket_name, keyword_set).
# Match is: any keyword is a substring of the normalized occupation.

_RULES = [
    # Political / lobbying — check first to avoid misclassifying
    ("Political / Lobbying", {
        "POLITICAL COMMITTEE", "POLITICAL ORG", "POLITICAL PARTY",
        "PARTY COMMITTEE", "LOBBYIST", "GOVERNMENT RELATIONS",
        "GOVT. RELATIONS", "POLITICAL AFFAIRS", "POLITICAL ACTION",
        "PAC", " PC ", "CCE", "COMMITTEE", "UNION",
    }),

    # Legal
    ("Legal", {
        "ATTORNEY", "LAWYER", "LAW FIRM", "LAW OFFICE", "LAWFIRM",
        "PARALEGAL", "LEGAL SERVICES", "ATTORNEYS", "LEGAL",
    }),

    # Real Estate
    ("Real Estate", {
        "REAL ESTATE", "REALTOR", "PROPERTY MANAGEMENT", "PROPERTY MGMT",
        "DEVELOPER", "DEVELOPMENT", "HOMEBUILDER", "LAND DEVELOPER",
        "MORTGAGE", "PROPERTY INVESTOR", "REAL PROPERTY",
    }),

    # Healthcare
    ("Healthcare", {
        "PHYSICIAN", "DOCTOR", "HEALTHCARE", "HEALTH CARE", "MEDICAL",
        "NURSE", "DENTIST", "PHARMACIST", "HOSPITAL",
        "SURGEON", "PSYCHIATRIST", "PSYCHOLOGIST", "THERAPIST",
        "MEDICINE", "PHYSICIAN'S", "RADIOLOG", "CARDIOLOG",
        "OPTOMETRIST", "OPTOMETRY", "CHIROPRACTOR", "VETERINARIAN", "DENTAL",
        "PHARMACEUTICAL", "PHARMACY",
    }),

    # Finance / Insurance / Accounting
    ("Finance & Insurance", {
        "FINANCE", "FINANCIAL SERVICES", "FINANCIAL ADVISOR",
        "INVESTMENT", "INVESTOR", "BANKER", "BANKING", "BANK",
        "SECURITIES", "INSURANCE", "ACCOUNTANT", "ACCOUNTING", "CPA",
        "WEALTH MANAGEMENT", "HEDGE FUND", "PRIVATE EQUITY",
        "STOCK BROKER", "FINANCIAL PLANNER",
    }),

    # Agriculture
    ("Agriculture", {
        "AGRICULTURE", "FARMING", "FARMER", "RANCHER", "CITRUS",
        "CATTLE", "SUGAR", "DAIRY", "POULTRY", "CROP", "GROWER",
        "NURSERY", "AGRIBUSINESS",
    }),

    # Construction / Contracting
    ("Construction", {
        "CONSTRUCTION", "BUILDER", "CONTRACTOR", "GENERAL CONTRACTOR",
        "SUBCONTRACTOR", "ELECTRICIAN", "PLUMBER", "HVAC",
        "ARCHITECT", "ARCHITECTURE", "STRUCTURAL", "MECHANICAL CONTRACTOR",
    }),

    # Education
    ("Education", {
        "TEACHER", "PROFESSOR", "EDUCATION", "EDUCATOR", "PRINCIPAL",
        "SUPERINTENDENT", "UNIVERSITY", "COLLEGE", "SCHOOL",
        "ACADEMIC", "FACULTY",
    }),

    # Technology / Engineering
    ("Technology / Engineering", {
        "SOFTWARE", "TECHNOLOGY", "TECH", "INFORMATION TECHNOLOGY",
        "COMPUTER", "DATA", "ENGINEER", "ENGINEERING",
        "IT PROFESSIONAL", "PROGRAMMER", "DEVELOPER", "SYSTEMS",
        "AEROSPACE", "TELECOMMUNICATIONS",
    }),

    # Retail / Hospitality / Food
    ("Retail & Hospitality", {
        "RETAIL", "RESTAURANT", "HOSPITALITY", "HOTEL",
        "FOOD SERVICE", "FOOD AND BEVERAGE", "CATERING",
        "GROCERY", "WHOLESALE", "DISTRIBUTION",
    }),

    # Business Owner / Executive / Consulting / Media
    ("Business & Consulting", {
        "BUSINESS OWNER", "BUSINESSMAN", "ENTREPRENEUR", "EXECUTIVE", "CEO",
        "PRESIDENT", "MANAGING PARTNER", "CONSULTANT", "CONSULTING",
        "SELF-EMPLOYED", "SELF EMPLOYED", "MANAGEMENT", "MANAGER",
        "BUSINESS DEVELOPMENT", "SALES", "MARKETING", "ADVERTISING",
        "COMMUNICATIONS", "PUBLIC RELATIONS", "ENTERTAINMENT",
        "ENERGY", "TRANSPORTATION", "AUTO DEALER", "AUTOMOTIVE",
        "TOBACCO", "GAMING",
    }),

    # Government / Public Service / Military
    ("Government & Public Service", {
        "GOVERNMENT", "PUBLIC SERVANT", "CIVIL SERVICE",
        "MILITARY", "ARMED FORCES", "VETERAN", "LAW ENFORCEMENT",
        "POLICE", "FIREFIGHTER", "FIRE DEPARTMENT",
        "CITY EMPLOYEE", "COUNTY EMPLOYEE", "STATE EMPLOYEE",
        "ELECTED OFFICIAL", "COMMISSIONER",
    }),

    # Retired
    ("Retired", {
        "RETIRED", "RETIREE",
    }),

    # Not employed / homemaker / student
    ("Not Employed", {
        "NOT EMPLOYED", "UNEMPLOYED", "HOMEMAKER",
        "HOUSEWIFE", "STAY AT HOME", "STUDENT", "NONE", "N/A", "NA",
        "INFORMATION REQUESTE",  # truncated "information requested"
    }),
]

# Exact match set for speed (normalized)
_EXACT_RETIRED = {"RETIRED", "RETIREE"}
_EXACT_NOT_EMPLOYED = {"NOT EMPLOYED", "UNEMPLOYED", "HOMEMAKER", "NONE", "N/A"}

_BUCKET_NAMES = [r[0] for r in _RULES] + ["Other"]


def classify_occupation(occupation: str) -> str:
    """
    Map a free-text occupation string to one of 15 industry buckets.
    Returns "Other" if no rule matches.

    Case-insensitive. Fast path for common values.
    """
    if not occupation or not str(occupation).strip():
        return "Not Employed"

    norm = str(occupation).strip().upper()

    # Fast path for exact common values
    if norm in _EXACT_RETIRED:
        return "Retired"
    if norm in _EXACT_NOT_EMPLOYED:
        return "Not Employed"

    # PAC / PC exact checks (short strings that could false-match)
    if norm in {"PAC", "CCE", "PC"}:
        return "Political / Lobbying"

    # Rule scan — substring matching
    for bucket, keywords in _RULES:
        for kw in keywords:
            if kw in norm:
                return bucket

    return "Other"


def bucket_names() -> list[str]:
    """Return all possible bucket names in display order."""
    return _BUCKET_NAMES[:]


if __name__ == "__main__":
    # Quick smoke test
    tests = [
        ("ATTORNEY", "Legal"),
        ("REAL ESTATE DEVELOPER", "Real Estate"),
        ("PHYSICIAN", "Healthcare"),
        ("RETIRED", "Retired"),
        ("NOT EMPLOYED", "Not Employed"),
        ("PAC", "Political / Lobbying"),
        ("GOVERNMENT RELATIONS", "Political / Lobbying"),
        ("SOFTWARE ENGINEER", "Technology / Engineering"),
        ("AGRICULTURE", "Agriculture"),
        ("CONSTRUCTION", "Construction"),
        ("RESTAURANT OWNER", "Retail & Hospitality"),
        ("CEO", "Business & Consulting"),
        ("TEACHER", "Education"),
        ("CPA", "Finance & Insurance"),
        ("INSURANCE", "Finance & Insurance"),
        ("", "Not Employed"),
        ("XYZUNKNOWN", "Other"),
    ]
    passed = 0
    for occ, expected in tests:
        result = classify_occupation(occ)
        status = "✓" if result == expected else "✗"
        if result != expected:
            print(f"  {status} '{occ}' → '{result}' (expected '{expected}')")
        passed += (result == expected)
    print(f"\n{passed}/{len(tests)} tests passed")
