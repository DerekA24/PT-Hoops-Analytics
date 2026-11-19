const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const frontend=path.join(__dirname,'..','PT_Hub_Complete_Handoff_2026-11-04','01_STUDENTS','frontend');
const profiles=fs.readFileSync(path.join(frontend,'assets','profiles.js'),'utf8');
const live=fs.readFileSync(path.join(frontend,'assets','live-game.js'),'utf8');
const stops=[[12,12],[74,62],[202,191],[422,248],[458,300]];
const storedY=display=>{for(let i=1;i<stops.length;i++){const a=stops[i-1],b=stops[i];if(display<=b[1])return a[0]+(display-a[1])*(b[0]-a[0])/(b[1]-a[1])}return 458};
const context=state=>{
 const scope={state,document:{body:{dataset:{}},getElementById:()=>null},dateInRange:()=>true};
 vm.runInNewContext(profiles+'\nglobalThis.zoneAt=courtZoneAt;globalThis.matches=courtShotTypeMatchesZone;globalThis.readSituation=()=>profileRecords({allDates:true,source:"game-situation",player:null});',scope);
 return scope;
};

test('the box sides and red dividers classify both halves of the court',()=>{
 const zone=context({players:[],games:[]}).zoneAt;
 const cases=[
  [250,80,'rim'],[250,140,'floaters'],
  [193,80,'rim'],[192,80,'midCornerLeft'],[307,140,'floaters'],[308,140,'midWingRight'],
  [130,80,'midCornerLeft'],[370,80,'midCornerRight'],
  [150,150,'midWingLeft'],[350,150,'midWingRight'],
  [190,200,'midKey'],[310,200,'midKey'],
  [30,80,'cornerLeft'],[470,80,'cornerRight'],
  [50,160,'wingLeft'],[450,160,'wingRight'],
  [100,260,'slotLeft'],[400,260,'slotRight'],[250,280,'top']
 ];
 for(const [x,y,expected] of cases)assert.equal(zone(x,storedY(y)),expected,`${x},${y}`);
 assert.equal(zone(250,storedY(247)),'midKey');
 assert.equal(zone(250,storedY(248)),'top');
});

test('normalized Game Situation shots retain their coordinates and gain the correct derived zone',()=>{
 const shots=[
  {id:'a',playerId:'p',date:'2026-11-19',type:'TWO_M',x:193,y:storedY(80),undone:false},
  {id:'b',playerId:'p',date:'2026-11-19',type:'TWO_X',x:192,y:storedY(80),undone:false},
  {id:'c',playerId:'p',date:'2026-11-19',type:'THREE_M',x:100,y:storedY(260),undone:false}
 ];
 const state={players:[{id:'p',name:'Player'}],games:[],shooting:[],court:[],gameSituations:[],gameSituationShots:shots};
 const records=context(state).readSituation();
 assert.deepEqual(Array.from(records,record=>record.zone),['rim','midCornerLeft','slotLeft']);
 assert.equal(shots[0].y,storedY(80));
 assert.ok(live.includes('courtZoneAt(point.x,point.y)'));
 assert.ok(live.includes('courtShotTypeMatchesZone(action[0],shotZone)'));
});

test('Live Game and Game Situation accept only the matching 2-point or 3-point outcome',()=>{
 const matches=context({players:[],games:[]}).matches;
 assert.equal(matches('TWO_M','midWingLeft'),true);
 assert.equal(matches('TWO_X','cornerLeft'),false);
 assert.equal(matches('FAST_TWO','slotRight'),false);
 assert.equal(matches('THREE_M','slotRight'),true);
 assert.equal(matches('THREE_X','midKey'),false);
 assert.equal(matches('FT_M','midKey'),true);
 assert.equal(matches('DRB','cornerLeft'),true);
});
