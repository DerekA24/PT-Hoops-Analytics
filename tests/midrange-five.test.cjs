const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','PT_Hub_Complete_Handoff_2026-11-04','01_STUDENTS','frontend','assets','profiles.js'),'utf8');

test('old midrange makes and misses spread across five zones without changing totals',()=>{
 const players=['a','b','c'].map(id=>({id,name:id}));
 const shooting=Array.from({length:31},(_,i)=>({id:'shot-'+i,playerId:players[i%3].id,type:i%2?'Midrange Low':'Midrange High',attempts:1,makes:i%3===0?1:0,date:'2026-11-10'}));
 const state={players,shooting,court:[],gameSituationShots:[],gameSituations:[],games:[]};
 const context={state,document:{body:{dataset:{profileScope:'team'}},getElementById:()=>null},dateInRange:()=>true};
 vm.runInNewContext(source+'\nglobalThis.getRecords=()=>profileRecords({allDates:true,source:"practice",player:null});globalThis.getZone=profileZone;',context);
 const first=context.getRecords(),second=context.getRecords();
 assert.deepEqual(JSON.parse(JSON.stringify(first)),JSON.parse(JSON.stringify(second)));
 assert.equal(first.reduce((n,shot)=>n+shot.attempts,0),31);
 assert.equal(first.reduce((n,shot)=>n+shot.makes,0),shooting.filter(shot=>shot.makes).length);
 const names=['Midrange Corner Left','Midrange Corner Right','Midrange Wing Left','Midrange Wing Right','Midrange Key'];
 assert.ok(first.every(shot=>names.includes(shot.type)));
 const makes=names.map(name=>first.filter(shot=>shot.type===name).reduce((n,shot)=>n+shot.makes,0));
 const misses=names.map(name=>first.filter(shot=>shot.type===name).reduce((n,shot)=>n+shot.attempts-shot.makes,0));
 assert.ok(Math.max(...makes)-Math.min(...makes)<=1);
 assert.ok(Math.max(...misses)-Math.min(...misses)<=1);
 assert.equal(context.getZone({type:'Midrange Wing Right'}),'midWingRight');
 assert.equal(context.getZone({type:'Midrange Key',x:250,y:280}),'midKey');
});
