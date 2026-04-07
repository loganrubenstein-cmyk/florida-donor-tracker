import { jest } from '@jest/globals';

const mockData = {
  nodes: [
    { id: 'c_test', label: 'TEST', type: 'committee', acct_num: 'test',
      total_received: 1000.0, total_given: 0.0, depth: 0, data_pending: false }
  ],
  edges: [
    { source: 'd_DONOR', target: 'c_test', total_amount: 500.0, num_contributions: 1 }
  ],
  meta: { total_nodes: 2, total_edges: 1, max_depth: 1 }
};

jest.unstable_mockModule('fs', () => ({
  readFileSync: jest.fn(() => JSON.stringify(mockData)),
}));
jest.unstable_mockModule('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

const { loadNetworkGraph } = await import('../lib/loadNetworkGraph.js');

test('returns object with nodes, edges, meta', () => {
  const data = loadNetworkGraph();
  expect(data).toHaveProperty('nodes');
  expect(data).toHaveProperty('edges');
  expect(data).toHaveProperty('meta');
});

test('nodes is a non-empty array', () => {
  const data = loadNetworkGraph();
  expect(Array.isArray(data.nodes)).toBe(true);
  expect(data.nodes.length).toBeGreaterThan(0);
});

test('edges have required fields', () => {
  const data = loadNetworkGraph();
  const edge = data.edges[0];
  expect(edge).toHaveProperty('source');
  expect(edge).toHaveProperty('target');
  expect(edge).toHaveProperty('total_amount');
  expect(edge).toHaveProperty('num_contributions');
});

test('meta has total_nodes and total_edges', () => {
  const data = loadNetworkGraph();
  expect(typeof data.meta.total_nodes).toBe('number');
  expect(typeof data.meta.total_edges).toBe('number');
});
