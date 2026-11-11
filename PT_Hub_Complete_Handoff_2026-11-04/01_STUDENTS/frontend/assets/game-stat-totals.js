// Shared Live Game box-score math for Other Leaderboards and the profiles.
((root)=>{
 'use strict';
 const stats=[
  {key:'gp',label:'Games Played',short:'GP',aliases:['gamesPlayed','gp']},
  {key:'gs',label:'Games Started',short:'GS',aliases:['gamesStarted','gs']},
  {key:'min',label:'Minutes',short:'MIN',aliases:['minutes','min']},
  {key:'pf',label:'Personal Fouls',short:'PF',aliases:['personalFouls','pf'],events:['FOUL','PF']},
  {key:'pts',label:'Points',short:'PTS',aliases:['pts','points']},
  {key:'orb',label:'Offensive Rebounds',short:'ORB',aliases:['orb','oreb','offensiveRebounds'],events:['OREB','ORB']},
  {key:'drb',label:'Defensive Rebounds',short:'DRB',aliases:['drb','dreb','defensiveRebounds'],events:['DREB','DRB']},
  {key:'ast',label:'Assists',short:'AST',aliases:['ast','assists'],events:['AST']},
  {key:'to',label:'Turnovers',short:'TO',aliases:['to','turnovers'],events:['TO']},
  {key:'stl',label:'Steals',short:'STL',aliases:['stl','steals'],events:['STL']},
  {key:'blk',label:'Blocks',short:'BLK',aliases:['blk','blocks'],events:['BLK']},
  {key:'pitp',label:'Points in the Paint',short:'PITP',aliases:['pitp','pointsInThePaint'],flag:'inPaint'},
  {key:'fbp',label:'Fast Break Points',short:'FBP',aliases:['fbp','fastBreakPoints'],flag:'fastBreak'}
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
 const isNewEvent=(game,event)=>event.source==='live-game'&&Number.isFinite(Date.parse(event.recordedAt))&&Date.parse(event.recordedAt)>Date.parse(game.statsImport?.importedAt||'1970-01-01T00:00:00Z');
 function gameValues(game,excluded=()=>false){
  const rows=Array.isArray(game.playerStats)?game.playerStats:[];
  const events=Array.isArray(game.events)?game.events.filter(e=>e.team!=='opponent'):[];
  const ids=new Set([...rows.map(r=>r.playerId),...events.map(e=>e.playerId),...(Array.isArray(game.starters)?game.starters:[])]);
  const result=[];
  for(const id of ids){
   if(!id||excluded(id))continue;
   const row=rows.find(r=>r.playerId===id),playerEvents=events.filter(e=>e.playerId===id);
   const gp=recordedValue(row,stats[0]);
   const recent=playerEvents.filter(event=>isNewEvent(game,event));
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
 function totalsFor(games,excluded=()=>false){
  const totals=new Map(stats.map(s=>[s.key,new Map()]));
  for(const game of games)for(const {id,values} of gameValues(game,excluded))for(const [key,value] of Object.entries(values)){
   const board=totals.get(key),previous=board.get(id)||{id,value:0,games:0};
   previous.value+=value;previous.games++;board.set(id,previous);
  }
  return totals;
 }
 root.PTGameStatTotals={stats,gameValues,totalsFor};
})(typeof window==='undefined'?globalThis:window);
