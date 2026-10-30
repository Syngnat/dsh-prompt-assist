import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAssistController} from '../assist/client/controller.js';
import {createDraftWriter, undoText} from '../assist/client/editor.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

/** Manual clock: the writer must not depend on real time to be testable. */
function clock() {
  const scheduled = [];
  let timer = null;
  return {
    scheduled,
    get pending() { return timer; },
    schedule(fn, ms) { timer = {fn, ms, cancelled: false}; scheduled.push(timer); return timer; },
    cancelTimer(handle) { handle.cancelled = true; if (timer === handle) timer = null; },
    tick() {
      const handle = timer;
      if (!handle) return false;
      timer = null;
      handle.fn();
      return true;
    },
  };
}

/** Whole-draft host: setDraft lands late (the composer keeps the old projection), insertText is CAS. */
function host(setDraftIsProjectedLate = true) {
  let input = {draft: 'Original draft', draftRev: 1, occurrences: []};
  const written = [], edits = [];
  return {
    written, edits,
    get input() { return input; },
    userEdit(draft) { input = {...input, draft, draftRev: input.draftRev + 1}; },
    actions: {
      setDraft(text) { written.push(text); if (!setDraftIsProjectedLate) input = {...input, draft: text, draftRev: input.draftRev + 1}; },
      captureInsertion: () => ({start: input.draft.length, end: input.draft.length, draftRev: input.draftRev}),
      insertText(text, span) {
        edits.push({text, span});
        if (span.draftRev !== input.draftRev) return false;
        input = {...input, draft: text, draftRev: input.draftRev + 1};
        return true;
      },
    },
  };
}

function writerFor(h, c) {
  return createDraftWriter({actions: h.actions, readInput: () => h.input, intervalMs: 150, schedule: c.schedule, cancelTimer: c.cancelTimer});
}

test('writer throttles a chunk burst into one whole-draft write of the newest text', () => {
  const c = clock(), h = host();
  const w = writerFor(h, c);
  w.begin({original: 'Original draft', draftRev: 1, structured: false});
  assert.equal(c.scheduled.length, 0);
  w.write('Original draft, part');
  w.write('Original draft, part two');
  w.write('Original draft, part three');
  assert.equal(c.scheduled.length, 1, 'a burst arms a single timer');
  assert.equal(c.scheduled[0].ms, 150);
  assert.deepEqual(h.written, [], 'nothing lands before the interval elapses');
  assert.equal(c.tick(), true);
  assert.deepEqual(h.written, ['Original draft, part three'], 'only the newest text is written once');
  assert.deepEqual(w.state(), {takenOver: false, written: true, text: 'Original draft, part three'});
});

test('writer keeps writing while the composer projection still shows the replaced draft', () => {
  const c = clock(), h = host(true);
  const w = writerFor(h, c);
  w.begin({original: 'Original draft', draftRev: 1, structured: false});
  w.write('Part');
  c.tick();
  // setDraft is synchronous in the composer but its projection and revision lag behind.
  assert.equal(h.input.draft, 'Original draft');
  w.write('Part two');
  c.tick();
  assert.deepEqual(h.written, ['Part', 'Part two'], 'a stale projection is not a user takeover');
  assert.equal(w.state().takenOver, false);
});

test('writer stops for good on the first draft it never produced', () => {
  const c = clock(), h = host(true);
  const w = writerFor(h, c);
  w.begin({original: 'Original draft', draftRev: 1, structured: false});
  w.write('Part');
  c.tick();
  h.userEdit('Original draft, my own words');
  w.write('Part two');
  c.tick();
  assert.equal(w.state().takenOver, true);
  assert.deepEqual(h.written, ['Part'], 'the user edit is never overwritten');
  assert.equal(w.write('Part two'), false, 'a taken-over writer refuses new text');
  assert.equal(c.pending, null);
});

test('writer stops when the live draft grows a reference or a command', () => {
  for (const patch of [{occurrences: [{label: 'file'}]}, {claim: {}}]) {
    const c = clock(), h = host(false);
    const w = writerFor(h, c);
    w.begin({original: 'Original draft', draftRev: 1, structured: false});
    const live = h.input;
    Object.assign(live, patch);
    w.write('Part');
    c.tick();
    assert.equal(w.state().takenOver, true, JSON.stringify(patch) + ' must stop the writer');
    assert.deepEqual(h.written, []);
  }
});

test('a structured snapshot disables the writer at begin', () => {
  const c = clock(), h = host();
  const w = writerFor(h, c);
  assert.deepEqual(w.begin({original: 'Original draft', draftRev: 1, structured: true}),
    {takenOver: true, written: false, text: 'Original draft'});
  assert.equal(w.write('Part'), false);
  assert.equal(c.tick(), false);
  assert.deepEqual(h.written, []);
  assert.equal(w.finish('Part'), false);
  assert.deepEqual(h.written, []);
});

test('without setDraft the writer degrades to one whole-span insertion per flush', () => {
  const c = clock();
  let input = {draft: 'Original draft', draftRev: 7, occurrences: []};
  const edits = [];
  const actions = {
    captureInsertion: () => ({start: 4, end: 4, draftRev: input.draftRev}),
    insertText(text, span) {
      edits.push({text, span});
      if (span.draftRev !== input.draftRev) return false;
      input = {...input, draft: text, draftRev: input.draftRev + 1};
      return true;
    },
  };
  const w = createDraftWriter({actions, readInput: () => input, intervalMs: 150, schedule: c.schedule, cancelTimer: c.cancelTimer});
  w.begin({original: 'Original draft', draftRev: 7, structured: false});
  w.write('Replacement');
  c.tick();
  assert.deepEqual(edits, [{text: 'Replacement', span: {start: 0, end: 'Original draft'.length, draftRev: 7}}]);
  assert.equal(input.draft, 'Replacement');
  assert.deepEqual(w.state(), {takenOver: false, written: true, text: 'Replacement'});
});

test('finish flushes the final text at once and never rewrites what already landed', () => {
  const c = clock(), h = host(false);
  const w = writerFor(h, c);
  w.begin({original: 'Original draft', draftRev: 1, structured: false});
  w.write('Part');
  assert.equal(w.finish('Part two'), true);
  assert.deepEqual(h.written, ['Part two']);
  assert.equal(c.pending, null, 'the pending interval was cancelled');
  assert.equal(c.scheduled.length, 1, 'finish reuses no timer');
  assert.equal(w.finish('Part two'), true);
  assert.deepEqual(h.written, ['Part two'], 'an identical final text is not written twice');
});

test('abort stops every later write and leaves the last written text visible', () => {
  const c = clock(), h = host(false);
  const w = writerFor(h, c);
  w.begin({original: 'Original draft', draftRev: 1, structured: false});
  w.write('Part');
  c.tick();
  w.abort();
  assert.equal(w.write('Part two'), false);
  assert.equal(w.finish('Part three'), false);
  assert.deepEqual(h.written, ['Part']);
  assert.deepEqual(w.state(), {takenOver: false, written: true, text: 'Part'});
});

function fixture(enhance = {}, options = {}) {
  let input = {draft: options.draft ?? 'Original draft', draftRev: 4, occurrences: [], attachmentIds: [], phase: 'plain'};
  let latest;
  const changes = [], edits = [], drafts = [], requests = [];
  const actions = {
    captureInsertion: () => ({start: input.draft.length, end: input.draft.length, draftRev: input.draftRev}),
    insertText(text, span) {
      edits.push({text, span});
      if (span.draftRev !== input.draftRev || span.start !== 0 || span.end !== input.draft.length) return false;
      input = {...input, draft: text, draftRev: input.draftRev + 1};
      return true;
    },
    setDraft(text) { drafts.push(text); input = {...input, draft: text, draftRev: input.draftRev + 1}; },
  };
  const controller = createAssistController({
    actions: () => actions, readInput: () => input, publish: value => { latest = value; changes.push(value); },
    requestId: () => String(requests.length), writerOptions: options.writerOptions,
    send: (_action, _sessionId, payload, signal, onText) => {
      const wait = deferred();
      requests.push({payload, signal, onText, wait});
      return wait.promise;
    },
  });
  const settings = {enhance: {enabled: true, followSession: true, ...enhance}, suggest: {enabled: true, followSession: true}};
  const observe = (patch = {}) => {
    controller.observe({sessionId: 's', qaId: '1:2', busy: false, paused: false, routeKey: 'route', settings, input, ...patch});
  };
  observe();
  return {
    controller, actions, changes, edits, drafts, requests, observe,
    get input() { return input; },
    get latest() { return latest; },
    patchInput(patch) { input = {...input, ...patch}; },
    stream(text) { requests.at(-1).onText(text); },
    reply(text, patch = {}) {
      const request = requests.at(-1);
      request.wait.resolve({feature: request.payload.feature, original: request.payload.draft,
        draftRev: request.payload.draftRev, qaId: request.payload.qaId, text, ...patch});
    },
  };
}

test('enhancement auto-apply replaces the draft, publishes the landing and registers one undo', async () => {
  const f = fixture();
  const work = f.controller.generate('enhance');
  f.reply('Enhanced draft text');
  assert.equal(await work, true);
  assert.equal(f.input.draft, 'Enhanced draft text');
  assert.deepEqual(f.edits.map(edit => edit.text), ['Enhanced draft text']);
  assert.deepEqual(f.edits[0].span, {start: 0, end: 'Original draft'.length, draftRev: 4});
  assert.deepEqual(f.latest.writeback, {mode: 'auto'});
  assert.equal(f.latest.preview.text, 'Enhanced draft text', 'the card stays for copy and comparison');
  assert.equal(f.latest.undo.sessionId, 's');
  assert.equal(f.latest.undo.replacement, 'Original draft');
  assert.equal(f.latest.undo.original, 'Enhanced draft text');
  assert.equal(undoText(f.latest.undo, () => f.input, f.actions).ok, true);
  assert.equal(f.input.draft, 'Original draft');
});

test('a stale draft at completion is reported as blocked, never written', async () => {
  const f = fixture();
  const work = f.controller.generate('enhance');
  // The Host changed the draft; the projection event has not reached the controller yet.
  f.patchInput({draft: 'Edited elsewhere', draftRev: 5});
  f.reply('Enhanced draft text');
  assert.equal(await work, true);
  assert.deepEqual(f.latest.writeback, {mode: 'blocked', reason: 'stale'});
  assert.equal(f.latest.undo, null);
  assert.equal(f.input.draft, 'Edited elsewhere');
  assert.deepEqual(f.edits, []);
});

test('auto-apply disabled keeps the manual two-stage card and writes nothing', async () => {
  const f = fixture({autoApply: false});
  const work = f.controller.generate('enhance');
  f.reply('Enhanced draft text');
  assert.equal(await work, true);
  assert.equal(f.latest.writeback, null);
  assert.equal(f.latest.undo, null);
  assert.equal(f.latest.preview.text, 'Enhanced draft text');
  assert.equal(f.input.draft, 'Original draft');
  assert.deepEqual(f.edits, []);
});

test('structured and unchanged enhancements never auto-apply', async () => {
  const structured = fixture();
  structured.patchInput({occurrences: [{label: 'file'}]});
  structured.observe();
  const work = structured.controller.generate('enhance');
  structured.reply('Enhanced draft text');
  assert.equal(await work, true);
  assert.equal(structured.latest.writeback, null);
  assert.deepEqual(structured.edits, []);

  const echo = fixture();
  const echoed = echo.controller.generate('enhance');
  echo.reply('  Original draft  ');
  assert.equal(await echoed, true);
  assert.equal(echo.latest.writeback, null);
  assert.equal(echo.latest.undo, null);
  assert.deepEqual(echo.edits, []);
  assert.equal(echo.input.draft, 'Original draft');
});

test('stream write lands every throttled chunk and registers a whole-draft undo', async () => {
  const c = clock();
  const f = fixture({streamWrite: true}, {writerOptions: {intervalMs: 150, schedule: c.schedule, cancelTimer: c.cancelTimer}});
  const work = f.controller.generate('enhance');
  f.stream('Part');
  c.tick();
  assert.equal(f.input.draft, 'Part', 'the first chunk reaches the composer');
  assert.equal(f.latest.preview.streaming, true);
  f.stream('Part two');
  f.stream('Part three');
  c.tick();
  assert.deepEqual(f.drafts, ['Part', 'Part three'], 'chunks inside one interval collapse to the newest');
  f.reply('Part three, final');
  assert.equal(await work, true);
  assert.equal(f.input.draft, 'Part three, final', 'the final text is flushed before publishing');
  assert.deepEqual(f.latest.writeback, {mode: 'stream'});
  assert.equal(f.latest.undo.original, 'Part three, final');
  assert.equal(f.latest.undo.replacement, 'Original draft');
  assert.equal(f.latest.undo.draftRev, f.input.draftRev);
  assert.deepEqual(f.edits, [], 'streaming never falls back to insertion');
  assert.equal(undoText(f.latest.undo, () => f.input, f.actions).ok, true);
  assert.equal(f.input.draft, 'Original draft');
});

test('a user edit during streaming stops the writing and keeps the card for a manual landing', async () => {
  const c = clock();
  const f = fixture({streamWrite: true}, {writerOptions: {intervalMs: 150, schedule: c.schedule, cancelTimer: c.cancelTimer}});
  const work = f.controller.generate('enhance');
  f.stream('Part');
  c.tick();
  assert.deepEqual(f.drafts, ['Part']);
  f.patchInput({draft: 'Part and my own words', draftRev: 9});
  f.stream('Part two');
  c.tick();
  f.reply('Part two final');
  assert.equal(await work, true);
  assert.deepEqual(f.drafts, ['Part'], 'the taken-over writer writes nothing else');
  assert.deepEqual(f.latest.writeback, {mode: 'taken-over'});
  assert.equal(f.latest.preview.text, 'Part two final', 'the card survives so the full text stays applicable');
  assert.equal(f.latest.undo, null);
  assert.equal(f.input.draft, 'Part and my own words');
  assert.deepEqual(f.edits, []);
});

test('cancel and dismiss drop the landing record and its undo together', async () => {
  const f = fixture();
  const work = f.controller.generate('enhance');
  f.reply('Enhanced draft text');
  await work;
  assert.equal(f.latest.writeback.mode, 'auto');
  f.controller.cancel();
  assert.equal(f.latest.writeback, null);
  assert.equal(f.latest.undo, null);

  const g = fixture();
  const second = g.controller.generate('enhance');
  g.reply('Enhanced draft text');
  await second;
  g.controller.dismiss();
  assert.equal(g.latest.preview, null);
  assert.equal(g.latest.writeback, null);
  assert.equal(g.latest.undo, null);
});

test('applyStaged lands a preview that was never written and clears the card', async () => {
  const f = fixture({autoApply: false});
  const work = f.controller.generate('enhance');
  f.reply('Enhanced draft text');
  await work;
  assert.deepEqual(f.controller.applyStaged(), {ok: true});
  assert.equal(f.input.draft, 'Enhanced draft text');
  assert.equal(f.latest.preview, null);
  assert.equal(f.latest.undo.sessionId, 's');
  assert.equal(undoText(f.latest.undo, () => f.input, f.actions).ok, true);
  assert.equal(f.input.draft, 'Original draft');
  assert.deepEqual(f.controller.applyStaged(), {ok: false, reason: 'stale'}, 'no card, nothing to stage');
});

test('streaming write requires an explicit opt-in and never touches suggestions', async () => {
  const c = clock();
  const f = fixture({streamWrite: false}, {writerOptions: {intervalMs: 150, schedule: c.schedule, cancelTimer: c.cancelTimer}});
  const work = f.controller.generate('enhance');
  f.stream('Part');
  c.tick();
  assert.deepEqual(f.drafts, [], 'streaming stays off unless the setting is exactly true');
  f.reply('Complete');
  await work;

  const suggest = fixture({streamWrite: true, autoApply: true}, {draft: ''});
  const request = suggest.controller.generate('suggest');
  assert.equal(suggest.requests.length, 1);
  suggest.stream('Partial suggestion');
  assert.equal(suggest.latest.preview, null, 'suggestion streaming stays hidden');
  suggest.reply('Which case should I verify next?', {outcome: 'suggestion'});
  await request;
  assert.equal(suggest.latest.writeback, null, 'suggestions never auto-apply');
  assert.equal(suggest.latest.undo, null);
  assert.deepEqual(suggest.edits, []);
  assert.deepEqual(suggest.drafts, []);
});

test('a streamed chunk projected back as input never cancels the pending generation', async () => {
  const c = clock();
  const f = fixture({streamWrite: true}, {writerOptions: {intervalMs: 150, schedule: c.schedule, cancelTimer: c.cancelTimer}});
  const work = f.controller.generate('enhance');
  f.stream('Part');
  c.tick();
  f.observe();
  assert.equal(f.requests[0].signal.aborted, false, 'our own chunk is not a user edit');
  assert.equal(f.latest.preview.streaming, true);
  f.stream('Part two');
  c.tick();
  f.reply('Part two, final');
  assert.equal(await work, true);
  assert.deepEqual(f.latest.writeback, {mode: 'stream'});
});

test('an edit projected during streaming keeps the pending result for a taken-over landing', async () => {
  const c = clock();
  const f = fixture({streamWrite: true}, {writerOptions: {intervalMs: 150, schedule: c.schedule, cancelTimer: c.cancelTimer}});
  const work = f.controller.generate('enhance');
  f.stream('Part');
  c.tick();
  f.patchInput({draft: 'Part and my own words', draftRev: 9});
  f.observe();
  assert.equal(f.requests[0].signal.aborted, false, 'the full result stays reachable for the card');
  f.stream('Part two');
  c.tick();
  f.reply('Part two, final');
  assert.equal(await work, true);
  assert.deepEqual(f.latest.writeback, {mode: 'taken-over'});
  assert.equal(f.input.draft, 'Part and my own words');
  assert.deepEqual(f.drafts, ['Part']);
});

test('the applied draft projected back keeps the card and its undo, a real edit drops both', async () => {
  const f = fixture();
  const work = f.controller.generate('enhance');
  f.reply('Enhanced draft text');
  await work;
  const undo = f.latest.undo;
  f.observe();
  assert.equal(f.latest.preview.text, 'Enhanced draft text', 'the landed card survives its own projection');
  assert.equal(f.latest.writeback.mode, 'auto');
  assert.equal(f.latest.undo, undo);
  f.patchInput({draft: 'Enhanced draft text, plus my own words', draftRev: 12});
  f.observe();
  assert.equal(f.latest.preview, null);
  assert.equal(f.latest.writeback, null);
  assert.equal(f.latest.undo, null);
});

test('clearLanding drops only the landing record and never aborts an unrelated request', async () => {
  const f = fixture();
  const landed = f.controller.generate('enhance');
  f.reply('Enhanced draft text');
  await landed;
  assert.equal(f.latest.writeback.mode, 'auto');
  f.observe();
  assert.equal(f.latest.writeback.mode, 'auto', 'the record survives its own projection');

  const running = f.controller.generate('enhance');
  assert.equal(f.latest.writeback, null, 'a new generation already invalidated the old record');
  assert.equal(f.latest.pending, 'enhance');
  f.controller.clearLanding();
  assert.equal(f.requests.at(-1).signal.aborted, false, 'clearLanding must not cancel the flight');
  assert.equal(f.latest.pending, 'enhance', 'the pending generation survives');
  f.reply('Second result');
  assert.equal(await running, true);
  assert.equal(f.latest.writeback.mode, 'auto');
});

test('the panel hands a successful registered undo back to the controller', async () => {
  const source = await readFile(new URL('../assist/client/panel.js', import.meta.url), 'utf8');
  const line = source.split('\n').find(text => text.includes('undoText(source'));
  assert.ok(line, 'the panel keeps a single undo source');
  assert.match(line, /if\(registered\)/, 'a controller-registered record is the one the controller owns');
  assert.match(line, /clearLanding\?\.\(\)/, 'that record must be cleared after a successful undo');
  assert.match(line, /setUndo\(null\)/, 'the local fallback still resets itself');
});
