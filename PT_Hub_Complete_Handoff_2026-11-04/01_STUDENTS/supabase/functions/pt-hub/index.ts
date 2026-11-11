import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const url=Deno.env.get("SUPABASE_URL")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,secret,{auth:{persistSession:false}});
const SHOT_TYPES=["TWO_M","TWO_X","THREE_M","THREE_X","FT_M","FT_X"];
const SCHEDULE_RECORD_ID="00000000-0000-0000-0000-000000000001";
const DAY_MS=864e5,DATE_WINDOW_MS=366*DAY_MS,FUTURE_SLACK_MS=DAY_MS;
const PUBLIC_UNDO_WINDOW_MS=24*36e5,PUBLIC_SHOT_DELETE_WINDOW_MS=15*6e4;
const MAX_PAGES=100,PAGE_SIZE=1000,MAX_PAYLOAD_CHARS=200000,MAX_SCHEDULE_ITEMS=400,MAX_ACTIVE_PLAYERS=150,MAX_LABEL_CHARS=80;
const MIN_CODE_LENGTH=6,MAX_CODE_LENGTH=64,LIMIT_GET=120,LIMIT_WRITE=80,LIMIT_GLOBAL_WRITE=600;
const DEFAULT_NOTE="Public courtside entry";
const allowedOrigin=(origin:string|null)=>{
 if(origin==="https://ptbasketballhub.netlify.app")return origin;
 if(origin?.startsWith("https://")&&origin.endsWith(".vercel.app"))return origin;
 if(origin==="http://localhost:8000"||origin==="http://127.0.0.1:8000")return origin;
 return null;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS_HEADERS={"Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info,x-coach-access-code","Vary":"Origin"};
function reply(v:unknown,s=200,origin:string|null=null){return new Response(JSON.stringify(v),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...CORS_HEADERS,...(origin?{"Access-Control-Allow-Origin":origin}:{})}})}
const str=(v:unknown)=>typeof v==="string"?v:"";
const isoDate=(s:unknown):s is string=>{if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const t=Date.parse(s+"T00:00:00Z");return Number.isFinite(t)&&new Date(t).toISOString().startsWith(s)&&Math.abs(t-Date.now())<DATE_WINDOW_MS};
const isoStamp=(s:unknown):s is string=>{if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(s))return false;const t=Date.parse(s);return Number.isFinite(t)&&t>Date.now()-DATE_WINDOW_MS&&t<Date.now()+FUTURE_SLACK_MS};
const stamp=(s:string)=>new Date(Math.min(Date.parse(s),Date.now())).toISOString();
const courtPoint=(x:unknown,y:unknown)=>Number.isInteger(x)&&(x as number)>=12&&(x as number)<=488&&Number.isInteger(y)&&(y as number)>=12&&(y as number)<=458;
const tokenOk=(t:unknown):t is string=>typeof t==="string"&&/^[A-Za-z0-9_-]{16,128}$/.test(t);
const ownerHash=(t:string)=>sha256("pt-hub-owner:"+t);
const sameHash=(a:string,b:string)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0};
async function sha256(text:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("")}
async function activePlayer(id:string){const {data}=await db.from("pt_players").select("id").eq("id",id).eq("active",true).maybeSingle();return !!data}
async function activePlayers(ids:string[]){if(!ids.length)return new Set<string>();const {data}=await db.from("pt_players").select("id").in("id",ids).eq("active",true);return new Set((data||[]).map(row=>row.id as string))}
type ShotSnapshotRow={id:string;player_id:string;drill_id:string;made:boolean;practice_date:string;created_at:string;notes:string|null};
type SituationShotRow={id:string;player_id:string;practice_date:string;shot_type:string;court_x:number|null;court_y:number|null;recorded_at:string;undone:boolean};
async function fetchAll<T>(table:string,columns:string,orderBy:string,playerId?:string){
 const rows:T[]=[];
 for(let page=0;page<MAX_PAGES;page++){
  const offset=page*PAGE_SIZE;
  let query=db.from(table).select(columns);
  if(playerId)query=query.eq("player_id",playerId);
  const {data,error}=await query.order(orderBy,{ascending:false}).order("id",{ascending:false}).range(offset,offset+PAGE_SIZE-1);
  if(error)return {data:null,error};
  rows.push(...((data||[]) as unknown as T[]));
  if(!data||data.length<PAGE_SIZE)break;
 }
 return {data:rows,error:null};
}
const fetchAllShots=(playerId?:string)=>fetchAll<ShotSnapshotRow>("pt_shots","id,player_id,drill_id,made,practice_date,created_at,notes","created_at",playerId);
const fetchAllSituationShots=(playerId?:string)=>fetchAll<SituationShotRow>("pt_game_situation_shots","id,player_id,practice_date,shot_type,court_x,court_y,recorded_at,undone","recorded_at",playerId);
type CoachCheck={error:string;status:number}|null;
const hasCoachCredential=(req:Request)=>!!(req.headers.get("authorization")||req.headers.get("x-coach-access-code"));
// Coach writes accept either a Supabase coach session or the shared access code. The code row is seeded by migration; requests never create it.
async function verifyCoach(req:Request):Promise<CoachCheck>{
 const bearer=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
 if(bearer){
  const {data:{user},error:authError}=await db.auth.getUser(bearer);
  if(authError||!user)return {error:"Coach session invalid",status:401};
  const {data:coach}=await db.from("pt_coaches").select("user_id").eq("user_id",user.id).maybeSingle();
  return coach?null:{error:"Coach permission required",status:403};
 }
 const code=req.headers.get("x-coach-access-code")?.trim()||"";
 if(!code)return {error:"Coach access required",status:401};
 const {data:configured,error:accessError}=await db.from("pt_coach_access").select("code_hash").eq("id","primary").maybeSingle();
 if(accessError)return {error:"Coach access unavailable",status:500};
 let storedHash=configured?.code_hash as string|undefined;
 if(!storedHash){
  // First use on a fresh project: the operator-provided secret seeds the row. Requests never choose the code.
  const initial=Deno.env.get("PT_COACH_INITIAL_CODE")?.trim()||"";
  if(initial.length<MIN_CODE_LENGTH)return {error:"Coach access is not configured. Set the PT_COACH_INITIAL_CODE function secret.",status:503};
  const {error}=await db.from("pt_coach_access").upsert({id:"primary",code_hash:await sha256(initial)},{onConflict:"id",ignoreDuplicates:true});
  if(error)return {error:"Coach access could not be initialized",status:500};
  const {data:seeded}=await db.from("pt_coach_access").select("code_hash").eq("id","primary").maybeSingle();
  storedHash=seeded?.code_hash;
  if(!storedHash)return {error:"Coach access could not be initialized",status:500};
 }
 return sameHash(storedHash,await sha256(code))?null:{error:"Coach access denied",status:403};
}
Deno.serve(async req=>{
 const origin=allowedOrigin(req.headers.get("origin"));
 if(req.method==="OPTIONS")return origin?new Response(null,{status:204,headers:{...CORS_HEADERS,"Access-Control-Allow-Origin":origin,"Access-Control-Max-Age":"86400"}}):new Response(null,{status:403});
 if(!origin)return reply({error:"Origin not allowed"},403);
 const ok=(v:unknown,s=200)=>reply(v,s,origin),fail=(m:string,c=400)=>reply({error:m},c,origin);
 const action=new URL(req.url).searchParams.get("action");
 try{
 const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
 const bucket=(await sha256("pt-hub-v1:"+ip)).slice(0,32);
 const write=req.method!=="GET";
 const [own,shared]=await Promise.all([
  db.rpc("pt_hub_allow_request",{p_bucket:bucket+":"+req.method,p_limit:write?LIMIT_WRITE:LIMIT_GET}),
  write?db.rpc("pt_hub_allow_request",{p_bucket:"global:write",p_limit:LIMIT_GLOBAL_WRITE}):Promise.resolve({data:true,error:null})]);
 if(own.error||!own.data||shared.error||!shared.data)return fail("Rate limit reached",429);
 if(req.method==="GET"&&action==="snapshot"){
 const params=new URL(req.url).searchParams;
 const scope=params.get("scope")||"full",playerId=params.get("player_id")||"";
 if(!["full","coach","player","schedule","schedule-only","entry","situation"].includes(scope)||scope==="player"&&!uuid.test(playerId))return fail("Invalid snapshot scope");
 const full=scope==="full",coach=scope==="coach",player=scope==="player",schedule=scope==="schedule"||scope==="schedule-only",situation=scope==="situation";
 const empty=<T>()=>Promise.resolve({data:[] as T[],error:null});
 const [p,d,s,r,sc,g,gs]=await Promise.all([
 scope==="schedule-only"?empty():db.from("pt_players").select("id,full_name,jersey_number,grade,position,active").eq("active",true).order("full_name").limit(250),
 schedule?empty():db.from("pt_drills").select("id,name,active").eq("active",true).limit(250),
 full||coach||player?fetchAllShots(player?playerId:undefined):empty<ShotSnapshotRow>(),
 full||coach?db.from("pt_drill_results").select("id,batch_id,player_id,result,practice_date,recorded_at,created_at").order("recorded_at",{ascending:false}).limit(10000):empty(),
 full||coach||schedule?db.from("pt_schedule_records").select("id,payload,updated_at").order("updated_at",{ascending:false}).limit(10):empty(),
 full?db.from("pt_game_situations").select("id,practice_date,payload,updated_at").order("created_at",{ascending:false}).limit(10000):empty(),
 full||player||situation?fetchAllSituationShots(player?playerId:undefined):empty<SituationShotRow>()]);
 if(p.error||d.error||s.error||r.error||sc.error||g.error||gs.error)return fail("Shared data unavailable",500);
 return ok({scope,players:p.data,drills:d.data,shots:s.data,drillResults:r.data,scheduleRecords:sc.data,gameSituations:g.data,gameSituationShots:gs.data});
 }
 if(!["POST","PATCH","DELETE"].includes(req.method))return fail("Unknown operation",404);
 let body:Record<string,unknown>;
 try{const parsed:unknown=await req.json();if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return fail("Invalid body");body=parsed as Record<string,unknown>}catch{return fail("Invalid JSON body")}
 const id=str(body.id);
 if(req.method==="POST"&&action==="shot"){
 if(!uuid.test(id)||!uuid.test(str(body.player_id))||!uuid.test(str(body.drill_id))||typeof body.made!=="boolean"||!isoDate(body.practice_date))return fail("Invalid shooting data");
 if(body.recorded_at!==undefined&&!isoStamp(body.recorded_at))return fail("Invalid recording timestamp");
 if(body.label!==undefined&&typeof body.label!=="string")return fail("Invalid drill label");
 const [p,d]=await Promise.all([activePlayer(str(body.player_id)),db.from("pt_drills").select("id").eq("id",str(body.drill_id)).eq("active",true).maybeSingle()]);
 if(!p||!d.data)return fail("Unknown player or drill",403);
 const label=str(body.label).trim().slice(0,MAX_LABEL_CHARS);
 const {error}=await db.from("pt_shots").upsert({id,player_id:body.player_id,drill_id:body.drill_id,made:body.made,practice_date:body.practice_date,entered_by:null,notes:label||DEFAULT_NOTE,owner_token_hash:tokenOk(body.owner_token)?await ownerHash(body.owner_token):null,...(isoStamp(body.recorded_at)?{created_at:stamp(body.recorded_at)}:{})},{onConflict:"id",ignoreDuplicates:true});
 return error?fail("Shot could not be saved",500):ok({ok:true,id});
 }
 if(req.method==="POST"&&action==="drill_result"){
 if(!uuid.test(id)||!uuid.test(str(body.batch_id))||!uuid.test(str(body.player_id))||!["win","loss"].includes(str(body.result))||!isoDate(body.practice_date)||!isoStamp(body.recorded_at))return fail("Invalid drill result");
 if(!await activePlayer(str(body.player_id)))return fail("Unknown player",403);
 const {error}=await db.from("pt_drill_results").upsert({id,batch_id:body.batch_id,player_id:body.player_id,result:body.result,practice_date:body.practice_date,recorded_at:stamp(body.recorded_at)},{onConflict:"id",ignoreDuplicates:true});
 return error?fail("Drill result could not be saved",500):ok({ok:true,id});
 }
 if(action==="game_situation_shot"&&req.method==="POST"){
  if(!uuid.test(id)||!uuid.test(str(body.player_id))||!isoDate(body.practice_date)||!SHOT_TYPES.includes(str(body.shot_type))||!isoStamp(body.recorded_at)||!courtPoint(body.court_x,body.court_y))return fail("Invalid game situation shot");
  if(!await activePlayer(str(body.player_id)))return fail("Unknown player",403);
  const {error}=await db.from("pt_game_situation_shots").upsert({id,player_id:body.player_id,practice_date:body.practice_date,shot_type:body.shot_type,court_x:body.court_x,court_y:body.court_y,recorded_at:stamp(body.recorded_at),owner_token_hash:tokenOk(body.owner_token)?await ownerHash(body.owner_token):null},{onConflict:"id",ignoreDuplicates:true});
  return error?fail("Game situation shot could not be saved",500):ok({ok:true,id});
 }
 // Anonymous undo covers the courtside case: the caller must hold the owner token issued when the shot was uploaded, and the shot must be recent. A coach credential removes both limits.
 if(action==="game_situation_shot"&&req.method==="PATCH"){
  if(!uuid.test(id)||body.undone!==true)return fail("Invalid undo request");
  let query=db.from("pt_game_situation_shots").update({undone:true}).eq("id",id);
  if(hasCoachCredential(req)){const denied=await verifyCoach(req);if(denied)return fail(denied.error,denied.status)}
  else{if(!tokenOk(body.owner_token))return fail("Coach access required",401);query=query.eq("owner_token_hash",await ownerHash(body.owner_token)).gte("recorded_at",new Date(Date.now()-PUBLIC_UNDO_WINDOW_MS).toISOString())}
  const {data,error}=await query.select("id").maybeSingle();
  return error?fail("Game situation undo could not be saved",500):data?ok({ok:true,id}):fail("Shot not found or undo window closed",404);
 }
 if(req.method==="DELETE"&&action==="shot"){
  if(!uuid.test(id))return fail("Invalid record");
  let query=db.from("pt_shots").delete().eq("id",id);
  if(hasCoachCredential(req)){const denied=await verifyCoach(req);if(denied)return fail(denied.error,denied.status)}
  else{if(!tokenOk(body.owner_token))return fail("Coach access required",401);query=query.eq("owner_token_hash",await ownerHash(body.owner_token)).gte("created_at",new Date(Date.now()-PUBLIC_SHOT_DELETE_WINDOW_MS).toISOString())}
  const {data,error}=await query.select("id").maybeSingle();
  return error?fail("Removal failed",500):data?ok({ok:true}):fail("Shot not found or undo window closed",404);
 }
 // Legacy session endpoint, kept insert-only for browser tabs that predate per-shot storage. It never overwrites an existing session.
 if(req.method==="POST"&&action==="game_situation"){
  if(!uuid.test(id)||!isoDate(body.practice_date)||!body.payload||typeof body.payload!=="object"||Array.isArray(body.payload))return fail("Invalid game situation");
  const payload=body.payload as Record<string,unknown>;
  if(JSON.stringify(payload).length>MAX_PAYLOAD_CHARS)return fail("Game situation is too large",413);
  const {error}=await db.from("pt_game_situations").upsert({id,practice_date:body.practice_date,payload},{onConflict:"id",ignoreDuplicates:true});
  if(error)return fail("Game situation could not be saved",500);
  const events=(Array.isArray(payload.events)?payload.events:[]) as Record<string,unknown>[];
  const candidates=events.filter(event=>uuid.test(str(event.id))&&uuid.test(str(event.playerId))&&SHOT_TYPES.includes(str(event.type))&&courtPoint(event.x,event.y)&&isoStamp(event.recordedAt));
  const known=await activePlayers([...new Set(candidates.map(event=>str(event.playerId)))]);
  const shots=candidates.filter(event=>known.has(str(event.playerId))).map(event=>({id:event.id,player_id:event.playerId,practice_date:body.practice_date,shot_type:event.type,court_x:event.x,court_y:event.y,recorded_at:stamp(str(event.recordedAt))}));
  if(shots.length){const {error:shotError}=await db.from("pt_game_situation_shots").upsert(shots,{onConflict:"id",ignoreDuplicates:true});if(shotError)return fail("Legacy shots could not be copied",500)}
  return ok({ok:true,id});
 }
 const denied=await verifyCoach(req);
 if(denied)return fail(denied.error,denied.status);
 if(req.method==="POST"&&action==="coach_code"){
  const code=str(body.code).trim();
  if(code.length<MIN_CODE_LENGTH||code.length>MAX_CODE_LENGTH)return fail("New code must be "+MIN_CODE_LENGTH+" to "+MAX_CODE_LENGTH+" characters");
  const {error}=await db.from("pt_coach_access").update({code_hash:await sha256(code),updated_at:new Date().toISOString()}).eq("id","primary");
  return error?fail("Coach code could not be changed",500):ok({ok:true});
 }
 if(req.method==="POST"&&action==="schedule_sync"){
  if(!Array.isArray(body.schedule)||!Array.isArray(body.games))return fail("Invalid schedule");
  if(body.schedule.length>MAX_SCHEDULE_ITEMS||body.games.length>MAX_SCHEDULE_ITEMS)return fail("Schedule has too many entries",413);
  const payload={schedule:body.schedule,games:body.games};
  if(JSON.stringify(payload).length>MAX_PAYLOAD_CHARS*5)return fail("Schedule is too large",413);
  const {error}=await db.from("pt_schedule_records").upsert({id:SCHEDULE_RECORD_ID,payload,updated_at:new Date().toISOString()},{onConflict:"id"});
  return error?fail("Schedule could not be saved",500):ok({ok:true,id:SCHEDULE_RECORD_ID});
 }
 if(req.method==="POST"&&action==="player"){
 const fullName=str(body.full_name).trim();
 if(!uuid.test(id)||fullName.length<2||fullName.length>90)return fail("Invalid player");
 const jerseyRaw=body.jersey_number;
 const jersey=jerseyRaw===null||jerseyRaw===undefined||jerseyRaw===""?null:Number(jerseyRaw);
 if(jersey!==null&&!(Number.isInteger(jersey)&&jersey>=0&&jersey<=99))return fail("Invalid jersey number");
 if(body.grade!==undefined&&typeof body.grade!=="string"||body.position!==undefined&&typeof body.position!=="string")return fail("Invalid player details");
 const active=body.active!==false;
 const existing=await db.from("pt_players").select("id").eq("id",id).maybeSingle();
 if(!existing.data&&active){
  const {count}=await db.from("pt_players").select("id",{count:"exact",head:true}).eq("active",true);
  if((count||0)>=MAX_ACTIVE_PLAYERS)return fail("Roster is full. Deactivate players before adding more.",409);
 }
 const {error}=await db.from("pt_players").upsert({id,full_name:fullName,jersey_number:jersey,grade:str(body.grade).slice(0,40),position:str(body.position).slice(0,40),active},{onConflict:"id"});
 return error?fail("Roster update failed",500):ok({ok:true});
 }
 if(req.method==="PATCH"&&action==="shot"){
 if(!uuid.test(id)||typeof body.made!=="boolean")return fail("Invalid correction");
 const {error}=await db.from("pt_shots").update({made:body.made}).eq("id",id);
 return error?fail("Correction failed",500):ok({ok:true});
 }
 return fail("Unknown operation",404);
 }catch(err){console.error("pt-hub request failed",req.method,action,err instanceof Error?err.message:String(err));return fail("Request failed",500)}
});
