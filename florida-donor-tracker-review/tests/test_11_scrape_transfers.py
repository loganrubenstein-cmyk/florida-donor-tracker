# tests/test_11_scrape_transfers.py
import importlib.util
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "scrape11",
    Path(__file__).parent.parent / "scripts" / "11_scrape_transfers.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

_looks_like_tsv             = _mod._looks_like_tsv
_looks_like_html_data_table = _mod._looks_like_html_data_table
_looks_like_plaintext_report= _mod._looks_like_plaintext_report
parse_plaintext_page        = _mod.parse_plaintext_page
_TRANSFER_PROBE_VARIANTS    = _mod._TRANSFER_PROBE_VARIANTS
_TRANSFER_BASE_PARAMS       = _mod._TRANSFER_BASE_PARAMS


# ── _looks_like_tsv ──────────────────────────────────────────────────────────

def test_looks_like_tsv_detects_tab_header():
    text = "Candidate/Committee\tDate\tAmount\tFunds Transferred To\n4700\t01/01/2020\t1000.00\tFoo PAC"
    assert _looks_like_tsv(text) is True

def test_looks_like_tsv_rejects_html():
    text = "<html><body><table><tr><td>data</td></tr></table></body></html>"
    assert _looks_like_tsv(text) is False

def test_looks_like_tsv_rejects_empty():
    assert _looks_like_tsv("") is False
    assert _looks_like_tsv("   ") is False

def test_looks_like_tsv_rejects_no_tabs():
    assert _looks_like_tsv("just some text with no tabs") is False


# ── _looks_like_html_data_table ───────────────────────────────────────────────

def test_looks_like_html_data_table_detects_transfer_table():
    text = "<html><body><table><tr><td>fund transfer</td><td>amount</td></tr></table></body></html>"
    assert _looks_like_html_data_table(text) is True

def test_looks_like_html_data_table_rejects_plain_text():
    text = "Republican Party of Florida    01/01/1999    5000.00  SUNTRUST BANK"
    assert _looks_like_html_data_table(text) is False

def test_looks_like_html_data_table_rejects_empty():
    assert _looks_like_html_data_table("") is False


# ── _looks_like_plaintext_report ─────────────────────────────────────────────

def test_looks_like_plaintext_detects_fund_transfer():
    text = "Republican Party of Florida (PTY)    08/24/1999    1,039.68  SUNTRUST BANK\n\n252 Fund Transfer(s) Selected"
    assert _looks_like_plaintext_report(text) is True

def test_looks_like_plaintext_detects_selected_footer():
    text = "Some Committee    01/01/2000    500.00  Some Entity\n\n10 Fund Transfer(s) Selected"
    assert _looks_like_plaintext_report(text) is True

def test_looks_like_plaintext_rejects_html():
    text = "<html><body><table><tr><td>transfer</td></tr></table></body></html>"
    assert _looks_like_plaintext_report(text) is False

def test_looks_like_plaintext_rejects_empty():
    assert _looks_like_plaintext_report("") is False


# ── parse_plaintext_page ──────────────────────────────────────────────────────

_SAMPLE_PLAINTEXT = """\
Republican Party of Florida (PTY)    08/24/1999    1,039.68  SUNTRUST BANK
Republican Party of Florida (PTY)    08/25/1999      887.39  SUNTRUST BANK
Republican Party of Florida (PTY)    09/01/1999   75,042.78  SUNTRUST BANK
---------------------------------------------------------------------
                        Total:   12,137,899.09

252 Fund Transfer(s) Selected
"""

def test_parse_plaintext_returns_dataframe():
    df = parse_plaintext_page(_SAMPLE_PLAINTEXT)
    assert isinstance(df, pd.DataFrame)

def test_parse_plaintext_correct_row_count():
    df = parse_plaintext_page(_SAMPLE_PLAINTEXT)
    assert len(df) == 3

def test_parse_plaintext_columns():
    df = parse_plaintext_page(_SAMPLE_PLAINTEXT)
    assert set(df.columns) == {"transferor_name", "transfer_date", "amount", "transferee_name"}

def test_parse_plaintext_transferor_name():
    df = parse_plaintext_page(_SAMPLE_PLAINTEXT)
    assert df["transferor_name"].iloc[0] == "Republican Party of Florida (PTY)"

def test_parse_plaintext_transferee_name():
    df = parse_plaintext_page(_SAMPLE_PLAINTEXT)
    assert df["transferee_name"].iloc[0] == "SUNTRUST BANK"

def test_parse_plaintext_date():
    df = parse_plaintext_page(_SAMPLE_PLAINTEXT)
    assert df["transfer_date"].iloc[0] == "08/24/1999"

def test_parse_plaintext_amount_strips_commas():
    df = parse_plaintext_page(_SAMPLE_PLAINTEXT)
    # "75,042.78" should become "75042.78" (commas stripped)
    assert df["amount"].iloc[2] == "75042.78"

def test_parse_plaintext_skips_dashes_and_totals():
    df = parse_plaintext_page(_SAMPLE_PLAINTEXT)
    # Dash line and Total line should not appear as rows
    texts = df["transferor_name"].tolist()
    assert not any("---" in t or "Total" in t for t in texts)

def test_parse_plaintext_empty_input():
    df = parse_plaintext_page("")
    assert df.empty

def test_parse_plaintext_no_matches():
    df = parse_plaintext_page("0 Fund Transfer(s) Selected\n")
    assert df.empty


# ── Probe variant structure ───────────────────────────────────────────────────

def test_probe_variants_count():
    assert len(_TRANSFER_PROBE_VARIANTS) == 4

def test_all_variants_have_election_all():
    for i, v in enumerate(_TRANSFER_PROBE_VARIANTS):
        assert v.get("election") == "All", f"Variant {i+1} missing election=All"

def test_all_variants_have_search_on_1():
    for i, v in enumerate(_TRANSFER_PROBE_VARIANTS):
        assert v.get("search_on") == "1", f"Variant {i+1} has wrong search_on"

def test_all_variants_have_comname_placeholder():
    for i, v in enumerate(_TRANSFER_PROBE_VARIANTS):
        assert "{comname}" in v.get("ComName", ""), f"Variant {i+1} missing {{comname}} placeholder"

def test_base_params_has_required_fields():
    required = {"election", "search_on", "ComName", "ComNameSrch", "rowlimit", "Submit"}
    assert required <= set(_TRANSFER_BASE_PARAMS.keys())
