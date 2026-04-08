// lib/loadAnnotations.js
// Only approved articles reach this file — script 24 pre-filters on approved_for_public.
import { readFileSync } from 'fs';
import { join } from 'path';

const ANNOTATIONS_FILE = join(process.cwd(), 'public', 'data', 'research', 'annotations.json');

let _cache = null;

export function loadAnnotations() {
  if (_cache) return _cache;
  try {
    const raw = JSON.parse(readFileSync(ANNOTATIONS_FILE, 'utf-8'));
    _cache = raw.entities || {};
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[loadAnnotations] Failed to load annotations:', err.message);
    }
    _cache = {};
  }
  return _cache;
}
