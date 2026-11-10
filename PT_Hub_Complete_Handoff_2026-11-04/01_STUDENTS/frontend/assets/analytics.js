
(function(){
'use strict';
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drillsDefault=['Free Throws','Top of Key 3','Wing 3','Slot 3','Corner 3','Midrange Low','Midrange High','Floaters','Finishing / Layups','Contested Shots'];
const data=()=>leaderboardRecords();
const roster=()=>Array.isArray(state.players)?state.players:[];
const nameFor=id=>roster().find(p=>p.id===id)?.name||'Unknown athlete';
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const fmt=(m,a)=>a?(100*m/a).toFixed(1)+'%':'—';
const drillName=x=>x.type==='Custom Drill'?(String(x.drill||'').trim()?'Custom: '+String(x.drill).trim():'Custom Drill'):String(x.type||'Other');
function aggregate(items){let m=0,a=0;for(const x of items){m+=num(x.makes);a+=num(x.attempts)}return{m,a,p:a?100*m/a:0,entries:items.length};}
function playersFor(items){const out=new Map();for(const x of items){if(!out.has(x.playerId))out.set(x.playerId,[]);out.get(x.playerId).push(x)}return [...out.entries()].map(([id,rows])=>({id,name:nameFor(id),...aggregate(rows)}));}
const boardDetail=category=>{
 const scope=document.getElementById('lbScope').value,minimum=Math.max(20,num(document.getElementById('lbMin').value)||20),metric=document.getElementById('lbMetric').value;
 const records=data().filter(x=>(scope!=='range'||dateInRange(x.date,'lb'))&&drillMatches(x,category));
 const ranked=playersFor(records).filter(x=>x.a>0).sort((a,b)=>{const sa=metric==='made'?a.m:metric==='attempts'?a.a:a.p,sb=metric==='made'?b.m:metric==='attempts'?b.a:b.p;return sb-sa||b.a-a.a||a.name.localeCompare(b.name)});
 return {records,all:ranked,qualified:ranked.filter(x=>x.a>=minimum),building:ranked.filter(x=>x.a<minimum),total:aggregate(records),minimum};
};
function leaderboardUpgrade(){if(!document.getElementById('leaderboards'))return;
 syncLeaderboardSource();const all=visibleLeaderboardDrills(data());syncFilterSelect('lbCategory',all);const cat=document.getElementById('lbCategory').value,scope=document.getElementById('lbScope').value;dateRangeValid('lb');const minInput=document.getElementById('lbMin');if(num(minInput.value)<20)minInput.value='20';minInput.min='20';const d=boardDetail(cat);
 document.getElementById('lbSummary').innerHTML=[['Made',d.total.m],['Attempts',d.total.a],['Shooting %',fmt(d.total.m,d.total.a)],['Athletes / Qualified',d.all.length+' / '+d.qualified.length]].map(([label,value])=>'<div class="card"><small>'+safe(label)+'</small><div class="stat">'+safe(value)+'</div></div>').join('');
 document.getElementById('lbWall').innerHTML=all.map(drill=>{
 const x=boardDetail(drill),selected=cat===drill;
 const rows=leaderboardRows('shooting:'+drill,[...x.qualified.map((p,i)=>({p,rank:i+1,qual:true})),...x.building.map(p=>({p,rank:'—',qual:false}))]);
 const content=rows.length?'<div class="scroll"><table><thead><tr><th>#</th><th>Athlete</th><th>Made/Att.</th><th>%</th></tr></thead><tbody>'+rows.map(({p,rank,qual})=>'<tr class="'+(qual&&rank<=3?'lb-top':'')+'"><td>'+rank+'</td><td>'+safe(p.name)+(qual?'':' <span title="Below 20 attempt minimum" class="lb-unqualified">*</span>')+'</td><td>'+p.m+'/'+p.a+'</td><td>'+fmt(p.m,p.a)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="lb-note">No shots recorded in this drill yet.</p>';
 return'<article class="lb-panel '+(selected?'selected':'')+'"><div class="lb-panel-head"><strong>'+safe(drillLabel(drill))+'</strong>'+leaderboardToggle('shooting:'+drill,x.all.length,drillLabel(drill))+'</div><div class="lb-panel-meta">'+x.total.m+'/'+x.total.a+' made · '+fmt(x.total.m,x.total.a)+' · '+x.qualified.length+' ranked · '+x.building.length+' building</div>'+content+(x.building.length?'<p class="lb-note">* Below '+x.minimum+' attempts: shown for progress, not ranked.</p>':'')+'</article>';
 }).join('');
 const champ=document.getElementById('lbChampions');if(champ){const winners=dailyChampionWins(data());champ.innerHTML='<div class="drill-wins-heading"><div class="lb-feature-title">DAILY SHOOTING CHAMPIONS</div>'+leaderboardToggle('shooting:champions',winners.length,'Daily Shooting Champions')+'</div><p class="muted">A daily shooting win requires 20 attempts in a drill that day. Ties share a win.</p>'+(winners.length?table(['Rank','Athlete','Wins'],leaderboardRows('shooting:champions',winners).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+safe(nameFor(x.id))+'</td><td><strong>'+x.count+'</strong></td></tr>')):'<p class="muted">No daily shooting champions have qualified yet.</p>');}
}
renderLeaderboards=leaderboardUpgrade;
// Repaint using all locally stored records without changing them.
leaderboardUpgrade();
})();
