#!/usr/bin/env python3
"""
46a_sweep_vendor_thresholds.py

Threshold-tuning harness for vendor canonicalization.
Reads tests/vendor_canon_labels.csv, applies the full 3-pass clustering
logic at a sweep of trigram thresholds, prints confusion matrix at each.

Pass 1:   exact normalize() match → force merge
Pass 1.5: compact_form() match → force merge
Pass 2:   first_token match AND trigram similarity >= threshold → merge

Exit 0 if the best threshold meets target (FP <= 5%, FN <= 10%).
Exit 1 otherwise.

Usage:
    .venv/bin/python scripts/46a_sweep_vendor_thresholds.py
"""
import csv
import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
_SPEC = importlib.util.spec_from_file_location(
    "vn", PROJECT_ROOT / "scripts" / "_vendor_norm.py"
)
vn = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(vn)

LABELS_PATH = PROJECT_ROOT / "tests" / "vendor_canon_labels.csv"

# Targets from the plan doc
MAX_FP_RATE = 0.05
MAX_FN_RATE = 0.10


def trigrams(s: str) -> set:
    """Return pg_trgm-style trigram set.

    pg_trgm pads with 2 leading spaces + 1 trailing space before
    extracting 3-char windows. We replicate that exactly so the sweep
    matches what Postgres similarity() will produce in production.
    """
    if not s:
        return set()
    padded = "  " + s + " "
    return {padded[i:i + 3] for i in range(len(padded) - 2)}


def similarity(a: str, b: str) -> float:
    """pg_trgm-compatible similarity: |intersection| / |union|."""
    ta, tb = trigrams(a), trigrams(b)
    if not ta and not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def containment(a: str, b: str) -> float:
    """Asymmetric: |intersection| / |shorter's trigrams|.

    Designed for stem-vs-expansion matching. 'ANEDOT' vs
    'ANEDOT PROCESSING SERVICE' → ~1.0 because all ANEDOT trigrams
    appear in the expansion, even though Jaccard drops to 0.27.
    """
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb:
        return 0.0
    shorter = ta if len(ta) <= len(tb) else tb
    return len(ta & tb) / len(shorter)


def is_expansion(shorter_norm: str, longer_norm: str) -> bool:
    """True if shorter's full form prefixes longer — e.g., 'ANEDOT' ⊂ 'ANEDOT INC'.

    Guards containment merge against false positives like 'DATA TARGETING'
    vs 'DATA TARGETING RESEARCH' (which IS same vendor) vs 'DATA CORP'
    (which is not). We require the shorter's tokens to all appear as a
    prefix of the longer's tokens.
    """
    sa = shorter_norm.split()
    sb = longer_norm.split()
    if len(sa) > len(sb):
        return False
    return sb[:len(sa)] == sa


def would_merge(a_raw: str, b_raw: str, threshold: float) -> tuple[bool, str]:
    """Apply full 3-pass logic. Returns (merged, reason)."""
    na = vn.normalize(a_raw)
    nb = vn.normalize(b_raw)

    if not na or not nb:
        return (False, "empty")

    if na == nb:
        return (True, "pass1_exact")

    ca, cb = vn.compact_form(na), vn.compact_form(nb)
    if ca and cb and ca == cb:
        return (True, "pass1.5_compact")

    # Pass 2 guards
    if vn.is_probable_franchise(na) or vn.is_probable_franchise(nb):
        return (False, "franchise_guarded")

    fa, fb = vn.first_token(na), vn.first_token(nb)
    if fa != fb:
        return (False, "first_token_mismatch")

    # Pass 2: Jaccard trigram.
    # (Tried a prefix-expansion pass here — too aggressive, false-positives
    # on 'GOOGLE' vs 'GOOGLE WORKSPACE' and similar. Those go to manual.)
    sim = similarity(na, nb)
    if sim >= threshold:
        return (True, f"pass2b_fuzzy_{sim:.2f}")

    return (False, f"below_threshold_{sim:.2f}")


def load_labels():
    pairs = []
    with open(LABELS_PATH, newline="") as f:
        for row in csv.DictReader(f):
            pairs.append({
                "label": row["label"].strip(),
                "a": row["name_a"].strip(),
                "b": row["name_b"].strip(),
                "category": row["category"].strip(),
                "merge_policy": row["merge_policy"].strip(),
                "rationale": row["rationale"].strip(),
            })
    return pairs


def evaluate(pairs, threshold: float):
    tp = fp = fn = tn = 0
    fp_examples, fn_examples = [], []

    for p in pairs:
        merged, reason = would_merge(p["a"], p["b"], threshold)
        gold = (p["label"] == "match")

        if merged and gold:
            tp += 1
        elif merged and not gold:
            fp += 1
            fp_examples.append((p["a"], p["b"], reason, p["rationale"]))
        elif not merged and gold:
            fn += 1
            fn_examples.append((p["a"], p["b"], reason, p["rationale"]))
        else:
            tn += 1

    total_pos = tp + fn
    total_neg = fp + tn
    fp_rate = fp / total_neg if total_neg else 0.0
    fn_rate = fn / total_pos if total_pos else 0.0

    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "fp_rate": fp_rate, "fn_rate": fn_rate,
        "fp_examples": fp_examples, "fn_examples": fn_examples,
    }


def main() -> int:
    all_pairs = load_labels()
    # Automated-pipeline target only. Manual-merge pairs live in the
    # `manual_merge` source type and are scored separately (not here).
    pairs = [p for p in all_pairs if p["merge_policy"] == "auto"]
    print(f"Loaded {len(all_pairs)} labeled pairs ({len(pairs)} auto, "
          f"{len(all_pairs) - len(pairs)} manual — scoring auto only)")
    print(f"  {sum(1 for p in pairs if p['label'] == 'match')} match")
    print(f"  {sum(1 for p in pairs if p['label'] == 'no_match')} no_match")
    print()

    thresholds = [0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]
    results = {}

    print(f"{'thresh':>8} {'TP':>5} {'FP':>5} {'FN':>5} {'TN':>5} "
          f"{'FP rate':>8} {'FN rate':>8}  status")
    print("-" * 70)

    for t in thresholds:
        r = evaluate(pairs, t)
        results[t] = r
        meets = r["fp_rate"] <= MAX_FP_RATE and r["fn_rate"] <= MAX_FN_RATE
        status = "✓ meets target" if meets else ""
        print(f"{t:>8.2f} {r['tp']:>5} {r['fp']:>5} {r['fn']:>5} {r['tn']:>5} "
              f"{r['fp_rate']:>7.1%} {r['fn_rate']:>7.1%}  {status}")

    # Pick best threshold: lowest FN rate among thresholds that meet FP target.
    # If none meet FP target, pick lowest (FP + FN).
    meeting = [t for t in thresholds
               if results[t]["fp_rate"] <= MAX_FP_RATE
               and results[t]["fn_rate"] <= MAX_FN_RATE]
    if meeting:
        # Tiebreaker: minimize FP first (safety), then minimize FN.
        best = min(meeting, key=lambda t: (results[t]["fp_rate"],
                                           results[t]["fn_rate"]))
    else:
        best = min(thresholds, key=lambda t: results[t]["fp"] + results[t]["fn"])

    print(f"\nBest threshold: {best:.2f}")
    r = results[best]

    if r["fp_examples"]:
        print(f"\n  False positives at {best} ({len(r['fp_examples'])}):")
        for a, b, reason, rationale in r["fp_examples"][:15]:
            print(f"    [{reason}]  {a!r}  ↔  {b!r}  — {rationale}")

    if r["fn_examples"]:
        print(f"\n  False negatives at {best} ({len(r['fn_examples'])}):")
        for a, b, reason, rationale in r["fn_examples"][:15]:
            print(f"    [{reason}]  {a!r}  ↔  {b!r}  — {rationale}")

    meets_target = r["fp_rate"] <= MAX_FP_RATE and r["fn_rate"] <= MAX_FN_RATE
    if meets_target:
        print(f"\n✓ Recommendation: use threshold = {best:.2f}")
        return 0
    else:
        print(f"\n✗ No threshold meets target (FP ≤ {MAX_FP_RATE:.0%}, "
              f"FN ≤ {MAX_FN_RATE:.0%}). Labels or rules need work.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
