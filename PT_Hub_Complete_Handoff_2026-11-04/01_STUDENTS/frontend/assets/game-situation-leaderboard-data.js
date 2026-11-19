// Count normalized events once; old session payloads fill gaps until migration is complete.
const PT_SCRIMMAGE_SCHEDULE_ID='a6d4920b-6180-4c40-8b0c-8c02d2b10002';
window.PTIsGameSituationMatchup=game=>game?.statsCategory==='game-situation'||game?.scheduleId===PT_SCRIMMAGE_SCHEDULE_ID||game?.id===PT_SCRIMMAGE_SCHEDULE_ID||(!game?.scheduleId&&String(game?.opponent||'').trim().toLowerCase()==='scrimmage');
window.PTGameSituationLeaderboardData=(state,dateMatches,excludedPlayer)=>{
 const normalized=Array.isArray(state.gameSituationShots)?state.gameSituationShots:[];
 const normalizedIds=new Set(normalized.map(event=>event.id).filter(Boolean));
 const situationGames=(state.games||[]).filter(window.PTIsGameSituationMatchup).map(game=>({...game,events:(game.events||[]).filter(event=>event.team!=='opponent')}));
 const sessions=[...(state.gameSituations||[]),...situationGames];
 const legacy=sessions.flatMap(session=>(session.events||[]).filter(event=>!normalizedIds.has(event.id)).map(event=>({...event,date:session.date})));
 const totals=new Map(),seen=new Set();let recorded=0;
 for(const event of [...normalized,...legacy]){
  if(!['REB','DRB','ORB','TO'].includes(event.type)||event.undone||!event.playerId||excludedPlayer(event.playerId)||!dateMatches(event.date))continue;
  if(event.id){if(seen.has(event.id))continue;seen.add(event.id)}
  const row=totals.get(event.playerId)||{id:event.playerId,drb:0,orb:0,to:0};
  // Older REB actions represent the defensive-rebound button before its rename.
  if(event.type==='REB'||event.type==='DRB')row.drb++;
  if(event.type==='ORB')row.orb++;
  if(event.type==='TO')row.to++;
  totals.set(row.id,row);recorded++;
 }
 return {totals,recorded};
};
