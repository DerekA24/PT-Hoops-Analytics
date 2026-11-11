(()=>{
 'use strict';
 if(!document.getElementById('schedulePage'))return;
 const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const sameGame=(a,b)=>a.date===b.date&&norm(a.opponent)===norm(b.opponent);
 let uploadKey='',draft=[];
 let editPermit=false,hudlPermit=false,schedulePermit=false,resolveCoach=null,verifyingCoach=false;
 function requireCoach(reason){
  if(resolveCoach)return Promise.resolve(false);
  return new Promise(resolve=>{resolveCoach=resolve;$('scheduleCoachReason').textContent=reason;$('scheduleCoachCode').value='';$('scheduleCoachError').textContent='';$('scheduleCoachGate').showModal();$('scheduleCoachCode').focus()});
 }
 function finishCoach(allowed){const resolve=resolveCoach;resolveCoach=null;$('scheduleCoachGate').close();if(resolve)resolve(allowed)}
 $('scheduleCoachCodeForm').onsubmit=async e=>{
  e.preventDefault();if(verifyingCoach)return;verifyingCoach=true;const pending=resolveCoach;
  try{const valid=await window.PTCoachAccess.verify($('scheduleCoachCode').value);if(resolveCoach!==pending)return;if(!valid){$('scheduleCoachError').textContent='Incorrect access code.';return}finishCoach(true)}
  catch{if(resolveCoach===pending)$('scheduleCoachError').textContent='Could not verify the coach access code. Please try again.'}
  finally{verifyingCoach=false}
 };
 $('scheduleCoachCancel').onclick=()=>finishCoach(false);
 $('scheduleCoachGate').addEventListener('cancel',e=>{e.preventDefault();finishCoach(false)});
 $('scheduleCoachGate').addEventListener('close',()=>{if(resolveCoach){const resolve=resolveCoach;resolveCoach=null;resolve(false)}});
 $('scheduleGameDialog').addEventListener('close',()=>{editPermit=false});
 $('hudlImportDialog').addEventListener('close',()=>{hudlPermit=false});
 window.addEventListener('pagehide',()=>{editPermit=false;hudlPermit=false;schedulePermit=false;for(const id of ['scheduleGameDialog','hudlImportDialog'])if($(id).open)$(id).close();if(resolveCoach)finishCoach(false)});
 function gameEntries(){
  const used=new Set(),scheduleIds=new Set(state.schedule.map(s=>s.id)),entries=state.schedule.map(s=>{
   const game=state.games.find(g=>!used.has(g.id)&&(g.scheduleId===s.id||g.id===s.id))||state.games.find(g=>!used.has(g.id)&&sameGame(g,s)&&(!g.scheduleId||!scheduleIds.has(g.scheduleId)));
   if(game)used.add(game.id);return {key:'s:'+s.id,schedule:s,game};
  });
  for(const game of state.games)if(!used.has(game.id))entries.push({key:'g:'+game.id,game,schedule:null});
  const distinct=new Map();
  for(const entry of entries){
   const item=entry.schedule||entry.game,key=[item.date||'',norm(item.opponent),item.time||'',item.location||''].join('|'),prior=distinct.get(key);
   if(!prior||entry.game&&!prior.game)distinct.set(key,entry);
  }
  return [...distinct.values()].sort((a,b)=>String((a.schedule||a.game).date||'').localeCompare(String((b.schedule||b.game).date||''))||String((a.schedule||a.game).time||'').localeCompare(String((b.schedule||b.game).time||'')));
 }
 const findEntry=key=>gameEntries().find(entry=>entry.key===key);
 const isPlayed=entry=>!!(entry.game?.played||entry.game?.final||entry.game?.playerStats?.length||entry.game?.events?.length||entry.schedule?.played);
 function hudlLink(value){try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='hudl.com'||url.hostname.endsWith('.hudl.com'))?url.href:''}catch{return ''}}
 function dateText(value){const date=new Date(String(value)+'T12:00:00');return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(date):'Date TBD'}
 function timeText(value){const match=/^(\d{1,2}):(\d{2})$/.exec(value||'');if(!match)return value||'Time TBD';const hour=Number(match[1]);return (hour%12||12)+':'+match[2]+(hour<12?' AM':' PM')}
 function scheduleToday(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Indiana/Indianapolis',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`}
 function render(){
  const entries=gameEntries(),currentDate=scheduleToday();
  $('scheduleGameList').innerHTML=entries.length?entries.map(entry=>{
   const item=entry.schedule||entry.game,game=entry.game||{},played=isPlayed(entry),link=hudlLink(item.hudlUrl||game.hudlUrl);
   const own=game.teamScore??item.teamScore,opponent=game.opponentScore??game.oppScore??item.opponentScore;
   const reached=String(item.date||'')<=currentDate,completed=reached&&(game.final||entry.schedule?.played||game.statsImport||String(item.date||'')<currentDate&&played);
   const hasScore=own!==null&&own!==undefined&&opponent!==null&&opponent!==undefined;
   const score=!reached?'Upcoming':completed?(hasScore?`${esc(own)} – ${esc(opponent)}`:'Score not recorded'):String(item.date||'')===currentDate?'Upcoming':'Result pending';
   return `<article class="schedule-game" data-game-key="${esc(entry.key)}"><div class="schedule-game-date"><strong>${esc(dateText(item.date))}</strong><small>${esc(timeText(item.time||game.time))}</small></div><div class="schedule-game-opponent"><span class="muted">${item.location==='Away'?'@':item.location==='Neutral'?'vs · Neutral':'vs'}</span> <strong>${esc(item.opponent||'Opponent TBD')}</strong></div><div class="schedule-game-score ${completed?'played':''}"><strong>${score}</strong>${completed&&hasScore?'<small>Park Tudor – Opponent</small>':''}</div><div class="schedule-game-actions">${link?`<a class="schedule-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open Hudl</a>`:''}<button type="button" data-upload-hudl="${esc(entry.key)}">${game.playerStats?.length?'Replace Hudl Stats':'Upload Hudl Stats'}</button><button type="button" data-edit-game="${esc(entry.key)}">${link?'Edit':'Edit / Add Hudl Link'}</button></div></article>`;
  }).join(''):'<div class="card"><p>No games scheduled yet. Add a game or import your schedule CSV.</p></div>';
 }
 function scoreFields(){$('scheduleScoreFields').hidden=!$('schedulePlayed').checked}
 async function openEditor(key=''){
  if(!await requireCoach(key?'Enter the coach access code to edit this game.':'Enter the coach access code to add a game.'))return;
  editPermit=true;
  const entry=key?findEntry(key):null;if(key&&!entry)return;
  const item=entry?.schedule||entry?.game||{},game=entry?.game||{};
  $('scheduleGameForm').reset();$('scheduleEditKey').value=key;$('scheduleEditorTitle').textContent=key?'Edit Game':'Add Game';
  $('scheduleGameDate').value=item.date||today();$('scheduleGameTime').value=item.time||game.time||'';$('scheduleGameOpponent').value=item.opponent||'';$('scheduleGameLocation').value=item.location||'Home';$('scheduleHudlUrl').value=item.hudlUrl||game.hudlUrl||'';
  $('schedulePlayed').checked=entry?isPlayed(entry):false;$('scheduleTeamScore').value=game.teamScore??item.teamScore??'';$('scheduleOpponentScore').value=game.opponentScore??game.oppScore??item.opponentScore??'';
  $('scheduleEditorError').textContent='';scoreFields();$('scheduleGameDialog').showModal();
 }
 function ensureGame(entry){
  if(entry.game)return entry.game;
  const item=entry.schedule,game={id:uid(),scheduleId:item.id,date:item.date,opponent:item.opponent,time:item.time||'',location:item.location||'Home',hudlUrl:item.hudlUrl||'',events:[]};state.games.push(game);return game;
 }
 $('scheduleGameForm').onsubmit=e=>{
  e.preventDefault();if(!editPermit){$('scheduleEditorError').textContent='Coach access is required. Close this window and try again.';return}const key=$('scheduleEditKey').value,entry=key?findEntry(key):null;
  if(key&&!entry)return;
  const rawUrl=$('scheduleHudlUrl').value.trim(),url=rawUrl?hudlLink(rawUrl):'';
  if(rawUrl&&!url){$('scheduleEditorError').textContent='Use an HTTPS link on hudl.com.';return}
  const date=$('scheduleGameDate').value,opponent=$('scheduleGameOpponent').value.trim();if(!date||!opponent)return;
  const ownScore=$('scheduleTeamScore').value,opponentScore=$('scheduleOpponentScore').value;
  if($('schedulePlayed').checked&&(ownScore==='')!==(opponentScore==='')){$('scheduleEditorError').textContent='Enter both scores, or leave both blank if the score is not known.';return}
  const values={date,opponent,time:$('scheduleGameTime').value,location:$('scheduleGameLocation').value,hudlUrl:url};
  if(gameEntries().some(other=>other.key!==key&&sameGame(other.schedule||other.game,values))){$('scheduleEditorError').textContent='This opponent is already scheduled on that date. Edit the existing game.';return}
  let target=entry;
  if(!target){const schedule={id:uid(),...values};state.schedule.push(schedule);target={key:'s:'+schedule.id,schedule,game:null}}
  if(target.schedule)Object.assign(target.schedule,values);
  if(target.game)Object.assign(target.game,values);
  if($('schedulePlayed').checked){const game=ensureGame(target);Object.assign(game,values,{played:true,final:true});if(ownScore!==''&&opponentScore!=='')Object.assign(game,{teamScore:Number(ownScore),opponentScore:Number(opponentScore),oppScore:Number(opponentScore)});else{delete game.teamScore;delete game.opponentScore;delete game.oppScore}}
  else if(target.game){target.game.played=false;target.game.final=false;delete target.game.teamScore;delete target.game.opponentScore;delete target.game.oppScore}
  save();$('scheduleGameDialog').close();$('schedulePageStatus').textContent='Game saved.';
 };
 const fields={
  gp:['GP','Games Played'],gs:['GS','Games Started','Started','Starter'],minutes:['MIN','Minutes','Minutes Played','MP'],personalFouls:['PF','Personal Fouls','Fouls'],pts:['PTS','Points'],orb:['ORB','OREB','Offensive Rebounds','Off Reb'],drb:['DRB','DREB','Defensive Rebounds','Def Reb'],ast:['AST','Assists'],to:['TO','TOV','Turnovers'],stl:['STL','Steals'],blk:['BLK','Blocks'],pitp:['PITP','Points in the Paint','Points in Paint'],fbp:['FBP','Fast Break Points'],fgMade:['FGM','Field Goals Made'],fgAttempts:['FGA','Field Goals Attempted'],twoMade:['2PM','2FGM','2PTM','2PT Made'],twoAttempts:['2PA','2FGA','2PTA','2PT Attempts'],threeMade:['3PM','3FGM','3PTM','3PT Made'],threeAttempts:['3PA','3FGA','3PTA','3PT Attempts'],ftMade:['FTM','Free Throws Made'],ftAttempts:['FTA','Free Throws Attempted']
 };
 const nameHeaders=['Player','Player Name','Name','Athlete','Athlete Name'];
 const jerseyHeaders=['#','##','Jersey','Jersey Number','Jersey #','Number'];
 function parseStats(text){
  const rows=parseCSV(text.replace(/^\uFEFF/,''));
  const headerIndex=rows.findIndex(row=>row.some(cell=>nameHeaders.some(h=>norm(h)===norm(cell))||jerseyHeaders.some(h=>h===cell.trim()||norm(h)&&norm(h)===norm(cell)))&&row.some(cell=>Object.values(fields).flat().some(h=>norm(h)===norm(cell))));
  if(headerIndex<0)throw Error('No player-stat header found. Use a per-game player totals CSV with a Player Name or Jersey Number column and stat columns.');
  const headers=rows[headerIndex].map(h=>h.trim()),indexFor=aliases=>headers.findIndex(h=>aliases.some(alias=>alias===h||norm(alias)&&norm(alias)===norm(h)));
  const nameIndex=indexFor(nameHeaders),jerseyIndex=indexFor(jerseyHeaders),idIndex=indexFor(['Player ID','playerId']),dnpIndex=indexFor(['DNP','Did Not Play']);
  const indices=Object.fromEntries(Object.entries(fields).map(([key,aliases])=>[key,indexFor(aliases)]));
  const dateIndex=indexFor(['Date','Game Date']),selectedDate=(findEntry(uploadKey)?.schedule||findEntry(uploadKey)?.game)?.date;
  const output=[];
  for(let i=headerIndex+1;i<rows.length;i++){
   const cells=rows[i],name=nameIndex<0?'':cells[nameIndex]?.trim()||'',jersey=jerseyIndex<0?'':cells[jerseyIndex]?.trim()||'';
   if(!name&&!jersey)continue;if(/^(team(?:\s*totals?)?|totals?|opponents?)$/i.test(name))continue;
   const errors=[],stats={},getValue=key=>indices[key]<0?'':String(cells[indices[key]]??'').trim();
   for(const key of Object.keys(fields)){
    let value=getValue(key);if(value===''||value==='-'||value==='—'||value.toLowerCase()==='n/a')continue;
    if(key==='gs'&&/^(yes|true|no|false)$/i.test(value))value=/^(yes|true)$/i.test(value)?'1':'0';
    if(key==='minutes'&&/^\d+:[0-5]\d$/.test(value)){const [m,s]=value.split(':').map(Number);stats.minutes=m+s/60;continue}
    const number=Number(value);
    if(!Number.isFinite(number)||number<0||key!=='minutes'&&!Number.isInteger(number)){errors.push(`${fields[key][0]} must be a nonnegative ${key==='minutes'?'number':'whole number'}.`);continue}
    if((key==='gp'||key==='gs')&&number>1){errors.push('Export one game of totals, not season totals or averages.');continue}
    stats[key]=number;
   }
   if(dateIndex>=0){const value=String(cells[dateIndex]||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&value!==selectedDate)errors.push('The report date does not match this game.')}
   if(stats.twoMade===undefined&&stats.twoAttempts===undefined&&['fgMade','fgAttempts','threeMade','threeAttempts'].every(key=>stats[key]!==undefined)){stats.twoMade=stats.fgMade-stats.threeMade;stats.twoAttempts=stats.fgAttempts-stats.threeAttempts;if(stats.twoMade<0||stats.twoAttempts<0)errors.push('Three-point totals cannot exceed field-goal totals.')}
   for(const [made,attempts] of [['fgMade','fgAttempts'],['twoMade','twoAttempts'],['threeMade','threeAttempts'],['ftMade','ftAttempts']]){
    if((stats[made]!==undefined)!==(stats[attempts]!==undefined))errors.push(`Include both ${fields[made][0]} and ${fields[attempts][0]} to import shooting results.`);
    if(stats[made]>stats[attempts])errors.push(`${fields[made][0]} cannot exceed ${fields[attempts][0]}.`);
   }
   const dnp=dnpIndex>=0&&/^(1|yes|true|dnp|x)$/i.test(String(cells[dnpIndex]||'').trim());
   stats.played=!dnp&&stats.gp!==0;if(stats.gs!==undefined)stats.started=stats.gs===1;delete stats.gs;delete stats.gp;
   if(stats.started&&!stats.played)errors.push('A starter must also be marked as played.');
   if(['twoMade','threeMade','ftMade'].every(key=>stats[key]!==undefined)){
    const points=stats.twoMade*2+stats.threeMade*3+stats.ftMade;
    if(stats.pts===undefined)stats.pts=points;else if(stats.pts!==points)errors.push('Points do not match the made two-pointers, three-pointers, and free throws.');
   }
   if(!Object.keys(stats).some(key=>!['played','started'].includes(key))&&!dnp)errors.push('No numeric stats were found for this player.');
   const nameMatches=state.players.filter(p=>norm(p.name)===norm(name)||norm(p.name?.split(' ').reverse().join(' '))===norm(name));
   const jerseyMatches=jersey?state.players.filter(p=>String(Number(p.number))===String(Number(jersey.replace(/^#/,'')))):[];
   const id=cells[idIndex],byId=idIndex>=0?state.players.find(p=>p.id===id):null;
   let match=byId||nameMatches.length===1&&nameMatches[0]||jerseyMatches.length===1&&jerseyMatches[0]||null;
   if(!byId&&nameMatches.length===1&&jerseyMatches.length===1&&nameMatches[0].id!==jerseyMatches[0].id)match=null;
   output.push({line:i+1,name:name||'#'+jersey,playerId:match?.id||'',stats,errors});
  }
  if(!output.length)throw Error('No player rows found in this report.');
  if(output.length>250)throw Error('This report has too many player rows. Export one game of player totals.');
  return output;
 }
 function renderPreview(){
  const counts=new Map();for(const row of draft)if(row.playerId)counts.set(row.playerId,(counts.get(row.playerId)||0)+1);
  let valid=!!draft.length;
  $('hudlImportPreview').innerHTML=table(['CSV Player','Match to Roster','Points','Minutes','Review'],draft.map((row,index)=>{
   const errors=[...row.errors];if(!row.playerId)errors.push('Choose a roster player.');if(counts.get(row.playerId)>1)errors.push('This player appears more than once. Use game totals, not period rows.');if(errors.length)valid=false;
   return `<tr><td>${esc(row.name)}</td><td><select data-match-player="${index}" aria-label="Match ${esc(row.name)} to roster"><option value="">Choose player</option>${state.players.map(p=>`<option value="${esc(p.id)}" ${p.id===row.playerId?'selected':''}>#${esc(p.number)} ${esc(p.name)}</option>`).join('')}</select></td><td>${row.stats.pts??'—'}</td><td>${row.stats.minutes===undefined?'—':Number(row.stats.minutes.toFixed(1))}</td><td class="${errors.length?'date-range-error':''}">${errors.length?esc(errors.join(' ')):'Ready'}</td></tr>`;
  }));
  $('saveHudlImport').disabled=!valid;$('hudlImportStatus').textContent=`${draft.length} player row(s). Saving replaces imported player totals for this game only.`;
 }
 async function openUpload(key){
  if(!await requireCoach('Enter the coach access code to upload Hudl stats for this game.'))return;
  hudlPermit=true;
  const entry=findEntry(key);if(!entry)return;uploadKey=key;draft=[];
  const item=entry.schedule||entry.game;$('hudlImportGame').textContent=dateText(item.date)+' · '+item.opponent;
  $('hudlStatsFile').value='';$('hudlImportPreview').innerHTML='';$('hudlImportError').textContent='';$('hudlImportStatus').textContent=state.players.length?'Choose a per-game player stats CSV.':'Add your roster in Coach Review before uploading player stats.';$('saveHudlImport').disabled=true;$('hudlImportDialog').showModal();
 }
 $('hudlStatsFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  if(!hudlPermit&&!await requireCoach('Enter the coach access code to upload Hudl stats.')){e.target.value='';return}hudlPermit=true;
  draft=[];$('hudlImportError').textContent='';$('hudlImportPreview').innerHTML='';$('saveHudlImport').disabled=true;
  try{if(file.size>5*1024*1024)throw Error('Choose a CSV smaller than 5 MB.');draft=parseStats(await file.text());renderPreview()}catch(error){$('hudlImportError').textContent=error.message}
 };
 $('hudlImportPreview').onchange=e=>{const select=e.target.closest('[data-match-player]');if(!select)return;draft[Number(select.dataset.matchPlayer)].playerId=select.value;renderPreview()};
 $('saveHudlImport').onclick=()=>{
  if(!hudlPermit||$('saveHudlImport').disabled)return;const entry=findEntry(uploadKey);if(!entry){$('hudlImportError').textContent='This game no longer exists.';return}
  const game=ensureGame(entry);game.playerStats=draft.map(row=>({playerId:row.playerId,...row.stats}));game.played=true;game.statsImport={filename:$('hudlStatsFile').files[0]?.name||'',importedAt:new Date().toISOString(),source:'hudl-csv'};
  save();$('hudlImportDialog').close();$('schedulePageStatus').textContent=`Stats saved for ${game.opponent}. Game leaderboards and profile graphs are updated.`;
 };
 $('addScheduleGame').onclick=()=>openEditor();$('schedulePlayed').onchange=scoreFields;
 document.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>$(button.dataset.closeDialog).close());
 $('scheduleGameList').onclick=e=>{const edit=e.target.closest('[data-edit-game]'),upload=e.target.closest('[data-upload-hudl]');if(edit)openEditor(edit.dataset.editGame);if(upload)openUpload(upload.dataset.uploadHudl)};
 $('scheduleTemplate').onclick=()=>downloadText('PT_Schedule_Template.csv',csvData([['Date','Opponent','Location','Start Time','Notes']]));
 $('hudlStatsTemplate').onclick=()=>downloadText('PT_Hudl_Player_Stats_Template.csv',csvData([['Player Name','Jersey Number','GP','GS','MIN','PF','PTS','ORB','DRB','AST','TO','STL','BLK','PITP','FBP','2PM','2PA','3PM','3PA','FTM','FTA']]));
 $('schedulePageUpload').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  if(!schedulePermit&&!await requireCoach('Enter the coach access code to import a schedule CSV.')){e.target.value='';return}schedulePermit=false;
  try{const rows=await getCSV(file,['Date','Opponent','Location','Start Time','Notes']),incoming=[];
   for(const row of rows){const [date,opponent,location,time,notes]=row.values;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00'))||!opponent||!['Home','Away','Neutral'].includes(location))throw Error('Invalid schedule data on row '+row.line);if(state.schedule.some(s=>sameGame(s,{date,opponent}))||incoming.some(s=>sameGame(s,{date,opponent})))continue;incoming.push({id:uid(),date,opponent,location,time,notes})}
   state.schedule.push(...incoming);save();$('schedulePageStatus').textContent=`${incoming.length} game(s) added. Existing games were kept.`;
  }catch(error){$('schedulePageStatus').textContent='Schedule import failed: '+error.message}finally{e.target.value=''}
 };
 $('importScheduleButton').onclick=async()=>{if(!await requireCoach('Enter the coach access code to import a schedule CSV.'))return;schedulePermit=true;$('schedulePageUpload').click()};
 $('schedulePageUpload').addEventListener('cancel',()=>{schedulePermit=false});
 window.renderSchedulePage=render;
 window.seedSeasonSchedule?.();
 render();
 setInterval(()=>{if(document.visibilityState==='visible')render()},60000);
})();
