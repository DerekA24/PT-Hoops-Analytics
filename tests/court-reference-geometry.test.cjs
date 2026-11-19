const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const frontend=path.join(__dirname,'..','PT_Hub_Complete_Handoff_2026-11-04','01_STUDENTS','frontend');
const read=name=>fs.readFileSync(path.join(frontend,name),'utf8');

test('all court drawings follow the reference proportions and retain their colors',()=>{
 for(const name of ['live-game.html','game-situation.html','player-profiles.html','team-profile.html','assets/game-report.js']){
  const source=read(name);
  assert.ok(source.includes('viewBox="0 0 500 322"'),name);
  assert.ok(source.includes('width="476" height="298"'),name);
  assert.ok(source.includes('x="193" y="12" width="114" height="179"'),name);
  assert.ok(source.includes('M64 62A186 186 0 0 0 436 62'),name);
  assert.ok(source.includes('M193 191A57 57 0 0 0 307 191'),name);
  assert.ok(source.includes('stroke-dasharray="6 8"'),name);
 }
 assert.equal(62+186,191+57);
 assert.ok(Math.abs(476/298-471/294)<0.01);
 assert.ok(read('live-game.html').includes('fill="#14263a"'));
 assert.ok(read('player-profiles.html').includes('fill="#15202c"'));
});

test('existing located shots map onto the new court without changing their stored coordinates',()=>{
 const context={state:{players:[],games:[]},document:{body:{dataset:{}},getElementById:()=>null},dateInRange:()=>true};
 vm.runInNewContext(read('assets/profiles.js')+'\nglobalThis.mapY=profileCourtY;globalThis.zoneFor=profileZone;',context);
 for(const [stored,shown] of [[12,12],[74,62],[202,191],[422,248],[458,300]])assert.equal(context.mapY(stored),shown);
 assert.equal(context.zoneFor({x:30,y:60,type:'THREE_M'}),'cornerLeft');
 assert.equal(context.zoneFor({x:470,y:60,type:'THREE_M'}),'cornerRight');
 assert.equal(context.zoneFor({x:250,y:300,type:'Midrange Key'}),'midKey');
 assert.equal(context.zoneFor({x:250,y:440,type:'THREE_M'}),'top');
});
