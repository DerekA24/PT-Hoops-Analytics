import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const url=Deno.env.get("SUPABASE_URL")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,secret,{auth:{persistSession:false}});
const allowedOrigin=(origin:string|null)=>{
 if(origin==="https://ptbasketballhub.netlify.app")return origin;
 if(origin?.startsWith("https://")&&origin.endsWith(".vercel.app"))return origin;
 if(origin==="http://localhost:8000"||origin==="http://127.0.0.1:8000")return origin;
 return null;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(v:unknown,s=200){return new Response(JSON.stringify(v),{status:s,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info,x-coach-access-code","Cache-Control":"no-store"}})}
const fail=(m:string,c=400)=>reply({error:m},c);
async function codeHash(code:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(code));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("")}
type ShotSnapshotRow={id:string;player_id:string;drill_id:string;made:boolean;practice_date:string;created_at:string};
type SituationShotRow={id:string;player_id:string;practice_date:string;shot_type:string;court_x:number|null;court_y:number|null;recorded_at:string;undone:boolean};
async function fetchAllShots(playerId?:string){
 const pageSize=1000,rows:ShotSnapshotRow[]=[];
 for(let offset=0;;offset+=pageSize){
  let query=db.from("pt_shots").select("id,player_id,drill_id,made,practice_date,created_at");
  if(playerId)query=query.eq("player_id",playerId);
  const {data,error}=await query.order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+pageSize-1);
  if(error)return {data:null,error};
  rows.push(...(data||[]));
  if(!data||data.length<pageSize)break;
 }
 return {data:rows,error:null};
}
async function fetchAllSituationShots(playerId?:string){
 const pageSize=1000,rows:SituationShotRow[]=[];
 for(let offset=0;;offset+=pageSize){
  let query=db.from("pt_game_situation_shots").select("id,player_id,practice_date,shot_type,court_x,court_y,recorded_at,undone");
  if(playerId)query=query.eq("player_id",playerId);
  const {data,error}=await query.order("recorded_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+pageSize-1);
  if(error)return {data:null,error};
  rows.push(...(data||[]));
  if(!data||data.length<pageSize)break;
 }
 return {data:rows,error:null};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return reply({},200);
 const origin=allowedOrigin(req.headers.get("origin"));
 if(!origin)return fail("Origin not allowed",403);
 try{
 const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("pt-hub-v1:"+ip)))).slice(0,16).map(x=>x.toString(16).padStart(2,"0")).join("");
 const {data:allowed,error:rateError}=await db.rpc("pt_hub_allow_request",{p_bucket:hash+":"+req.method,p_limit:req.method==="GET"?120:80});
 if(rateError||!allowed)return fail("Rate limit reached",429);
 const action=new URL(req.url).searchParams.get("action");
 if(req.method==="GET"&&action==="snapshot"){
 const params=new URL(req.url).searchParams;
 const scope=params.get("scope")||"full",playerId=params.get("player_id")||"";
 if(!["full","coach","player","schedule","schedule-only","entry"].includes(scope)||scope==="player"&&!uuid.test(playerId))return fail("Invalid snapshot scope");
 const full=scope==="full",coach=scope==="coach",player=scope==="player",schedule=scope==="schedule"||scope==="schedule-only";
 const empty=<T>()=>Promise.resolve({data:[] as T[],error:null});
 const [p,d,s,r,sc,g,gs]=await Promise.all([
 scope==="schedule-only"?empty():db.from("pt_players").select("id,full_name,jersey_number,grade,position,active").eq("active",true).limit(250),
 scope==="schedule"||scope==="schedule-only"?empty():db.from("pt_drills").select("id,name,active").eq("active",true).limit(250),
 full||coach||player?fetchAllShots(player?playerId:undefined):empty<ShotSnapshotRow>(),
 full||coach?db.from("pt_drill_results").select("id,batch_id,player_id,result,practice_date,recorded_at,created_at").order("recorded_at",{ascending:false}).limit(10000):empty(),
 full||schedule?db.from("pt_schedule_records").select("id,payload,updated_at").order("updated_at",{ascending:false}).limit(10):empty(),
 full?db.from("pt_game_situations").select("id,practice_date,payload,updated_at").order("created_at",{ascending:false}).limit(10000):empty(),
 full||player?fetchAllSituationShots(player?playerId:undefined):empty<SituationShotRow>()]);
 if(p.error||d.error||s.error||r.error||sc.error||g.error||gs.error)return fail("Shared data unavailable",500);
 return reply({scope,players:p.data,drills:d.data,shots:s.data,drillResults:r.data,scheduleRecords:sc.data,gameSituations:g.data,gameSituationShots:gs.data});
 }
 if(!["POST","PATCH","DELETE"].includes(req.method))return fail("Unknown operation",404);
 const body=await req.json();
 if(req.method==="POST"&&action==="shot"){
 if(!uuid.test(body.id||"")||!uuid.test(body.player_id||"")||!uuid.test(body.drill_id||"")||typeof body.made!=="boolean"||typeof body.practice_date!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(body.practice_date))return fail("Invalid shooting data");
 if(body.recorded_at!==undefined&&(typeof body.recorded_at!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(body.recorded_at)||!Number.isFinite(Date.parse(body.recorded_at))))return fail("Invalid recording timestamp");
 const [p,d]=await Promise.all([db.from("pt_players").select("id").eq("id",body.player_id).eq("active",true).maybeSingle(),db.from("pt_drills").select("id").eq("id",body.drill_id).eq("active",true).maybeSingle()]);
 if(!p.data||!d.data)return fail("Unknown player or drill",403);
 const {error}=await db.from("pt_shots").upsert({id:body.id,player_id:body.player_id,drill_id:body.drill_id,made:body.made,practice_date:body.practice_date,entered_by:null,notes:"Public courtside entry",...(body.recorded_at?{created_at:new Date(body.recorded_at).toISOString()}:{})},{onConflict:"id",ignoreDuplicates:true});
 return error?fail("Shot could not be saved",500):reply({ok:true,id:body.id});
 }
 if(req.method==="POST"&&action==="drill_result"){
 if(!uuid.test(body.id||"")||!uuid.test(body.batch_id||"")||!uuid.test(body.player_id||"")||!["win","loss"].includes(body.result)||typeof body.practice_date!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(body.practice_date)||typeof body.recorded_at!=="string"||!Number.isFinite(Date.parse(body.recorded_at)))return fail("Invalid drill result");
 const {data:player}=await db.from("pt_players").select("id").eq("id",body.player_id).eq("active",true).maybeSingle();
 if(!player)return fail("Unknown player",403);
 const {error}=await db.from("pt_drill_results").upsert({id:body.id,batch_id:body.batch_id,player_id:body.player_id,result:body.result,practice_date:body.practice_date,recorded_at:new Date(body.recorded_at).toISOString()},{onConflict:"id",ignoreDuplicates:true});
 return error?fail("Drill result could not be saved",500):reply({ok:true,id:body.id});
 }
 if(action==="game_situation_shot"&&req.method==="POST"){
  if(!uuid.test(body.id||"")||!uuid.test(body.player_id||"")||typeof body.practice_date!=="string"||!/^[0-9]{4}-\d{2}-\d{2}$/.test(body.practice_date)||!["TWO_M","TWO_X","THREE_M","THREE_X","FT_M","FT_X"].includes(body.shot_type)||!Number.isFinite(Date.parse(body.recorded_at))||!Number.isInteger(body.court_x)||body.court_x<12||body.court_x>488||!Number.isInteger(body.court_y)||body.court_y<12||body.court_y>458)return fail("Invalid game situation shot");
  const {error}=await db.from("pt_game_situation_shots").upsert({id:body.id,player_id:body.player_id,practice_date:body.practice_date,shot_type:body.shot_type,court_x:body.court_x,court_y:body.court_y,recorded_at:new Date(body.recorded_at).toISOString()},{onConflict:"id",ignoreDuplicates:true});
  return error?fail("Game situation shot could not be saved",500):reply({ok:true,id:body.id});
 }
 if(action==="game_situation_shot"&&req.method==="PATCH"){
  if(!uuid.test(body.id||"")||body.undone!==true)return fail("Invalid undo request");
  const {data,error}=await db.from("pt_game_situation_shots").update({undone:true}).eq("id",body.id).select("id").maybeSingle();
  return error?fail("Game situation undo could not be saved",500):data?reply({ok:true,id:body.id}):fail("Shot not found",404);
 }
 // Keep the previous endpoint available for already-open browser tabs during rollout.
 if(req.method==="POST"&&action==="game_situation"){
  if(!uuid.test(body.id||"")||typeof body.practice_date!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(body.practice_date)||!body.payload||typeof body.payload!=="object")return fail("Invalid game situation");
  const {error}=await db.from("pt_game_situations").upsert({id:body.id,practice_date:body.practice_date,payload:body.payload},{onConflict:"id"});
  if(error)return fail("Game situation could not be saved",500);
  const events=Array.isArray(body.payload.events)?body.payload.events:[];
  const shots=events.filter((event:Record<string,unknown>)=>uuid.test(String(event.id||""))&&uuid.test(String(event.playerId||""))&&["TWO_M","TWO_X","THREE_M","THREE_X","FT_M","FT_X"].includes(String(event.type||""))&&typeof event.x==="number"&&Number.isInteger(event.x)&&event.x>=12&&event.x<=488&&typeof event.y==="number"&&Number.isInteger(event.y)&&event.y>=12&&event.y<=458&&Number.isFinite(Date.parse(String(event.recordedAt||"")))).map((event:Record<string,unknown>)=>({id:event.id,player_id:event.playerId,practice_date:body.practice_date,shot_type:event.type,court_x:event.x,court_y:event.y,recorded_at:new Date(String(event.recordedAt)).toISOString()}));
  if(shots.length){const {error:shotError}=await db.from("pt_game_situation_shots").upsert(shots,{onConflict:"id",ignoreDuplicates:true});if(shotError)return fail("Legacy shots could not be copied",500)}
  return reply({ok:true,id:body.id});
 }
 const bearer=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
 if(bearer){
  const {data:{user},error:authError}=await db.auth.getUser(bearer);
  if(authError||!user)return fail("Coach session invalid",401);
  const {data:coach}=await db.from("pt_coaches").select("user_id").eq("user_id",user.id).maybeSingle();
  if(!coach)return fail("Coach permission required",403);
 }else{
  const code=req.headers.get("x-coach-access-code")?.trim()||"";
  if(code.length<1)return fail("Coach access required",401);
  const hash=await codeHash(code);
  const {data:configured,error:accessError}=await db.from("pt_coach_access").select("code_hash").eq("id","primary").maybeSingle();
  if(accessError)return fail("Coach access unavailable",500);
  if(configured&&configured.code_hash!==hash)return fail("Coach access denied",403);
  if(!configured){
   const {error}=await db.from("pt_coach_access").insert({id:"primary",code_hash:hash});
   if(error)return fail("Coach access could not be initialized",500);
   }
  }
  if(req.method==="POST"&&action==="schedule_sync"){
  if(!uuid.test(body.id||"")||!Array.isArray(body.schedule)||!Array.isArray(body.games))return fail("Invalid schedule");
  const {error}=await db.from("pt_schedule_records").upsert({id:body.id,payload:{schedule:body.schedule,games:body.games}},{onConflict:"id"});
  return error?fail("Schedule could not be saved",500):reply({ok:true,id:body.id});
  }
 if(req.method==="POST"&&action==="player"){
 if(!uuid.test(body.id||"")||typeof body.full_name!=="string"||body.full_name.trim().length<2||body.full_name.length>90)return fail("Invalid player");
 const {error}=await db.from("pt_players").upsert({id:body.id,full_name:body.full_name.trim(),jersey_number:body.jersey_number===null?null:Number(body.jersey_number),grade:String(body.grade||"").slice(0,40),position:String(body.position||"").slice(0,40),active:true},{onConflict:"id"});
 return error?fail("Roster update failed",500):reply({ok:true});
 }
 if(req.method==="PATCH"&&action==="shot"){
 if(!uuid.test(body.id||"")||typeof body.made!=="boolean")return fail("Invalid correction");
 const {error}=await db.from("pt_shots").update({made:body.made}).eq("id",body.id);
 return error?fail("Correction failed",500):reply({ok:true});
 }
 if(req.method==="DELETE"&&action==="shot"){
 if(!uuid.test(body.id||""))return fail("Invalid record");
 const {error}=await db.from("pt_shots").delete().eq("id",body.id);
 return error?fail("Removal failed",500):reply({ok:true});
 }
 return fail("Unknown operation",404);
 }catch{return fail("Request failed",500)}
});
