const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const profiles = fs.readFileSync(path.join(__dirname, '..', 'PT_Hub_Complete_Handoff_2026-11-04', '01_STUDENTS', 'frontend', 'assets', 'profiles.js'), 'utf8');

function records(state) {
  const context = {state, document: {body:{dataset:{}},getElementById: () => null}, dateInRange: () => true};
  vm.runInNewContext(profiles + '\nglobalThis.readSituationRecords = () => profileRecords({allDates:true,source:"game-situation",player:null});', context);
  return context.readSituationRecords();
}

const legacyEvent = {id:'11111111-1111-4111-8111-111111111111', playerId:'22222222-2222-4222-8222-222222222222', type:'TWO_M', x:250, y:110};
const session = {id:'33333333-3333-4333-8333-333333333333', date:'2026-11-10', events:[legacyEvent]};
const shot = {id:legacyEvent.id, playerId:legacyEvent.playerId, date:session.date, type:legacyEvent.type, x:legacyEvent.x, y:legacyEvent.y, recordedAt:'2026-11-10T12:00:00.000Z', undone:false};
const stateWith = (shots) => ({shooting:[], court:[], gameSituations:[session], gameSituationShots:shots});

test('legacy shooting survives before migration', () => {
  const result = records(stateWith([]));
  assert.equal(result.length, 1);
  assert.equal(result[0].makes, 1);
});

test('a migrated shot is counted once, even while the original session remains', () => {
  const result = records(stateWith([shot]));
  assert.equal(result.length, 1);
  assert.equal(result[0].attempts, 1);
});

test('undo hides a migrated shot without deleting its historical session', () => {
  assert.equal(records(stateWith([{...shot, undone:true}])).length, 0);
});

test('defensive and offensive rebounds and turnovers stay out of shooting totals', () => {
  for(const type of ['REB','DRB','ORB','TO']){
    const state={shooting:[],court:[],gameSituations:[],gameSituationShots:[{...shot,type}]};
    assert.equal(records(state).length,0);
  }
});

test('cloud sync writes one shot and an undo without rewriting a session', async () => {
  const cloud = fs.readFileSync(path.join(__dirname, '..', 'PT_Hub_Complete_Handoff_2026-11-04', '01_STUDENTS', 'frontend', 'assets', 'cloud.js'), 'utf8');
  const calls = [];
  const values = new Map();
  const state = {players:[], games:[], shooting:[], court:[], schedule:[], drillResults:[], gameSituations:[], gameSituationShots:[]};
  const context = {
    state,
    location: {pathname:'/game-situation.html'},
    window: {addEventListener(){}},
    document: {createElement: () => ({classList:{toggle(){}},setAttribute(){}}), querySelector: () => null, getElementById: () => null, addEventListener(){}, visibilityState:'visible'},
    localStorage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)},
    fetch: async (url, options) => {
      calls.push({url, method:options.method, body:options.body && JSON.parse(options.body)});
      if(options.method==='POST'&&options.body&&JSON.parse(options.body).shot_type==='DRB')
        return {ok:false,status:400,json:async()=>({error:'Invalid game situation event'})};
      return {ok:true, json:async () => options.method==='GET'
        ? {scope:'entry',players:[],drills:[],shots:[],drillResults:[],scheduleRecords:[],gameSituations:[],gameSituationShots:[]}
        : {ok:true}};
    },
    setTimeout, clearTimeout, setInterval: () => 0,
    save: () => {},
  };
  vm.runInNewContext(cloud, context);
  await new Promise(resolve => setTimeout(resolve, 30));
  state.gameSituationShots.push({...shot});
  context.window.ptCloudQueueSave();
  await new Promise(resolve => setTimeout(resolve, 160));
  assert.equal(calls.filter(call => call.method==='POST' && call.url.includes('action=game_situation_shot')).length, 1);
  assert.equal(calls.filter(call => call.method==='POST' && call.url.endsWith('action=game_situation')).length, 0);
  state.gameSituationShots[0].undone = true;
  context.window.ptCloudQueueSave();
  await new Promise(resolve => setTimeout(resolve, 160));
  assert.equal(calls.filter(call => call.method==='PATCH' && call.url.includes('action=game_situation_shot')).length, 1);
  state.gameSituationShots.push({...shot,id:'44444444-4444-4444-8444-444444444444',type:'DRB'});
  context.window.ptCloudQueueSave();
  await new Promise(resolve => setTimeout(resolve, 160));
  assert.equal(calls.filter(call => call.method==='POST' && call.body?.shot_type==='DRB').length,1);
  assert.equal(calls.filter(call => call.method==='POST' && call.body?.shot_type==='REB').length,1);
});

test('an older backend keeps receiving session saves until migration is deployed', async () => {
  const cloud = fs.readFileSync(path.join(__dirname, '..', 'PT_Hub_Complete_Handoff_2026-11-04', '01_STUDENTS', 'frontend', 'assets', 'cloud.js'), 'utf8');
  const calls = [];
  const values = new Map();
  const context = {
    state: {players:[], games:[], shooting:[], court:[], schedule:[], drillResults:[], gameSituations:[session], gameSituationShots:[shot]},
    location: {pathname:'/game-situation.html'},
    window: {addEventListener(){}},
    document: {createElement: () => ({classList:{toggle(){}},setAttribute(){}}), querySelector: () => null, getElementById: () => null, addEventListener(){}, visibilityState:'visible'},
    localStorage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)},
    fetch: async (url, options) => {
      calls.push({url, method:options.method});
      return {ok:true, json:async () => options.method==='GET'
        ? {players:[],drills:[],shots:[],drillResults:[],scheduleRecords:[],gameSituations:[]}
        : {ok:true}};
    },
    setTimeout, clearTimeout, setInterval: () => 0, save: () => {},
  };
  vm.runInNewContext(cloud, context);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(calls.filter(call => call.method==='POST' && call.url.endsWith('action=game_situation')).length, 1);
  assert.equal(calls.filter(call => call.method==='POST' && call.url.endsWith('action=game_situation_shot')).length, 0);
});
