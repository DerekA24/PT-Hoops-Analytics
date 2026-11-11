/* PT Basketball Analytics Hub: shared courtside release. Public shooting, secured coach edits. */
(()=>{'use strict';
 const base='https://jbznaeunhtqgagnqweqw.supabase.co';
 const endpoint=base+'/functions/v1/pt-hub';
 const REQUEST_TIMEOUT_MS=20000,MASS_DELETE_LIMIT=10,RETRY_BASE_MS=1000,RETRY_MAX_MS=60000,DEFAULT_NOTE='Public courtside entry';
 const page=location.pathname.split('/').pop()||'index.html';
 const fullPages=new Set(['leaderboards.html','other-leaderboards.html','team-profile.html']);
 const schedulePages=new Set(['live-game.html','schedule.html']);
 const playerPage=page==='player-profiles.html';
 const coachPage=page==='coach-review.html';
 const situationPage=page==='game-situation.html';
 const scope=()=>fullPages.has(page)?'full':coachPage&&window.PTCoachAccess?.isUnlocked()?'coach':page==='schedule.html'?'schedule-only':schedulePages.has(page)?'schedule':playerPage?'player':situationPage?'situation':'entry';
 const shotIds=new Set(state.shooting.map(s=>s.id));
 const knownPlayers=new Set(state.players.map(p=>p.id));
 const pendingKey='pt_hub_pending_v1',rejectedKey='pt_hub_rejected_v1',cloudPlayersKey='pt_hub_cloud_players_v1',pendingResultsKey='pt_hub_pending_drill_results_v1';
 const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}};
 const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
 let pending=readJson(pendingKey,[]).filter(id=>typeof id==='string');
 let rejected=readJson(rejectedKey,[]).filter(x=>x&&typeof x==='object'&&typeof x.id==='string');
 let cloudPlayerIds=new Set(readJson(cloudPlayersKey,[]).filter(id=>typeof id==='string'));
 let roster=new Map(),drills=new Map(),cloudShots=new Map(),cloudDrillResults=new Set(),cloudSituationShots=new Map(),situationLoaded=false,situationSyncing=false,legacySituationMode=false,cloudSituationSignature='',cloudScheduleSignature='',scheduleLoaded=false,busy=false,lastError='',resultRetryDelay=RETRY_BASE_MS,resultRetryTimer=null;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const status=document.createElement('div');status.id='ptSharedStatus';status.setAttribute('role','status');status.textContent='Connecting shared team data…';
 if(!fullPages.has(page)&&!playerPage)status.hidden=true;
 document.querySelector('nav')?.insertAdjacentElement('afterend',status);
 const badge=document.getElementById('storageStatus');
 const label=(msg,error=false)=>{lastError=error?msg:'';status.textContent=msg;status.classList.toggle('pt-error',error);if(badge)badge.textContent=error?'Cloud save needs attention':'Shared team data · Supabase';};
 const remember=()=>writeJson(pendingKey,pending);
 const rememberRejected=()=>writeJson(rejectedKey,rejected);
 const persist=()=>{if(typeof window.ptPersistState==='function')window.ptPersistState()};
 const credential=()=>window.PTCoachAccess?.cloudCredential()||'';
 const isClientError=e=>Number.isInteger(e?.status)&&e.status>=400&&e.status<500&&e.status!==429;
 function request(action,method='GET',body=null,token='',query=''){
   const controller=typeof AbortController==='function'?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS):null;
   return fetch(endpoint+'?action='+encodeURIComponent(action)+query,{method,...(controller?{signal:controller.signal}:{}),headers:{'Content-Type':'application/json',...(token?{'X-Coach-Access-Code':token}:{})},...(body?{body:JSON.stringify(body)}:{})})
    .then(async r=>{let v;try{v=await r.json()}catch{throw Error('Cloud service unavailable')}if(!r.ok){const err=Error(v.error||'Cloud request failed');err.status=r.status;throw err}return v})
    .catch(e=>{if(e?.name==='AbortError')throw Error('Cloud request timed out');throw e})
    .finally(()=>clearTimeout(timer));
 }
 window.ptCloudStatus=()=>({error:lastError,pending:pending.length+pendingDrillResults.length,rejected:rejected.length});
 window.ptCloudHasShot=(id)=>cloudShots.has(id);
 // Called after a backup import or cross-tab state swap so id changes are not mistaken for coach deletions.
 window.ptCloudResync=()=>{shotIds.clear();for(const s of state.shooting)shotIds.add(s.id);knownPlayers.clear();for(const p of state.players)knownPlayers.add(p.id);pending=pending.filter(id=>shotIds.has(id));remember()};
 // Secure deletion bridge for Coach Review. Never claim success before Supabase confirms.
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
 window.ptCloudSendPlayer=(p)=>window.PTCoachAccess?.isUnlocked()?sendPlayer(p):Promise.resolve();
 window.ptCloudDeactivatePlayer=async(p)=>{if(!window.PTCoachAccess?.isUnlocked()||!uuid.test(p?.id||''))return;try{await request('player','POST',{id:p.id,full_name:p.name,jersey_number:p.number||null,grade:p.grade,position:p.position,active:false},await token());roster.delete(p.id);cloudPlayerIds.delete(p.id);writeJson(cloudPlayersKey,[...cloudPlayerIds]);label('Player removed from the shared roster')}catch(e){label('Player removal not synchronized: '+e.message,true)}};
 window.ptCloudChangeCoachCode=(current,next)=>request('coach_code','POST',{code:next},current);
 const validShot=s=>uuid.test(s.id)&&uuid.test(s.playerId)&&Number(s.attempts)===1&&(Number(s.makes)===0||Number(s.makes)===1);
 function noticeChanges(){
   const current=new Set(state.shooting.map(s=>s.id)),rejectedIds=new Set(rejected.map(x=>x.id));
   for(const s of state.shooting){if(!shotIds.has(s.id)&&validShot(s)&&!rejectedIds.has(s.id)&&!pending.includes(s.id))pending.push(s.id)}
   const vanished=Array.from(shotIds).filter(id=>!current.has(id)&&cloudShots.has(id));
   if(vanished.length>MASS_DELETE_LIMIT)label(vanished.length+' shared shots disappeared from this device at once. Cloud copies were kept; use Coach Review to delete individual shots.',true);
   else for(const id of vanished)removeShot(id);
   for(const s of state.shooting){if(s.dirty&&cloudShots.has(s.id)&&validShot(s)&&Number(s.makes)!==Number(cloudShots.get(s.id).made))coachMutation('PATCH',s,s.makes===1)}
   for(const result of state.drillResults||[])if(uuid.test(result.id)&&!cloudDrillResults.has(result.id)&&!pendingDrillResults.some(x=>x.id===result.id)&&!rejectedIds.has(result.id))pendingDrillResults.push(result);
   shotIds.clear();for(const id of current)shotIds.add(id);remember();
   if(pending.length)flush();
   if(pendingDrillResults.length)flushDrillResults();
   const scheduleSignature=JSON.stringify({schedule:state.schedule,games:state.games});
   if(scheduleLoaded&&scheduleSignature!==cloudScheduleSignature&&window.PTCoachAccess?.isUnlocked())syncSchedule(scheduleSignature);
   if(situationLoaded&&state.gameSituationShots.some(shot=>validSituationShot(shot)&&(!cloudSituationShots.has(shot.id)?!shot.undone:shot.undone&&!cloudSituationShots.get(shot.id))))syncGameSituationShots();
   if(legacySituationMode){const situations=state.gameSituations||[],signature=JSON.stringify(situations);if(signature!==cloudSituationSignature)syncLegacyGameSituations(situations,signature)}
   if(window.PTCoachAccess?.isUnlocked())for(const p of state.players){if(!knownPlayers.has(p.id)){knownPlayers.add(p.id);sendPlayer(p)}}
 }
 let debounce=null;window.ptCloudQueueSave=()=>{clearTimeout(debounce);debounce=setTimeout(noticeChanges,80)};
 let pendingDrillResults=readJson(pendingResultsKey,[]).filter(x=>x&&typeof x==='object'&&uuid.test(x.id||''));
 const rememberDrillResults=()=>writeJson(pendingResultsKey,pendingDrillResults);
 const reject=(id,reason)=>{rejected.push({id,reason,at:new Date().toISOString()});rememberRejected()};
 async function flushDrillResults(){
  if(busy||!pendingDrillResults.length)return;
  busy=true;clearTimeout(resultRetryTimer);let retry=false;
  try{while(pendingDrillResults.length){
   const result=pendingDrillResults[0];
   try{await request('drill_result','POST',{id:result.id,batch_id:result.batchId,player_id:result.playerId,result:result.result,practice_date:result.date,recorded_at:result.recordedAt})}
   catch(e){if(!isClientError(e))throw e;reject(result.id,e.message);pendingDrillResults.shift();rememberDrillResults();label('A drill result was rejected by the shared database: '+e.message,true);continue}
   cloudDrillResults.add(result.id);pendingDrillResults.shift();rememberDrillResults();resultRetryDelay=RETRY_BASE_MS;
  }}catch(e){retry=true;label('Drill result saved on this device. Cloud retry pending: '+e.message,true)}
  finally{busy=false;if(retry&&pendingDrillResults.length){resultRetryTimer=setTimeout(flushDrillResults,resultRetryDelay);resultRetryDelay=Math.min(RETRY_MAX_MS,resultRetryDelay*2)}}
 }
 // Shots that cannot sync yet (unknown roster or drill) are skipped, never allowed to block the shots behind them.
 async function flush(){
   if(busy||!pending.length||!drills.size||!roster.size)return;
   busy=true;
   try{let index=0,blocked='';
    while(index<pending.length){const id=pending[index],s=state.shooting.find(x=>x.id===id);
      if(!s){pending.splice(index,1);remember();continue}
      if(!roster.has(s.playerId)){blocked='This athlete is not yet in the shared roster. Coach must add them to Supabase.';index++;continue}
      const drill=drills.get(String(s.type||'').toLowerCase());
      if(!drill){blocked=String(s.type||'This drill')+' needs database setup before it can sync. The shot is saved on this device.';index++;continue}
      const customLabel=/^custom drill$/i.test(String(s.type||''))&&s.drill&&s.drill!=='Athlete Quick Entry'?String(s.drill):'';
      try{await request('shot','POST',{id:s.id,player_id:s.playerId,drill_id:drill,made:Number(s.makes)===1,practice_date:s.date,recorded_at:s.recordedAt,...(customLabel?{label:customLabel}:{})})}
      catch(e){if(!isClientError(e))throw e;reject(s.id,e.message);pending.splice(index,1);remember();label('A shot was rejected by the shared database: '+e.message,true);continue}
      cloudShots.set(s.id,{made:Number(s.makes)===1});pending.splice(index,1);remember();label('Shot saved to the shared team database');
    }
    if(blocked)label(blocked,true);
   }catch(e){label('Shot saved on this device. Cloud retry pending: '+e.message,true)}finally{busy=false}}
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
     try{await request('game_situation_shot','POST',{id:shot.id,player_id:shot.playerId,practice_date:shot.date,shot_type:shot.type,court_x:shot.x,court_y:shot.y,recorded_at:shot.recordedAt})}
     catch(e){if(!isClientError(e))throw e;reject(shot.id,e.message);cloudSituationShots.set(shot.id,true);label('A game situation shot was rejected by the shared database: '+e.message,true);continue}
     cloudSituationShots.set(shot.id,false);
    }
    if(shot.undone&&!cloudSituationShots.get(shot.id)){
     try{await request('game_situation_shot','PATCH',{id:shot.id,undone:true},credential())}
     catch(e){if(!isClientError(e))throw e;label('Undo could not be shared: '+e.message,true)}
     cloudSituationShots.set(shot.id,true);
    }
   }
   if(!lastError)label('Game situation shots saved to Supabase');
  }catch(e){failed=true;label('Game situation shots saved on this device. Cloud retry pending: '+e.message,true)}
  finally{situationSyncing=false;if(!failed)setTimeout(noticeChanges,0)}
 }
 // Prefer whichever copy of a game carries more recorded events, then the newer edit. Live events must never be erased by a stale schedule copy.
 const pickGame=(local,remote)=>{const le=Array.isArray(local.events)?local.events.length:0,re=Array.isArray(remote.events)?remote.events.length:0;if(le!==re)return le>re?local:remote;const lu=Date.parse(local.updatedAt||'')||0,ru=Date.parse(remote.updatedAt||'')||0;return lu>ru?local:remote};
 const mergeById=(local,shared,pick=(a,b)=>b)=>{const merged=new Map(local.filter(x=>x?.id).map(x=>[x.id,x]));for(const item of shared)if(item?.id)merged.set(item.id,merged.has(item.id)?pick(merged.get(item.id),item):item);return [...merged.values()]};
 window.ptCloudMergeGames=(local,shared)=>mergeById(local,shared,pickGame);
 async function load(){
  const selectedId=playerPage?(document.getElementById('profilePlayer')?.value||state.players[0]?.id||''):'';
  const currentScope=playerPage&&!uuid.test(selectedId)?'entry':scope();
  try{const data=await request('snapshot','GET',null,'','&scope='+currentScope+(currentScope==='player'?'&player_id='+encodeURIComponent(selectedId):''));let addedPlayers=0,addedShots=0,addedResults=0,changedShots=0;
   roster=new Map(data.players.map(p=>[p.id,p]));drills=new Map(data.drills.map(d=>[d.name.toLowerCase(),d.id]));
   if((currentScope==='full'||currentScope==='coach'||currentScope==='schedule'||currentScope==='schedule-only')&&Array.isArray(data.scheduleRecords)){
    const remote=data.scheduleRecords.flatMap(record=>record.payload&&typeof record.payload==='object'?[record.payload]:[]);
    const remoteSchedule=remote.flatMap(record=>Array.isArray(record.schedule)?record.schedule:[]);
    const remoteGames=remote.flatMap(record=>Array.isArray(record.games)?record.games:[]);
    const mergedSchedule=mergeById(state.schedule,remoteSchedule),mergedGames=mergeById(state.games,remoteGames,pickGame);
    if(JSON.stringify(state.schedule)!==JSON.stringify(mergedSchedule)||JSON.stringify(state.games)!==JSON.stringify(mergedGames)){state.schedule=mergedSchedule;state.games=mergedGames;save();}
    cloudScheduleSignature=remote.length?JSON.stringify({schedule:remoteSchedule,games:remoteGames}):'';
    scheduleLoaded=true;
   }
   let changedSituation=false;
   if((currentScope==='full'||currentScope==='player'||currentScope==='situation')&&Array.isArray(data.gameSituationShots)){
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
   const byId=new Map(data.drills.map(d=>[d.id,d.name]));
   // The shared roster is authoritative for players it already knows: pull field edits, and drop players a coach deactivated elsewhere.
   const remoteIds=new Set(data.players.map(p=>p.id));let changedPlayers=0;
   if(currentScope!=='schedule-only'){
    const removed=state.players.filter(p=>cloudPlayerIds.has(p.id)&&!remoteIds.has(p.id));
    if(removed.length&&removed.length<=MASS_DELETE_LIMIT){state.players=state.players.filter(p=>!removed.some(r=>r.id===p.id));for(const p of removed){cloudPlayerIds.delete(p.id);knownPlayers.delete(p.id)}changedPlayers+=removed.length}
   }
   const existingP=new Map(state.players.map(p=>[p.id,p]));
   for(const p of data.players){
    const fields={name:p.full_name,number:p.jersey_number??'',grade:p.grade||'',position:p.position||''};
    const local=existingP.get(p.id);
    if(!local){state.players.push({id:p.id,...fields});existingP.set(p.id,fields);knownPlayers.add(p.id);addedPlayers++}
    else if(Object.keys(fields).some(k=>String(local[k]??'')!==String(fields[k]??''))&&!local.dirty){Object.assign(local,fields);changedPlayers++}
    cloudPlayerIds.add(p.id);
   }
   writeJson(cloudPlayersKey,[...cloudPlayerIds]);
   // Database is authoritative for previously shared shooting statistics.
   // One-time cleanup of stale on-device shooting totals after the coach's season reset. Shots still waiting to upload are kept.
   const seasonResetKey='pt_hub_season_reset_2026_10_30_v1';
   let removedShots=0;
   if((currentScope==='full'||currentScope==='coach')&&data.shots.length===0 && !localStorage.getItem(seasonResetKey)){
     const keep=new Set(pending);
     const kept=state.shooting.filter(s=>keep.has(s.id));
     removedShots=state.shooting.length-kept.length;
     state.shooting=kept;
     shotIds.clear();for(const s of kept)shotIds.add(s.id);
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
   const existingS=new Map(state.shooting.map(s=>[s.id,s]));
   for(const x of data.shots){
    cloudShots.set(x.id,{made:x.made});
    const name=byId.get(x.drill_id)||'Custom Drill',labelText=x.notes&&x.notes!==DEFAULT_NOTE?x.notes:name;
    const local=existingS.get(x.id);
    if(!local){const record={id:x.id,playerId:x.player_id,type:name,drill:labelText,date:x.practice_date,makes:x.made?1:0,attempts:1,recordedAt:x.created_at,source:'supabase'};state.shooting.push(record);existingS.set(x.id,record);shotIds.add(x.id);addedShots++;continue}
    // Pull corrections made on other devices unless this device holds an unsent edit.
    if(!local.dirty&&Number(local.attempts)===1&&Number(local.makes)!==(x.made?1:0)){local.makes=x.made?1:0;changedShots++}
   }
   if(addedPlayers||changedPlayers||addedShots||changedShots||addedResults||removedShots||changedSituation)save();
   if(playerPage&&currentScope==='entry'&&addedPlayers)setTimeout(load,0);
   if(!lastError&&(!status.hidden||currentScope==='full'))label('Shared database connected · '+data.players.length+' athletes · '+data.shots.length+' shots'+(addedPlayers||addedShots||changedShots?' · refreshed':''));
   noticeChanges();
  }catch(e){label('Shared data unavailable. Local recording continues; cloud sync will retry: '+e.message,true)}
 }
 async function syncSchedule(signature){
  try{await request('schedule_sync','POST',{schedule:state.schedule,games:state.games},await token());cloudScheduleSignature=signature;label('Schedule saved to Supabase')}catch(e){label('Schedule cloud save failed: '+e.message,true)}
 }
 async function syncLegacyGameSituations(situations,signature){
  try{for(const game of situations){if(!uuid.test(game.id))continue;await request('game_situation','POST',{id:game.id,practice_date:game.date,payload:game})}cloudSituationSignature=signature;label('Game situation data saved to Supabase')}catch(e){label('Game situation cloud save failed: '+e.message,true)}
 }
 // Coach Review's access-code gate is the only coach sign-in step.
 async function token(){
  const code=credential();
  if(!code)throw Error('Unlock Coach Review with the coach access code first');
  return code;
 }
 window.addEventListener('pt-coach-unlocked',async()=>{
  for(const p of state.players)if(!roster.has(p.id)&&uuid.test(p.id))await sendPlayer(p);
  await load();
 });
 async function sendPlayer(p){try{if(!uuid.test(p.id))throw Error('Player ID is not a UUID');await request('player','POST',{id:p.id,full_name:p.name,jersey_number:p.number===''?null:p.number,grade:p.grade,position:p.position},await token());roster.set(p.id,p);cloudPlayerIds.add(p.id);writeJson(cloudPlayersKey,[...cloudPlayerIds]);if(p.dirty){delete p.dirty;persist()}label('Roster saved to Supabase')}catch(e){label('Roster cloud save failed: '+e.message,true)}}
 async function coachMutation(method,shot,made){try{await request('shot',method,{id:shot.id,...(method==='PATCH'?{made}:{})},await token());if(method==='PATCH'){cloudShots.set(shot.id,{made});delete shot.dirty;persist()}else cloudShots.delete(shot.id);label('Coach correction saved to Supabase')}catch(e){label('Coach correction not synchronized: '+e.message,true)}}
 // Shots removed on this device are removed from the cloud too. Without a coach code the server only honours recent entries (athlete Undo).
 async function removeShot(id){try{await request('shot','DELETE',{id},credential());cloudShots.delete(id);label('Shot removed from the shared team database')}catch(e){if(isClientError(e)){cloudShots.delete(id);label('Shot stays in the shared database: '+e.message+' Ask a coach to remove it in Coach Review.',true)}else label('Shot removal not synchronized: '+e.message,true)}}
 if(playerPage)document.getElementById('profilePlayer')?.addEventListener('change',()=>load());
 load();setInterval(()=>{if(document.visibilityState==='visible'){noticeChanges();load()}},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){noticeChanges();load()}});
})();
