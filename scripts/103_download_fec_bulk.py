#!/usr/bin/env python3
"""
103_download_fec_bulk.py

Download FEC bulk data files for multiple cycles.
Source: https://www.fec.gov/files/bulk-downloads/{cycle}/{file}.zip

Per cycle, pulls:
  cn{YY}.zip        candidate master
  cm{YY}.zip        committee master
  ccl{YY}.zip       candidate-committee linkages
  weball{YY}.zip    all-candidate financial summary
  webl{YY}.zip      PAC/party financial summary
  pas2{YY}.zip      committee->candidate contributions
  oth{YY}.zip       committee->committee transfers
  indiv{YY}.zip     individual contributions (LARGE)

Outputs to public/data/fec/{cycle}/ (gitignored).
Unzips in place for easy inspection.
Conditional-GET via Last-Modified cache (.meta sidecar).
"""
import sys
import time
import zipfile
from pathlib import Path

import requests

CRITICAL_FILES = {"cn", "cm", "ccl"}  # absence => hard failure

PROJECT = Path(__file__).resolve().parent.parent
DEST_ROOT = PROJECT / "public" / "data" / "fec"
DEST_ROOT.mkdir(parents=True, exist_ok=True)

CYCLES = [2016, 2018, 2020, 2022, 2024, 2026]
SMALL_FILES = ["cn", "cm", "ccl", "weball", "webl", "pas2", "oth"]
LARGE_FILES = []  # indiv*.zip skipped — too large for available disk (~5GB/cycle)
BASE = "https://www.fec.gov/files/bulk-downloads/{cycle}/{fname}"
UA = "Mozilla/5.0 (compatible; FLDonorTracker/1.0)"

CHUNK = 1024 * 1024  # 1 MB


def fetch(cycle: int, prefix: str) -> Path | None:
    yy = str(cycle)[-2:]
    fname = f"{prefix}{yy}.zip"
    url = BASE.format(cycle=cycle, fname=fname)
    dest_dir = DEST_ROOT / str(cycle)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / fname
    meta = dest_dir / f"{fname}.meta"

    headers = {"User-Agent": UA}
    if meta.exists() and dest.exists():
        headers["If-Modified-Since"] = meta.read_text().strip()

    t0 = time.time()
    try:
        with requests.get(url, headers=headers, stream=True, timeout=60) as r:
            if r.status_code == 304:
                print(f"  [cache] {fname} unchanged", flush=True)
                return dest
            if r.status_code == 404:
                print(f"  [404]   {fname} not available for cycle {cycle}", flush=True)
                return None
            r.raise_for_status()
            total = int(r.headers.get("Content-Length", 0))
            lm = r.headers.get("Last-Modified", "")
            mb = total / (1024 * 1024)
            print(f"  [GET]   {fname}  ({mb:.1f} MB) ...", flush=True)
            tmp = dest.with_suffix(".zip.part")
            written = 0
            with open(tmp, "wb") as f:
                for block in r.iter_content(CHUNK):
                    f.write(block)
                    written += len(block)
            if total and written != total:
                print(f"  [err]   {fname} short read: got {written} / expected {total}", flush=True)
                tmp.unlink(missing_ok=True)
                return None
            try:
                with zipfile.ZipFile(tmp) as _zf:
                    _zf.testzip()
            except (zipfile.BadZipFile, Exception) as e:
                print(f"  [err]   {fname} invalid zip after download: {e}", flush=True)
                tmp.unlink(missing_ok=True)
                return None
            tmp.replace(dest)
            if lm:
                meta.write_text(lm)
            dt = time.time() - t0
            print(f"  [done]  {fname} {written/1024/1024:.1f} MB in {dt:.0f}s", flush=True)
            return dest
    except requests.RequestException as e:
        print(f"  [err]   {fname}: {e}", flush=True)
        return None


def unzip(path: Path) -> None:
    out = path.parent
    try:
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                target = out / info.filename
                if target.exists() and target.stat().st_size == info.file_size:
                    continue
                z.extract(info, out)
                print(f"    unzipped {info.filename} ({info.file_size/1024/1024:.1f} MB)", flush=True)
    except zipfile.BadZipFile as e:
        print(f"  [err]   unzip {path.name}: {e}", flush=True)


def main():
    print("=" * 72)
    print("FEC bulk download")
    print("=" * 72)
    t0 = time.time()

    missing_critical = []
    per_cycle_counts = {}

    for cycle in CYCLES:
        print(f"\n--- cycle {cycle} ---", flush=True)
        ok = 0
        for prefix in SMALL_FILES + LARGE_FILES:
            p = fetch(cycle, prefix)
            if p and p.exists():
                unzip(p)
                ok += 1
            else:
                if prefix in CRITICAL_FILES:
                    missing_critical.append(f"{prefix}{str(cycle)[-2:]}.zip")
        per_cycle_counts[cycle] = ok

    print(f"\nTotal: {time.time()-t0:.0f}s")
    print("\nPer-cycle file counts:")
    for cycle, n in per_cycle_counts.items():
        print(f"  {cycle}: {n} / {len(SMALL_FILES) + len(LARGE_FILES)} files")

    if missing_critical:
        print(f"\nERROR: missing critical files: {', '.join(missing_critical)}", flush=True)
        sys.exit(1)
    print("\nAll critical files present.")


if __name__ == "__main__":
    main()
