// Reversible display resets for Game Situation sessions. Shot records are untouched.
window.PTLiveGameResets={
 score(game,id,source,before){
  game.events=Array.isArray(game.events)?game.events:[];
  game.events.push({id,type:'RESET_SCORE',source,label:'Score reset',scoreBefore:{...before},recordedAt:new Date().toISOString()});
  game.teamScore=0;game.opponentScore=0;game.oppScore=0;
 },
 roster(game,id,source,lineups,active){
  game.events=Array.isArray(game.events)?game.events:[];
  game.events.push({id,type:'RESET_ROSTER',source,label:'Roster reset',lineupsBefore:{pt:[...lineups.pt],opponent:[...lineups.opponent]},activeBefore:active?{...active}:null,recordedAt:new Date().toISOString()});
  game.liveLineups={pt:['','','','',''],opponent:['','','','','']};
  game.liveActive=null;
 },
 restore(game,entry){
  if(entry.type==='RESET_SCORE'){
   game.teamScore=entry.scoreBefore.pt;
   game.opponentScore=entry.scoreBefore.opponent;
   game.oppScore=game.opponentScore;
  }else if(entry.type==='RESET_ROSTER'){
   game.liveLineups={pt:[...entry.lineupsBefore.pt],opponent:[...entry.lineupsBefore.opponent]};
   game.liveActive=entry.activeBefore?{...entry.activeBefore}:null;
  }
 },
 undo(game){
  const entry=game.events?.at(-1);
  if(entry?.type!=='RESET_SCORE'&&entry?.type!=='RESET_ROSTER')return false;
  game.events.pop();this.restore(game,entry);return true;
 }
};
