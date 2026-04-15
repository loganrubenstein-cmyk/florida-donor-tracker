"""One-shot fix: restore clean 11-col headers on contributions CSV files."""
import csv
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROCESSED    = PROJECT_ROOT / "data" / "processed"

CORRECT_HEADER = [
    "report_year", "report_type", "contribution_date", "amount",
    "contributor_name", "contributor_address", "contributor_city_state_zip",
    "contributor_occupation", "type_code", "in_kind_description", "source_file",
]

csv.field_size_limit(10_000_000)


def fix_file(src: Path, extra_col: str | None = None) -> int:
    tmp = src.with_suffix(".csv.tmp")
    header = CORRECT_HEADER + ([extra_col] if extra_col else [])
    rows_written = 0
    with open(src, "r", encoding="utf-8", errors="replace", newline="") as fin, \
         open(tmp, "w", encoding="utf-8", newline="") as fout:
        reader = csv.reader(fin)
        writer = csv.writer(fout)
        next(reader)  # discard bloated header
        writer.writerow(header)
        for row in reader:
            if not row:
                continue
            core = (row[:11] + [""] * 11)[:11]  # always exactly 11
            if extra_col:
                canon = row[-1] if len(row) > 11 else ""
                writer.writerow(core + [canon])
            else:
                writer.writerow(core)
            rows_written += 1
            if rows_written % 1_000_000 == 0:
                print(f"  {rows_written:,} rows ...", flush=True)
    os.replace(tmp, src)
    return rows_written


def verify(path: Path, expected_cols: int) -> bool:
    with open(path, "r", encoding="utf-8", newline="") as f:
        header = next(csv.reader(f))
    ok = len(header) == expected_cols
    print(f"  {path.name}: {len(header)} cols — {'OK' if ok else 'WRONG'} — {header}")
    return ok


def main() -> int:
    print("=== Fix contributions.csv ===", flush=True)
    n1 = fix_file(PROCESSED / "contributions.csv")
    print(f"  {n1:,} rows written")

    print("=== Fix contributions_deduped.csv ===", flush=True)
    n2 = fix_file(PROCESSED / "contributions_deduped.csv", extra_col="canonical_name")
    print(f"  {n2:,} rows written")

    print("=== Verify ===", flush=True)
    ok1 = verify(PROCESSED / "contributions.csv", 11)
    ok2 = verify(PROCESSED / "contributions_deduped.csv", 12)

    if ok1 and ok2:
        print("ALL DONE — headers clean")
        return 0
    else:
        print("ERROR — header mismatch after fix", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
