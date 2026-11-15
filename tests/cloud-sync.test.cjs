const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cloud = fs.readFileSync(path.join(__dirname, '..', 'PT_Hub_Complete_Handoff_2026-11-04', '01_STUDENTS', 'frontend', 'assets', 'cloud.js'), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const PLAYER = id(1), DRILL = id(2);

function boot({page = 'shooting-drills.html', state, snapshot = {}, respond = () => ({ok:true, body:{ok:true}}), values = new Map(), postDelay = 0, storageThrows = () => false}) {
  const calls = [];
  const listeners = {};
  const windowListeners = {};
  const context = {
    state,
    location: {pathname: '/' + page},
    window: {addEventListener(type, fn){(windowListeners[type] ||= []).push(fn)}},
    document: {createElement: () => ({classList:{toggle(){}}, setAttribute(){}}), querySelector: () => null, getElementById: () => null, addEventListener(type, fn){(listeners[type] ||= []).push(fn)}, visibilityState: 'visible'},
    localStorage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (storageThrows(key)) throw new Error('QuotaExceededError'); values.set(key, String(value)); }},
    fetch: async (url, options) => {
      const call = {url, method: options.method, headers: options.headers, body: options.body && JSON.parse(options.body)};
      calls.push(call);
      if (options.method === 'GET') return {ok:true, status:200, json: async () => ({scope:'entry', players:[], drills:[], shots:[], drillResults:[], scheduleRecords:[], gameSituations:[], gameSituationShots:[], ...snapshot})};
      if (postDelay) await wait(postDelay);
      const reply = respond(call);
      return {ok: reply.ok, status: reply.status || (reply.ok ? 200 : 400), json: async () => reply.body};
    },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (typeof t.unref === 'function') t.unref(); return t; }, clearTimeout, setInterval: () => 0, AbortController,
    save: () => { context.saves = (context.saves || 0) + 1; },
  };
  vm.runInNewContext(cloud, context);
  return {context, calls, values, listeners, windowListeners};
}

const shot = (n, extra = {}) => ({id: id(n), playerId: PLAYER, type: 'Free Throws', date: '2026-11-10', makes: 1, attempts: 1, recordedAt: '2026-11-10T12:00:00.000Z', ...extra});
const roster = {players: [{id: PLAYER, full_name: 'Test Player', jersey_number: 4, grade: '', position: ''}], drills: [{id: DRILL, name: 'Free Throws'}]};
const posts = calls => calls.filter(c => c.method === 'POST' && c.url.includes('action=shots'));
const batchIds = calls => posts(calls).flatMap(c => c.body.shots.map(s => s.id));
const accept = call => ({ok:true, body:{ok:true, saved: call.body.shots.map(s => s.id), rejected: []}});

test('a shot with an unregistered drill does not block the shots behind it', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls, values} = boot({state, snapshot: roster, respond: accept});
  await wait(30);
  state.shooting.push(shot(10, {type: 'Mystery Drill'}), shot(11));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(batchIds(calls), [id(11)]);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), [id(10)]);
});

test('a shot the server rejects is set aside instead of retried forever', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls, values} = boot({state, snapshot: roster, respond: () => ({ok:true, body:{ok:true, saved:[id(21)], rejected:[{id: id(20), error:'Invalid shooting data'}]}})});
  await wait(30);
  state.shooting.push(shot(20), shot(21));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(posts(calls).length, 1, 'both shots travel in one request');
  assert.deepEqual(batchIds(calls), [id(20), id(21)]);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), []);
  assert.equal(JSON.parse(values.get('pt_hub_rejected_v1'))[0].id, id(20));
  assert.equal(context.window.ptCloudStatus().rejected, 1);
});

test('a backup import does not delete shared shots, and resync forgets vanished ids', async () => {
  const cloudShots = Array.from({length: 12}, (_, i) => ({id: id(100 + i), player_id: PLAYER, drill_id: DRILL, made: true, practice_date: '2026-11-10', created_at: '2026-11-10T12:00:00.000Z', notes: null}));
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls} = boot({page: 'leaderboards.html', state, snapshot: {...roster, scope: 'full', shots: cloudShots}, respond: accept});
  await wait(30);
  assert.equal(state.shooting.length, 12);
  state.shooting = [];
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 0, 'mass disappearance must not delete from the cloud');
  state.shooting = cloudShots.slice(0, 10).map(x => ({id: x.id, playerId: PLAYER, type: 'Free Throws', date: x.practice_date, makes: 1, attempts: 1, source: 'supabase'}));
  context.window.ptCloudResync();
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 0, 'resync must reset tracking without deletions');
  state.shooting = state.shooting.slice(0, 8);
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 0, 'shots uploaded by another device need a coach to remove them');
  state.shooting.push(shot(200));
  context.window.ptCloudQueueSave();
  await wait(150);
  const upload = posts(calls).flatMap(c => c.body.shots).find(s => s.id === id(200));
  assert.match(upload.owner_token, /^[0-9a-f]{48}$/);
  state.shooting = state.shooting.filter(s => s.id !== id(200));
  context.window.ptCloudQueueSave();
  await wait(150);
  const removal = calls.find(c => c.method === 'DELETE');
  assert.ok(removal, 'a shot this device uploaded is removed when undone');
  assert.equal(removal.body.owner_token, upload.owner_token);
  assert.equal(removal.headers['X-Coach-Access-Code'], undefined);
});

test('cloud corrections refresh stale local copies, but unsent coach edits win locally', async () => {
  const stale = shot(30, {makes: 0, source: 'supabase'});
  const dirty = shot(31, {makes: 0, source: 'supabase', dirty: true});
  const state = {players: [], games: [], shooting: [stale, dirty], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const remote = [stale, dirty].map(s => ({id: s.id, player_id: PLAYER, drill_id: DRILL, made: true, practice_date: s.date, created_at: s.recordedAt, notes: null}));
  const {context, calls} = boot({page: 'leaderboards.html', state, snapshot: {...roster, scope: 'full', shots: remote}});
  await wait(60);
  assert.equal(stale.makes, 1);
  assert.equal(dirty.makes, 0);
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 0, 'no coach code available, so no PATCH goes out');
  assert.ok(context.saves >= 1);
});

test('schedule merge keeps the copy of a game that holds more live events', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context} = boot({state});
  await wait(30);
  const local = [{id: 'g1', events: [{id: 'e1'}, {id: 'e2'}]}, {id: 'g2', updatedAt: '2026-11-01T00:00:00Z', opponent: 'Old'}];
  const remote = [{id: 'g1', events: []}, {id: 'g2', updatedAt: '2026-11-05T00:00:00Z', opponent: 'New'}, {id: 'g3'}];
  const merged = context.window.ptCloudMergeGames(local, remote);
  assert.equal(merged.find(g => g.id === 'g1').events.length, 2);
  assert.equal(merged.find(g => g.id === 'g2').opponent, 'New');
  assert.equal(merged.length, 3);
});

test('schedule and roster pushes wait until the shared schedule has been read', async () => {
  const state = {players: [], games: [{id: 'g1', events: []}], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls} = boot({page: 'coach-review.html', state, snapshot: {...roster, scope: 'entry', scheduleRecords: undefined}});
  context.window.PTCoachAccess = {isUnlocked: () => true, cloudCredential: () => '232323'};
  await wait(30);
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(calls.filter(c => c.url.includes('action=schedule_sync')).length, 0);
});

test('shots recorded in a burst go up as one request, not one per tap', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls, values} = boot({state, snapshot: roster, respond: accept});
  await wait(30);
  for (let n = 40; n < 52; n++) state.shooting.push(shot(n));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(posts(calls).length, 1);
  assert.equal(posts(calls)[0].body.shots.length, 12);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), []);
  for (let n = 40; n < 52; n++) assert.ok(context.window.ptCloudHasShot(id(n)));
});

test('a rate-limited batch stays pending and is retried with backoff', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  let attempts = 0;
  const {context, calls, values} = boot({state, snapshot: roster, respond: call => ++attempts === 1 ? {ok:false, status:429, body:{error:'Rate limit reached'}} : accept(call)});
  await wait(30);
  state.shooting.push(shot(60), shot(61));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(posts(calls).length, 1);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), [id(60), id(61)], 'a 429 keeps the shots queued');
  assert.equal(JSON.parse(values.get('pt_hub_rejected_v1') || '[]').length, 0, 'a 429 is never a rejection');
  await wait(1200);
  assert.equal(posts(calls).length, 2, 'the batch is retried without another tap');
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), []);
});

test('every request carries one stable device id that survives a reload', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const first = boot({state, snapshot: roster, respond: accept});
  await wait(30);
  state.shooting.push(shot(70));
  first.context.window.ptCloudQueueSave();
  await wait(150);
  const ids = new Set(first.calls.map(c => c.headers['X-PT-Device']));
  assert.equal(ids.size, 1);
  const device = [...ids][0];
  assert.match(device, /^[0-9a-f]{32}$/);
  assert.equal(first.values.get('pt_hub_device_v1'), device);
  const second = boot({state: {...state, shooting: []}, snapshot: roster, values: first.values});
  await wait(30);
  assert.equal(second.calls.at(-1).headers['X-PT-Device'], device);
});

test('drill results upload as one batch and rejected rows are set aside', async () => {
  const results = [1, 2, 3].map(n => ({id: id(80 + n), batchId: id(80), playerId: PLAYER, date: '2026-11-10', result: n === 2 ? 'loss' : 'win', recordedAt: '2026-11-10T12:00:00.000Z'}));
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: results, gameSituations: [], gameSituationShots: []};
  const {context, calls, values} = boot({state, snapshot: roster, respond: call => ({ok:true, body:{ok:true, saved:[id(81), id(83)], rejected:[{id: id(82), error:'Invalid drill result'}]}})});
  await wait(30);
  context.window.ptCloudQueueSave();
  await wait(150);
  const batches = calls.filter(c => c.url.includes('action=drill_results'));
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].body.results.map(r => r.id), [id(81), id(82), id(83)]);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_drill_results_v1')), []);
  assert.equal(JSON.parse(values.get('pt_hub_rejected_v1'))[0].id, id(82));
  assert.equal(calls.filter(c => c.url.includes('action=drill_result&')).length, 0, 'no per-row requests');
});

test('a screen wake right after a refresh does not fetch the snapshot again', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {calls, listeners} = boot({state, snapshot: roster});
  await wait(30);
  const gets = () => calls.filter(c => c.method === 'GET').length;
  assert.equal(gets(), 1);
  for (const fn of listeners.visibilitychange || []) fn();
  for (const fn of listeners.visibilitychange || []) fn();
  await wait(30);
  assert.equal(gets(), 1, 'unlocking a phone seconds after a refresh must not cost another snapshot');
});

test('a failure of the whole batch request keeps every shot queued', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  let attempts = 0;
  const {context, calls, values} = boot({state, snapshot: roster, respond: call => ++attempts === 1 ? {ok:false, status:404, body:{error:'Unknown operation'}} : accept(call)});
  await wait(30);
  state.shooting.push(shot(90), shot(91));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), [id(90), id(91)], 'an old function answering 404 must not discard the queue');
  assert.equal(JSON.parse(values.get('pt_hub_rejected_v1') || '[]').length, 0);
  await wait(1200);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), []);
  assert.equal(posts(calls).length, 2);
});

test('a partial batch reply leaves the rest queued and retries without a tap', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  let attempts = 0;
  const {context, calls, values} = boot({state, snapshot: roster, respond: call => ++attempts === 1 ? {ok:true, body:{ok:true, saved:[id(95)], rejected:[]}} : accept(call)});
  await wait(30);
  state.shooting.push(shot(95), shot(96));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), [id(96)]);
  await wait(1200);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), []);
  assert.deepEqual(batchIds(calls).slice(-1), [id(96)]);
});

test('an undo while the upload is in flight still removes the shot from the cloud', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls} = boot({state, snapshot: roster, respond: call => call.method === 'DELETE' ? {ok:true, body:{ok:true}} : accept(call), postDelay: 120});
  await wait(30);
  state.shooting.push(shot(300));
  context.window.ptCloudQueueSave();
  await wait(100);
  assert.equal(posts(calls).length, 1, 'upload is in flight');
  state.shooting = [];
  context.window.ptCloudQueueSave();
  await wait(400);
  const removal = calls.find(c => c.method === 'DELETE');
  assert.ok(removal, 'the shot that was undone mid-flight must be deleted once the upload lands');
  assert.equal(removal.body.id, id(300));
  assert.ok(removal.body.owner_token);
  assert.equal(context.window.ptCloudHasShot(id(300)), false);
});

test('a drill result queued during a shot upload goes up without another tap', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls} = boot({state, snapshot: roster, respond: call => call.url.includes('action=shots') ? accept(call) : ({ok:true, body:{ok:true, saved: call.body.results.map(r => r.id), rejected: []}}), postDelay: 120});
  await wait(30);
  state.shooting.push(shot(310));
  context.window.ptCloudQueueSave();
  await wait(40);
  state.drillResults.push({id: id(311), batchId: id(312), playerId: PLAYER, date: '2026-11-10', result: 'win', recordedAt: '2026-11-10T12:00:00.000Z'});
  context.window.ptCloudQueueSave();
  await wait(500);
  assert.equal(calls.filter(c => c.url.includes('action=drill_results')).length, 1);
});

test('uploaded drill results are remembered across reloads instead of re-sent', async () => {
  const results = [{id: id(320), batchId: id(321), playerId: PLAYER, date: '2026-11-10', result: 'win', recordedAt: '2026-11-10T12:00:00.000Z'}];
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: results, gameSituations: [], gameSituationShots: []};
  const first = boot({state, snapshot: roster, respond: call => ({ok:true, body:{ok:true, saved: call.body.results.map(r => r.id), rejected: []}})});
  await wait(30);
  first.context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(first.calls.filter(c => c.url.includes('action=drill_results')).length, 1);
  const second = boot({state: {...state, drillResults: [...results]}, snapshot: roster, values: first.values});
  await wait(30);
  second.context.window.ptCloudQueueSave();
  await wait(150);
  assert.equal(second.calls.filter(c => c.url.includes('action=drill_results')).length, 0, 'a reload must not re-upload the season');
});

test('an unknown-player rejection keeps the shot queued until the roster catches up', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  let attempts = 0;
  const {context, calls, values} = boot({state, snapshot: roster, respond: call => ++attempts === 1 ? {ok:true, body:{ok:true, saved:[], rejected:[{id: id(330), error:'Unknown player or drill'}]}} : accept(call)});
  await wait(30);
  state.shooting.push(shot(330));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), [id(330)], 'a roster race is not a permanent rejection');
  assert.equal(JSON.parse(values.get('pt_hub_rejected_v1') || '[]').length, 0);
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), []);
  assert.ok(context.window.ptCloudHasShot(id(330)));
});

test('a second tab never erases the first tab\'s pending shots', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const a = boot({state, snapshot: roster, respond: () => ({ok:false, status:503, body:{error:'down'}})});
  await wait(30);
  state.shooting.push(shot(340));
  a.context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(JSON.parse(a.values.get('pt_hub_pending_v1')), [id(340)]);
  const b = boot({state: {...state, shooting: []}, snapshot: roster, values: a.values, respond: accept});
  await wait(30);
  b.context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(JSON.parse(a.values.get('pt_hub_pending_v1')), [id(340)], 'tab B does not know this shot and must leave it queued for tab A');
});

test('a failed queue write is reported instead of swallowed', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context} = boot({state, snapshot: roster, respond: () => ({ok:false, status:503, body:{error:'down'}}), storageThrows: key => key === 'pt_hub_pending_v1'});
  await wait(30);
  state.shooting.push(shot(350));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.match(context.window.ptCloudStatus().error, /could not (save|record)/i);
});
