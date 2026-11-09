const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../PT_Hub_Complete_Handoff_2026-11-04/01_STUDENTS/frontend/assets/game-report-data.js');
const {build}=globalThis.PTGameReport;
const players=[{id:'pt-1',name:'Test Player',number:12}];
const game=()=>({date:'2026-11-09',opponent:'Test Opponent',opponentPlayers:[{id:'opp-1',name:'Opponent Player',number:7}],events:[]});

test('separates teams and counts field goals, free throws, and tagged points',()=>{
 const value=game();value.events=[
  {playerId:'pt-1',team:'pt',type:'TWO_M',x:250,y:90,inPaint:true,fastBreak:true},
  {playerId:'pt-1',team:'pt',type:'FT_M',x:250,y:202},
  {playerId:'opp-1',team:'opponent',type:'THREE_M',x:470,y:350},
  {playerId:'opp-1',team:'opponent',type:'OREB'},
 ];
 const report=build(value,players);
 assert.equal(report.ptScore,3);assert.equal(report.opponentScore,3);
 assert.deepEqual(report.pt.totals.fg,{made:1,attempts:1});
 assert.deepEqual(report.pt.totals.ft,{made:1,attempts:1});
 assert.equal(report.pt.totals.pitp,2);assert.equal(report.pt.totals.fbp,2);
 assert.equal(report.opponent.totals.orb,1);
 assert.equal(report.pt.shots.length,1);assert.equal(report.opponent.shots.length,1);
 assert.equal(report.pt.zones.find(z=>z.id==='rim').made,1);
 assert.equal(report.opponent.zones.find(z=>z.id==='right3').threeAttempts,1);
});

test('adds only post-import live events to imported totals',()=>{
 const value=game();value.statsImport={importedAt:'2026-11-09T12:00:00Z'};
 value.playerStats=[{playerId:'pt-1',pts:10,fgMade:4,fgAttempts:8,threeMade:2,threeAttempts:4,ftMade:0,ftAttempts:0}];
 value.events=[
  {playerId:'pt-1',type:'TWO_M',source:'live-game',recordedAt:'2026-11-09T11:00:00Z'},
  {playerId:'pt-1',type:'THREE_M',source:'live-game',recordedAt:'2026-11-09T13:00:00Z'},
 ];
 const report=build(value,players);
 assert.equal(report.pt.totals.pts,13);
 assert.deepEqual(report.pt.totals.fg,{made:5,attempts:9});
 assert.equal(report.pt.shots.length,0);assert.equal(report.pt.unlocated,2);
});

test('does not invent totals or shot locations for an empty game',()=>{
 const report=build(game(),players);
 assert.equal(report.ptScore,null);assert.equal(report.pt.totals.fg,null);
 assert.equal(report.pt.totals.second,null);assert.equal(report.facts.length,0);
 assert.equal(report.pt.shots.length,0);
});

test('preserves explicit scoreboard values and does not mutate source data',()=>{
 const value=game();value.teamScore=34;value.opponentScore=39;
 const before=JSON.stringify(value),report=build(value,players);
 assert.equal(report.ptScore,34);assert.equal(report.opponentScore,39);
 assert.equal(JSON.stringify(value),before);
});

test('second-chance points require explicit recorded data',()=>{
 const value=game();value.events=[{playerId:'pt-1',type:'OREB'},{playerId:'pt-1',type:'TWO_M'}];
 assert.equal(build(value,players).pt.totals.second,null);
 value.events[1].secondChance=true;
 assert.equal(build(value,players).pt.totals.second,2);
});
