import assert from 'node:assert/strict';
import {readFileSync, realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

// Run once per SDK in a fresh Node process. No application boot, profile, filesystem writes,
// plugin manager, model calls, or mocked registry: only the real jobs-local service and probe fibers.
const manifest = realpathSync(resolve(process.argv[2] ?? '.compat-runtime/node_modules/@deepseek-ai/dsh/package.json'));
const sdk = JSON.parse(readFileSync(manifest, 'utf8'));
assert.equal(sdk.name, '@deepseek-ai/dsh', 'argument must identify a DSH SDK package.json');
const requireSdk = createRequire(manifest);
const jobsEntry = requireSdk.resolve('@deepseek-ai/dsh-jobs-local');
const requireJobs = createRequire(jobsEntry);
const jobsManifest = JSON.parse(readFileSync(requireJobs.resolve('@deepseek-ai/dsh-jobs-local/package.json'), 'utf8'));
assert.equal(jobsManifest.version, sdk.version, 'jobs-local must come from the selected SDK');
const {Context} = await import(pathToFileURL(requireJobs.resolve('@deepseek-ai/cordis')).href);
const {default: LocalJobs} = await import(pathToFileURL(jobsEntry).href);
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve; const promise = new Promise(yes => {resolve = yes;}); return {promise, resolve};};
const resources = new Set();
const workItems = [];
const ctx = new Context();
const rootFiber = ctx.fiber;
const watchdog = setTimeout(() => {
  console.error('FAIL real jobs contract timed out:', sdk.version);
  process.exit(1);
}, 15000);
const timeoutBaseline = process.getActiveResourcesInfo().filter(type => type === 'Timeout').length;
let jobs;
let closed = false;

function controlledWork(label) {
  const advance = deferred(), continued = deferred(), finish = deferred();
  const work = {label, advance, continued, finish, cancels: [], cleaned: false, started: false};
  work.run = handle => {
    work.started = true;
    const timer = setInterval(() => {}, 1000);
    resources.add(timer);
    handle.append(label + ':started\n', {channel: 'log'});
    const done = (async () => {
      try {
        await advance.promise;
        handle.append(label + ':continued\n', {channel: 'log'});
        continued.resolve();
        const outcome = await finish.promise;
        // Teardown and wait must await this asynchronous producer cleanup, not merely call cancel.
        await turn();
        handle.append(label + ':cleaned\n', {channel: 'log'});
        return outcome;
      } finally {
        clearInterval(timer); resources.delete(timer); work.cleaned = true;
      }
    })();
    return {done, cancel(reason) {
      work.cancels.push(reason); advance.resolve();
      finish.resolve({status: 'killed', result: label + ':cancelled'});
    }};
  };
  workItems.push(work);
  return work;
}
function producer(work, onDispose = () => {}) {
  return ctx.plugin({name: 'contract-producer-' + work.label, inject: ['jobs'], apply(child) {
    work.id = child.jobs.start({kind: 'online-update-contract', label: work.label, outputLimitBytes: 4096, run: work.run});
    child.effect(() => onDispose, 'probe producer disposed');
  }});
}
function controller(name) {
  return ctx.plugin({name, inject: ['jobs'], apply(child) {
    child.jobs.attachController(name);
  }});
}
const textOf = read => read.chunks.map(chunk => chunk.text).join('');
function assertNoController() {
  let ran = false;
  assert.throws(() => jobs.start({kind: 'online-update-contract', label: 'must not start', run() {
    ran = true; throw new Error('starter must not run without a controller');
  }}), /no job controller/i);
  assert.equal(ran, false, 'admission must fail before the producer runs');
}

try {
  const registryFiber = ctx.plugin(LocalJobs, {});
  await registryFiber.await();
  jobs = ctx.jobs;
  for (const method of ['start', 'list', 'get', 'read', 'readAt', 'kill', 'wait', 'attachController']) {
    assert.equal(typeof jobs[method], 'function', 'missing jobs API: ' + method);
  }
  assert.equal(ctx.get('pluginManager'), undefined);
  assert.equal(ctx.get('agents'), undefined);
  assert.deepEqual(jobs.list(), []);
  assertNoController();

  // Prove the old producer AND its only controller can disappear while the job remains live.
  const oldController = controller('contract-old-controller'); await oldController.await();
  const first = controlledWork('survives-unload'); let producerDisposed = false;
  const oldProducer = producer(first, () => {producerDisposed = true;}); await oldProducer.await();
  assert.equal(jobs.get(first.id).owner, undefined, 'the continuity contract is specifically unowned');
  assert.equal(jobs.get(first.id).status, 'running');
  await oldProducer.dispose(); await oldController.dispose();
  assert.equal(producerDisposed, true);
  assert.equal(first.cancels.length, 0, 'fiber unload must not cancel Host-owned work');
  assert.equal(first.cleaned, false);
  assert.equal(jobs.get(first.id).status, 'running');
  assertNoController();
  first.advance.resolve(); await first.continued.promise;
  assert.match(textOf(jobs.readAt(first.id, 0)), /survives-unload:continued/);
  first.finish.resolve({status: 'completed', result: 'verified-result'});
  assert.equal((await jobs.wait(first.id, 2000)).status, 'completed');
  assert.equal(first.cleaned, true); assert.equal(first.cancels.length, 0);

  // A new controller can recover retained output and result after the original fibers are gone.
  const replacement = controller('contract-replacement-controller'); await replacement.await();
  const replacementJobs = replacement.ctx.jobs;
  assert.equal(replacementJobs.get(first.id).status, 'completed');
  const retained = replacementJobs.readAt(first.id, 0);
  assert.equal(retained.lossy, false);
  assert.match(textOf(retained), /survives-unload:started/);
  assert.match(textOf(retained), /survives-unload:cleaned/);
  assert.deepEqual(replacementJobs.readAt(first.id, 0), retained, 'readAt must not consume the model cursor');
  const consumed = replacementJobs.read(first.id);
  assert.equal(consumed.job.status, 'completed'); assert.equal(consumed.result, 'verified-result');
  assert.equal(textOf(consumed), textOf(retained));
  assert.equal(replacementJobs.read(first.id).result, undefined, 'producer result is delivered only once');
  assert.equal(replacementJobs.read(first.id).chunks.length, 0);
  assert.ok(replacementJobs.list().some(job => job.id === first.id), 'collecting must retain the terminal record');

  // Explicit cancellation reaches a detached producer; settlement waits for its cleanup.
  const cancelled = controlledWork('explicit-kill');
  const cancelledProducer = producer(cancelled); await cancelledProducer.await(); await cancelledProducer.dispose();
  assert.equal(cancelled.cancels.length, 0);
  assert.equal(replacementJobs.kill(cancelled.id, undefined, 'contract stop'), 'requested');
  assert.equal(replacementJobs.get(cancelled.id).status, 'stopping');
  assert.equal(cancelled.cleaned, false, 'the fixture must actually have asynchronous cleanup');
  assert.equal((await replacementJobs.wait(cancelled.id, 2000)).status, 'killed');
  assert.deepEqual(cancelled.cancels, ['contract stop']); assert.equal(cancelled.cleaned, true);
  assert.match(textOf(replacementJobs.readAt(cancelled.id, 0)), /explicit-kill:cleaned/);
  assert.equal(replacementJobs.read(cancelled.id).result, 'explicit-kill:cancelled');
  assert.equal(replacementJobs.kill(cancelled.id), 'already-finished');
  assert.equal(cancelled.cancels.length, 1);

  // Closing the service/root, unlike producer/controller disposal, owns cancellation and draining.
  const teardown = controlledWork('root-close');
  const teardownProducer = producer(teardown); await teardownProducer.await(); await teardownProducer.dispose();
  await replacement.dispose(); assertNoController();
  assert.equal(teardown.cancels.length, 0); assert.equal(jobs.get(teardown.id).status, 'running');
  assert.equal(resources.size, 1);
  await rootFiber.dispose(); closed = true;
  assert.equal(teardown.cancels.length, 1); assert.equal(teardown.cleaned, true);
  assert.equal(resources.size, 0);
  assert.deepEqual(jobs.list(), [], 'service teardown must drop all retained records');
  // Cordis keeps the root fiber reusable (uid 0); its child service must be disposed.
  assert.equal(registryFiber.uid, null); assert.equal(ctx.get("jobs"), undefined);
  assert.deepEqual(rootFiber.getEffects(), []);
  await turn();
  assert.equal(process.getActiveResourcesInfo().filter(type => type === 'Timeout').length, timeoutBaseline, 'no producer or registry timers may remain');
  console.log('Real DSH jobs lifecycle contract verified:', sdk.version,
    '; producer/controller unload survives; replacement reads; kill and root teardown drain; profiles/installs/model calls: 0');
} finally {
  // Release all fixture gates even if an assertion failed; keep the watchdog armed while disposing.
  for (const work of workItems) {
    work.advance.resolve(); work.finish.resolve({status: 'killed', result: 'fixture cleanup'});
  }
  try {if (!closed) await rootFiber.dispose();}
  finally {for (const timer of resources) clearInterval(timer); resources.clear(); clearTimeout(watchdog);}
}
