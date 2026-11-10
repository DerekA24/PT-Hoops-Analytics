(()=>{
 'use strict';
 const $=id=>document.getElementById(id),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const value=n=>n===null||n===undefined?'--':escape(n);
 const ratio=p=>p?`${p.made}/${p.attempts}${p.attempts?' ('+(100*p.made/p.attempts).toFixed(1)+'%)':''}`:'--';
 const shortPair=p=>p?`${p.made}/${p.attempts}`:'--';
 let report,worker,timer;
 $('reportPrint').onclick=()=>window.print();
 function box(team,title,opponent=false){
  const rows=team.players.map(p=>`<tr><td>${escape(p.number)}</td><td>${escape(p.name)}</td><td>${value(p.pts)}</td><td>${value(p.reb)}</td><td>${value(p.ast)}</td><td>${value(p.stl)}</td><td>${value(p.fouls)}</td><td>${shortPair(p.fg)}</td><td>${shortPair(p.three)}</td></tr>`).join('');
  return `<div class="report-box"><h2 class="report-section-title ${opponent?'opponent':''}">${escape(title)} - Player Box Score</h2><table class="report-table box-score"><thead><tr>${['#','Player','Pts','Reb','Ast','Stl','Fouls','FG','3PT'].map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="9">No player participation recorded.</td></tr>'}</tbody><tfoot><tr><td colspan="2">TOTAL</td><td>${value(team.totals.pts)}</td><td>${value(team.totals.reb)}</td><td>${value(team.totals.ast)}</td><td>${value(team.totals.stl)}</td><td>${value(team.totals.fouls)}</td><td>${shortPair(team.totals.fg)}</td><td>${shortPair(team.totals.three)}</td></tr></tfoot></table></div>`;
 }
 function court(team,title,opponent=false){
  const dots=team.shots.map(e=>e.type.endsWith('_M')?`<circle cx="${Number(e.x)}" cy="${Number(e.y)}" r="5" fill="#248c35" stroke="#fff" stroke-width="1"/>`:`<path d="M${Number(e.x)-5} ${Number(e.y)-5}l10 10m0-10l-10 10" stroke="#d1182c" stroke-width="2.5"/>`).join('');
  const svg=`<svg class="report-court" viewBox="0 0 500 470" role="img" aria-label="${escape(title)} recorded field goal locations"><rect x="12" y="12" width="476" height="446" fill="#fff" stroke="#242b30" stroke-width="2"/><g class="line"><rect x="174" y="12" width="152" height="190"/><rect x="210" y="12" width="80" height="74"/><circle cx="250" cy="74" r="11"/><path d="M222 60H278 M174 202A76 76 0 0 1 326 202 M174 202A76 76 0 0 0 326 202 M12 184A238 238 0 0 0 488 184"/></g>${dots}</svg>`;
  const rows=team.zones.map(z=>`<tr><td>${z.label}</td><td>${z.made}/${z.attempts}</td><td>${z.attempts?(100*z.made/z.attempts).toFixed(1)+'%':'--'}</td><td>${z.threeAttempts||'--'}</td></tr>`).join('');
  return `<div class="report-box"><h2 class="report-section-title ${opponent?'opponent':''}">${escape(title)} - Shot Chart</h2>${svg}<table class="report-table"><thead><tr><th>Zone</th><th>FG</th><th>FG%</th><th>3PA</th></tr></thead><tbody>${rows}</tbody></table><p class="report-chart-note">${team.shots.length} located field-goal attempts.${team.unlocated?' '+team.unlocated+' attempts have no saved location.':''}${!team.shots.length?' No located field goals recorded for this team.':''} Free throws are excluded from the court plot.</p></div>`;
 }
 function showInsights(ids,source){
  const chosen=ids.map(id=>report.facts.find(f=>f.id===id)).filter(Boolean);
  for(const fact of report.facts)if(chosen.length<3&&!chosen.includes(fact))chosen.push(fact);
  $('reportInsights').innerHTML=chosen.length?chosen.slice(0,3).map(f=>`<article><h3>${escape(f.title)}</h3><p>${escape(f.text)}</p></article>`).join(''):'<article><h3>More data needed</h3><p>Record game events to generate statistical insights.</p></article>';
  $('reportInsightSource').textContent=source;
 }
 function unavailable(){clearTimeout(timer);worker?.terminate();worker=null;$('reportStatus').textContent='The insights model could not finish. Verified stat-based insights are shown; the report can still be printed.';$('reportRetry').hidden=false;showInsights([],'Stat-based summary - model unavailable')}
 function generateInsights(){
  if(report.facts.length<3){$('reportStatus').textContent='Report ready. More recorded statistics are needed for model-prioritized insights.';return}
  worker?.terminate();$('reportRetry').hidden=true;
  $('reportStatus').textContent='Preparing quick insights. First use downloads a small open-weight model; game data stays on this device.';
  showInsights([],'Verified statistics - model loading');
  try{
   worker=new Worker(new URL('report-insights-worker.js?v=1',document.currentScript?.src||new URL('assets/game-report.js',location.href)),{type:'module'});
   timer=setTimeout(unavailable,180000);
   worker.onmessage=({data})=>{
    if(data.type==='status')$('reportStatus').textContent=data.text;
    if(data.type==='result'){
     clearTimeout(timer);showInsights(data.ids,'AI-prioritized with SmolLM2-135M (open weights)');$('reportStatus').textContent='Report ready. Quick insights were prioritized on this device from verified statistics.';
     worker.terminate();worker=null;
    }
    if(data.type==='error')unavailable();
   };
   worker.onerror=unavailable;
   worker.postMessage({facts:report.facts});
  }catch{unavailable()}
 }
 $('reportRetry').onclick=generateInsights;
 try{
  const id=new URLSearchParams(location.search).get('report');if(!id||!/^[\w-]{1,100}$/.test(id))throw Error('No game report was selected.');
  const snapshot=JSON.parse(localStorage.getItem('pt-game-report-'+id)||'null');if(!snapshot?.game||!Array.isArray(snapshot.players))throw Error('This report is no longer available on this browser. Generate it again from Live Game.');
  report=PTGameReport.build(snapshot.game,snapshot.players);
  const homeName=report.homeName;
  document.title=`${homeName} vs ${report.opponentName} - ${report.date||'Game Report'}`;
  const labels=[['FG','fg'],['3PT','three'],['FT','ft'],['Rebounds','reb'],['Off. Rebounds','orb'],['Def. Rebounds','drb'],['Assists','ast'],['Turnovers','to'],['Steals','stl'],['Blocks','blk'],['Fouls','fouls'],['Points in Paint','pitp'],['Second-Chance Points','second'],['Fast-Break Points','fbp']];
  const teamRows=labels.map(([label,key])=>`<tr><td>${label}</td><td>${['fg','three','ft'].includes(key)?ratio(report.pt.totals[key]):value(report.pt.totals[key])}</td><td>${['fg','three','ft'].includes(key)?ratio(report.opponent.totals[key]):value(report.opponent.totals[key])}</td></tr>`).join('');
  const banner=`<div class="report-score"><h1>${escape(homeName)}</h1><strong>${value(report.ptScore)} - ${value(report.opponentScore)}</strong><h2>${escape(report.opponentName)}</h2></div>`;
  const footer=page=>`<footer class="report-page-footer"><span>Park Tudor Basketball | ${escape(report.date||'Date not set')}</span><span>${page} / 2</span></footer>`;
  $('reportRoot').innerHTML=`<section class="report-sheet">${banner}<p class="report-meta">${escape(report.date||'Game date not set')} | Recorded game snapshot | Generated ${escape(new Date(snapshot.createdAt||report.createdAt).toLocaleString())}</p><div class="report-top-grid"><div class="report-box"><h2 class="report-section-title">Team Stats</h2><table class="report-table team-stats"><thead><tr><th></th><th>${homeName==='Park Tudor'?'PT':escape(homeName)}</th><th>${report.opponentName==='White'?'White':'OPP'}</th></tr></thead><tbody>${teamRows}</tbody></table></div><div>${box(report.pt,homeName)}${box(report.opponent,report.opponentName,true)}</div></div><p class="report-data-note">Includes the selected game's recorded events and any imported player totals. Live events entered after an import supplement those totals. Missing statistics are shown as --. Second-chance points require an explicit tag and are not inferred from rebound timing.</p><div class="report-insights"><div class="report-insights-heading"><h2>QUICK INSIGHTS</h2><small id="reportInsightSource"></small></div><div id="reportInsights" class="report-insight-grid"></div></div><p class="report-footnote">Insights select from calculated facts; they do not invent possessions, scoring sequences, or missing statistics. The report is a snapshot; regenerate it after entering additional data.</p>${footer(1)}</section><section class="report-sheet charts"><div class="report-chart-grid">${court(report.pt,homeName)}${court(report.opponent,report.opponentName,true)}</div><div class="shot-key"><span class="made">&#9679; Made</span><span class="missed">&#215; Missed</span></div><p class="report-data-note">Shot charts use saved field-goal locations from live events. Imported box scores do not supply locations. Zone totals describe only the plotted attempts, so they can differ from complete game shooting totals.</p>${footer(2)}</section>`;
  showInsights([],'Verified stat-based summary');generateInsights();
 }catch(error){$('reportRoot').innerHTML=`<div class="report-error"><h1>Game report unavailable</h1><p>${escape(error.message)}</p><a href="live-game.html">Return to Live Game</a></div>`;$('reportStatus').textContent='Generate a new report from Live Game.';$('reportPrint').disabled=true}
 window.addEventListener('pagehide',()=>{clearTimeout(timer);worker?.terminate()});
})();
