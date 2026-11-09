/* Report calculations are independent of the page and never change saved games. */
((root)=>{
 'use strict';
 const fieldShots=new Set(['TWO_M','TWO_X','THREE_M','THREE_X']);
 const scoring={TWO_M:2,THREE_M:3,FT_M:1};
 const eventFields={orb:['OREB','ORB'],drb:['DREB','DRB'],ast:['AST'],to:['TO'],stl:['STL'],blk:['BLK'],fouls:['FOUL','PF']};
 const aliases={pts:['pts','points'],orb:['orb','oreb'],drb:['drb','dreb'],ast:['ast','assists'],to:['to','turnovers'],stl:['stl','steals'],blk:['blk','blocks'],fouls:['personalFouls','pf','fouls'],pitp:['pitp','pointsInThePaint'],fbp:['fbp','fastBreakPoints'],second:['secondChancePoints']};
 const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
 const read=(row,keys)=>{for(const key of keys){const value=number(row?.[key]);if(value!==null)return value}return null};
 const sum=values=>values.some(v=>v!==null)?values.reduce((n,v)=>n+(v??0),0):null;
 const pair=(made,attempts)=>made===null||attempts===null?null:{made,attempts};
 const sumPairs=rows=>{const known=rows.filter(Boolean);return known.length?{made:known.reduce((n,r)=>n+r.made,0),attempts:known.reduce((n,r)=>n+r.attempts,0)}:null};
 const pct=p=>p&&p.attempts?100*p.made/p.attempts:null;
 function basePair(row,kind){
  if(kind==='three')return pair(read(row,['threeMade']),read(row,['threeAttempts']));
  if(kind==='ft')return pair(read(row,['ftMade']),read(row,['ftAttempts']));
  const fg=pair(read(row,['fgMade']),read(row,['fgAttempts']));if(fg)return fg;
  const two=pair(read(row,['twoMade']),read(row,['twoAttempts'])),three=basePair(row,'three');
  return two&&three?{made:two.made+three.made,attempts:two.attempts+three.attempts}:null;
 }
 const eventPair=(events,kind)=>{const list=events.filter(e=>kind==='fg'?fieldShots.has(e.type):kind==='three'?/^THREE_[MX]$/.test(e.type):/^FT_[MX]$/.test(e.type));return {made:list.filter(e=>e.type.endsWith('_M')).length,attempts:list.length}};
 const newer=(game,event)=>event.source==='live-game'&&Number.isFinite(Date.parse(event.recordedAt))&&Date.parse(event.recordedAt)>Date.parse(game.statsImport?.importedAt||'1970-01-01T00:00:00Z');
 function eventValue(events,key){
  if(eventFields[key])return events.filter(e=>eventFields[key].includes(e.type)).length;
  if(key==='pts')return events.reduce((n,e)=>n+(scoring[e.type]||0),0);
  const flag={pitp:'inPaint',fbp:'fastBreak',second:'secondChance'}[key];
  if(flag)return events.reduce((n,e)=>n+(e[flag]===true?(scoring[e.type]||0):0),0);
  return 0;
 }
 const located=e=>e.x!==null&&e.y!==null&&e.x!==''&&e.y!==''&&Number.isFinite(Number(e.x))&&Number.isFinite(Number(e.y))&&e.x>=12&&e.x<=488&&e.y>=12&&e.y<=458;
 function zoneOf(e){
  if(e.type.startsWith('THREE'))return e.x<174?'left3':e.x>326?'right3':'top3';
  const dx=Math.abs(e.x-250);
  if(dx<76&&e.y<146)return 'rim';
  return dx<76&&e.y<=202?'paint':'mid';
 }
 function teamData(game,roster,team){
  const events=(game.events||[]).filter(e=>(e.team==='opponent'?'opponent':'pt')===team);
  const imported=team==='pt'?(game.playerStats||[]):(game.opponentPlayerStats||[]);
  const ids=new Set([...imported.map(p=>p.playerId),...events.map(e=>e.playerId),...(game.liveLineups?.[team]||[])]);
  const hasLive=(game.events||[]).length>0;
  const players=[];
  for(const id of ids){
   if(!id)continue;const row=imported.find(r=>r.playerId===id),own=events.filter(e=>e.playerId===id),recent=own.filter(e=>newer(game,e));
   if(row?.played===false&&!recent.length)continue;
   const who=roster.find(p=>p.id===id),values={};
   for(const [key,keys] of Object.entries(aliases)){
    const baseline=read(row,keys);
    const tagged=key==='second'?own.some(e=>typeof e.secondChance==='boolean'):true;
    values[key]=baseline!==null?baseline+eventValue(recent,key):hasLive&&tagged?eventValue(own,key):null;
   }
   for(const kind of ['fg','three','ft']){
    const baseline=basePair(row,kind),delta=eventPair(baseline?recent:own,kind);
    values[kind]=baseline?{made:baseline.made+delta.made,attempts:baseline.attempts+delta.attempts}:hasLive?delta:null;
   }
   // Imported shooting can supply points when a PTS column was not provided.
   if(read(row,aliases.pts)===null&&basePair(row,'fg')&&basePair(row,'three')&&basePair(row,'ft')){
    const fg=basePair(row,'fg'),three=basePair(row,'three'),ft=basePair(row,'ft');
    values.pts=2*fg.made+three.made+ft.made+eventValue(recent,'pts');
   }
   values.reb=sum([values.orb,values.drb]);
   players.push({id,name:who?.name||own.find(e=>e.playerName)?.playerName||row?.name||'Unknown player',number:who?.number??row?.number??'',...values});
  }
  players.sort((a,b)=>(number(a.number)??999)-(number(b.number)??999)||a.name.localeCompare(b.name));
  const totals={};for(const key of [...Object.keys(aliases),'reb'])totals[key]=sum(players.map(p=>p[key]));
  for(const key of ['fg','three','ft'])totals[key]=sumPairs(players.map(p=>p[key]));
  const shots=events.filter(e=>fieldShots.has(e.type)&&located(e));
  const zones=[['rim','Rim'],['paint','Paint (Non-Rim)'],['mid','Midrange'],['left3','Left 3'],['top3','Top 3'],['right3','Right 3']].map(([id,label])=>{
   const list=shots.filter(e=>zoneOf(e)===id);return {id,label,made:list.filter(e=>e.type.endsWith('_M')).length,attempts:list.length,threeAttempts:list.filter(e=>e.type.startsWith('THREE')).length};
  });
  return {players,totals,shots,zones,eventCount:events.length,unlocated:events.filter(e=>fieldShots.has(e.type)&&!located(e)).length};
 }
 function insights(report){
  const a=report.pt.totals,b=report.opponent.totals,facts=[];
  const add=(title,text,priority)=>facts.push({id:'I'+(facts.length+1),title,text,priority});
  if(a.to!==null&&b.to!==null)add('Ball security',`Park Tudor recorded ${a.to} turnovers; the opponent recorded ${b.to}.`,Math.abs(a.to-b.to)+4);
  if(a.reb!==null&&b.reb!==null)add('Rebounding',`Park Tudor recorded ${a.reb} rebounds versus ${b.reb} for the opponent. Offensive rebounds: ${a.orb??'unavailable'} versus ${b.orb??'unavailable'}.`,Math.abs(a.reb-b.reb)+3);
  if(a.pitp!==null&&b.pitp!==null)add('Inside scoring',`Recorded points in the paint: Park Tudor ${a.pitp}, opponent ${b.pitp}.`,Math.abs(a.pitp-b.pitp)+2);
  if(pct(a.fg)!==null&&pct(b.fg)!==null)add('Shooting efficiency',`Park Tudor shot ${a.fg.made}/${a.fg.attempts} (${pct(a.fg).toFixed(1)}%) from the field; the opponent shot ${b.fg.made}/${b.fg.attempts} (${pct(b.fg).toFixed(1)}%).`,Math.abs(pct(a.fg)-pct(b.fg))/2+3);
  if(a.three?.attempts)add('Three-point shooting',`Park Tudor made ${a.three.made} of ${a.three.attempts} threes (${pct(a.three).toFixed(1)}%).`,3);
  if(a.ft?.attempts)add('Free throws',`Park Tudor made ${a.ft.made}/${a.ft.attempts} free throws, leaving ${a.ft.attempts-a.ft.made} points at the line.`,a.ft.attempts-a.ft.made+2);
  if(a.fbp!==null&&b.fbp!==null)add('Transition scoring',`Recorded fast-break points: Park Tudor ${a.fbp}, opponent ${b.fbp}.`,Math.abs(a.fbp-b.fbp)/2+1);
  const leader=report.pt.players.filter(p=>p.pts!==null).sort((x,y)=>y.pts-x.pts)[0];
  if(leader?.pts)add('Leading scorer',`${leader.name} led Park Tudor's recorded scoring with ${leader.pts} points.`,2);
  return facts.sort((x,y)=>y.priority-x.priority);
 }
 function build(game,players){
  const report={date:game.date||'',opponentName:game.opponent||'Opponent',createdAt:new Date().toISOString(),pt:teamData(game,players,'pt'),opponent:teamData(game,game.opponentPlayers||[],'opponent')};
  report.ptScore=number(game.teamScore)??report.pt.totals.pts;
  report.opponentScore=number(game.opponentScore??game.oppScore)??report.opponent.totals.pts;
  report.facts=insights(report);return report;
 }
 root.PTGameReport={build,pct};
})(typeof window==='undefined'?globalThis:window);
