#!/bin/bash
cd "$(dirname "$0")/.."
.pipeline-venv/bin/python3 scripts/seed_orphan_entities.py
