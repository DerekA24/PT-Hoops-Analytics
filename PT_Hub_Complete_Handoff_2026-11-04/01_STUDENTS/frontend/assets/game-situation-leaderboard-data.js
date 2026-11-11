// Count normalized events once; old session payloads fill gaps until migration is complete.
window.PTGameSituationLeaderboardData=(state,dateMatches,excludedPlayer)=>{
 const normalized=Array.isArray(state.gameSituationShots)?state.gameSituationShots:[];
 const normalizedIds=new Set(normalized.map(event=>event.id).filter(Boolean));
 const legacy=(state.gameSituations||[]).flatMap(session=>(session.events||[]).filter(event=>!normalizedIds.has(event.id)).map(event=>({...event,date:session.date})));
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
