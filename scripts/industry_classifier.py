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
        "PARTY COMMITTEE", "LOBBYIST", "LOBBYING",
        "GOVERNMENT RELATIONS", "GOVT. RELATIONS",
        "POLITICAL AFFAIRS", "POLITICAL ACTION",
        "POLITICAL CAMPAIGN", "POLITICAL ASSOC",
        "PAC", "P.A.C.", " PC ", "CCE", "COMMITTEE", "UNION",
        "LABOR ORGANIZATION", "LABOR ORG",
        "TRADE ASSOCIATION", "TRADE ASSOC",
        "SOCIAL WELFARE ORG", "SOCIAL WELFARE",
        "ADVOCACY ORGANIZATION", "ADVOCACY ORG", "ADVOCACY",
        "CIVIC ACTION", "GRASSROOTS",
        "501(C)", "501C", "C4 ORG", "C(4)",
        "STATE PARTY", "GOVERNORS ASSOC",
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
        "MANUFACTURED HOUSING", "MANUFACTURED HOME",
        "TITLE SERV", "TITLE INSUR",
    }),

    # Healthcare
    ("Healthcare", {
        "PHYSICIAN", "DOCTOR", "HEALTHCARE", "HEALTH CARE", "MEDICAL",
        "NURSE", "DENTIST", "PHARMACIST", "HOSPITAL",
        "SURGEON", "PSYCHIATRIST", "PSYCHOLOGIST", "THERAPIST",
        "MEDICINE", "PHYSICIAN'S", "RADIOLOG", "CARDIOLOG",
        "OPTOMETRIST", "OPTOMETRY", "CHIROPRACTOR", "VETERINARIAN", "DENTAL",
        "PHARMACEUTICAL", "PHARMACY",
        "NURSING HOME", "ASSISTED LIVING", "RETIREMENT COMMUNIT",
        "THERAPEUTICS", "BIOTECH", "BIOPHARMACEUTICAL",
    }),

    # Finance / Insurance / Accounting
    ("Finance & Insurance", {
        "FINANCE", "FINANCIAL SERVICES", "FINANCIAL ADVISOR",
        "INVESTMENT", "INVESTOR", "BANKER", "BANKING", "BANK",
        "SECURITIES", "INSURANCE", "ACCOUNTANT", "ACCOUNTING", "CPA",
        "WEALTH MANAGEMENT", "HEDGE FUND", "PRIVATE EQUITY",
        "STOCK BROKER", "FINANCIAL PLANNER",
        "HOLDING COMPANY",
    }),

    # Agriculture
    ("Agriculture", {
        "AGRICULTURE", "FARMING", "FARMER", "RANCHER", "RANCH",
        "CITRUS", "CATTLE", "SUGAR", "DAIRY", "POULTRY", "CROP", "GROWER",
        "NURSERY", "AGRIBUSINESS", "THOROUGHBRED", "EQUESTRIAN",
        "HEMP", "FERTILIZER", "TIMBER", "FORESTRY",
    }),

    # Construction / Contracting
    ("Construction", {
        "CONSTRUCTION", "BUILDER", "CONTRACTOR", "GENERAL CONTRACTOR",
        "SUBCONTRACTOR", "ELECTRICIAN", "PLUMBER", "HVAC",
        "ARCHITECT", "ARCHITECTURE", "STRUCTURAL", "MECHANICAL CONTRACTOR",
        "HEAVY EQUIPMENT", "MINING",
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

    # Retail / Hospitality / Food / Gaming
    ("Retail & Hospitality", {
        "RETAIL", "RESTAURANT", "HOSPITALITY", "HOTEL",
        "FOOD SERVICE", "FOOD AND BEVERAGE", "CATERING",
        "GROCERY", "WHOLESALE", "DISTRIBUTION",
        "CASINO", "PARI-MUTU", "PARIMUTUEL", "GAMING",
        "TOURISM", "RESORT", "THEME PARK", "AMUSEMENT",
        "SUPERMARKET", "SUPER MARKET",
        "BEVERAGE", "ALCOHOL", "LIQUOR",
        "TRIBAL", "INDIAN TRIBE", " TRIBE",
        "DAILY FANTASY",
    }),

    # Business Owner / Executive / Consulting / Media / Energy
    ("Business & Consulting", {
        "BUSINESS OWNER", "BUSINESSMAN", "ENTREPRENEUR", "EXECUTIVE", "CEO",
        "PRESIDENT", "MANAGING PARTNER", "CONSULTANT", "CONSULTING",
        "SELF-EMPLOYED", "SELF EMPLOYED", "MANAGEMENT", "MANAGER",
        "BUSINESS DEVELOPMENT", "SALES", "MARKETING", "ADVERTISING",
        "COMMUNICATIONS", "PUBLIC RELATIONS", "ENTERTAINMENT",
        "ENERGY", "TRANSPORTATION", "AUTO DEALER", "AUTOMOTIVE", "AUTOMOBILE",
        "TOBACCO", "MEDIA", "BROADCASTING", "PUBLISHING",
        "UTILITIES", "UTILITY", "PETROLEUM", "OIL AND GAS", "NATURAL GAS",
        "ELECTRIC COMPANY", "ELECTRIC CO",
        "CHAMBER OF COMMERCE",
        "CORPORATION", "BUSINESS",
        "NONPROFIT", "NON-PROFIT", "NON PROFIT", "NFP",
        "PHILANTHROPIST",
    }),

    # Government / Public Service / Military
    ("Government & Public Service", {
        "GOVERNMENT", "PUBLIC SERVANT", "CIVIL SERVICE",
        "MILITARY", "ARMED FORCES", "VETERAN", "LAW ENFORCEMENT",
        "POLICE", "FIREFIGHTER", "FIRE DEPARTMENT", "FIRE FIGHTER",
        "CITY EMPLOYEE", "COUNTY EMPLOYEE", "STATE EMPLOYEE",
        "ELECTED OFFICIAL", "COMMISSIONER",
        "CORRECTIONS", "DEPT. OF", "GOVT. AGENCY", "GOV. AGENCY",
        "SUPERVISOR OF ELECTIONS", "CLERK OF COURT",
        "FIRST LADY", "GOVERNOR",
    }),

    # Retired
    ("Retired", {
        "RETIRED", "RETIREE",
    }),

    # Not employed / homemaker / student
    ("Not Employed", {
        "NOT EMPLOYED", "UNEMPLOYED", "HOMEMAKER",
        "HOUSEWIFE", "STAY AT HOME", "STUDENT", "NONE", "N/A", "NA",
        "INFORMATION REQUESTE", "INFO REQUESTED",
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
        ("P.A.C.", "Political / Lobbying"),
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
        # New keyword smoke tests
        ("UTILITIES", "Business & Consulting"),
        ("POLITICAL CAMPAIGN", "Political / Lobbying"),
        ("TRADE ASSOCIATION", "Political / Lobbying"),
        ("LABOR ORGANIZATION", "Political / Lobbying"),
        ("501(C)4", "Political / Lobbying"),
        ("SOCIAL WELFARE ORGANIZATION", "Political / Lobbying"),
        ("CASINO/RESORT C.E.O.", "Retail & Hospitality"),
        ("PARI-MUTUELS", "Retail & Hospitality"),
        ("TOURISM", "Retail & Hospitality"),
        ("THEME PARKS & RESORTS", "Retail & Hospitality"),
        ("NURSING HOME", "Healthcare"),
        ("ASSISTED LIVING", "Healthcare"),
        ("CORRECTIONS", "Government & Public Service"),
        ("RANCH", "Agriculture"),
        ("THOROUGHBRED BREEDER", "Agriculture"),
        ("LOBBYING", "Political / Lobbying"),
        ("INFO REQUESTED", "Not Employed"),
        ("HOLDING COMPANY", "Finance & Insurance"),
        ("MANUFACTURED HOUSING", "Real Estate"),
    ]
    passed = 0
    for occ, expected in tests:
        result = classify_occupation(occ)
        status = "✓" if result == expected else "✗"
        if result != expected:
            print(f"  {status} '{occ}' → '{result}' (expected '{expected}')")
        passed += (result == expected)
    print(f"\n{passed}/{len(tests)} tests passed")
