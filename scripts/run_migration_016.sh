#!/bin/bash
cd "$(dirname "$0")/.."
.pipeline-venv/bin/python3 scripts/apply_migration_016.py
