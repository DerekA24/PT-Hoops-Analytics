/* PT Basketball Analytics Hub: shared courtside release. Public shooting, secured coach edits. */
(()=>{'use strict';
 const base='https://jbznaeunhtqgagnqweqw.supabase.co';
 const endpoint=base+'/functions/v1/pt-hub';
 const page=location.pathname.split('/').pop()||'index.html';
 const fullPages=new Set(['leaderboards.html','other-leaderboards.html','team-profile.html']);
 const schedulePages=new Set(['live-game.html','schedule.html']);
 const playerPage=page==='player-profiles.html';
 const coachPage=page==='coach-review.html';
 const scope=()=>fullPages.has(page)?'full':coachPage&&window.PTCoachAccess?.isUnlocked()?'coach':page==='schedule.html'?'schedule-only':schedulePages.has(page)?'schedule':playerPage?'player':'entry';
 const shotIds=new Set(state.shooting.map(s=>s.id));
 const knownPlayers=new Set(state.players.map(p=>p.id));
 const pendingKey='pt_hub_pending_v1';
 let pending=[];try{pending=JSON.parse(localStorage.getItem(pendingKey)||'[]')}catch{}
 let roster=new Map(),drills=new Map(),cloudShots=new Map(),cloudDrillResults=new Set(),cloudSituationShots=new Map(),situationLoaded=page==='game-situation.html',situationSyncing=false,legacySituationMode=false,cloudSituationSignature='',cloudScheduleSignature='',busy=false,lastError='';
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const status=document.createElement('div');status.id='ptSharedStatus';status.setAttribute('role','status');status.textContent='Connecting shared team data…';
 if(!fullPages.has(page)&&!playerPage)status.hidden=true;
 document.querySelector('nav')?.insertAdjacentElement('afterend',status);
 const badge=document.getElementById('storageStatus');
 const label=(msg,error=false)=>{lastError=error?msg:'';status.textContent=msg;status.classList.toggle('pt-error',error);if(badge)badge.textContent=error?'Cloud save needs attention':'Shared team data · Supabase';};
 function request(action,method='GET',body=null,token='',query=''){
   return fetch(endpoint+'?action='+encodeURIComponent(action)+query,{method,headers:{'Content-Type':'application/json',...(token?{'X-Coach-Access-Code':token}:{}),...(body?.recorded_at?{}:{})},...(body?{body:JSON.stringify(body)}:{})}).then(async r=>{let v;try{v=await r.json()}catch{throw Error('Cloud service unavailable')}if(!r.ok)throw Error(v.error||'Cloud request failed');return v});
 }
 // Secure deletion bridge for Coach Review. Never claim success before Supabase confirms.
 window.ptCloudHasShot=(id)=>cloudShots.has(id);
 window.ptCoachDeleteShot=async(id)=>{
  if(!cloudShots.has(id)&&!state.shooting.some(s=>s.id===id&&s.source==='supabase'))return;
  const jwt=await token();
  await request('shot','DELETE',{id},jwt);
  cloudShots.delete(id);
  shotIds.delete(id);
  pending=pending.filter(x=>x!==id);
  remember();
  label('Coach deletion confirmed in Supabase');
 };
 const remember=()=>localStorage.setItem(pendingKey,JSON.stringify(pending));
 const validShot=s=>uuid.test(s.id)&&uuid.test(s.playerId)&&Number(s.attempts)===1&&(Number(s.makes)===0||Number(s.makes)===1);
 function noticeChanges(){
   const current=new Set(state.shooting.map(s=>s.id));
   for(const s of state.shooting){if(!shotIds.has(s.id)&&validShot(s)){pending.push(s.id);}}
   for(const id of Array.from(shotIds)){
     if(!current.has(id)&&cloudShots.has(id))coachMutation('DELETE',id);
   }
   for(const s of state.shooting){if(cloudShots.has(s.id)&&validShot(s)&&Number(s.makes)!==Number(cloudShots.get(s.id).made))coachMutation('PATCH',s.id,s.makes===1)}
   for(const result of state.drillResults||[])if(uuid.test(result.id)&&!cloudDrillResults.has(result.id)&&!pendingDrillResults.some(x=>x.id===result.id))pendingDrillResults.push(result);
   shotIds.clear();for(const id of current)shotIds.add(id);remember();
   if(pending.length)flush();
   if(pendingDrillResults.length)flushDrillResults();
   const scheduleSignature=JSON.stringify({schedule:state.schedule,games:state.games});
   if(scheduleSignature!==cloudScheduleSignature&&window.PTCoachAccess?.isUnlocked())syncSchedule(scheduleSignature);
   if(situationLoaded&&state.gameSituationShots.some(shot=>validSituationShot(shot)&&(!cloudSituationShots.has(shot.id)?!shot.undone:shot.undone&&!cloudSituationShots.get(shot.id))))syncGameSituationShots();
   if(legacySituationMode){const situations=state.gameSituations||[],signature=JSON.stringify(situations);if(signature!==cloudSituationSignature)syncLegacyGameSituations(situations,signature)}
   if(window.PTCoachAccess?.isUnlocked())for(const p of state.players){if(!knownPlayers.has(p.id)){knownPlayers.add(p.id);sendPlayer(p)}}
 }
 let debounce=null;window.ptCloudQueueSave=()=>{clearTimeout(debounce);debounce=setTimeout(noticeChanges,80)};
 let pendingDrillResults=[];try{const stored=JSON.parse(localStorage.getItem('pt_hub_pending_drill_results_v1')||'[]');pendingDrillResults=Array.isArray(stored)?stored.filter(x=>x&&typeof x==='object'&&uuid.test(x.id||'')):[]}catch{}
 const rememberDrillResults=()=>localStorage.setItem('pt_hub_pending_drill_results_v1',JSON.stringify(pendingDrillResults));
 async function flushDrillResults(){
  if(busy||!pendingDrillResults.length)return;
  busy=true;
  try{while(pendingDrillResults.length){
   const result=pendingDrillResults[0];
   await request('drill_result','POST',{id:result.id,batch_id:result.batchId,player_id:result.playerId,result:result.result,practice_date:result.date,recorded_at:result.recordedAt});
   cloudDrillResults.add(result.id);pendingDrillResults.shift();rememberDrillResults();
  }}catch(e){label('Drill result saved on this device. Cloud retry pending: '+e.message,true)}finally{busy=false;if(pendingDrillResults.length)setTimeout(flushDrillResults,1000)}
 }
 async function flush(){
   if(busy||!pending.length||!drills.size||!roster.size)return;
   busy=true;
   try{while(pending.length){const id=pending[0],s=state.shooting.find(x=>x.id===id);
      if(!s){pending.shift();remember();continue}
      if(!roster.has(s.playerId)){label('This athlete is not yet in the shared roster. Coach must add them to Supabase.',true);break}
      const drill=drills.get(String(s.type||'').toLowerCase());
      if(!drill){label(String(s.type||'This drill')+' needs database setup before it can sync. The shot is saved on this device.',true);break}
      await request('shot','POST',{id:s.id,player_id:s.playerId,drill_id:drill,made:Number(s.makes)===1,practice_date:s.date,recorded_at:s.recordedAt});
      cloudShots.set(s.id,{made:Number(s.makes)===1});pending.shift();remember();label('Shot saved to the shared team database');
   }}catch(e){label('Shot saved on this device. Cloud retry pending: '+e.message,true)}finally{busy=false}}
 const validSituationShot=shot=>uuid.test(shot.id)&&uuid.test(shot.playerId)&&/^\d{4}-\d{2}-\d{2}$/.test(shot.date||'')&&/^(TWO|THREE|FT)_[MX]$/.test(shot.type||'')&&Number.isInteger(shot.x)&&shot.x>=12&&shot.x<=488&&Number.isInteger(shot.y)&&shot.y>=12&&shot.y<=458&&Number.isFinite(Date.parse(shot.recordedAt));
 const legacySituationShot=(event,session)=>({id:event.id,playerId:event.playerId,date:session.date,type:event.type,x:event.x,y:event.y,recordedAt:event.recordedAt||session.createdAt||(session.date?session.date+'T12:00:00Z':''),undone:false});
 async function syncGameSituationShots(){
  if(situationSyncing)return;
  situationSyncing=true;let failed=false;
  try{
   for(const shot of state.gameSituationShots.slice()){
    if(!validSituationShot(shot))continue;
    if(!cloudSituationShots.has(shot.id)){
     if(shot.undone)continue;
     await request('game_situation_shot','POST',{id:shot.id,player_id:shot.playerId,practice_date:shot.date,shot_type:shot.type,court_x:shot.x,court_y:shot.y,recorded_at:shot.recordedAt});
     cloudSituationShots.set(shot.id,false);
    }
    if(shot.undone&&!cloudSituationShots.get(shot.id)){
     await request('game_situation_shot','PATCH',{id:shot.id,undone:true});
     cloudSituationShots.set(shot.id,true);
    }
   }
   label('Game situation shots saved to Supabase');
  }catch(e){failed=true;label('Game situation shots saved on this device. Cloud retry pending: '+e.message,true)}
  finally{situationSyncing=false;if(!failed)setTimeout(noticeChanges,0)}
 }
 async function load(){
  const selectedId=playerPage?(document.getElementById('profilePlayer')?.value||state.players[0]?.id||''):'';
  const currentScope=playerPage&&!uuid.test(selectedId)?'entry':scope();
  try{const data=await request('snapshot','GET',null,'','&scope='+currentScope+(currentScope==='player'?'&player_id='+encodeURIComponent(selectedId):''));let addedPlayers=0,addedShots=0,addedResults=0;
   roster=new Map(data.players.map(p=>[p.id,p]));drills=new Map(data.drills.map(d=>[d.name.toLowerCase(),d.id]));
   if((currentScope==='full'||currentScope==='schedule'||currentScope==='schedule-only')&&Array.isArray(data.scheduleRecords)){
    const remote=data.scheduleRecords.flatMap(record=>record.payload&&typeof record.payload==='object'?[record.payload]:[]);
    const remoteSchedule=remote.flatMap(record=>Array.isArray(record.schedule)?record.schedule:[]);
    const remoteGames=remote.flatMap(record=>Array.isArray(record.games)?record.games:[]);
    const mergeById=(local,shared)=>{const merged=new Map(local.filter(x=>x?.id).map(x=>[x.id,x]));for(const item of shared)if(item?.id)merged.set(item.id,item);return [...merged.values()]};
    const mergedSchedule=mergeById(state.schedule,remoteSchedule),mergedGames=mergeById(state.games,remoteGames);
    if(JSON.stringify(state.schedule)!==JSON.stringify(mergedSchedule)||JSON.stringify(state.games)!==JSON.stringify(mergedGames)){state.schedule=mergedSchedule;state.games=mergedGames;save();}
    cloudScheduleSignature=remote.length?JSON.stringify({schedule:remoteSchedule,games:remoteGames}):'';
   }
   let changedSituation=false;
   if((currentScope==='full'||currentScope==='player')&&Array.isArray(data.gameSituationShots)){
    legacySituationMode=false;
    const before=JSON.stringify({sessions:state.gameSituations,shots:state.gameSituationShots});
    const remoteShots=data.gameSituationShots.map(row=>({id:row.id,playerId:row.player_id,date:row.practice_date,type:row.shot_type,x:row.court_x,y:row.court_y,recordedAt:row.recorded_at,undone:row.undone===true}));
    cloudSituationShots=new Map(remoteShots.map(shot=>[shot.id,shot.undone]));
    const shots=new Map((state.gameSituationShots||[]).filter(shot=>shot?.id).map(shot=>[shot.id,shot]));
    for(const shot of remoteShots){const local=shots.get(shot.id);shots.set(shot.id,{...shot,undone:shot.undone||local?.undone===true})}
    const sessions=new Map((state.gameSituations||[]).filter(game=>game?.id).map(game=>[game.id,game]));
    for(const record of data.gameSituations||[])if(record.payload?.id&&!sessions.has(record.payload.id))sessions.set(record.payload.id,record.payload);
    for(const session of sessions.values()){
     for(const event of session.events||[]){if(!/^(TWO|THREE|FT)_[MX]$/.test(event.type||'')||shots.has(event.id))continue;const shot=legacySituationShot(event,session);if(validSituationShot(shot))shots.set(shot.id,shot)}
     const beforeUndo=(session.events||[]).length;
     session.events=(session.events||[]).filter(event=>!shots.get(event.id)?.undone);
     if(session.events.length!==beforeUndo){
      const points=event=>event.type==='TWO_M'?2:event.type==='THREE_M'?3:event.type==='FT_M'?1:0;
      session.teamScore=session.events.filter(event=>event.team!=='opponent').reduce((total,event)=>total+points(event),0);
      session.opponentScore=session.events.filter(event=>event.team==='opponent').reduce((total,event)=>total+points(event),0);
      session.oppScore=session.opponentScore;
     }
    }
    state.gameSituations=[...sessions.values()].sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date)));
    state.gameSituationShots=[...shots.values()];
    changedSituation=before!==JSON.stringify({sessions:state.gameSituations,shots:state.gameSituationShots});
    situationLoaded=true;
   }else if(Array.isArray(data.gameSituations)&&!data.scope){
    legacySituationMode=true;
    situationLoaded=false;
    const remote=data.gameSituations.map(record=>record.payload).filter(Boolean),sessions=new Map((state.gameSituations||[]).filter(game=>game?.id).map(game=>[game.id,game]));
    for(const game of remote)if(game.id&&!sessions.has(game.id))sessions.set(game.id,game);
    state.gameSituations=[...sessions.values()].sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date)));
    cloudSituationSignature=JSON.stringify(remote.sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date))));
   }
   state.drillResults=Array.isArray(state.drillResults)?state.drillResults:[];
   const existingResults=new Set((state.drillResults||[]).map(x=>x.id));
   for(const result of data.drillResults||[]){cloudDrillResults.add(result.id);if(!existingResults.has(result.id)){state.drillResults.push({id:result.id,batchId:result.batch_id,playerId:result.player_id,date:result.practice_date,result:result.result,recordedAt:result.recorded_at||result.created_at});existingResults.add(result.id);addedResults++}}
   const byId=new Map(data.drills.map(d=>[d.id,d.name]));const existingP=new Set(state.players.map(p=>p.id));
   for(const p of data.players){if(!existingP.has(p.id)){state.players.push({id:p.id,name:p.full_name,number:p.jersey_number||'',grade:p.grade||'',position:p.position||''});existingP.add(p.id);knownPlayers.add(p.id);addedPlayers++}}
   // Database is authoritative for previously shared shooting statistics.
   // One-time cleanup of stale on-device shooting totals after the coach's season reset.
   const seasonResetKey='pt_hub_season_reset_2026_10_30_v1';
   let removedShots=0;
   if((currentScope==='full'||currentScope==='coach')&&data.shots.length===0 && !localStorage.getItem(seasonResetKey)){
     removedShots=state.shooting.length;
     state.shooting=[];
     pending=[];
     remember();
     shotIds.clear();
     cloudShots.clear();
     localStorage.setItem(seasonResetKey,'done');
   }
   // Keep cloud-imported shots consistent with later coach deletions.
   const serverIds=new Set(data.shots.map(x=>x.id));
   const before=state.shooting.length;
   if(currentScope==='full'||currentScope==='coach')state.shooting=state.shooting.filter(x=>x.source!=='supabase'||serverIds.has(x.id));
   if(currentScope==='player')state.shooting=state.shooting.filter(x=>x.source!=='supabase'||x.playerId!==selectedId||serverIds.has(x.id));
   removedShots+=before-state.shooting.length;
   if(removedShots){shotIds.clear();for(const x of state.shooting)shotIds.add(x.id);}
   const existingS=new Set(state.shooting.map(s=>s.id));
   for(const x of data.shots){cloudShots.set(x.id,{made:x.made});if(!existingS.has(x.id)){const name=byId.get(x.drill_id)||'Custom Drill';state.shooting.push({id:x.id,playerId:x.player_id,type:name,drill:name,date:x.practice_date,makes:x.made?1:0,attempts:1,recordedAt:x.created_at,source:'supabase'});existingS.add(x.id);shotIds.add(x.id);addedShots++}}
   if(addedPlayers||addedShots||addedResults||removedShots||changedSituation)save();
   if(playerPage&&currentScope==='entry'&&addedPlayers)setTimeout(load,0);
   if(!lastError&&(!status.hidden||currentScope==='full'))label('Shared database connected · '+data.players.length+' athletes · '+data.shots.length+' shots'+(addedPlayers||addedShots?' · refreshed':''));
   noticeChanges();
  }catch(e){label('Shared data unavailable. Local recording continues; cloud sync will retry: '+e.message,true)}
 }
 async function syncSchedule(signature){
  try{await request('schedule_sync','POST',{id:'00000000-0000-0000-0000-000000000001',schedule:state.schedule,games:state.games},await token());cloudScheduleSignature=signature;label('Schedule saved to Supabase')}catch(e){label('Schedule cloud save failed: '+e.message,true)}
 }
 async function syncLegacyGameSituations(situations,signature){
  try{for(const game of situations){if(!uuid.test(game.id))continue;await request('game_situation','POST',{id:game.id,practice_date:game.date,payload:game})}cloudSituationSignature=signature;label('Game situation data saved to Supabase')}catch(e){label('Game situation cloud save failed: '+e.message,true)}
 }
 // Coach Review's access-code gate is the only coach sign-in step.
 async function token(){
  const code=window.PTCoachAccess?.cloudCredential();
  if(!code)throw Error('Unlock Coach Review with the coach access code first');
  return code;
 }
 window.addEventListener('pt-coach-unlocked',async()=>{
  for(const p of state.players)if(!roster.has(p.id)&&uuid.test(p.id))await sendPlayer(p);
  await load();
 });
 async function sendPlayer(p){try{if(!uuid.test(p.id))throw Error('Player ID is not a UUID');await request('player','POST',{id:p.id,full_name:p.name,jersey_number:p.number||null,grade:p.grade,position:p.position},await token());roster.set(p.id,p);label('Roster saved to Supabase')}catch(e){label('Roster cloud save failed: '+e.message,true)}}
 async function coachMutation(method,id,made){try{await request('shot',method,{id,...(method==='PATCH'?{made}:{})},await token());if(method==='PATCH')cloudShots.set(id,{made});else cloudShots.delete(id);label('Coach correction saved to Supabase')}catch(e){label('Coach correction not synchronized: '+e.message,true)}}
 if(playerPage)document.getElementById('profilePlayer')?.addEventListener('change',()=>load());
 load();setInterval(()=>{if(document.visibilityState==='visible'){noticeChanges();load()}},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){noticeChanges();load()}});
})();
