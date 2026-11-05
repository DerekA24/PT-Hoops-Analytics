// Profile charts use the existing backup schema; untagged located shots are practice shots.
let profileSource='practice',profileAllDates=true;
const profileZones=[
 {id:'rim',name:'Finishing',x:250,y:116,path:'M174 12H326V146H174Z'},
 {id:'floaters',name:'Floaters',x:250,y:167,path:'M174 146H326V186H174Z'},
 {id:'free',name:'Free Throws',x:250,y:215,path:'M174 186H326V240H174Z'},
 {id:'midLow',name:'Midrange Low',x:110,y:110,path:'M45 12H174V202H52L45 184Z M326 12H455V184L448 202H326Z'},
 {id:'midHigh',name:'Midrange High',x:250,y:300,path:'M52 202H174V240H326V202H448L410 300L326 352H174L90 300Z'},
 {id:'corner',name:'Corner 3',x:28,y:100,rotate:true,path:'M12 12H45V184H12Z M455 12H488V184H455Z'},
 {id:'wing',name:'Wing 3',x:57,y:256,path:'M12 184H45L90 300L62 345L12 280Z M455 184H488V280L438 345L410 300Z'},
 {id:'slot',name:'Slot 3',x:119,y:390,path:'M12 280L62 345L90 300L174 352V458H12Z M326 352L410 300L438 345L488 280V458H326Z'},
 {id:'top',name:'Top of Key 3',x:250,y:394,path:'M174 352H326V458H174Z'}
];
function profileShotSource(shot){return shot.shotContext==='game'||shot.context==='game'||shot.source==='game'||shot.gameId?'game':'practice'}
function profileLocation(shot){return shot.x!==null&&shot.y!==null&&shot.x!==''&&shot.y!==''&&Number.isFinite(Number(shot.x))&&Number.isFinite(Number(shot.y))&&Number(shot.x)>=12&&Number(shot.x)<=488&&Number(shot.y)>=12&&Number(shot.y)<=458}
function profileZone(shot){
 const name=String(shot.category||shot.type||shot.drill||'').toLowerCase();
 if(/free throw|^ft_[mx]$/.test(name))return 'free';
 if(profileLocation(shot)){
  const x=Number(shot.x),y=Number(shot.y),dx=Math.abs(x-250);
  if(dx<76&&y<146)return 'rim';
  if(dx<76&&y<186)return 'floaters';
  if((x<45||x>455)&&y<184)return 'corner';
  if(Math.hypot(x-250,Math.max(0,y-184))<210)return y<202?'midLow':'midHigh';
  return y<300?'wing':dx>76?'slot':'top';
 }
 if(/top of key/.test(name))return 'top';
 if(/corner/.test(name))return 'corner';
 if(/wing/.test(name))return 'wing';
 if(/slot/.test(name))return 'slot';
 if(/midrange|mid.range/.test(name)){
  const detail=name+' '+String(shot.drill||'').toLowerCase();
  if(/\blow\b/.test(detail))return 'midLow';
  if(/\bhigh\b/.test(detail))return 'midHigh';
  return null;
 }
 if(/floater/.test(name))return 'floaters';
 if(/finish|layup|lay.up|at rim/.test(name))return 'rim';
 return null;
}
function profileIsTeam(){return document.body.dataset.profileScope==='team'}
function profileCategory(shot){const name=shot.category||(shot.type==='Custom Drill'&&shot.drill?'Custom: '+shot.drill:shot.type)||profileZones.find(z=>z.id===shot.zone)?.name||'Located shots';return name==='Midrange'?'Midrange (Unspecified)':name}
function profileRecords({allDates=profileAllDates}={}){
 const player=profileIsTeam()?null:$('profilePlayer').value,records=[];
 const dateMatches=date=>allDates||dateInRange(date,'court');
 const add=(shot,kind,date)=>{
  if((player!==null&&shot.playerId!==player)||!dateMatches(date))return;
  const attempts=kind==='set'?Number(shot.attempts):1;
  const makes=kind==='set'?Number(shot.makes):Number(shot.made);
  if(!Number.isFinite(attempts)||!Number.isFinite(makes)||attempts<=0||makes<0||makes>attempts)return;
  records.push({...shot,date,makes,attempts,kind,zone:profileZone(shot)});
 };
 const shooting=state.shooting.filter(s=>profileShotSource(s)===profileSource);
 for(const shot of shooting)add(shot,'set',shot.date);
 const linked=new Set(shooting.map(s=>s.id));
 for(const shot of state.court){if(profileShotSource(shot)!==profileSource||shot.shotId&&linked.has(shot.shotId))continue;add(shot,'court',shot.date)}
 if(profileSource==='game')for(const game of state.games){
  const boxScores=Array.isArray(game.playerStats)?game.playerStats:[],covered=new Set(),didNotPlay=new Set();
  const pairs=[['twoMade','twoAttempts','TWO','Game 2PT'],['threeMade','threeAttempts','THREE','Game 3PT'],['ftMade','ftAttempts','FT','Free Throws']];
  for(const row of boxScores){
   if(row.played===false){didNotPlay.add(row.playerId);continue}
   if(Number.isInteger(row.fgMade)&&Number.isInteger(row.fgAttempts)&&row.fgMade>=0&&row.fgAttempts>=row.fgMade&&row.twoMade===undefined&&row.threeMade===undefined){
    covered.add(row.playerId+'|TWO');covered.add(row.playerId+'|THREE');
    if(row.fgAttempts)add({id:`box-${game.id}-${row.playerId}-FG`,playerId:row.playerId,type:'FG',category:'Game Field Goals',makes:row.fgMade,attempts:row.fgAttempts},'set',game.date);
   }
   for(const [made,attempts,type,category] of pairs){
    if(!Number.isInteger(row[made])||!Number.isInteger(row[attempts])||row[made]<0||row[attempts]<row[made])continue;
    covered.add(row.playerId+'|'+type);
    if(row[attempts])add({id:`box-${game.id}-${row.playerId}-${type}`,playerId:row.playerId,type,category,makes:row[made],attempts:row[attempts]},'set',game.date);
   }
  }
  for(const event of game.events||[]){
   if(event.team==='opponent')continue;
   if(!/^(TWO|THREE|FT)_[MX]$/.test(event.type))continue;
   if((didNotPlay.has(event.playerId)||covered.has(event.playerId+'|'+event.type.split('_')[0]))&&!isNewLiveEvent(game,event))continue;
   if(event.shotId&&linked.has(event.shotId))continue;
   add({...event,made:event.type.endsWith('_M'),category:event.type.startsWith('THREE')?'Game 3PT':event.type.startsWith('FT')?'Free Throws':'Game 2PT'},'game',game.date);
  }
 }
 return records;
}
function profileColor(makes,attempts){return attempts?`hsl(${Math.round(215-215*makes/attempts)} 72% 40%)`:'#25313d'}
function renderProfile(){
 if(!document.getElementById('profiles'))return;
 dateRangeValid('court');
 const team=profileIsTeam(),player=team?null:state.players.find(p=>p.id===$('profilePlayer').value),label=profileSource==='game'?'Game':'Practice';
 $('profileIdentity').textContent=team?'Entire team · All athletes':player?`#${player.number} ${player.name}${player.position?' · '+player.position:''}`:'Choose a player to see their results.';
 $('profileChartTitle').textContent=label+' Shot Heat Chart';
 for(const source of ['practice','game'])for(const id of [source+'Shots','trend'+(source==='practice'?'Practice':'Game')+'Shots']){const button=$(id);if(button){button.classList.toggle('active',source===profileSource);button.setAttribute('aria-pressed',String(source===profileSource))}}
 $('allDates').classList.toggle('active',profileAllDates);$('oneDate').classList.toggle('active',!profileAllDates);
 const records=team||player?profileRecords():[],zones=new Map(profileZones.map(z=>[z.id,{m:0,a:0}]));
 let makes=0,attempts=0,mapped=0;
 const categories=new Map(),months=new Map();
 for(const shot of records){
  makes+=shot.makes;attempts+=shot.attempts;
  if(shot.zone){const z=zones.get(shot.zone);z.m+=shot.makes;z.a+=shot.attempts;mapped+=shot.attempts}
  const category=profileCategory(shot),c=categories.get(category)||{m:0,a:0};c.m+=shot.makes;c.a+=shot.attempts;categories.set(category,c);
  const month=String(shot.date||'').slice(0,7)||'Undated',m=months.get(month)||{m:0,a:0};m.m+=shot.makes;m.a+=shot.attempts;months.set(month,m);
 }
 $('heatZones').innerHTML=profileZones.map(z=>{const s=zones.get(z.id);return `<path data-zone="${z.id}" d="${z.path}" fill="${profileColor(s.m,s.a)}" stroke="#101820" stroke-width="2"><title>${esc(z.name)}: ${s.a?s.m+'/'+s.a+' · '+pct(s.m,s.a):'No shots'}</title></path>`}).join('');
 $('heatLabels').innerHTML=profileZones.map(z=>{const s=zones.get(z.id),transform=z.rotate?` transform="rotate(-90 ${z.x} ${z.y})"`:'';return `<text x="${z.x}" y="${z.y-9}" text-anchor="middle"${transform}><tspan x="${z.x}">${esc(z.name)}</tspan><tspan x="${z.x}" dy="16" class="heat-zone-value">${s.a?pct(s.m,s.a):'No shots'}</tspan>${s.a?`<tspan x="${z.x}" dy="14">${s.m}/${s.a}</tspan>`:''}</text>`}).join('');
 $('markers').innerHTML=records.filter(profileLocation).map(s=>`<circle cx="${Number(s.x)}" cy="${Number(s.y)}" r="3" fill="${s.makes?'#fff':'#101820'}" stroke="#fff" stroke-width="1"/>`).join('');
 $('courtMode').textContent=`${label} · ${profileAllDates?'Full season':dateRangeLabel('court')} · ${mapped} of ${attempts} attempts mapped${attempts>mapped?' · '+(attempts-mapped)+' without a court zone':''}${attempts?'':'. No shots recorded for this selection.'}`;
 $('profileSummary').innerHTML=`<div class="profile-compact-stats"><span><small>Made</small><strong>${makes}</strong></span><span><small>Attempts</small><strong>${attempts}</strong></span><span><small>Shooting</small><strong>${pct(makes,attempts)}</strong></span></div>`;
 $('profileCategories').innerHTML=categories.size?table(['Category','Made / Att.','%'],[...categories].map(([name,s])=>`<tr><td>${esc(name)}</td><td>${s.m}/${s.a}</td><td>${pct(s.m,s.a)}</td></tr>`)):'<p class="muted">No shot data for this selection.</p>';
 $('monthTrend').innerHTML=[...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,s])=>`<p>${esc(month)} · ${s.m}/${s.a} · ${pct(s.m,s.a)}</p>`).join('')||'<p class="muted">No monthly data.</p>';
 const located=records.filter(s=>s.kind==='court');
 $('courtHistory').innerHTML=located.length?table(['Date','Result','Zone','Manage'],located.slice().reverse().map(s=>`<tr><td>${esc(s.date)}</td><td>${s.makes?'Made':'Missed'}</td><td>${esc(profileZones.find(z=>z.id===s.zone)?.name||'Unknown')}</td><td><button data-flip="${esc(s.id)}">Flip</button> <button data-delete-court="${esc(s.id)}">Delete</button></td></tr>`)):'<p class="muted">No located shots in this selection.</p>';
 if($('teamTrendChart'))renderShootingTrend();
}
function renderShootingTrend(){
 const records=profileRecords(),select=$('trendShotType'),previous=select.value;
 const categories=[...new Set(profileRecords({allDates:true}).map(profileCategory))].sort((a,b)=>a.localeCompare(b));
 select.innerHTML='<option value="">All Shots</option>'+categories.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
 select.value=categories.includes(previous)?previous:'';
 const metric=$('trendMetric').value,metricLabel=metric==='percentage'?'Shooting Percentage':metric==='makes'?'Makes':'Attempts';
 const grouped=new Map();let undated=0;
 for(const shot of records){
  if(select.value&&profileCategory(shot)!==select.value)continue;
  const date=String(shot.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))){undated+=shot.attempts;continue}
  const row=grouped.get(date)||{date,m:0,a:0};row.m+=shot.makes;row.a+=shot.attempts;grouped.set(date,row);
 }
 const days=[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const source=profileSource==='game'?'Game':'Practice',scope=select.value||'All shots',owner=profileIsTeam()?'Team':state.players.find(p=>p.id===$('profilePlayer').value)?.name||'Player';
 if(!days.length){$('teamTrendChart').innerHTML='<p class="trend-empty">No dated shots match this selection.</p>';$('teamTrendSummary').textContent=`${owner} · ${source} · ${scope} · ${profileAllDates?'Full season':dateRangeLabel('court')}${undated?' · '+undated+' undated attempts excluded':''}`;$('teamTrendTable').innerHTML='';return}
 const value=d=>metric==='percentage'?100*d.m/d.a:metric==='makes'?d.m:d.a;
 const W=Math.max(320,Math.min(900,$('teamTrendChart').clientWidth||900)),H=290,L=58,R=24,T=24,B=44;
 const maximum=metric==='percentage'?100:Math.max(4,Math.ceil(Math.max(...days.map(value))/4)*4);
 const first=Date.parse(days[0].date+'T00:00:00Z'),last=Date.parse(days.at(-1).date+'T00:00:00Z');
 const x=d=>L+(last===first?(W-L-R)/2:(Date.parse(d.date+'T00:00:00Z')-first)/(last-first)*(W-L-R));
 const y=v=>H-B-v/maximum*(H-T-B);
 const format=v=>metric==='percentage'?v.toFixed(1)+'%':String(v);
 const grid=Array.from({length:5},(_,i)=>{const v=maximum*i/4;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#3d4651" stroke-dasharray="3 5"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end">${v}${metric==='percentage'?'%':''}</text>`}).join('');
 const labelCount=W<600?3:6;
 const labels=days.filter((_,i)=>days.length<=labelCount||i===0||i===days.length-1||i%Math.ceil(days.length/labelCount)===0).map(d=>`<text x="${x(d)}" y="${H-15}" text-anchor="middle">${d.date.slice(5)}</text>`).join('');
 const points=days.map(d=>`${x(d)},${y(value(d))}`).join(' ');
 const area=`M${x(days[0])} ${H-B} L${days.map(d=>`${x(d)} ${y(value(d))}`).join(' L')} L${x(days.at(-1))} ${H-B}Z`;
 const dots=days.map(d=>`<circle cx="${x(d)}" cy="${y(value(d))}" r="5" fill="#ff8d7e" stroke="#fff" stroke-width="1.5" tabindex="0" aria-label="${d.date}: ${format(value(d))}; ${d.m} made of ${d.a}"><title>${d.date}: ${format(value(d))} · ${d.m}/${d.a}</title></circle>`).join('');
 $('teamTrendChart').innerHTML=`<svg class="team-trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="trendTitle trendDescription"><title id="trendTitle">${esc(owner)} ${esc(metricLabel)} Over Time</title><desc id="trendDescription">${esc(owner+' · '+source+' · '+scope)}. Daily totals from ${days[0].date} to ${days.at(-1).date}. Percentages use combined makes divided by attempts.</desc>${grid}<path d="${area}" fill="#c63527" opacity=".15"/><polyline points="${points}" fill="none" stroke="#f37c6d" stroke-width="3" stroke-linejoin="round"/>${dots}${labels}</svg>`;
 const totals=days.reduce((t,d)=>({m:t.m+d.m,a:t.a+d.a}),{m:0,a:0});
 $('teamTrendSummary').textContent=`${owner} · ${source} · ${scope} · ${days[0].date} to ${days.at(-1).date} · ${totals.m}/${totals.a} made · ${pct(totals.m,totals.a)}${undated?' · '+undated+' undated attempts excluded':''}`;
 $('teamTrendTable').innerHTML=table(['Date','Attempts','Makes','Percentage'],days.map(d=>`<tr><td>${d.date}</td><td>${d.a}</td><td>${d.m}</td><td>${pct(d.m,d.a)}</td></tr>`));
}
if(document.getElementById('profiles')){
 const el=id=>document.getElementById(id);
 if(el('profilePlayer'))el('profilePlayer').onchange=renderProfile;
 if(el('trendShotType')){el('trendShotType').onchange=renderShootingTrend;el('trendMetric').onchange=renderShootingTrend}
 if(el('teamTrendChart')){let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderShootingTrend,100)})}
 for(const source of ['practice','game'])for(const id of [source+'Shots','trend'+(source==='practice'?'Practice':'Game')+'Shots']){const button=el(id);if(button)button.onclick=()=>{profileSource=source;renderProfile()}}
 el('allDates').onclick=()=>{profileAllDates=true;renderProfile()};
 el('oneDate').onclick=()=>{profileAllDates=false;renderProfile()};
 for(const id of ['courtStartDate','courtEndDate'])el(id).onchange=()=>{profileAllDates=false;renderProfile()};
 el('courtHistory').onclick=e=>{const flip=e.target.closest('[data-flip]'),remove=e.target.closest('[data-delete-court]');if(flip){const shot=state.court.find(s=>s.id===flip.dataset.flip);if(shot){shot.made=!shot.made;save()}}if(remove&&confirm('Delete this located shot?')){state.court=state.court.filter(s=>s.id!==remove.dataset.deleteCourt);save()}};
}
