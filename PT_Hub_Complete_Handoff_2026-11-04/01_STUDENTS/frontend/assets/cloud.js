/* PT Basketball Analytics Hub: shared courtside release. Public shooting, secured coach edits. */
(()=>{'use strict';
 const base='https://jbznaeunhtqgagnqweqw.supabase.co';
 const endpoint=base+'/functions/v1/pt-hub';
 const REQUEST_TIMEOUT_MS=20000,MASS_DELETE_LIMIT=10,RETRY_BASE_MS=1000,RETRY_MAX_MS=60000,DEFAULT_NOTE='Public courtside entry';
 // One upload carries up to MAX_BATCH records, and a screen wake only refetches when the last snapshot is older than REFRESH_MIN_GAP_MS.
 const MAX_BATCH=100,REFRESH_MIN_GAP_MS=20000;
 // Vercel serves clean URLs, so /leaderboards is leaderboards.html. Every page check below keys on the file name.
 const page=(()=>{const last=location.pathname.split('/').pop()||'index.html';return last.includes('.')?last:last+'.html'})();
 const fullPages=new Set(['leaderboards.html','other-leaderboards.html','team-profile.html']);
 const schedulePages=new Set(['live-game.html','schedule.html']);
 const playerPage=page==='player-profiles.html';
 const coachPage=page==='coach-review.html';
 const situationPage=page==='game-situation.html';
 const scope=()=>fullPages.has(page)?'full':coachPage&&window.PTCoachAccess?.isUnlocked()?'coach':page==='schedule.html'?'schedule-only':schedulePages.has(page)?'schedule':playerPage?'player':situationPage?'situation':'entry';
 const shotIds=new Set(state.shooting.map(s=>s.id));
 const knownPlayers=new Set(state.players.map(p=>p.id));
 const pendingKey='pt_hub_pending_v1',rejectedKey='pt_hub_rejected_v1',cloudPlayersKey='pt_hub_cloud_players_v1',pendingResultsKey='pt_hub_pending_drill_results_v1',tokensKey='pt_hub_owner_tokens_v1',deviceKey='pt_hub_device_v1',cloudResultsKey='pt_hub_cloud_drill_results_v1',MAX_OWNER_TOKENS=5000,MAX_REMEMBERED_RESULTS=5000,TRANSIENT_REJECTION_LIMIT=20;
 const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}};
 const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
 let pending=readJson(pendingKey,[]).filter(id=>typeof id==='string');
 let rejected=readJson(rejectedKey,[]).filter(x=>x&&typeof x==='object'&&typeof x.id==='string');
 let cloudPlayerIds=new Set(readJson(cloudPlayersKey,[]).filter(id=>typeof id==='string'));
 // Each uploaded shot carries a random owner token so this device, and only this device, can undo it without a coach code.
 let ownerTokens=readJson(tokensKey,{});if(!ownerTokens||typeof ownerTokens!=='object'||Array.isArray(ownerTokens))ownerTokens={};
 const randomToken=()=>{const bytes=new Uint8Array(24);if(typeof crypto!=='undefined'&&crypto.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.random()*256|0;return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};
 // The server rate-limits per device id instead of per network address, so a gym full of phones on one Wi-Fi network no longer shares one budget.
 const deviceId=(()=>{let saved=null;try{saved=localStorage.getItem(deviceKey)}catch{}if(typeof saved==='string'&&/^[0-9a-f]{32}$/.test(saved))return saved;const fresh=randomToken().slice(0,32);try{localStorage.setItem(deviceKey,fresh)}catch{}return fresh})();
 const rememberTokens=()=>{const keys=Object.keys(ownerTokens);if(keys.length>MAX_OWNER_TOKENS)for(const key of keys.slice(0,keys.length-MAX_OWNER_TOKENS))delete ownerTokens[key];writeJson(tokensKey,ownerTokens)};
 const ownerToken=id=>{if(!ownerTokens[id]){ownerTokens[id]=randomToken();rememberTokens()}return ownerTokens[id]};
 const forgetToken=id=>{if(ownerTokens[id]){delete ownerTokens[id];rememberTokens()}};
 // Drill results already in the shared database are remembered on the device, so a reload does not re-send the season.
 let roster=new Map(),drills=new Map(),cloudShots=new Map(),cloudDrillResults=new Set(readJson(cloudResultsKey,[]).filter(id=>typeof id==='string')),cloudSituationShots=new Map(),situationLoaded=false,situationSyncing=false,legacySituationMode=false,cloudSituationSignature='',cloudScheduleSignature='',scheduleLoaded=false,scheduleSyncing=false,queuedScheduleSignature='',liveGameSyncTimer=null,liveGameSyncBusy=false,queuedLiveGame=null,liveGameRetryDelay=RETRY_BASE_MS,busy=false,lastError='',resultRetryDelay=RETRY_BASE_MS,resultRetryTimer=null,shotRetryDelay=RETRY_BASE_MS,shotRetryTimer=null,lastLoadAt=0;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const status=document.createElement('div');status.id='ptSharedStatus';status.setAttribute('role','status');status.textContent='Connecting shared team data…';
 if(!fullPages.has(page)&&!playerPage&&page!=='live-game.html')status.hidden=true;
 document.querySelector('nav')?.insertAdjacentElement('afterend',status);
 const badge=document.getElementById('storageStatus');
 const label=(msg,error=false)=>{lastError=error?msg:'';status.textContent=msg;status.classList.toggle('pt-error',error);if(badge)badge.textContent=error?'Cloud save needs attention':'Shared team data · Supabase';};
 // A queue that cannot be written to storage is the one failure a reload would hide, so it stays reported until a write succeeds.
 const STORAGE_FAILURE='This device could not save its sync queue. Keep this page open until the shots upload.';
 let storageFailed=false;
 const remember=()=>{storageFailed=!writeJson(pendingKey,pending);if(storageFailed)label(STORAGE_FAILURE,true)};
 const rememberRejected=()=>writeJson(rejectedKey,rejected);
 const rememberCloudResults=()=>writeJson(cloudResultsKey,[...cloudDrillResults].slice(-MAX_REMEMBERED_RESULTS));
 // Ids this tab itself queued. Ids another tab queued stay in the shared list untouched, since only that tab holds the shot.
 const queuedHere=new Set();
 // Shots undone while their upload was in flight: removed from the cloud as soon as the upload lands.
 const inFlight=new Set(),undoAfterUpload=new Set();
 const transientRejections=new Map();
 window.addEventListener('storage',e=>{if(!e||typeof e.key!=='string')return;if(e.key===pendingKey)pending=readJson(pendingKey,[]).filter(id=>typeof id==='string');if(e.key===rejectedKey)rejected=readJson(rejectedKey,[]).filter(x=>x&&typeof x==='object'&&typeof x.id==='string');if(e.key===cloudResultsKey)for(const id of readJson(cloudResultsKey,[]))if(typeof id==='string')cloudDrillResults.add(id);if(e.key===tokensKey){const fresh=readJson(tokensKey,{});if(fresh&&typeof fresh==='object'&&!Array.isArray(fresh))ownerTokens={...fresh,...ownerTokens}}});
 const persist=()=>{if(typeof window.ptPersistState==='function')window.ptPersistState()};
 const credential=()=>window.PTCoachAccess?.cloudCredential()||'';
 const isClientError=e=>Number.isInteger(e?.status)&&e.status>=400&&e.status<500&&e.status!==429;
 function request(action,method='GET',body=null,token='',query=''){
   const controller=typeof AbortController==='function'?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS):null;
   return fetch(endpoint+'?action='+encodeURIComponent(action)+query,{method,...(controller?{signal:controller.signal}:{}),headers:{'Content-Type':'application/json','X-PT-Device':deviceId,...(token?{'X-Coach-Access-Code':token}:{})},...(body?{body:JSON.stringify(body)}:{})})
    .then(async r=>{let v;try{v=await r.json()}catch{throw Error('Cloud service unavailable')}if(!r.ok){const err=Error(v.error||'Cloud request failed');err.status=r.status;throw err}return v})
    .catch(e=>{if(e?.name==='AbortError')throw Error('Cloud request timed out');throw e})
    .finally(()=>clearTimeout(timer));
 }
 window.ptCloudStatus=()=>({error:storageFailed?STORAGE_FAILURE:lastError,pending:pending.length+pendingDrillResults.length,rejected:rejected.length});
 window.ptCloudHasShot=(id)=>cloudShots.has(id);
 // Called after a backup import or cross-tab state swap so id changes are not mistaken for coach deletions.
 window.ptCloudResync=()=>{shotIds.clear();for(const s of state.shooting)shotIds.add(s.id);knownPlayers.clear();for(const p of state.players)knownPlayers.add(p.id);pending=pending.filter(id=>shotIds.has(id));remember()};
 // Secure deletion bridge for Coach Review. Never claim success before Supabase confirms.
 window.ptCoachDeleteShot=async(id)=>{
  if(!cloudShots.has(id)&&!state.shooting.some(s=>s.id===id&&s.source==='supabase'))return;
  const jwt=await token();
  await request('shot','DELETE',{id},jwt);
  cloudShots.delete(id);forgetToken(id);
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
   for(const s of state.shooting){if(!shotIds.has(s.id)&&validShot(s)&&!rejectedIds.has(s.id)&&!pending.includes(s.id)){pending.push(s.id);queuedHere.add(s.id)}}
   const vanished=Array.from(shotIds).filter(id=>!current.has(id)&&(cloudShots.has(id)||inFlight.has(id)));
   if(vanished.length>MASS_DELETE_LIMIT)label(vanished.length+' shared shots disappeared from this device at once. Cloud copies were kept; use Coach Review to delete individual shots.',true);
   else for(const id of vanished){if(inFlight.has(id)&&!cloudShots.has(id))undoAfterUpload.add(id);else removeShot(id)}
   for(const s of state.shooting){if(s.dirty&&cloudShots.has(s.id)&&validShot(s)&&Number(s.makes)!==Number(cloudShots.get(s.id).made))coachMutation('PATCH',s,s.makes===1)}
   for(const result of state.drillResults||[])if(uuid.test(result.id)&&!cloudDrillResults.has(result.id)&&!pendingDrillResults.some(x=>x.id===result.id)&&!rejectedIds.has(result.id))pendingDrillResults.push(result);
   shotIds.clear();for(const id of current)shotIds.add(id);remember();
   if(pending.length)flush();
   if(pendingDrillResults.length)flushDrillResults();
   const scheduleSignature=JSON.stringify({schedule:state.schedule,games:state.games});
   if(scheduleLoaded&&scheduleSignature!==cloudScheduleSignature&&page!=='live-game.html'&&window.PTCoachAccess?.isUnlocked())syncSchedule(scheduleSignature);
   if(situationLoaded&&state.gameSituationShots.some(shot=>validSituationShot(shot)&&(!cloudSituationShots.has(shot.id)?!shot.undone:shot.undone&&!cloudSituationShots.get(shot.id))))syncGameSituationShots();
   if(legacySituationMode){const situations=state.gameSituations||[],signature=JSON.stringify(situations);if(signature!==cloudSituationSignature)syncLegacyGameSituations(situations,signature)}
   if(window.PTCoachAccess?.isUnlocked())for(const p of state.players){if(!knownPlayers.has(p.id)){knownPlayers.add(p.id);sendPlayer(p)}}
 }
 let debounce=null;window.ptCloudQueueSave=()=>{clearTimeout(debounce);debounce=setTimeout(noticeChanges,80)};
 let pendingDrillResults=readJson(pendingResultsKey,[]).filter(x=>x&&typeof x==='object'&&uuid.test(x.id||''));
 const rememberDrillResults=()=>writeJson(pendingResultsKey,pendingDrillResults);
 const reject=(id,reason)=>{rejected=rejected.filter(item=>item.id!==id);rejected.push({id,reason,at:new Date().toISOString()});rememberRejected()};
 const clearRejection=id=>{const remaining=rejected.filter(item=>item.id!==id);if(remaining.length!==rejected.length){rejected=remaining;rememberRejected()}};
 // A batch reply names what was saved and what was refused. Anything the server did not mention stays queued and is sent again; uploads are idempotent by id.
 // Only the server's per-record verdicts count as rejections. A failure of the whole request (old function, origin, outage) keeps every record queued.
 // 'Unknown player or drill' usually means this phone's roster is older than the coach's last edit, so those records wait for the next snapshot instead of being set aside. After many tries they are set aside for real.
 const isTransient=item=>/unknown player|unknown drill/i.test(String(item?.error||''));
 const settleBatch=(reply,ids)=>{const saved=new Set((Array.isArray(reply?.saved)?reply.saved:[]).filter(id=>ids.has(id)));const named=(Array.isArray(reply?.rejected)?reply.rejected:[]).filter(item=>item&&ids.has(item.id));const refused=[],waiting=[];for(const item of named){const tries=(transientRejections.get(item.id)||0)+1;if(isTransient(item)&&tries<TRANSIENT_REJECTION_LIMIT){transientRejections.set(item.id,tries);waiting.push(item)}else{transientRejections.delete(item.id);refused.push(item)}}for(const item of refused)reject(item.id,String(item.error||'Rejected by the shared database'));const done=new Set([...saved,...refused.map(item=>item.id)]);if(!done.size&&!waiting.length)throw Error('The shared database did not confirm the upload');return {saved,refused,waiting,done}};
 const batchLabel=(kind,refused,waiting=[])=>refused.length?label(refused.length+' '+kind+(refused.length===1?' was':' were')+' rejected by the shared database: '+String(refused[0].error||''),true):waiting.length?label(waiting.length+' '+kind+(waiting.length===1?' is':' are')+' waiting for the shared roster to update. Saved on this device.',true):label(kind.charAt(0).toUpperCase()+kind.slice(1)+' saved to the shared team database');
 async function flushDrillResults(){
  if(busy||!pendingDrillResults.length)return;
  busy=true;clearTimeout(resultRetryTimer);let retry=false;
  try{while(pendingDrillResults.length){
   const batch=pendingDrillResults.slice(0,MAX_BATCH),ids=new Set(batch.map(r=>r.id));
   const results=batch.map(r=>({id:r.id,batch_id:r.batchId,player_id:r.playerId,result:r.result,practice_date:r.date,recorded_at:r.recordedAt}));
   const {saved,refused,waiting,done}=settleBatch(await request('drill_results','POST',{results}),ids);
   for(const id of saved)cloudDrillResults.add(id);rememberCloudResults();
   for(const id of saved)clearRejection(id);
   pendingDrillResults=pendingDrillResults.filter(r=>!done.has(r.id));rememberDrillResults();resultRetryDelay=RETRY_BASE_MS;
   batchLabel('drill results',refused,waiting);
   if(waiting.length)break;
  }}catch(e){retry=true;label('Drill result saved on this device. Cloud retry pending: '+e.message,true)}
  finally{busy=false;if(retry&&pendingDrillResults.length){resultRetryTimer=setTimeout(flushDrillResults,resultRetryDelay);resultRetryDelay=Math.min(RETRY_MAX_MS,resultRetryDelay*2)}if(pending.length)setTimeout(flush,0)}
 }
 const shotPayload=(s,drill)=>{const customLabel=/^custom drill$/i.test(String(s.type||''))&&s.drill&&s.drill!=='Athlete Quick Entry'?String(s.drill):'';return {id:s.id,player_id:s.playerId,drill_id:drill,made:Number(s.makes)===1,practice_date:s.date,recorded_at:s.recordedAt,owner_token:ownerToken(s.id),...(customLabel?{label:customLabel}:{})}};
 // Shots that cannot sync yet (unknown roster or drill) are skipped, never allowed to block the shots behind them.
 function readyShots(){
   const ready=[],keep=[];let blocked='';
   for(const id of pending){const s=state.shooting.find(x=>x.id===id);
     if(!s){if(!queuedHere.has(id))keep.push(id);continue}
     keep.push(id);
     if(!roster.has(s.playerId)){blocked='This athlete is not yet in the shared roster. Coach must add them to Supabase.';continue}
     const drill=drills.get(String(s.type||'').toLowerCase());
     if(!drill){blocked=String(s.type||'This drill')+' needs database setup before it can sync. The shot is saved on this device.';continue}
     ready.push(shotPayload(s,drill));
   }
   if(keep.length!==pending.length){pending=keep;remember()}
   return {ready,blocked};
 }
 // Every shot waiting on this device travels in one request, so a full gym tapping at once stays far below the shared write budget.
 async function flush(){
   if(busy||!pending.length||!drills.size||!roster.size)return;
   busy=true;clearTimeout(shotRetryTimer);let retry=false;
   try{
    const {ready,blocked}=readyShots();
    for(let start=0;start<ready.length;start+=MAX_BATCH){
      const batch=ready.slice(start,start+MAX_BATCH),ids=new Set(batch.map(s=>s.id));
      for(const id of ids)inFlight.add(id);
      let settled;
      try{settled=settleBatch(await request('shots','POST',{shots:batch}),ids)}finally{for(const id of ids)inFlight.delete(id)}
      const {saved,refused,waiting,done}=settled;
      for(const s of batch)if(saved.has(s.id))cloudShots.set(s.id,{made:s.made});
      pending=pending.filter(id=>!done.has(id));remember();shotRetryDelay=RETRY_BASE_MS;
      for(const id of saved)if(undoAfterUpload.has(id)){undoAfterUpload.delete(id);removeShot(id)}
      batchLabel(batch.length===1?'shot':'shots',refused,waiting);
      if(waiting.length)break;
    }
    if(blocked)label(blocked,true);
    if(readyShots().ready.length)retry=true;
   }catch(e){retry=true;label('Shot saved on this device. Cloud retry pending: '+e.message,true)}
   finally{busy=false;if(retry&&pending.length){shotRetryTimer=setTimeout(flush,shotRetryDelay);shotRetryDelay=Math.min(RETRY_MAX_MS,shotRetryDelay*2)}if(pendingDrillResults.length)setTimeout(flushDrillResults,0)}
 }
 const validSituationShot=shot=>uuid.test(shot.id)&&uuid.test(shot.playerId)&&/^\d{4}-\d{2}-\d{2}$/.test(shot.date||'')&&(/^(TWO|THREE|FT)_[MX]$/.test(shot.type||'')||['REB','DRB','ORB','TO','DRAW_FOUL'].includes(shot.type))&&Number.isInteger(shot.x)&&shot.x>=12&&shot.x<=488&&Number.isInteger(shot.y)&&shot.y>=12&&shot.y<=458&&Number.isFinite(Date.parse(shot.recordedAt));
 const legacySituationShot=(event,session)=>({id:event.id,playerId:event.playerId,date:session.date,type:event.type,x:event.x,y:event.y,recordedAt:event.recordedAt||session.createdAt||(session.date?session.date+'T12:00:00Z':''),undone:false});
 async function syncGameSituationShots(){
  if(situationSyncing)return;
  situationSyncing=true;let failed=false,waitingForRoster=false,permanentRejection=false;
  try{
   for(const shot of state.gameSituationShots.slice()){
    if(!validSituationShot(shot))continue;
    if(!cloudSituationShots.has(shot.id)){
     if(shot.undone)continue;
     const payload={id:shot.id,player_id:shot.playerId,practice_date:shot.date,shot_type:shot.type,court_x:shot.x,court_y:shot.y,recorded_at:shot.recordedAt,owner_token:ownerToken(shot.id)};
     try{await request('game_situation_shot','POST',payload)}
     catch(e){
      if(!isClientError(e))throw e;
      // Older deployed functions know REB but not DRB. Keep the local DRB event,
      // and store its identical event ID as legacy REB until the function is updated.
      if(shot.type==='DRB'){
       try{await request('game_situation_shot','POST',{...payload,shot_type:'REB'});cloudSituationShots.set(shot.id,false);clearRejection(shot.id);continue}
       catch(fallbackError){if(!isClientError(fallbackError))throw fallbackError;e=fallbackError}
      }
      // Keep new Draw Foul events queued if the database migration or function
      // has not reached the server yet. Never turn them into another stat.
      if(shot.type==='DRAW_FOUL')throw e;
      if(/unknown player/i.test(e.message)){
       waitingForRoster=true;cloudSituationShots.set(shot.id,true);label('Game Situation shot is waiting for the player to return to the shared roster. Saved on this device.',true);continue;
      }
      permanentRejection=true;
      reject(shot.id,e.message);cloudSituationShots.set(shot.id,true);label('A game situation shot was rejected by the shared database: '+e.message,true);continue;
     }
     cloudSituationShots.set(shot.id,false);clearRejection(shot.id);
    }
    if(shot.undone&&!cloudSituationShots.get(shot.id)){
     const code=credential();
     if(!code&&!ownerTokens[shot.id]){label('This shot was recorded on another device. A coach can undo it from Coach Review.',true);cloudSituationShots.set(shot.id,true);continue}
     try{await request('game_situation_shot','PATCH',{id:shot.id,undone:true,...(code?{}:{owner_token:ownerTokens[shot.id]})},code)}
     catch(e){if(!isClientError(e))throw e;label('Undo could not be shared: '+e.message,true)}
     cloudSituationShots.set(shot.id,true);
    }
   }
   if(!waitingForRoster&&!permanentRejection)label('Game situation shots saved to Supabase');
  }catch(e){failed=true;label('Game situation shots saved on this device. Cloud retry pending: '+e.message,true)}
  finally{situationSyncing=false;setTimeout(noticeChanges,failed?RETRY_MAX_MS:0)}
 }
 // Prefer the newest game edit. Event count alone cannot resolve an undo: an
 // intentionally emptied local event list must beat an older cloud snapshot.
 const pickGame=(local,remote)=>{const lu=Date.parse(local.updatedAt||'')||0,ru=Date.parse(remote.updatedAt||'')||0;if(lu!==ru)return lu>ru?local:remote;const le=Array.isArray(local.events)?local.events.length:0,re=Array.isArray(remote.events)?remote.events.length:0;return le>re?local:remote};
 const mergeById=(local,shared,pick=(a,b)=>b)=>{const merged=new Map(local.filter(x=>x?.id).map(x=>[x.id,x]));for(const item of shared)if(item?.id)merged.set(item.id,merged.has(item.id)?pick(merged.get(item.id),item):item);return [...merged.values()]};
 window.ptCloudMergeGames=(local,shared)=>mergeById(local,shared,pickGame);
 async function load(){
  lastLoadAt=Date.now();
  const selectedId=playerPage?(document.getElementById('profilePlayer')?.value||state.players[0]?.id||''):'';
  const currentScope=playerPage&&!uuid.test(selectedId)?'entry':scope();
  try{const data=await request('snapshot','GET',null,'','&scope='+currentScope+(currentScope==='player'?'&player_id='+encodeURIComponent(selectedId):''));let addedPlayers=0,addedShots=0,addedResults=0,changedShots=0;
   roster=new Map(data.players.map(p=>[p.id,p]));drills=new Map(data.drills.map(d=>[d.name.toLowerCase(),d.id]));
   // Recover drill results parked after an "Unknown player" rejection once
   // their same player ID returns in the active Supabase roster.
   const activePlayerIds=new Set(roster.keys()),recoveredResults=new Set((state.drillResults||[]).filter(result=>activePlayerIds.has(result.playerId)&&rejected.some(item=>item.id===result.id&&/unknown player/i.test(item.reason||''))).map(result=>result.id));
   if(recoveredResults.size){
    rejected=rejected.filter(item=>!recoveredResults.has(item.id));rememberRejected();
    const queuedIds=new Set(pendingDrillResults.map(result=>result.id));
    for(const result of state.drillResults||[])if(recoveredResults.has(result.id)&&!queuedIds.has(result.id))pendingDrillResults.push(result);
    for(const id of recoveredResults)transientRejections.delete(id);
    rememberDrillResults();
   }
   if(playerPage&&currentScope==='player'&&Array.isArray(data.playerGames)&&document.getElementById('profilePlayer')?.value===selectedId){
    window.ptPlayerGameSnapshot={playerId:selectedId,games:data.playerGames};
    renderProfile();
   }
   if((currentScope==='full'||currentScope==='coach'||currentScope==='schedule'||currentScope==='schedule-only')&&Array.isArray(data.scheduleRecords)){
    const remote=data.scheduleRecords.flatMap(record=>record.payload&&typeof record.payload==='object'?[record.payload]:[]);
    const remoteSchedule=remote.flatMap(record=>Array.isArray(record.schedule)?record.schedule:[]);
    const remoteGames=remote.flatMap(record=>Array.isArray(record.games)?record.games:[]);
    const localGames=page==='live-game.html'?state.games.filter(game=>game.updatedAt):[];
    const mergedSchedule=mergeById(state.schedule,remoteSchedule),mergedGames=mergeById(state.games,remoteGames,pickGame);
    if(JSON.stringify(state.schedule)!==JSON.stringify(mergedSchedule)||JSON.stringify(state.games)!==JSON.stringify(mergedGames)){state.schedule=mergedSchedule;state.games=mergedGames;save();}
    cloudScheduleSignature=remote.length?JSON.stringify({schedule:remoteSchedule,games:remoteGames}):'';
    scheduleLoaded=true;
    if(page==='live-game.html')for(const game of localGames){const shared=remoteGames.find(item=>item.id===game.id||item.scheduleId&&item.scheduleId===game.scheduleId);if(!shared||(Date.parse(game.updatedAt)||0)>(Date.parse(shared.updatedAt)||0))window.ptCloudQueueLiveGameSave?.(game)}
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
     for(const event of session.events||[]){if(!validSituationShot(legacySituationShot(event,session))||shots.has(event.id))continue;shots.set(event.id,legacySituationShot(event,session))}
     const beforeUndo=(session.events||[]).length;
     session.events=(session.events||[]).filter(event=>!shots.get(event.id)?.undone);
     if(session.events.length!==beforeUndo){
      const points=event=>event.type==='TWO_M'?2:event.type==='THREE_M'?3:event.type==='FT_M'?1:0;
      const lastReset=session.events.findLastIndex(event=>event.type==='RESET_SCORE');
      const scoringEvents=session.events.slice(lastReset+1);
      session.teamScore=scoringEvents.filter(event=>event.team!=='opponent').reduce((total,event)=>total+points(event),0);
      session.opponentScore=scoringEvents.filter(event=>event.team==='opponent').reduce((total,event)=>total+points(event),0);
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
   if((data.drillResults||[]).length)setTimeout(rememberCloudResults,0);
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
  }catch{label('Shared data unavailable. Saving on this device and retrying.',true)}
 }
 async function syncSchedule(signature){
  if(scheduleSyncing){queuedScheduleSignature=signature;return}
  scheduleSyncing=true;
  try{await request('schedule_sync','POST',{schedule:state.schedule,games:state.games},await token());cloudScheduleSignature=signature;label('Schedule saved to Supabase')}catch(e){label('Schedule cloud save failed: '+e.message,true)}
  finally{scheduleSyncing=false;const next=queuedScheduleSignature;queuedScheduleSignature='';if(next&&next!==cloudScheduleSignature)syncSchedule(next)}
 }
 async function syncLiveGame(){
  if(liveGameSyncBusy||page!=='live-game.html'||!queuedLiveGame)return;
  liveGameSyncTimer=null;
  liveGameSyncBusy=true;const game=queuedLiveGame;queuedLiveGame=null;
  try{await request('live_game_sync','POST',{game});liveGameRetryDelay=RETRY_BASE_MS;label('Live Game saved to Supabase')}
  catch(e){if(!queuedLiveGame)queuedLiveGame=game;const message=/coach access required/i.test(e.message)?'The deployed Supabase function is outdated. Deploy the current pt-hub function; Live Game saves do not need coach access.':'Live Game saved on this device. Supabase retry pending: '+e.message;label(message,true);clearTimeout(liveGameSyncTimer);liveGameSyncTimer=setTimeout(syncLiveGame,liveGameRetryDelay);liveGameRetryDelay=Math.min(RETRY_MAX_MS,liveGameRetryDelay*2)}
  finally{liveGameSyncBusy=false;if(queuedLiveGame&&liveGameSyncTimer===null)liveGameSyncTimer=setTimeout(syncLiveGame,0)}
 }
 window.ptCloudQueueLiveGameSave=game=>{if(page!=='live-game.html'||!game?.scheduleId)return;try{queuedLiveGame=JSON.parse(JSON.stringify(game))}catch{return}clearTimeout(liveGameSyncTimer);liveGameSyncTimer=setTimeout(syncLiveGame,120)};
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
 async function removeShot(id){const code=credential();if(!code&&!ownerTokens[id]){cloudShots.delete(id);label('That shot was recorded on another device, so it stays in the shared database. A coach can remove it in Coach Review.',true);return}try{await request('shot','DELETE',{id,...(code?{}:{owner_token:ownerTokens[id]})},code);cloudShots.delete(id);forgetToken(id);label('Shot removed from the shared team database')}catch(e){if(isClientError(e)){cloudShots.delete(id);label('Shot stays in the shared database: '+e.message+' Ask a coach to remove it in Coach Review.',true)}else label('Shot removal not synchronized: '+e.message,true)}}
 if(playerPage)document.getElementById('profilePlayer')?.addEventListener('change',()=>load());
 load();setInterval(()=>{if(document.visibilityState==='visible'){noticeChanges();load()}},60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')return;noticeChanges();if(Date.now()-lastLoadAt>=REFRESH_MIN_GAP_MS)load()});
})();
