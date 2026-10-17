import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistController } from '../assist/client/controller.js';
import { DEFAULT_SETTINGS, reconcileState } from '../assist/client/api.js';
import { initialContextState, foldContextState } from '../assist/context.js';

function fixture() {
  const requests = [], changes = [];
  const input = { draft: '', draftRev: 1, occurrences: [], attachmentIds: [], phase: 'plain' };
  let projection = initialContextState({});
  projection.settings = { suggest: { ...DEFAULT_SETTINGS, enabled: true }, enhance: DEFAULT_SETTINGS };
  const controller = createAssistController({
    actions: () => ({ captureInsertion: () => ({ start: 0, end: 0, draftRev: 1 }) }),
    publish: value => changes.push(value), requestId: () => String(requests.length),
    send: (_action, _session, payload, signal) => { requests.push({ payload, signal }); return new Promise(() => {}); },
  });
  const observe = (host = null, selection = null, patch = {}) => {
    const wire = { settings: projection.settings, qaId: projection.qaId, busy: projection.busy };
    const { state, busy } = reconcileState(host, wire, { running: false }, true);
    controller.observe({ sessionId: 's', input, settings: state.settings, qaId: state.qaId,
      busy, paused: false, routeKey: JSON.stringify(selection?.next ?? state?.current ?? null), ...patch });
  };
  const event = (seq, type, data) => { projection = foldContextState(projection, { seq, type, data }); };
  const question = () => event(1, 'user/message', { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Question' }] });
  const answer = (turn, start) => {
    event(start, 'turn/start', { turn });
    event(start + 1, 'assistant/message', { turn, message: { role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: 'Answer' }] } });
    event(start + 2, 'turn/end', { turn, reason: { kind: 'completed' } });
  };
  return { controller, requests, changes, observe, question, answer,
    host: (extra = {}) => ({ qaId: projection.qaId, busy: projection.busy, current: { provider: 'p', model: 'm' }, ...extra }) };
}

test('new native QA queued before first Host state survives null-to-known route hydration', () => {
  const f = fixture();
  f.observe(); // wire baseline is authoritative, but Host admission is not hydrated
  f.question(); f.answer(1, 2); f.observe();
  assert.equal(f.requests.length, 0);
  f.observe(f.host()); // Host both admits QA and supplies the previously absent route
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].payload.qaId, '1:4');
  f.observe(f.host()); assert.equal(f.requests.length, 1);
  f.controller.dispose();
});

test('initial historical QA is baseline, never a hydration trigger', () => {
  const f = fixture(); f.question(); f.answer(1, 2);
  f.observe(); f.observe(f.host());
  assert.equal(f.requests.length, 0); f.controller.dispose();
});

test('known route changes invalidate pending QA rather than charge on a new model', () => {
  const f = fixture(); f.observe(f.host());
  f.question(); f.answer(1, 2); f.observe(f.host({ busy: true }));
  f.observe(f.host({ current: { provider: 'p', model: 'different' } }));
  assert.equal(f.requests.length, 0); f.controller.dispose();
});

test('same question completed in another turn produces a new end sequence and is admitted once', () => {
  const f = fixture(); f.observe(f.host()); f.question(); f.answer(1, 2); f.observe(f.host());
  f.answer(2, 5); f.observe(f.host());
  assert.deepEqual(f.requests.map(r => r.payload.qaId), ['1:4', '1:7']); f.controller.dispose();
});

test('Goal busy continues to block after route hydration until authoritative Host idle', () => {
  const f = fixture(); f.observe(); f.question(); f.answer(1, 2); f.observe();
  f.observe(f.host({ busy: true })); assert.equal(f.requests.length, 0);
  f.observe(f.host()); assert.equal(f.requests.length, 1); f.controller.dispose();
});

for (const patch of [{ input: { draft: 'typed', draftRev: 2, occurrences: [], attachmentIds: [], phase: 'plain' } },
  { paused: true }, { settings: { suggest: DEFAULT_SETTINGS, enhance: DEFAULT_SETTINGS } }]) {
  test('hydration cannot preserve a candidate across a concurrent user invalidation: ' + JSON.stringify(patch), () => {
    const f = fixture(); f.observe(); f.question(); f.answer(1, 2); f.observe();
    f.observe(f.host(), null, patch); f.observe(f.host());
    assert.equal(f.requests.length, 0); f.controller.dispose();
  });
}

test('trigger diagnostics explain waiting and dispatch',()=>{const f=fixture();f.observe();assert.equal(f.changes.at(-1).trigger.reason,'baseline');f.question();f.answer(1,2);f.observe();assert.equal(f.changes.at(-1).trigger.reason,'busy-or-unhydrated');f.observe(f.host());assert.equal(f.changes.at(-1).trigger.reason,'new-qa');f.observe(f.host());assert.equal(f.changes.at(-1).trigger.reason,'already-requested');f.controller.dispose();});
