import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const url=Deno.env.get("SUPABASE_URL")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,secret,{auth:{persistSession:false}});
const SHOT_TYPES=["TWO_M","TWO_X","THREE_M","THREE_X","FT_M","FT_X"];
const SITUATION_EVENT_TYPES=[...SHOT_TYPES,"REB","DRB","ORB","TO"];
const SCHEDULE_RECORD_ID="00000000-0000-0000-0000-000000000001";
const DAY_MS=864e5,DATE_WINDOW_MS=366*DAY_MS,FUTURE_SLACK_MS=DAY_MS;
const PUBLIC_UNDO_WINDOW_MS=24*36e5,PUBLIC_SHOT_DELETE_WINDOW_MS=15*6e4;
const MAX_PAGES=100,PAGE_SIZE=1000,MAX_PAYLOAD_CHARS=200000,MAX_SCHEDULE_ITEMS=400,MAX_ACTIVE_PLAYERS=150,MAX_LABEL_CHARS=80;
const MIN_CODE_LENGTH=10,MAX_CODE_LENGTH=64,MAX_BATCH=100;
// Rate limits per minute, checked in three layers. A client that sends its device id gets its own request budget; a client without one
// shares the smaller legacy budget of its network address. Every network address also has a ceiling, since device ids are self-declared.
// Finally all writes together are capped by row count, so a batch of 100 shots costs 100 and a flood of batches cannot outrun the cap.
// Row budgets count rows that passed validation, so garbage costs nothing shared, and they are sized for a whole roster
// reconnecting after an outage with a 100-shot backlog each.
// Every network address also has request ceilings charged before any work, so rotating device ids buys nothing beyond them.
const LIMIT_GET_DEVICE=40,LIMIT_WRITE_DEVICE=120,LIMIT_GET_IP=120,LIMIT_WRITE_IP=80,LIMIT_GET_NET_CEILING=600,LIMIT_WRITE_NET_REQUESTS=1200,LIMIT_WRITE_NET_ROWS=3000,LIMIT_GLOBAL_WRITE_ROWS=6000,MAX_BODY_BYTES=512*1024;
// Coach code attempts are charged atomically per network address before the code is compared, so a self-declared device id
// cannot speed up guessing and a burst of parallel guesses cannot slip past the counter. There is deliberately no shared
// attempt budget: one would let a guesser anywhere lock the real coach out. Strength against many networks guessing at once
// comes from the code itself, which must be at least MIN_CODE_LENGTH characters when seeded or changed.
// Coach code guesses: a device may try 10 times a minute, charged before the compare; a network may fail 30 times a minute,
// counted only on a wrong code so the coach's own correct unlocks on the gym Wi-Fi never lock the coach out.
// A per-network attempt cap, charged atomically before the compare, bounds the burst that can land before the failure count catches up.
const LIMIT_COACH_ATTEMPTS_DEVICE=10,LIMIT_COACH_ATTEMPTS_NET=120,LIMIT_COACH_FAILURES_NET=30;
const DEFAULT_NOTE="Public courtside entry";
const allowedOrigin=(origin:string|null)=>{
 if(origin==="https://ptbasketballhub.netlify.app")return origin;
 if(origin?.startsWith("https://")&&origin.endsWith(".vercel.app"))return origin;
 if(origin==="http://localhost:8000"||origin==="http://127.0.0.1:8000")return origin;
 return null;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS_HEADERS={"Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"content-type,x-coach-access-code,x-pt-device","Vary":"Origin"};
function reply(v:unknown,s=200,origin:string|null=null){return new Response(JSON.stringify(v),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...CORS_HEADERS,...(origin?{"Access-Control-Allow-Origin":origin}:{})}})}
const str=(v:unknown)=>typeof v==="string"?v:"";
const isoDate=(s:unknown):s is string=>{if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const t=Date.parse(s+"T00:00:00Z");return Number.isFinite(t)&&new Date(t).toISOString().startsWith(s)&&t>Date.now()-DATE_WINDOW_MS&&t<Date.now()+2*FUTURE_SLACK_MS};
// A timestamp from a phone whose clock runs ahead is clamped to now by stamp(), never rejected.
const isoStamp=(s:unknown):s is string=>{if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(s))return false;const t=Date.parse(s);return Number.isFinite(t)&&t>Date.now()-DATE_WINDOW_MS};
// Free text that reaches Postgres: control characters out, then a grapheme-safe cut.
const cleanText=(v:unknown,max:number)=>Array.from(str(v).replace(/[\u0000-\u001f\u007f]/g,"").trim()).slice(0,max).join("");
const stripNul=(v:unknown)=>JSON.parse(JSON.stringify(v).replace(/\\u0000/g,""));
const stamp=(s:string)=>new Date(Math.min(Date.parse(s),Date.now())).toISOString();
const courtPoint=(x:unknown,y:unknown)=>Number.isInteger(x)&&(x as number)>=12&&(x as number)<=488&&Number.isInteger(y)&&(y as number)>=12&&(y as number)<=458;
const tokenOk=(t:unknown):t is string=>typeof t==="string"&&/^[A-Za-z0-9_-]{16,128}$/.test(t);
const deviceOk=(t:string)=>/^[0-9a-f]{32}$/i.test(t);
// The caller's network, for rate buckets. Cloudflare sets cf-connecting-ip and overwrites any copy a client sends. Without it, the
// trustworthy entry in x-forwarded-for is the last one, appended by the proxy in front of us; the first entry is whatever the client wrote.
// IPv6 callers are grouped by /64, since one household or phone rotates freely inside that prefix.
function clientNetwork(req:Request){
 const forwarded=req.headers.get("x-forwarded-for")?.split(",").map(s=>s.trim()).filter(Boolean)||[];
 const raw=req.headers.get("cf-connecting-ip")?.trim()||forwarded.at(-1)||"unknown";
 const ip=raw.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i,"$1");
 if(!ip.includes(":"))return ip;
 const [head,tail=""]=ip.split("::"),left=head.split(":").filter(Boolean),right=tail.split(":").filter(Boolean);
 const groups=[...left,...Array(Math.max(0,8-left.length-right.length)).fill("0"),...right];
 return groups.slice(0,4).map(g=>g.toLowerCase()).join(":")+"::/64";
}
type Rejection={id:string;error:string};
const asRecord=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const batchItems=(v:unknown):Record<string,unknown>[]|null=>Array.isArray(v)&&v.length>0&&v.length<=MAX_BATCH?v.map(asRecord):null;
const ownerHash=(t:string)=>sha256("pt-hub-owner:"+t);
const sameHash=(a:string,b:string)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0};
const allow=(bucket:string,limit:number,cost=1)=>db.rpc("pt_hub_allow_request",{p_bucket:bucket,p_limit:limit,p_cost:cost}).then(r=>!r.error&&r.data===true);
// Reads a request body up to MAX_BODY_BYTES and gives up past that, so a missing or dishonest Content-Length cannot force a large parse.
async function readCapped(req:Request):Promise<string|null>{
 if(!req.body)return "";
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BODY_BYTES){await reader.cancel();return null}chunks.push(value)}
 const joined=new Uint8Array(total);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder().decode(joined);
}
async function sha256(text:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("")}
async function activePlayer(id:string){const {data}=await db.from("pt_players").select("id").eq("id",id).eq("active",true).maybeSingle();return !!data}
async function activePlayers(ids:string[]){if(!ids.length)return new Set<string>();const {data}=await db.from("pt_players").select("id").in("id",ids).eq("active",true);return new Set((data||[]).map(row=>row.id as string))}
async function activeDrills(ids:string[]){if(!ids.length)return new Set<string>();const {data}=await db.from("pt_drills").select("id").in("id",ids).eq("active",true);return new Set((data||[]).map(row=>row.id as string))}
// Shooting and drill-result rows are validated the same way whether they arrive alone or in a batch.
const shotProblem=(b:Record<string,unknown>)=>!uuid.test(str(b.id))||!uuid.test(str(b.player_id))||!uuid.test(str(b.drill_id))||typeof b.made!=="boolean"||!isoDate(b.practice_date)?"Invalid shooting data":b.recorded_at!==undefined&&!isoStamp(b.recorded_at)?"Invalid recording timestamp":b.label!==undefined&&typeof b.label!=="string"?"Invalid drill label":"";
async function shotRow(b:Record<string,unknown>){const label=cleanText(b.label,MAX_LABEL_CHARS);return {id:str(b.id),player_id:b.player_id,drill_id:b.drill_id,made:b.made,practice_date:b.practice_date,notes:label||DEFAULT_NOTE,owner_token_hash:tokenOk(b.owner_token)?await ownerHash(b.owner_token):null,...(isoStamp(b.recorded_at)?{created_at:stamp(b.recorded_at)}:{})}}
const resultProblem=(b:Record<string,unknown>)=>!uuid.test(str(b.id))||!uuid.test(str(b.batch_id))||!uuid.test(str(b.player_id))||!["win","loss"].includes(str(b.result))||!isoDate(b.practice_date)||!isoStamp(b.recorded_at)?"Invalid drill result":"";
const resultRow=(b:Record<string,unknown>)=>({id:str(b.id),batch_id:b.batch_id,player_id:b.player_id,result:b.result,practice_date:b.practice_date,recorded_at:stamp(str(b.recorded_at))});
// Write a batch in one statement; if Postgres refuses the statement, retry row by row so one bad row becomes one rejection.
async function upsertRows<T extends {id:string}>(table:string,rows:T[]){
 if(!rows.length)return {saved:[] as string[],rejected:[] as Rejection[]};
 const bulk=await db.from(table).upsert(rows,{onConflict:"id",ignoreDuplicates:true});
 if(!bulk.error)return {saved:rows.map(r=>r.id),rejected:[] as Rejection[]};
 const saved:string[]=[],rejected:Rejection[]=[];
 for(const row of rows){const {error}=await db.from(table).upsert(row,{onConflict:"id",ignoreDuplicates:true});if(error)rejected.push({id:row.id,error:"Row could not be saved"});else saved.push(row.id)}
 return {saved,rejected};
}
// Split a batch into rows to write and rejections to report. Duplicate ids inside one batch collapse to the first occurrence.
async function partition<T extends {id:string}>(items:Record<string,unknown>[],problem:(b:Record<string,unknown>)=>string,toRow:(b:Record<string,unknown>)=>T|Promise<T>,allowed:(b:Record<string,unknown>)=>boolean,denial:string){
 const rows:T[]=[],rejected:Rejection[]=[],seen=new Set<string>();
 for(const item of items){
  const id=str(item.id),error=problem(item);
  if(error){rejected.push({id,error});continue}
  if(seen.has(id))continue;
  seen.add(id);
  if(!allowed(item)){rejected.push({id,error:denial});continue}
  rows.push(await toRow(item));
 }
 return {rows,rejected};
}
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
const hasCoachCredential=(req:Request)=>!!req.headers.get("x-coach-access-code");
// Coach writes carry the shared access code. Nobody signs in; the code row is seeded from a function secret and requests never create it.
const minuteWindow=()=>new Date(Math.floor(Date.now()/60000)*60000).toISOString();
async function bucketCount(bucket:string){const {data,error}=await db.from("pt_hub_rate").select("count").eq("bucket",bucket).eq("minute_window",minuteWindow()).maybeSingle();return error?Number.MAX_SAFE_INTEGER:Number(data?.count||0)}
async function verifyCoach(req:Request,network:string,device:string):Promise<CoachCheck>{
 const code=req.headers.get("x-coach-access-code")?.trim()||"";
 if(!code)return {error:"Coach access required",status:401};
 if(!await allow("coach-try:"+network,LIMIT_COACH_ATTEMPTS_NET))return {error:"Too many coach code attempts from this network. Wait a minute and try again.",status:429};
 if(await bucketCount("coach-fail:"+network)>=LIMIT_COACH_FAILURES_NET)return {error:"Too many wrong coach codes from this network. Wait a minute and try again.",status:429};
 if(device&&!await allow("coach-try:"+device,LIMIT_COACH_ATTEMPTS_DEVICE))return {error:"Too many coach code attempts. Wait a minute and try again.",status:429};
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
 if(sameHash(storedHash,await sha256(code)))return null;
 await allow("coach-fail:"+network,LIMIT_COACH_FAILURES_NET);
 return {error:"Coach access denied",status:403};
}
Deno.serve(async req=>{
 const origin=allowedOrigin(req.headers.get("origin"));
 if(req.method==="OPTIONS")return origin?new Response(null,{status:204,headers:{...CORS_HEADERS,"Access-Control-Allow-Origin":origin,"Access-Control-Max-Age":"86400"}}):new Response(null,{status:403});
 if(!origin)return reply({error:"Origin not allowed"},403);
 const ok=(v:unknown,s=200)=>reply(v,s,origin),fail=(m:string,c=400)=>reply({error:m},c,origin);
 const action=new URL(req.url).searchParams.get("action");
 try{
 const device=req.headers.get("x-pt-device")?.trim()||"";
 const perDevice=deviceOk(device),network=(await sha256("pt-hub-v1:"+clientNetwork(req))).slice(0,32);
 const write=req.method!=="GET",kind=write?":write":":read";
 const client=perDevice?"device:"+device.toLowerCase():"ip:"+network;
 const clientLimit=perDevice?(write?LIMIT_WRITE_DEVICE:LIMIT_GET_DEVICE):(write?LIMIT_WRITE_IP:LIMIT_GET_IP);
 // Writes are parsed before any budget is charged, so the row count is known and an oversized batch is refused for free.
 let body:Record<string,unknown>={},batchAction=false;
 if(write){
  if(!["POST","PATCH","DELETE"].includes(req.method))return fail("Unknown operation",404);
  if(Number(req.headers.get("content-length")||0)>MAX_BODY_BYTES)return fail("Body too large",413);
  const text=await readCapped(req);
  if(text===null)return fail("Body too large",413);
  try{const parsed:unknown=JSON.parse(text);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return fail("Invalid body");body=parsed as Record<string,unknown>}catch{return fail("Invalid JSON body")}
  const batch=action==="shots"?body.shots:action==="drill_results"?body.results:undefined;
  if(batch!==undefined){if(!Array.isArray(batch)||!batch.length)return fail("Invalid batch");if(batch.length>MAX_BATCH)return fail("Batch too large",413);batchAction=true}
 }
 // Budgets are charged in order: the client's own, then its network, then the shared row budget. A refused client never touches the shared one.
 if(!await allow(client+kind,clientLimit))return fail("Rate limit reached",429);
 if(!await allow("net:"+network+(write?":write-req":":read"),write?LIMIT_WRITE_NET_REQUESTS:LIMIT_GET_NET_CEILING))return fail("Rate limit reached",429);
 // Row budgets, per network and shared, are charged for rows that passed validation. Single-record writes cost one row here;
 // batches are charged inside their handler once the valid row count is known.
 const chargeRows=async(n:number)=>n<=0||(await allow("net:"+network+":write",LIMIT_WRITE_NET_ROWS,n)&&await allow("global:write",LIMIT_GLOBAL_WRITE_ROWS,n));
 if(write&&!batchAction&&!await chargeRows(1))return fail("Rate limit reached",429);
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
 full||coach||schedule||player?db.from("pt_schedule_records").select("id,payload,updated_at").order("updated_at",{ascending:false}).limit(10):empty(),
 full?db.from("pt_game_situations").select("id,practice_date,payload,updated_at").order("created_at",{ascending:false}).limit(10000):empty(),
 full||player||situation?fetchAllSituationShots(player?playerId:undefined):empty<SituationShotRow>()]);
 if(p.error||d.error||s.error||r.error||sc.error||g.error||gs.error)return fail("Shared data unavailable",500);
 // Player profiles receive only the selected athlete's game box scores and events.
 // The complete schedule payload remains server-side for this snapshot scope.
 const playerGames=player?(()=>{
  const games=new Map<string,Record<string,unknown>>();
  for(const record of (sc.data||[]) as {payload:unknown}[]){
   const payload=record.payload as Record<string,unknown>|null;
   for(const raw of Array.isArray(payload?.games)?payload.games:[]){
    if(!raw||typeof raw!=="object"||Array.isArray(raw))continue;
    const game=raw as Record<string,unknown>,id=String(game.id||"");
    if(!id||games.has(id))continue;
    const rows=Array.isArray(game.playerStats)?game.playerStats.filter((row:Record<string,unknown>)=>row?.playerId===playerId):[];
    const events=Array.isArray(game.events)?game.events.filter((event:Record<string,unknown>)=>event?.playerId===playerId&&event.team!=="opponent"):[];
    const starters=Array.isArray(game.starters)?game.starters.filter((id:unknown)=>id===playerId):[];
    if(!rows.length&&!events.length&&!starters.length)continue;
    games.set(id,{id,date:game.date,played:game.played,final:game.final,statsImport:game.statsImport,playerStats:rows,events,starters});
   }
  }
  return [...games.values()];
 })():undefined;
 return ok({scope,players:p.data,drills:d.data,shots:s.data,drillResults:r.data,scheduleRecords:player?[]:sc.data,playerGames,gameSituations:g.data,gameSituationShots:gs.data});
 }
 if(!write)return fail("Unknown operation",404);
 const id=str(body.id);
 // Courtside uploads arrive as batches: one request per device per flush instead of one per tap. The single-record forms stay for older cached pages.
 if(req.method==="POST"&&(action==="shots"||action==="shot")){
  const items=action==="shots"?batchItems(body.shots):[body];
  if(!items)return fail("Invalid shot batch");
  const candidates=items.filter(item=>!shotProblem(item));
  const [players,drills]=await Promise.all([activePlayers([...new Set(candidates.map(item=>str(item.player_id)))]),activeDrills([...new Set(candidates.map(item=>str(item.drill_id)))])]);
  const {rows,rejected}=await partition(items,shotProblem,shotRow,item=>players.has(str(item.player_id))&&drills.has(str(item.drill_id)),"Unknown player or drill");
  if(action==="shot"&&rejected.length)return fail(rejected[0].error,rejected[0].error==="Unknown player or drill"?403:400);
  if(batchAction&&!await chargeRows(rows.length))return fail("Rate limit reached",429);
  const written=await upsertRows("pt_shots",rows);
  if(action==="shot")return written.rejected.length?fail("Shot could not be saved",500):ok({ok:true,id});
  return ok({ok:true,saved:written.saved,rejected:[...rejected,...written.rejected]});
 }
 if(req.method==="POST"&&(action==="drill_results"||action==="drill_result")){
  const items=action==="drill_results"?batchItems(body.results):[body];
  if(!items)return fail("Invalid drill result batch");
  const players=await activePlayers([...new Set(items.filter(item=>!resultProblem(item)).map(item=>str(item.player_id)))]);
  const {rows,rejected}=await partition(items,resultProblem,resultRow,item=>players.has(str(item.player_id)),"Unknown player");
  if(action==="drill_result"&&rejected.length)return fail(rejected[0].error,rejected[0].error==="Unknown player"?403:400);
  if(batchAction&&!await chargeRows(rows.length))return fail("Rate limit reached",429);
  const written=await upsertRows("pt_drill_results",rows);
  if(action==="drill_result")return written.rejected.length?fail("Drill result could not be saved",500):ok({ok:true,id});
  return ok({ok:true,saved:written.saved,rejected:[...rejected,...written.rejected]});
 }
 if(action==="game_situation_shot"&&req.method==="POST"){
  if(!uuid.test(id)||!uuid.test(str(body.player_id))||!isoDate(body.practice_date)||!SITUATION_EVENT_TYPES.includes(str(body.shot_type))||!isoStamp(body.recorded_at)||!courtPoint(body.court_x,body.court_y))return fail("Invalid game situation event");
  if(!await activePlayer(str(body.player_id)))return fail("Unknown player",403);
  const {error}=await db.from("pt_game_situation_shots").upsert({id,player_id:body.player_id,practice_date:body.practice_date,shot_type:body.shot_type,court_x:body.court_x,court_y:body.court_y,recorded_at:stamp(body.recorded_at),owner_token_hash:tokenOk(body.owner_token)?await ownerHash(body.owner_token):null},{onConflict:"id",ignoreDuplicates:true});
  return error?fail("Game situation shot could not be saved",500):ok({ok:true,id});
 }
 // Anonymous undo covers the courtside case: the caller must hold the owner token issued when the shot was uploaded, and the shot must be recent. A coach credential removes both limits.
 if(action==="game_situation_shot"&&req.method==="PATCH"){
  if(!uuid.test(id)||body.undone!==true)return fail("Invalid undo request");
  let query=db.from("pt_game_situation_shots").update({undone:true}).eq("id",id);
  if(hasCoachCredential(req)){const denied=await verifyCoach(req,network,perDevice?device.toLowerCase():"");if(denied)return fail(denied.error,denied.status)}
  else{if(!tokenOk(body.owner_token))return fail("Coach access required",401);query=query.eq("owner_token_hash",await ownerHash(body.owner_token)).gte("recorded_at",new Date(Date.now()-PUBLIC_UNDO_WINDOW_MS).toISOString())}
  const {data,error}=await query.select("id").maybeSingle();
  return error?fail("Game situation undo could not be saved",500):data?ok({ok:true,id}):fail("Shot not found or undo window closed",404);
 }
 if(req.method==="DELETE"&&action==="shot"){
  if(!uuid.test(id))return fail("Invalid record");
  let query=db.from("pt_shots").delete().eq("id",id);
  if(hasCoachCredential(req)){const denied=await verifyCoach(req,network,perDevice?device.toLowerCase():"");if(denied)return fail(denied.error,denied.status)}
  else{if(!tokenOk(body.owner_token))return fail("Coach access required",401);query=query.eq("owner_token_hash",await ownerHash(body.owner_token)).gte("created_at",new Date(Date.now()-PUBLIC_SHOT_DELETE_WINDOW_MS).toISOString())}
  const {data,error}=await query.select("id").maybeSingle();
  return error?fail("Removal failed",500):data?ok({ok:true}):fail("Shot not found or undo window closed",404);
 }
 // Legacy session endpoint, kept insert-only for browser tabs that predate per-shot storage. It never overwrites an existing session.
 if(req.method==="POST"&&action==="game_situation"){
  if(!uuid.test(id)||!isoDate(body.practice_date)||!body.payload||typeof body.payload!=="object"||Array.isArray(body.payload))return fail("Invalid game situation");
  const payload=stripNul(body.payload) as Record<string,unknown>;
  if(JSON.stringify(payload).length>MAX_PAYLOAD_CHARS)return fail("Game situation is too large",413);
  const {error}=await db.from("pt_game_situations").upsert({id,practice_date:body.practice_date,payload},{onConflict:"id",ignoreDuplicates:true});
  if(error)return fail("Game situation could not be saved",500);
  const events=(Array.isArray(payload.events)?payload.events:[]) as Record<string,unknown>[];
  const candidates=events.filter(event=>uuid.test(str(event.id))&&uuid.test(str(event.playerId))&&SITUATION_EVENT_TYPES.includes(str(event.type))&&courtPoint(event.x,event.y)&&isoStamp(event.recordedAt));
  const known=await activePlayers([...new Set(candidates.map(event=>str(event.playerId)))]);
  const shots=candidates.filter(event=>known.has(str(event.playerId))).map(event=>({id:event.id,player_id:event.playerId,practice_date:body.practice_date,shot_type:event.type,court_x:event.x,court_y:event.y,recorded_at:stamp(str(event.recordedAt))}));
  if(shots.length){const {error:shotError}=await db.from("pt_game_situation_shots").upsert(shots,{onConflict:"id",ignoreDuplicates:true});if(shotError)return fail("Legacy shots could not be copied",500)}
  return ok({ok:true,id});
 }
 const denied=await verifyCoach(req,network,perDevice?device.toLowerCase():"");
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
  const payload=stripNul({schedule:body.schedule,games:body.games}) as Record<string,unknown>;
  if(JSON.stringify(payload).length>MAX_PAYLOAD_CHARS*5)return fail("Schedule is too large",413);
  const {error}=await db.from("pt_schedule_records").upsert({id:SCHEDULE_RECORD_ID,payload,updated_at:new Date().toISOString()},{onConflict:"id"});
  return error?fail("Schedule could not be saved",500):ok({ok:true,id:SCHEDULE_RECORD_ID});
 }
 if(req.method==="POST"&&action==="player"){
 const fullName=cleanText(body.full_name,90);
 if(!uuid.test(id)||fullName.length<2||fullName.length>90)return fail("Invalid player");
 const jerseyRaw=body.jersey_number;
 if(!(jerseyRaw===null||jerseyRaw===undefined||jerseyRaw===""||typeof jerseyRaw==="number"||typeof jerseyRaw==="string"&&/^\d{1,2}$/.test(jerseyRaw)))return fail("Invalid jersey number");
 const jersey=jerseyRaw===null||jerseyRaw===undefined||jerseyRaw===""?null:Number(jerseyRaw);
 if(jersey!==null&&!(Number.isInteger(jersey)&&jersey>=0&&jersey<=99))return fail("Invalid jersey number");
 if(body.grade!==undefined&&typeof body.grade!=="string"||body.position!==undefined&&typeof body.position!=="string")return fail("Invalid player details");
 if(body.active!==undefined&&typeof body.active!=="boolean")return fail("Invalid player details");
 const active=body.active!==false;
 const existing=await db.from("pt_players").select("id").eq("id",id).maybeSingle();
 if(!existing.data&&active){
  const {count}=await db.from("pt_players").select("id",{count:"exact",head:true}).eq("active",true);
  if((count||0)>=MAX_ACTIVE_PLAYERS)return fail("Roster is full. Deactivate players before adding more.",409);
 }
 const {error}=await db.from("pt_players").upsert({id,full_name:fullName,jersey_number:jersey,grade:cleanText(body.grade,40),position:cleanText(body.position,40),active},{onConflict:"id"});
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
