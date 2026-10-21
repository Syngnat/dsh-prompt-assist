import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFastRoute, FAST_ROUTE_STATES } from '../fast-route.js';
import { FAST_ROUTE_TRUTH_TABLE, FAST_ROUTE_MATRIX, expectedMatrixState } from './fixtures/fast-route-truth-table.js';

const resolve = row => resolveFastRoute(row.selection, { grants: row.grants, routes: row.routes, apis: row.apis });
const outcome = value => ({ state: value.state, visible: value.visible, eligible: value.eligible });

for (const row of FAST_ROUTE_TRUTH_TABLE) {
  test('truth table: ' + row.id + ' — ' + row.note, () => {
    assert.deepEqual(outcome(resolve(row)), row.expect, 'row ' + row.id);
  });
}

test('the truth table exercises every resolver state', () => {
  const covered = new Set(FAST_ROUTE_TRUTH_TABLE.map(row => resolve(row).state));
  assert.deepEqual([...FAST_ROUTE_STATES].filter(state => !covered.has(state)), [],
    'every state needs at least one row');
});

test('eligibility is exactly the ready state across the whole grid', () => {
  for (const row of FAST_ROUTE_MATRIX) {
    const value = resolve(row);
    assert.equal(value.eligible, value.state === 'ready', row.id);
    assert.equal(value.visible, value.state !== 'not-candidate' && value.state !== 'api-incompatible', row.id);
  }
});

test('family × grant-scope × evidence grid matches the documented rule', () => {
  const actual = FAST_ROUTE_MATRIX.map(row => ({ id: row.id, state: resolve(row).state, expected: expectedMatrixState(row) }));
  assert.deepEqual(actual.filter(row => row.state !== row.expected), []);
});

test('a rejected route is never eligible even when fully granted', () => {
  for (const row of FAST_ROUTE_MATRIX.filter(item => item.evidence === 'rejected' && item.family !== 'other')) {
    assert.equal(resolve(row).eligible, false, row.id);
  }
});
