const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','PT_Hub_Complete_Handoff_2026-11-04','01_STUDENTS','frontend','assets','profiles.js'),'utf8');
const context={document:{getElementById:()=>null},state:{players:[]}};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context);

test('PSR uses the supplied varsity average for each named zone',()=>{
 const expected={rim:0.75,floaters:0.5,midCornerLeft:0.5,midCornerRight:0.5,midWingLeft:0.45,midWingRight:0.45,midKey:0.45,cornerLeft:0.42,cornerRight:0.42,wingLeft:0.4,wingRight:0.4,slotLeft:0.38,slotRight:0.38,top:0.38,free:0.7};
 for(const [zone,benchmark] of Object.entries(expected))assert.equal(context.practiceBenchmark({zone}),benchmark,zone);
 assert.equal(context.practiceBenchmark({zone:null}),null);
});

test('PSR is 100 at expectations and moves one point per percentage point',()=>{
 assert.equal(context.practiceShootingRating(8,8,10),100);
 assert.equal(context.practiceShootingRating(13,12.5,20),102.5);
 assert.equal(context.practiceShootingRating(12,12.5,20),97.5);
 assert.equal(context.practiceShootingRating(0,0,0),null);
});

test('trend plots each practice date and excludes shots without category averages',()=>{
 const records=[
  {date:'2026-11-10',zone:'rim',category:'Finishing',makes:8,attempts:10},
  {date:'2026-11-10',zone:'wingLeft',category:'Wing 3 Left',makes:5,attempts:10},
  {date:'2026-11-10',zone:null,category:'Custom: Test',makes:5,attempts:5},
  {date:'2026-11-11',zone:'free',category:'Free Throws',makes:7,attempts:10},
  {date:'2026-11-12',zone:null,category:'Custom: Test',makes:1,attempts:5}
 ];
 const nodes={trendShotType:{value:'',innerHTML:''},trendMetric:{value:'psr',innerHTML:''},teamTrendPsrHelp:{hidden:true},teamTrendChart:{clientWidth:900,innerHTML:''},teamTrendSummary:{textContent:''},teamTrendTable:{innerHTML:''}};
 context.$=id=>nodes[id];
 context.profileRecords=()=>records;
 context.profileCategory=shot=>shot.category;
 context.profileIsTeam=()=>true;
 context.esc=value=>String(value);
 context.table=(headers,rows)=>headers.join('|')+'\n'+rows.join('\n');
 context.pct=(makes,attempts)=>(100*makes/attempts).toFixed(1)+'%';
 vm.runInContext("profileSource='practice'",context);
 context.renderShootingTrend();
 assert.equal(nodes.trendMetric.value,'psr');
 assert.equal(nodes.teamTrendPsrHelp.hidden,false);
 assert.match(nodes.teamTrendChart.innerHTML,/PSR\+ 107\.5/);
 assert.match(nodes.teamTrendChart.innerHTML,/PSR\+ 100\.0/);
 assert.doesNotMatch(nodes.teamTrendTable.innerHTML,/2026-11-12/);
 assert.match(nodes.teamTrendSummary.textContent,/10 unrated attempts \(no category average\)/);
 assert.match(nodes.teamTrendTable.innerHTML,/Practice Date\|Rated Attempts\|Makes\|Expected Makes\|PSR\+/);
 vm.runInContext("profileSource='game'",context);
 context.renderShootingTrend();
 assert.equal(nodes.trendMetric.value,'percentage');
 assert.equal(nodes.teamTrendPsrHelp.hidden,true);
 assert.doesNotMatch(nodes.trendMetric.innerHTML,/value="psr"/);
  vm.runInContext("profileSource='practice'",context);
  nodes.trendShotType.value='Finishing';
  nodes.trendMetric.value='psr';
  context.renderShootingTrend();
  assert.equal(nodes.trendMetric.value,'percentage');
  assert.doesNotMatch(nodes.trendMetric.innerHTML,/value="psr"/);
});
