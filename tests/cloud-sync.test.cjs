const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cloud = fs.readFileSync(path.join(__dirname, '..', 'PT_Hub_Complete_Handoff_2026-11-04', '01_STUDENTS', 'frontend', 'assets', 'cloud.js'), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const PLAYER = id(1), DRILL = id(2);

function boot({page = 'shooting-drills.html', state, snapshot = {}, respond = () => ({ok:true, body:{ok:true}})}) {
  const calls = [];
  const values = new Map();
  const context = {
    state,
    location: {pathname: '/' + page},
    window: {addEventListener(){}},
    document: {createElement: () => ({classList:{toggle(){}}, setAttribute(){}}), querySelector: () => null, getElementById: () => null, addEventListener(){}, visibilityState: 'visible'},
    localStorage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value))},
    fetch: async (url, options) => {
      const call = {url, method: options.method, headers: options.headers, body: options.body && JSON.parse(options.body)};
      calls.push(call);
      if (options.method === 'GET') return {ok:true, status:200, json: async () => ({scope:'entry', players:[], drills:[], shots:[], drillResults:[], scheduleRecords:[], gameSituations:[], gameSituationShots:[], ...snapshot})};
      const reply = respond(call);
      return {ok: reply.ok, status: reply.status || (reply.ok ? 200 : 400), json: async () => reply.body};
    },
    setTimeout, clearTimeout, setInterval: () => 0, AbortController,
    save: () => { context.saves = (context.saves || 0) + 1; },
  };
  vm.runInNewContext(cloud, context);
  return {context, calls, values};
}

const shot = (n, extra = {}) => ({id: id(n), playerId: PLAYER, type: 'Free Throws', date: '2026-11-10', makes: 1, attempts: 1, recordedAt: '2026-11-10T12:00:00.000Z', ...extra});
const roster = {players: [{id: PLAYER, full_name: 'Test Player', jersey_number: 4, grade: '', position: ''}], drills: [{id: DRILL, name: 'Free Throws'}]};
const posts = calls => calls.filter(c => c.method === 'POST' && c.url.includes('action=shot'));

test('a shot with an unregistered drill does not block the shots behind it', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls, values} = boot({state, snapshot: roster});
  await wait(30);
  state.shooting.push(shot(10, {type: 'Mystery Drill'}), shot(11));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(posts(calls).map(c => c.body.id), [id(11)]);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), [id(10)]);
});

test('a shot the server rejects is set aside instead of retried forever', async () => {
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls, values} = boot({state, snapshot: roster, respond: call => call.body.id === id(20) ? {ok:false, status:403, body:{error:'Unknown player or drill'}} : {ok:true, body:{ok:true}}});
  await wait(30);
  state.shooting.push(shot(20), shot(21));
  context.window.ptCloudQueueSave();
  await wait(150);
  assert.deepEqual(posts(calls).map(c => c.body.id), [id(20), id(21)]);
  assert.deepEqual(JSON.parse(values.get('pt_hub_pending_v1')), []);
  assert.equal(JSON.parse(values.get('pt_hub_rejected_v1'))[0].id, id(20));
  assert.equal(context.window.ptCloudStatus().rejected, 1);
});

test('a backup import does not delete shared shots, and resync forgets vanished ids', async () => {
  const cloudShots = Array.from({length: 12}, (_, i) => ({id: id(100 + i), player_id: PLAYER, drill_id: DRILL, made: true, practice_date: '2026-11-10', created_at: '2026-11-10T12:00:00.000Z', notes: null}));
  const state = {players: [], games: [], shooting: [], court: [], schedule: [], drillResults: [], gameSituations: [], gameSituationShots: []};
  const {context, calls} = boot({page: 'leaderboards.html', state, snapshot: {...roster, scope: 'full', shots: cloudShots}});
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
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 2, 'ordinary removals still propagate');
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
