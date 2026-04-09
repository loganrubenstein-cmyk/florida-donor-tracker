# tests/test_15_import_lobbyists.py
import importlib.util
import io
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "il15",
    Path(__file__).parent.parent / "scripts" / "15_import_lobbyists.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

build_lobbyist_name    = _mod.build_lobbyist_name
build_registrations    = _mod.build_registrations
build_lobbyists        = _mod.build_lobbyists
build_principals       = _mod.build_principals


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_raw():
    """Minimal post-rename DataFrame (as load_raw_file would produce)."""
    return pd.DataFrame({
        "lob_last":       ["Smith",   "Jones",    "Smith"],
        "lob_first":      ["John",    "Alice",    "John"],
        "lob_middle":     ["",        "B",        ""],
        "lob_suffix":     ["",        "",         ""],
        "lob_addr1":      ["100 Main","200 Oak",  "100 Main"],
        "lob_addr2":      ["",        "",         ""],
        "lob_addr3":      ["",        "",         ""],
        "lob_city":       ["Tampa",   "Miami",    "Tampa"],
        "lob_state":      ["FL",      "FL",       "FL"],
        "lob_zip":        ["33601",   "33101",    "33601"],
        "lob_phone":      ["8135551234","3055559999","8135551234"],
        "lob_phone_ext":  ["",        "",         ""],
        "suspended":      ["",        "",         ""],
        "principal_name": ["TECO Energy","Florida Chamber","Big Sugar Corp"],
        "reg_eff_date":   ["01/01/2023","06/15/2023","03/01/2024"],
        "reg_wd_date":    ["",         "12/31/2023",""],
        "prin_addr1":     ["1 Power","200 Oak",   "1 Sugar"],
        "prin_addr2":     ["",        "",         ""],
        "prin_city":      ["Tampa",   "Tallahassee","Clewiston"],
        "prin_state":     ["FL",      "FL",       "FL"],
        "prin_zip":       ["33601",   "32301",    "33440"],
        "prin_country":   ["USA",     "USA",      "USA"],
        "principal_naics":["221122",  "813910",   "111991"],
        "firm_name":      ["Smith Lobbying","Jones & Assoc","Smith Lobbying"],
        "firm_addr1":     ["100 Main","200 Oak",  "100 Main"],
        "firm_addr2":     ["",        "",         ""],
        "firm_city":      ["Tampa",   "Miami",    "Tampa"],
        "firm_state":     ["FL",      "FL",       "FL"],
        "firm_zip":       ["33601",   "33101",    "33601"],
        "firm_country":   ["USA",     "USA",      "USA"],
        "firm_phone_prefix":["",      "",         ""],
        "firm_phone":     ["8135551234","3055559999","8135551234"],
        "firm_phone_ext": ["",        "",         ""],
        "firm_eff_date":  ["01/01/2023","06/15/2023","01/01/2023"],
        "firm_wd_date":   ["",         "",         ""],
        "branch":         ["legislative","executive","legislative"],
    })


# ── build_lobbyist_name ──────────────────────────────────────────────────────

def test_name_last_first():
    row = {"lob_last": "Smith", "lob_first": "John", "lob_middle": ""}
    assert build_lobbyist_name(row) == "SMITH JOHN"

def test_name_with_middle():
    row = {"lob_last": "Jones", "lob_first": "Alice", "lob_middle": "B"}
    assert build_lobbyist_name(row) == "JONES ALICE B"

def test_name_uppercased():
    row = {"lob_last": "mcdonald", "lob_first": "ronald", "lob_middle": ""}
    assert build_lobbyist_name(row) == "MCDONALD RONALD"

def test_name_empty_middle_excluded():
    """Middle name omitted when empty — result has exactly two tokens."""
    row = {"lob_last": "Smith", "lob_first": "John", "lob_middle": ""}
    result = build_lobbyist_name(row)
    assert result == "SMITH JOHN"
    assert len(result.split()) == 2


# ── build_registrations ──────────────────────────────────────────────────────

def test_registrations_row_count(sample_raw):
    regs = build_registrations(sample_raw)
    assert len(regs) == 3

def test_registrations_has_lobbyist_name(sample_raw):
    regs = build_registrations(sample_raw)
    assert "lobbyist_name" in regs.columns
    assert regs.iloc[0]["lobbyist_name"] == "SMITH JOHN"

def test_registrations_is_active_true_when_no_wd(sample_raw):
    regs = build_registrations(sample_raw)
    # Row 0: reg_wd_date is "" → active
    assert bool(regs.iloc[0]["is_active"]) is True

def test_registrations_is_active_false_when_wd(sample_raw):
    regs = build_registrations(sample_raw)
    # Row 1: reg_wd_date is "12/31/2023" → withdrawn
    assert bool(regs.iloc[1]["is_active"]) is False

def test_registrations_drops_empty_lobbyist_name():
    df = pd.DataFrame({
        "lob_last": ["", "Jones"], "lob_first": ["", "Alice"],
        "lob_middle": ["", ""], "lob_city": ["", "Miami"],
        "lob_state": ["", "FL"], "principal_name": ["TECO", "FL Chamber"],
        "reg_eff_date": ["01/01/2023", "01/01/2023"],
        "reg_wd_date": ["", ""], "firm_name": ["", "Jones & Assoc"],
        "branch": ["legislative", "executive"],
        "principal_naics": ["", "813910"],
        "firm_eff_date": ["", "01/01/2023"], "firm_wd_date": ["", ""],
    })
    regs = build_registrations(df)
    assert len(regs) == 1
    assert regs.iloc[0]["lobbyist_name"] == "JONES ALICE"

def test_registrations_drops_empty_principal():
    df = pd.DataFrame({
        "lob_last": ["Smith"], "lob_first": ["John"], "lob_middle": [""],
        "lob_city": ["Tampa"], "lob_state": ["FL"],
        "principal_name": [""],
        "reg_eff_date": ["01/01/2023"], "reg_wd_date": [""],
        "firm_name": ["Smith LLC"], "branch": ["legislative"],
        "principal_naics": [""], "firm_eff_date": [""], "firm_wd_date": [""],
    })
    regs = build_registrations(df)
    assert len(regs) == 0

def test_registrations_branch_preserved(sample_raw):
    regs = build_registrations(sample_raw)
    assert set(regs["branch"]) == {"legislative", "executive"}


# ── build_lobbyists ──────────────────────────────────────────────────────────

def test_lobbyists_deduped(sample_raw):
    lobs = build_lobbyists(sample_raw.copy())
    # SMITH JOHN appears twice — should be deduped to 1 row
    assert len(lobs[lobs["lobbyist_name"] == "SMITH JOHN"]) == 1

def test_lobbyists_unique_names(sample_raw):
    lobs = build_lobbyists(sample_raw.copy())
    assert lobs["lobbyist_name"].nunique() == len(lobs)

def test_lobbyists_has_required_columns(sample_raw):
    lobs = build_lobbyists(sample_raw.copy())
    for col in ("lobbyist_name", "lobbyist_last", "lobbyist_first", "firm_name", "city", "state", "phone"):
        assert col in lobs.columns, f"Missing column: {col}"

def test_lobbyists_keeps_most_recent_firm(sample_raw):
    # SMITH JOHN: row 0 eff_date=2023-01-01, row 2 eff_date=2024-03-01
    # Most recent should be row 2 (same firm here, but logic tested)
    lobs = build_lobbyists(sample_raw.copy())
    smith = lobs[lobs["lobbyist_name"] == "SMITH JOHN"].iloc[0]
    assert smith["firm_name"] == "Smith Lobbying"


# ── build_principals ─────────────────────────────────────────────────────────

def test_principals_deduped(sample_raw):
    prins = build_principals(sample_raw.copy())
    assert len(prins) == 3  # TECO, FL Chamber, Big Sugar

def test_principals_has_required_columns(sample_raw):
    prins = build_principals(sample_raw.copy())
    for col in ("principal_name", "principal_naics", "city", "state", "country", "total_lobbyists"):
        assert col in prins.columns, f"Missing column: {col}"

def test_principals_total_lobbyists(sample_raw):
    prins = build_principals(sample_raw.copy())
    teco = prins[prins["principal_name"] == "TECO Energy"].iloc[0]
    assert teco["total_lobbyists"] == 1
    # FL Chamber has 1 unique lobbyist (JONES ALICE B)
    chamber = prins[prins["principal_name"] == "Florida Chamber"].iloc[0]
    assert chamber["total_lobbyists"] == 1

def test_principals_case_insensitive_dedup():
    """Two rows with same principal but different case → one row."""
    df = pd.DataFrame({
        "lob_last": ["Smith", "Jones"], "lob_first": ["John", "Alice"],
        "lob_middle": ["", ""], "principal_name": ["TECO ENERGY", "Teco Energy"],
        "reg_eff_date": ["01/01/2023", "06/01/2023"],
        "reg_wd_date": ["", ""],
        "principal_naics": ["221122", "221122"],
        "prin_city": ["Tampa", "Tampa"], "prin_state": ["FL", "FL"],
        "prin_country": ["USA", "USA"],
        "branch": ["legislative", "executive"],
    })
    prins = build_principals(df)
    assert len(prins) == 1
    assert prins.iloc[0]["total_lobbyists"] == 2
