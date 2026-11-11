const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','PT_Hub_Complete_Handoff_2026-11-04','01_STUDENTS','frontend','assets','profiles.js'),'utf8');

test('legacy unsided attempts are divided without losing shots or makes',()=>{
 const state={players:[{id:'p',name:'Player'}],shooting:[
  {id:'a',playerId:'p',type:'Corner 3',attempts:5,makes:3,date:'2026-11-10'},
  {id:'b',playerId:'p',type:'Corner 3',attempts:1,makes:1,date:'2026-11-10'}
 ],court:[],gameSituationShots:[],gameSituations:[],games:[]};
 const context={state,document:{body:{dataset:{profileScope:'team'}},getElementById:()=>null},dateInRange:()=>true};
 vm.runInNewContext(source+'\nglobalThis.getRecords=()=>profileRecords({allDates:true,source:"practice",player:null});globalThis.getZone=profileZone;',context);
 const records=context.getRecords();
 const left=records.filter(r=>r.type==='Corner 3 Left'),right=records.filter(r=>r.type==='Corner 3 Right');
 assert.equal(left.reduce((n,r)=>n+r.attempts,0),3);
 assert.equal(right.reduce((n,r)=>n+r.attempts,0),3);
 assert.equal(records.reduce((n,r)=>n+r.makes,0),4);
 assert.equal(left.reduce((n,r)=>n+r.makes,0),2);
 assert.equal(right.reduce((n,r)=>n+r.makes,0),2);
 assert.equal(context.getZone({type:'Corner 3 Right'}),'cornerRight');
 assert.equal(context.getZone({type:'Wing 3',x:470,y:240}),'wingRight');
});

test('old makes stay balanced for both each athlete and the team',()=>{
 const players=['a','b','c','d'].map(id=>({id,name:id}));
 const shooting=players.flatMap(player=>Array.from({length:3},(_,index)=>({id:player.id+index,playerId:player.id,type:'Wing 3',attempts:1,makes:1,date:'2026-11-10'})));
 const state={players,shooting,court:[],gameSituationShots:[],gameSituations:[],games:[]};
 const context={state,document:{body:{dataset:{profileScope:'team'}},getElementById:()=>null},dateInRange:()=>true};
 vm.runInNewContext(source+'\nglobalThis.getRecords=()=>profileRecords({allDates:true,source:"practice",player:null});',context);
 const records=context.getRecords();
 assert.equal(records.filter(r=>r.type==='Wing 3 Left').reduce((sum,r)=>sum+r.makes,0),6);
 assert.equal(records.filter(r=>r.type==='Wing 3 Right').reduce((sum,r)=>sum+r.makes,0),6);
 for(const player of players){
  const own=records.filter(r=>r.playerId===player.id);
  const left=own.filter(r=>r.type==='Wing 3 Left').reduce((sum,r)=>sum+r.makes,0);
  const right=own.filter(r=>r.type==='Wing 3 Right').reduce((sum,r)=>sum+r.makes,0);
  assert.ok(Math.abs(left-right)<=1);
 }
});
