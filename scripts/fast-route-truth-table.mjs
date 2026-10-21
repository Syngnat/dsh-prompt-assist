#!/usr/bin/env node
/**
 * Print the Fast route truth table (docs) and assert nothing: assertions live in
 * tests/fast-route-truth-table.test.js, which imports the same fixture.
 */
import { resolveFastRoute } from '../fast-route.js';
import { FAST_ROUTE_TRUTH_TABLE, FAST_ROUTE_MATRIX, expectedMatrixState } from '../tests/fixtures/fast-route-truth-table.js';

const resolve = row => resolveFastRoute(row.selection, { grants: row.grants, routes: row.routes, apis: row.apis });
const cell = value => value === undefined || value === null || value === '' ? '—' : String(value).replace(/\u0000/g, '\\0');
const grantsOf = row => Array.isArray(row.grants) && row.grants.length
  ? row.grants.map(item => typeof item === 'string' ? item : [item.provider, item.model ? 'model=' + item.model : '', item.family ? 'family=' + item.family : ''].filter(Boolean).join(':')).join(', ')
  : '—';

console.log('# Fast route truth table\n');
console.log('| # | route | grants | api | evidence | state | visible | eligible | before | note |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
FAST_ROUTE_TRUTH_TABLE.forEach((row, index) => {
  const value = resolve(row);
  const route = row.selection ? cell(row.selection.provider) + ' / ' + cell(row.selection.model) : '—';
  const evidence = row.routes ? Object.values(row.routes)[0]?.priority ?? '—' : '—';
  console.log('| ' + [index + 1, route, grantsOf(row), cell(row.apis && Object.values(row.apis)[0]),
    evidence, value.state, value.visible, value.eligible, row.before ?? '—', row.note].join(' | ') + ' |');
});

console.log('\n## family × grant scope × evidence grid\n');
const familes = ['openai', 'xai', 'other'], grantScopes = ['none', 'provider', 'family', 'model'], evidences = ['unknown', 'verified', 'rejected'];
console.log('| family | grant | ' + evidences.join(' | ') + ' |');
console.log('|---|---|' + evidences.map(() => '---').join('|') + '|');
for (const family of familes) for (const grant of grantScopes) {
  const rowStates = evidences.map(evidence => {
    const row = FAST_ROUTE_MATRIX.find(item => item.family === family && item.grant === grant && item.evidence === evidence);
    const state = resolve(row).state;
    return state === expectedMatrixState(row) ? state : state + ' (expected ' + expectedMatrixState(row) + ')';
  });
  console.log('| ' + family + ' | ' + grant + ' | ' + rowStates.join(' | ') + ' |');
}
