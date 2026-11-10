(()=>{
 'use strict';
 if(!document.getElementById('liveGamePage'))return;
 const situation=document.body.dataset.entryMode==='game-situation';
 const homeName=situation?'Red':'Park Tudor',eventSource=situation?'game-situation':'live-game';
 state.gameSituations=Array.isArray(state.gameSituations)?state.gameSituations:[];
 const actions=situation?[['TWO_M','Made 2'],['TWO_X','Missed 2'],['THREE_M','Made 3'],['THREE_X','Missed 3'],['FT_M','Made FT'],['FT_X','Missed FT']]:[
  ['TWO_M','2pt Make'],['TWO_X','2pt Miss'],['THREE_M','3pt Make'],['THREE_X','3pt Miss'],['FT_M','Free Throw Make'],['FT_X','Free Throw Miss'],['OREB','ORB'],['DREB','DRB'],['STL','STL'],['AST','AST'],['TO','TO'],['BLK','BLK'],['FOUL','Foul'],['FAST_TWO','Fast Break 2']
 ];
 const tablet=matchMedia('(min-width:768px) and (min-height:600px) and (pointer:coarse)');
 let tabletTeam='pt',restoreTeam=true;
 const selectionKey=situation?'pt-situation-current-session-v1':'pt-live-current-game-v1';let selection=localStorage.getItem(selectionKey)||(situation?'new':''),point={x:250,y:300},busy=false;
 if(situation&&!state.gameSituations.some(session=>'g:'+session.id===selection&&session.date===today()))selection='new';
 const points=event=>({TWO_M:2,THREE_M:3,FT_M:1})[event.type]||0;
 const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 function entries(){
  if(situation)return [{key:'new',schedule:{date:today(),opponent:'White'},game:null},...state.gameSituations.slice().sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date))).map(game=>({key:'g:'+game.id,game,schedule:null}))];
  const used=new Set(),list=state.schedule.map(schedule=>{
   const game=state.games.find(g=>!used.has(g.id)&&(g.scheduleId===schedule.id||g.id===schedule.id||g.date===schedule.date&&normalize(g.opponent)===normalize(schedule.opponent)));
   if(game)used.add(game.id);return {key:'s:'+schedule.id,schedule,game};
  });
  for(const game of state.games)if(!used.has(game.id))list.push({key:'g:'+game.id,game,schedule:null});
  return list.sort((a,b)=>String((a.schedule||a.game).date||'').localeCompare(String((b.schedule||b.game).date||'')));
 }
 const selectedEntry=()=>entries().find(e=>e.key===selection);
 function ensureGame(){
  const entry=selectedEntry();if(!entry)return null;
  if(entry.game)return entry.game;
  if(situation){const game={id:uid(),date:today(),createdAt:new Date().toISOString(),homeTeamName:'Red',opponent:'White',opponentPlayers:[],shotContext:'game-situation',events:[],played:false};state.gameSituations.push(game);selection='g:'+game.id;localStorage.setItem(selectionKey,selection);return game}
  const item=entry.schedule,game={id:uid(),scheduleId:item.id,date:item.date,opponent:item.opponent,time:item.time||'',location:item.location||'Home',hudlUrl:item.hudlUrl||'',events:[],played:false};state.games.push(game);return game;
 }
 function roster(game,team){return situation||team==='pt'?state.players:Array.isArray(game?.opponentPlayers)?game.opponentPlayers:[]}
 function slots(game,team){const values=game?.liveLineups?.[team]||[];return Array.from({length:5},(_,i)=>values[i]||'')}
 function activePlayer(game){
  const active=game?.liveActive;if(!active||!['pt','opponent'].includes(active.team)||!Number.isInteger(active.slot)||active.slot<0||active.slot>4)return null;
  if(slots(game,active.team)[active.slot]!==active.playerId)return null;
  const player=roster(game,active.team).find(p=>p.id===active.playerId);return player?{...active,player}:null;
 }
 const playerLabel=player=>`${player.number!==undefined&&player.number!==''?'#'+player.number+' ':''}${player.name}`;
 function score(game,team){
  const value=team==='pt'?game?.teamScore:game?.opponentScore??game?.oppScore;
  if(value!==undefined&&value!==null&&Number.isFinite(Number(value)))return Number(value);
  return (game?.events||[]).filter(e=>(e.team==='opponent'?'opponent':'pt')===team).reduce((n,e)=>n+points(e),0);
 }
 function updateDot(){for(const id of ['liveCourtDot','liveCourtDotHalo']){const dot=$(id);dot.setAttribute('cx',String(point.x));dot.setAttribute('cy',String(point.y))}$('liveLocationText').textContent=`${point.x}, ${point.y}`}
 function render(){
  const list=entries();if(!list.some(e=>e.key===selection))selection=situation?'new':'';
  if($('liveGameSelector')){$('liveGameSelector').innerHTML=situation?list.map(entry=>`<option value="${esc(entry.key)}">${entry.key==='new'?'New Red vs White session':esc(entry.game.date)+' - Red vs White #'+(state.gameSituations.indexOf(entry.game)+1)+' - '+esc(new Date(entry.game.createdAt||entry.game.date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))}</option>`).join(''):'<option value="">Select a game</option>'+list.map(entry=>{const item=entry.schedule||entry.game;return `<option value="${esc(entry.key)}">${esc(item.date||'Date TBD')} · ${item.location==='Away'?'@':'vs'} ${esc(item.opponent||'Opponent TBD')}${item.time?' · '+esc(item.time):''}</option>`}).join('');$('liveGameSelector').value=selection;}
  const entry=selectedEntry(),game=entry?.game,opponent=situation?'White':(entry?.schedule||game)?.opponent||'Opponent',active=activePlayer(game);
  if(restoreTeam){tabletTeam=game?.liveActive?.team||'pt';restoreTeam=false}
  $('liveTabletOpponent').textContent=opponent;$('liveScoreOpponent').textContent=opponent;$('livePtScore').textContent=score(game,'pt');$('liveOpponentScore').textContent=score(game,'opponent');
  $('liveGamePage').dataset.tabletTeam=tabletTeam;
  for(const button of document.querySelectorAll('[data-live-team]')){button.setAttribute('aria-pressed',String(button.dataset.liveTeam===tabletTeam));button.disabled=!entry}
  $('liveOpponentName').textContent=opponent;$('liveAddOpponent').disabled=!entry;
  if($('liveGameTeams'))$('liveGameTeams').textContent=`${homeName} vs ${opponent}`;
  $('liveGameScore').textContent=`${score(game,'pt')} \u2013 ${score(game,'opponent')}`;
  $('liveGameScore').setAttribute('aria-label',`${homeName} ${score(game,'pt')}, ${opponent} ${score(game,'opponent')}`);
  const saved=game?.liveCourtPoint;if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))point={x:Math.max(12,Math.min(488,saved.x)),y:Math.max(12,Math.min(458,saved.y))};updateDot();
  $('livePlayerSlots').innerHTML=Array.from({length:5},(_,slot)=>['pt','opponent'].map(team=>{
   const lineup=slots(game,team),id=lineup[slot],players=roster(game,team),player=players.find(p=>p.id===id),isActive=active?.team===team&&active.slot===slot;
   return `<div class="live-slot-dropdown ${isActive?'selected':''}" data-live-slot="${team}:${slot}" data-live-team-slot="${team}"><button type="button" class="live-player-activate" data-live-activate="${team}:${slot}" aria-pressed="${!!isActive}" title="${player?esc(playerLabel(player)):'Use the arrow to choose a player'}" ${!entry||!player?'disabled':''}>${player?'<span class="live-player-number">'+(player.number!==undefined&&player.number!==''?'#'+esc(player.number):'')+'</span> <span class="live-player-name">'+esc(player.name)+'</span>':'Select player'}</button><span class="live-player-arrow" aria-hidden="true">&#9662;</span><select data-live-player="${team}:${slot}" aria-label="Change ${team==='pt'?homeName:esc(opponent)} player ${slot+1}" aria-describedby="liveSelectedPlayer" ${!entry?'disabled':''}><option value="">Select player</option>${players.map(p=>`<option value="${esc(p.id)}" ${p.id===id?'selected':''} ${lineup.some((value,i)=>i!==slot&&value===p.id)||situation&&slots(game,team==='pt'?'opponent':'pt').includes(p.id)?'disabled':''}>${esc(playerLabel(p))}</option>`).join('')}</select></div>`;
  }).join('')).join('');
  $('liveRosterNote').innerHTML=state.players.length?'':'Add Park Tudor players in <a href="coach-review.html#roster">Coach Review → Roster</a>.';
  $('liveSelectedPlayer').textContent=active?`${active.team==='pt'?homeName:opponent} · ${playerLabel(active.player)}`:entry?'Choose a player above.':'Select a game and player.';
  $('liveStatButtons').innerHTML=actions.map(([type,label])=>`<button type="button" data-live-stat="${type}" ${!active||busy?'disabled':''} class="${type.endsWith('_M')||type==='FAST_TWO'?'live-make':type.endsWith('_X')?'live-miss':''}">${label}</button>`).join('');
  const last=(game?.events||[]).at(-1),lastPlayer=last?roster(game,last.team==='opponent'?'opponent':'pt').find(p=>p.id===last.playerId):null;
  $('liveUndo').disabled=!last||last.source!==eventSource;
  if($('liveGenerateReport'))$('liveGenerateReport').disabled=!entry;
  $('liveLastEntry').textContent=last?.source===eventSource?`Saved: ${last.team==='opponent'?opponent:homeName} · ${lastPlayer?playerLabel(lastPlayer):last.playerName||'Player'} · ${last.label||last.type} · (${last.x}, ${last.y})`:'';
 }
 function arrangeTabletFooter(){
  const destination=tablet.matches?$('liveScoreFooter'):document.querySelector('.live-last-entry');
  if($('liveUndo').parentElement!==destination)destination.insertBefore($('liveUndo'),tablet.matches?($('liveGenerateReport')||null):null);
 }
 document.querySelector('.live-tablet-teams').addEventListener('click',e=>{
  const button=e.target.closest('[data-live-team]');if(!button||button.disabled)return;
  tabletTeam=button.dataset.liveTeam;
  const game=selectedEntry()?.game;
  if(game&&game.liveActive?.team!==tabletTeam){
   const lineup=slots(game,tabletTeam),slot=lineup.findIndex(id=>roster(game,tabletTeam).some(p=>p.id===id));
   game.liveActive=slot>=0?{team:tabletTeam,slot,playerId:lineup[slot]}:null;save();
  }else render();
 });
 tablet.addEventListener('change',arrangeTabletFooter);arrangeTabletFooter();
 function setLineup(game,team,slot,id){
  const lineup=slots(game,team);if(id&&(!roster(game,team).some(p=>p.id===id)||lineup.some((value,i)=>i!==slot&&value===id)||situation&&slots(game,team==='pt'?'opponent':'pt').includes(id)))return false;
  game.liveLineups={pt:slots(game,'pt'),opponent:slots(game,'opponent'),...game.liveLineups};game.liveLineups[team]=lineup;lineup[slot]=id;
  if(id)game.liveActive={team,slot,playerId:id};else if(game.liveActive?.team===team&&game.liveActive.slot===slot)game.liveActive=null;
  return true;
 }
 if($('liveGameSelector'))$('liveGameSelector').onchange=e=>{selection=e.target.value;localStorage.setItem(selectionKey,selection);point={x:250,y:300};restoreTeam=true;render()};
 $('livePlayerSlots').onchange=e=>{
  const select=e.target.closest('[data-live-player]');if(!select)return;const [team,index]=select.dataset.livePlayer.split(':'),game=ensureGame();if(!game)return;
  if(setLineup(game,team,Number(index),select.value))save();else render();
 };
 $('livePlayerSlots').onclick=e=>{
  const button=e.target.closest('[data-live-activate]');if(!button)return;
  const [team,index]=button.dataset.liveActivate.split(':'),game=ensureGame();if(!game)return;
  const slot=Number(index),playerId=slots(game,team)[slot];if(!playerId||!roster(game,team).some(player=>player.id===playerId))return;
  game.liveActive={team,slot,playerId};save();
 };
 function moveDot(x,y){point={x:Math.max(12,Math.min(488,Math.round(x))),y:Math.max(12,Math.min(458,Math.round(y)))};updateDot();if(selectedEntry()){const game=ensureGame();game.liveCourtPoint={...point};save()}}
 $('liveCourt').onclick=e=>{const court=$('liveCourt'),position=court.createSVGPoint();position.x=e.clientX;position.y=e.clientY;const transformed=position.matrixTransform(court.getScreenCTM().inverse());moveDot(transformed.x,transformed.y)};
 $('liveCourt').onkeydown=e=>{const steps={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]};if(!steps[e.key])return;e.preventDefault();moveDot(point.x+steps[e.key][0],point.y+steps[e.key][1])};
 $('liveStatButtons').onclick=e=>{
  const button=e.target.closest('[data-live-stat]');if(!button||busy)return;const action=actions.find(([type])=>type===button.dataset.liveStat);if(!action)return;
  const game=ensureGame(),active=activePlayer(game);if(!game||!active)return;
  busy=true;
  try{
   const type=action[0]==='FAST_TWO'?'TWO_M':action[0],before={pt:score(game,'pt'),opponent:score(game,'opponent')};
   const event={id:uid(),playerId:active.player.id,playerName:active.player.name,team:active.team,type,label:action[1],x:point.x,y:point.y,fastBreak:action[0]==='FAST_TWO',inPaint:type==='TWO_M'&&point.x>=174&&point.x<=326&&point.y<=202,recordedAt:new Date().toISOString(),source:eventSource,shotContext:situation?'game-situation':'game',scoreBefore:before};
   const events=Array.isArray(game.events)?game.events:[];game.events=events;events.push(event);game.played=true;game.final=false;
   game.teamScore=before.pt+(active.team==='pt'?points(event):0);game.opponentScore=before.opponent+(active.team==='opponent'?points(event):0);game.oppScore=game.opponentScore;
   save();
  }finally{busy=false;render()}
 };
 $('liveUndo').onclick=()=>{
  const game=selectedEntry()?.game,last=game?.events?.at(-1);if(!last||last.source!==eventSource)return;
  game.events.pop();game.teamScore=last.scoreBefore?.pt??Math.max(0,score(game,'pt')-(last.team==='opponent'?0:points(last)));game.opponentScore=last.scoreBefore?.opponent??Math.max(0,score(game,'opponent')-(last.team==='opponent'?points(last):0));game.oppScore=game.opponentScore;save();
 };
 if($('liveGenerateReport'))$('liveGenerateReport').onclick=()=>{
  const entry=selectedEntry();if(!entry)return toast('Select a game before generating a report.');
  const game={...(entry.schedule||{}),...(entry.game||{}),events:entry.game?.events||[],...(situation?{homeTeamName:'Red',opponentPlayers:state.players}:{} )};
  const id=uid(),snapshot={game,players:state.players,createdAt:new Date().toISOString()};
  try{
   // Keep a few report snapshots for reload/printing without changing game records.
   const old=Object.keys(localStorage).filter(key=>key.startsWith('pt-game-report-')).sort((a,b)=>{
    try{return String(JSON.parse(localStorage.getItem(a)).createdAt).localeCompare(String(JSON.parse(localStorage.getItem(b)).createdAt))}catch{return 0}
   });
   while(old.length>=5)localStorage.removeItem(old.shift());
   localStorage.setItem('pt-game-report-'+id,JSON.stringify(snapshot));
  }catch{return toast('Could not prepare the report. Free some browser storage and try again.');}
  const url='game-report.html?report='+encodeURIComponent(id);
  const reportWindow=window.open(url,'_blank');
  if(reportWindow)reportWindow.opener=null;else location.assign(url);
 };
 $('liveAddOpponent').onclick=()=>{if(situation||!selectedEntry())return;$('liveOpponentForm').reset();$('liveOpponentError').textContent='';$('liveOpponentDialog').showModal()};
 $('liveCloseOpponent').onclick=()=>$('liveOpponentDialog').close();
 $('liveOpponentForm').onsubmit=e=>{
  e.preventDefault();if(situation)return;const game=ensureGame();if(!game)return;const name=$('liveOpponentPlayerName').value.trim(),number=$('liveOpponentPlayerNumber').value.trim();if(!name)return;
  const players=roster(game,'opponent');if(number!==''&&players.some(p=>p.number!==''&&Number(p.number)===Number(number))){$('liveOpponentError').textContent='That jersey number is already on this opponent roster.';return}
  const player={id:'opponent-'+uid(),name,number};game.opponentPlayers=[...players,player];
  const lineup=slots(game,'opponent'),empty=lineup.indexOf('');if(empty>=0)setLineup(game,'opponent',empty,player.id);
  tabletTeam='opponent';save();$('liveOpponentDialog').close();
 };
 window.renderLiveGame=render;if(!situation)window.seedSeasonSchedule?.();render();
})();
