#!/bin/bash
cd "$(dirname "$0")/.."
.pipeline-venv/bin/python3 scripts/25_export_donor_profiles.py --force
