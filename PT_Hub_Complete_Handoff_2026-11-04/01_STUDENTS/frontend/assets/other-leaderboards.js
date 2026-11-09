// Game-stat boards read saved games and optional per-game playerStats box scores.
(()=>{
 'use strict';
 const root=document.getElementById('otherLeaderboards');if(!root)return;
 const stats=[
  {key:'gp',label:'Games Played',description:'Games with recorded participation',aliases:['gamesPlayed','gp']},
  {key:'gs',label:'Games Started',description:'Games started',aliases:['gamesStarted','gs']},
  {key:'min',label:'Minutes',description:'Minutes played',aliases:['minutes','min']},
  {key:'pf',label:'Personal Fouls',description:'Personal fouls',aliases:['personalFouls','pf'],events:['FOUL','PF']},
  {key:'pts',label:'Points',description:'Points',aliases:['pts','points']},
  {key:'orb',label:'Offensive Rebounds',description:'Offensive rebounds',aliases:['orb','oreb','offensiveRebounds'],events:['OREB','ORB']},
  {key:'drb',label:'Defensive Rebounds',description:'Defensive rebounds',aliases:['drb','dreb','defensiveRebounds'],events:['DREB','DRB']},
  {key:'ast',label:'Assists',description:'Assists',aliases:['ast','assists'],events:['AST']},
  {key:'to',label:'Turnovers',description:'Turnovers',aliases:['to','turnovers'],events:['TO']},
  {key:'stl',label:'Steals',description:'Steals',aliases:['stl','steals'],events:['STL']},
  {key:'blk',label:'Blocks',description:'Blocks',aliases:['blk','blocks'],events:['BLK']},
  {key:'pitp',label:'Points in the Paint',description:'Points in the paint',aliases:['pitp','pointsInThePaint'],flag:'inPaint'},
  {key:'fbp',label:'Fast Break Points',description:'Fast break points',aliases:['fbp','fastBreakPoints'],flag:'fastBreak'}
 ];
 const normalize=key=>key.toLowerCase().replace(/[^a-z0-9]/g,'');
 function recordedValue(row,stat){
  if(!row)return null;
  const entries=new Map(Object.entries(row).map(([key,value])=>[normalize(key),value]));
  for(const alias of stat.aliases){
   const value=entries.get(normalize(alias));
   if(value===null||value===undefined||value===''||typeof value==='boolean')continue;
   if(stat.key==='min'&&typeof value==='string'&&/^\d+:[0-5]\d$/.test(value)){const [minutes,seconds]=value.split(':').map(Number);return minutes+seconds/60}
   const number=Number(value);if(Number.isFinite(number)&&number>=0)return number;
  }
  return null;
 }
 const points=event=>({TWO_M:2,THREE_M:3,FT_M:1})[event.type]||0;
 function gameValues(game){
  const rows=Array.isArray(game.playerStats)?game.playerStats:[];
  const events=Array.isArray(game.events)?game.events.filter(e=>e.team!=='opponent'):[];
  const ids=new Set([...rows.map(r=>r.playerId),...events.map(e=>e.playerId),...(Array.isArray(game.starters)?game.starters:[])]);
  const result=[];
  for(const id of ids){
   if(!id)continue;
   const row=rows.find(r=>r.playerId===id),playerEvents=events.filter(e=>e.playerId===id);
   const gp=recordedValue(row,stats[0]);
   const recent=playerEvents.filter(event=>isNewLiveEvent(game,event));
   if((row?.played===false||gp===0)&&!recent.length)continue;
   const values={gp:1};
   const started=recordedValue(row,stats[1]);
   if(started!==null)values.gs=started>0?1:0;
   else if(typeof row?.started==='boolean')values.gs=Number(row.started);
   else if(Array.isArray(game.starters))values.gs=Number(game.starters.includes(id));
   for(const stat of stats.slice(2)){
    const recorded=recordedValue(row,stat);
    if(recorded!==null){
     let additional=0;
     if(stat.events)additional=recent.filter(e=>stat.events.includes(e.type)).length;
     else if(stat.key==='pts')additional=recent.reduce((n,e)=>n+points(e),0);
     else if(stat.flag)additional=recent.reduce((n,e)=>n+(e[stat.flag]===true||e.tags?.includes(stat.key.toUpperCase())?points(e):0),0);
     values[stat.key]=recorded+additional;continue;
    }
    if(!playerEvents.length)continue;
    if(stat.events)values[stat.key]=playerEvents.filter(e=>stat.events.includes(e.type)).length;
    else if(stat.key==='pts')values.pts=playerEvents.reduce((n,e)=>n+points(e),0);
    else if(stat.flag){
     const scoring=playerEvents.filter(e=>points(e)>0);
     const tagged=scoring.filter(e=>typeof e[stat.flag]==='boolean'||Array.isArray(e.tags)&&e.tags.includes(stat.key.toUpperCase()));
     if(tagged.length)values[stat.key]=tagged.reduce((n,e)=>n+(e[stat.flag]===true||e.tags?.includes(stat.key.toUpperCase())?points(e):0),0);
    }
   }
   result.push({id,values});
  }
  return result;
 }
 function totalsFor(games){
  const totals=new Map(stats.map(s=>[s.key,new Map()]));
  for(const game of games)for(const {id,values} of gameValues(game))for(const [key,value] of Object.entries(values)){
   const board=totals.get(key),previous=board.get(id)||{id,value:0,games:0};
   previous.value+=value;previous.games++;board.set(id,previous);
  }
  return totals;
 }
 const format=value=>Number.isInteger(value)?String(value):value.toFixed(1);
 let drillWinsMetric='wins';
 function renderDrillWins(){
  const totals=new Map();
  for(const result of state.drillResults||[]){
   if(!['win','loss'].includes(result.result)||!result.playerId)continue;
   if($('otherScope').value==='range'&&!dateInRange(result.date,'other'))continue;
   const row=totals.get(result.playerId)||{id:result.playerId,wins:0,losses:0};
   row[result.result==='win'?'wins':'losses']++;totals.set(row.id,row);
  }
  const score=row=>drillWinsMetric==='pct'?row.wins/(row.wins+row.losses):row.wins;
  const rows=[...totals.values()].sort((a,b)=>score(b)-score(a)||playerName(a.id).localeCompare(playerName(b.id)));
  let lastScore=null,lastRank=0;
  $('otherDrillWins').innerHTML='<div class="drill-wins-heading"><h3 class="lb-feature-title">DRILL WINS</h3><div class="drill-wins-toggle" role="group" aria-label="Rank drill wins by">'+[['wins','Total Wins'],['pct','Win %']].map(([value,label])=>`<button type="button" data-drill-metric="${value}" aria-pressed="${drillWinsMetric===value}">${label}</button>`).join('')+'</div>'+leaderboardToggle('other:drillWins',rows.length,'Drill Wins')+'</div><p class="muted">Ranked by '+(drillWinsMetric==='pct'?'win percentage (wins divided by wins + losses)':'total wins')+'. Ties share a rank. Uses the selected date range. Minimum Games applies only to game stats above.</p>'+(rows.length?table(['Rank','Player','Drill Wins','Drill Losses','Win %'],leaderboardRows('other:drillWins',rows).map((row,i)=>{const value=score(row),rank=value===lastScore?lastRank:i+1;lastScore=value;lastRank=rank;return `<tr class="${rank<=3?'lb-top':''}"><td>${rank}</td><td>${esc(playerName(row.id))}</td><td><strong>${row.wins}</strong></td><td>${row.losses}</td><td>${(100*row.wins/(row.wins+row.losses)).toFixed(1)}%</td></tr>`})):'<p class="muted">No drill results recorded for these dates. Record wins and losses in Enter Practice Data.</p>');

 }
 function render(){
  dateRangeValid('other');
  renderDrillWins();
  const games=state.games.filter(g=>(g.played||g.final||g.events?.length||g.playerStats?.length)&&($('otherScope').value!=='range'||dateInRange(g.date,'other')));
  const totals=totalsFor(games),minimum=Math.max(1,Math.floor(Number($('otherMinGames').value)||1));
  const selected=$('otherStat').value,athletes=new Set();let recordedStats=0;
  $('otherWall').innerHTML=stats.map(stat=>{
   const values=[...totals.get(stat.key).values()],rows=values.filter(r=>r.games>=minimum).sort((a,b)=>b.value-a.value||playerName(a.id).localeCompare(playerName(b.id)));
   if(values.length)recordedStats++;for(const row of rows)athletes.add(row.id);
   let lastValue=null,lastRank=0;
   const body=leaderboardRows('other:'+stat.key,rows).map((row,i)=>{
    const rank=row.value===lastValue?lastRank:i+1;lastValue=row.value;lastRank=rank;
    return `<tr class="${rank<=3?'lb-top':''}"><td>${rank}</td><td>${esc(playerName(row.id))}</td><td>${format(row.value)}</td><td>${row.games}</td></tr>`;
   }).join('');
   return `<article class="lb-panel ${selected===stat.key?'selected':''}" data-stat="${stat.key}"><div class="lb-panel-head"><strong>${stat.label}</strong>${leaderboardToggle('other:'+stat.key,rows.length,stat.label)}</div><div class="lb-panel-meta">${stat.description} · ${rows.length} ranked · ${expandedLeaderboards.has('other:'+stat.key)?'All athletes':'Top 5'}</div>${body?`<div class="scroll"><table><thead><tr><th>#</th><th>Athlete</th><th>Total</th><th title="Games with recorded data for this stat">Games</th></tr></thead><tbody>${body}</tbody></table></div>`:`<p class="lb-note">${values.length?'No athletes meet the minimum games for this stat.':'No data recorded for this stat.'}</p>`}</article>`;
  }).join('');
  const pts=[...totals.get('pts').values()].reduce((n,r)=>n+r.value,0);
  $('otherSummary').innerHTML=[['Games',games.length],['Athletes Ranked',athletes.size],['Stats Recorded',recordedStats],['Recorded Points',format(pts)]].map(([name,value])=>`<div class="card"><small>${name}</small><div class="stat">${value}</div></div>`).join('');
 }
 $('otherDrillWins').addEventListener('click',e=>{const button=e.target.closest('[data-drill-metric]');if(!button)return;drillWinsMetric=button.dataset.drillMetric;renderDrillWins();$('otherDrillWins').querySelector(`[data-drill-metric="${drillWinsMetric}"]`)?.focus()});
 $('otherStat').innerHTML='<option value="">All Stats</option>'+stats.map(s=>`<option value="${s.key}">${s.label}</option>`).join('');
 for(const id of ['otherScope','otherStat','otherMinGames'])$(id).addEventListener('change',render);
 $('otherMinGames').addEventListener('input',render);
 for(const id of ['otherStartDate','otherEndDate'])$(id).addEventListener('change',()=>{$('otherScope').value='range';render()});

 window.renderOtherLeaderboards=render;render();
})();
