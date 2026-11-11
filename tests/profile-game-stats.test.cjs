const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assets=path.join(__dirname,'..','PT_Hub_Complete_Handoff_2026-11-04','01_STUDENTS','frontend','assets');
const state={players:[{id:'p1',name:'First Player'},{id:'p2',name:'Second Player'},{id:'test',name:'Test Player'}],games:[
 {id:'new',date:'2026-11-10',played:true,statsImport:{importedAt:'2026-11-10T20:00:00Z'},playerStats:[
  {playerId:'p1',pts:7,minutes:20,orb:2,to:1},
  {playerId:'p2',pts:4,minutes:10},
  {playerId:'test',pts:99,minutes:40}
 ],events:[
  {playerId:'p1',type:'THREE_M',team:'pt',source:'live-game',recordedAt:'2026-11-10T19:00:00Z'},
  {playerId:'p1',type:'TWO_M',team:'pt',source:'live-game',recordedAt:'2026-11-10T21:00:00Z'},
  {playerId:'p1',type:'TO',team:'opponent',source:'live-game',recordedAt:'2026-11-10T21:00:00Z'}
 ]},
 {id:'old',date:'2026-11-01',played:true,playerStats:[{playerId:'p1',pts:30,minutes:30}]}
 ],gameSituations:[{events:[{playerId:'p1',type:'THREE_M'}]}],gameSituationShots:[{playerId:'p1',type:'THREE_M'}],shooting:[],court:[]};
const context={state,document:{body:{dataset:{profileScope:'team'}},getElementById:()=>null},dateInRange:date=>date>='2026-11-10'};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(assets,'game-stat-totals.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(assets,'game-situation-leaderboard-data.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(assets,'profiles.js'),'utf8'),context);

test('Practice heat map and Game Situation stats are the profile defaults',()=>{
 assert.equal(vm.runInContext('profileSource',context),'practice');
 assert.equal(vm.runInContext('profileStatsSource',context),'situation');
});

test('profile game bars use imported and later Live Game stats without Game Situation data',()=>{
 const player=context.profileGameStats(state.games,'p1',false).totals;
 assert.equal(player.get('gp'),1);
 assert.equal(player.get('min'),20);
 assert.equal(player.get('pts'),9);
 assert.equal(player.get('orb'),2);
 assert.equal(player.get('to'),1);
 assert.equal(player.get('pts')/player.get('min'),0.45);
 const team=context.profileGameStats(state.games,null,false).totals;
 assert.equal(team.get('pts'),13);
 assert.equal(team.get('min'),30);
 assert.equal(team.get('gp'),2);
 assert.equal(team.get('pts')/team.get('min'),13/30);
});

test('unrecorded minutes remain unavailable for per-minute calculations',()=>{
 const totals=context.profileGameStats([{id:'no-minutes',date:'2026-11-10',played:true,events:[{playerId:'p1',team:'pt',type:'TWO_M'}]}],'p1',true).totals;
 assert.equal(totals.get('pts'),2);
 assert.equal(totals.get('min'),null);
});

test('per-minute bar shows counting stats and omits games and minutes',()=>{
 const nodes={profileGameTotals:{innerHTML:''},profileGamePerMinute:{innerHTML:''}};
 context.$=id=>nodes[id];
 context.esc=value=>String(value);
 context.renderProfileGameStats(null);
 const totals=nodes.profileGameTotals.innerHTML,perMinute=nodes.profileGamePerMinute.innerHTML;
 assert.equal((totals.match(/class="profile-game-stat"/g)||[]).length,13);
 assert.equal((perMinute.match(/class="profile-game-stat"/g)||[]).length,10);
 assert.match(perMinute,/PTS\/MIN/);
 assert.doesNotMatch(perMinute,/(?:GP|GS|MIN)\/MIN/);
});

test('Game Situation stats show DRB, ORB, and TO and include legacy REB',()=>{
 const previousShots=state.gameSituationShots,previousSessions=state.gameSituations;
 state.gameSituationShots=[
  {id:'orb-1',playerId:'p1',date:'2026-11-10',type:'ORB'},
  {id:'drb-1',playerId:'p1',date:'2026-11-10',type:'DRB'},
  {id:'to-1',playerId:'p1',date:'2026-11-10',type:'TO'},
  {id:'undone',playerId:'p1',date:'2026-11-10',type:'REB',undone:true},
  {id:'old',playerId:'p1',date:'2026-11-01',type:'REB'},
  {id:'other',playerId:'p2',date:'2026-11-10',type:'REB'}
 ];
 state.gameSituations=[{date:'2026-11-10',events:[{id:'orb-1',playerId:'p1',type:'ORB'},{id:'reb-1',playerId:'p1',type:'REB'}]}];
 const button=()=>({pressed:'',setAttribute(name,value){if(name==='aria-pressed')this.pressed=value}});
 const nodes={profileGameTotals:{innerHTML:''},profileGamePerMinute:{innerHTML:''},profileStatsSituation:button(),profileStatsLive:button(),profileGameStatsDescription:{textContent:''},profileGameTotalsHeading:{textContent:''},profileGamePerMinuteSection:{hidden:false}};
 context.$=id=>nodes[id];
 vm.runInContext("profileStatsSource='situation';profileAllDates=false",context);
 try{
  context.renderProfileGameStats('p1');
  const html=nodes.profileGameTotals.innerHTML;
  assert.equal((html.match(/class="profile-game-stat"/g)||[]).length,3);
  assert.match(html,/<small>Defensive Rebounds<\/small><strong>2<\/strong>/);
  assert.match(html,/<small>Offensive Rebounds<\/small><strong>1<\/strong>/);
  assert.match(html,/<small>Turnovers<\/small><strong>1<\/strong>/);
  assert.equal(nodes.profileGamePerMinuteSection.hidden,true);
  assert.equal(nodes.profileGamePerMinute.innerHTML,'');
  assert.equal(nodes.profileStatsSituation.pressed,'true');
 }finally{
  state.gameSituationShots=previousShots;state.gameSituations=previousSessions;
  vm.runInContext("profileStatsSource='situation';profileAllDates=true",context);
 }
});
