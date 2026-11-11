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
 const situationStats=[
  {key:'drb',label:'Defensive Rebounds',description:'Defensive rebounds'},
  {key:'orb',label:'Offensive Rebounds',description:'Offensive rebounds'},
  {key:'to',label:'Turnovers',description:'Recorded turnovers'}
 ];
 let source='live';
 const totalsFor=games=>window.PTGameStatTotals.totalsFor(games,isTestPlayerId);
 const format=value=>Number.isInteger(value)?String(value):value.toFixed(1);
 function renderSituation(){
  const inRange=date=>$('otherScope').value!=='range'||dateInRange(date,'other');
  const {totals,recorded}=window.PTGameSituationLeaderboardData(state,inRange,isTestPlayerId);
  const players=[...totals.values()],selected=$('otherStat').value,athletes=new Set();
  $('otherWall').innerHTML=situationStats.map(stat=>{
   const rows=players.filter(player=>player[stat.key]>0).sort((a,b)=>b[stat.key]-a[stat.key]||playerName(a.id).localeCompare(playerName(b.id)));
   for(const row of rows)athletes.add(row.id);
   const body=leaderboardRows('situation:'+stat.key,rows).map((row,index)=>`<tr class="${index<3?'lb-top':''}"><td>${index+1}</td><td>${esc(playerName(row.id))}</td><td>${row[stat.key]}</td></tr>`).join('');
   return `<article class="lb-panel ${selected===stat.key?'selected':''}" data-stat="${stat.key}"><div class="lb-panel-head"><strong>${stat.label}</strong>${leaderboardToggle('situation:'+stat.key,rows.length,stat.label)}</div><div class="lb-panel-meta">${stat.description} · ${rows.length} ranked · ${expandedLeaderboards.has('situation:'+stat.key)?'All athletes':'Top 5'}</div>${body?`<div class="scroll"><table><thead><tr><th>#</th><th>Athlete</th><th>Total</th></tr></thead><tbody>${body}</tbody></table></div>`:'<p class="lb-note">No game situation data recorded for this stat.</p>'}</article>`;
  }).join('');
  const total=key=>players.reduce((sum,row)=>sum+row[key],0);
  $('otherSummary').innerHTML=[['Recorded Actions',recorded],['Athletes Ranked',athletes.size],['Defensive Rebounds',total('drb')],['Offensive Rebounds',total('orb')],['Turnovers',total('to')]].map(([name,value])=>`<div class="card"><small>${name}</small><div class="stat">${value}</div></div>`).join('');
 }
 let drillWinsMetric='wins';
 function renderDrillWins(){
  const totals=new Map();
  for(const result of state.drillResults||[]){
   if(!['win','loss'].includes(result.result)||!result.playerId||isTestPlayerId(result.playerId))continue;
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
  const situationMode=source==='situation';
  $('otherLiveSource').setAttribute('aria-pressed',String(!situationMode));
  $('otherSituationSource').setAttribute('aria-pressed',String(situationMode));
  $('otherMinGamesField').hidden=situationMode;
  $('otherHudlNote').hidden=situationMode;
  $('otherDrillWins').hidden=situationMode;
  $('otherLeaderboardHeading').textContent=situationMode?'Game Situation Leaderboards':'All Game Stat Leaderboards';
  if(situationMode){renderSituation();return}
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
 function setStatOptions(){const selected=$('otherStat').value,options=source==='situation'?situationStats:stats;$('otherStat').innerHTML='<option value="">All Stats</option>'+options.map(s=>`<option value="${s.key}">${s.label}</option>`).join('');$('otherStat').value=options.some(stat=>stat.key===selected)?selected:''}
 $('otherLiveSource').addEventListener('click',()=>{if(source==='live')return;source='live';setStatOptions();render()});
 $('otherSituationSource').addEventListener('click',()=>{if(source==='situation')return;source='situation';setStatOptions();render()});
 setStatOptions();
 for(const id of ['otherScope','otherStat','otherMinGames'])$(id).addEventListener('change',render);
 $('otherMinGames').addEventListener('input',render);
 for(const id of ['otherStartDate','otherEndDate'])$(id).addEventListener('change',()=>{$('otherScope').value='range';render()});

 window.renderOtherLeaderboards=render;render();
})();
