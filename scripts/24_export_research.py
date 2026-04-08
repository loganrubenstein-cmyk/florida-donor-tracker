#!/usr/bin/env python3
"""
Script 24: Export approved research annotations to public/data/research/annotations.json.

Reads research/entities/*.json, filters entries and articles marked
approved_for_public: true, and writes a clean JSON for the frontend.

Usage (from project root, with .venv activated):
    python scripts/24_export_research.py
    python scripts/24_export_research.py --force
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

RESEARCH_DIR = PROJECT_ROOT / "research" / "entities"
OUTPUT_DIR   = PROJECT_ROOT / "public" / "data" / "research"
OUTPUT_FILE  = OUTPUT_DIR / "annotations.json"


def load_entity(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  WARNING: Could not read {path.name}: {e}", file=sys.stderr)
        return None


def build_public_entry(entity: dict) -> dict | None:
    """
    Build a public-safe dict from a research entity.

    Rules:
    - If approved_for_public is True at entity level: include summary, key_facts,
      themes, industry, and all articles where approved_for_public is True.
    - If approved_for_public is False at entity level: include only articles
      where approved_for_public is True (article links can surface even if the
      full entity profile isn't approved).
    - If neither the entity nor any articles are approved: return None.
    """
    entity_approved = entity.get("approved_for_public", False)
    approved_articles = [
        {
            "title":   a.get("title", ""),
            "url":     a.get("url", ""),
            "outlet":  a.get("outlet", ""),
            "date":    a.get("date", ""),
            "summary": a.get("summary", "") if entity_approved else "",
        }
        for a in entity.get("articles", [])
        if a.get("approved_for_public", False) and a.get("url")
    ]

    if not entity_approved and not approved_articles:
        return None

    entry = {
        "id":             entity.get("id", ""),
        "canonical_name": entity.get("canonical_name", ""),
        "type":           entity.get("type", ""),
        "industry":       entity.get("industry", ""),
        "themes":         entity.get("themes", []),
        "articles":       approved_articles,
    }

    if entity_approved:
        entry["summary"]    = entity.get("summary", "")
        entry["key_facts"]  = [
            {"fact": f.get("fact", ""), "source": f.get("source", ""), "url": f.get("url", ""), "date": f.get("date", "")}
            for f in entity.get("key_facts", [])
        ]

    return entry


def main(force: bool = False) -> int:
    print("=== Script 24: Export Research Annotations ===\n")

    if not RESEARCH_DIR.exists():
        print("No research/entities/ directory found. Nothing to export.")
        return 0

    entity_files = sorted(RESEARCH_DIR.glob("*.json"))
    if not entity_files:
        print("No entity files found in research/entities/. Nothing to export.")
        return 0

    print(f"Found {len(entity_files)} entity file(s).")

    annotations = {}
    skipped = 0

    for path in entity_files:
        entity = load_entity(path)
        if not entity:
            skipped += 1
            continue

        entry = build_public_entry(entity)
        if entry:
            annotations[entity["id"]] = entry
            status = "entity+articles" if entity.get("approved_for_public") else f"{len(entry['articles'])} article(s) only"
            print(f"  ✓ {path.name} → {status}")
        else:
            print(f"  – {path.name} (not approved)")
            skipped += 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_entities": len(annotations),
        "entities": annotations,
    }
    OUTPUT_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nWrote {len(annotations)} approved annotation(s) → {OUTPUT_FILE}")
    if skipped:
        print(f"Skipped {skipped} unapproved or unreadable file(s).")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
