const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','PT_Hub_Complete_Handoff_2026-11-04','01_STUDENTS','frontend','assets','game-situation-leaderboard-data.js'),'utf8');
const context={window:{}};vm.runInNewContext(code,context);

test('game situation boards keep DRB, ORB, and TO separate and count legacy REB as DRB',()=>{
 const state={
  gameSituationShots:[
   {id:'orb',playerId:'p1',date:'2026-11-11',type:'ORB'},
   {id:'drb',playerId:'p1',date:'2026-11-11',type:'DRB'},
   {id:'undone',playerId:'p1',date:'2026-11-11',type:'REB',undone:true},
   {id:'turnover',playerId:'p2',date:'2026-11-11',type:'TO'},
   {id:'shot',playerId:'p1',date:'2026-11-11',type:'TWO_M'},
  ],
  gameSituations:[{date:'2026-11-11',events:[
   {id:'orb',playerId:'p1',type:'ORB'},
   {id:'legacy-reb',playerId:'p1',type:'REB'},
   {id:'test',playerId:'test',type:'ORB'},
  ]},{date:'2026-11-01',events:[{id:'old-to',playerId:'p2',type:'TO'}]}],
 };
 const result=context.window.PTGameSituationLeaderboardData(state,date=>date==='2026-11-11',id=>id==='test');
 assert.equal(result.recorded,4);
 assert.equal(result.totals.get('p1').drb,2);
 assert.equal(result.totals.get('p1').orb,1);
 assert.equal(result.totals.get('p2').to,1);
 assert.equal(result.totals.has('test'),false);
});
