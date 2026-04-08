import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Read network_graph.json at build time (server-side only).
 * Returns { nodes, edges, meta }.
 */
export function loadNetworkGraph() {
  const filePath = join(process.cwd(), 'public', 'data', 'network_graph.json');
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to load network_graph.json: ${err.message}`);
  }
}
