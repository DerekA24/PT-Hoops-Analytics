import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const url=Deno.env.get("SUPABASE_URL")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,secret,{auth:{persistSession:false}});
const origin="https://ptbasketballhub.netlify.app";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(v:unknown,s=200){return new Response(JSON.stringify(v),{status:s,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info","Cache-Control":"no-store"}})}
const fail=(m:string,c=400)=>reply({error:m},c);
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return reply({},200);
 if(req.headers.get("origin")!==origin)return fail("Origin not allowed",403);
 try{
 const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("pt-hub-v1:"+ip)))).slice(0,16).map(x=>x.toString(16).padStart(2,"0")).join("");
 const {data:allowed,error:rateError}=await db.rpc("pt_hub_allow_request",{p_bucket:hash+":"+req.method,p_limit:req.method==="GET"?120:80});
 if(rateError||!allowed)return fail("Rate limit reached",429);
 const action=new URL(req.url).searchParams.get("action");
 if(req.method==="GET"&&action==="snapshot"){
 const [p,d,s]=await Promise.all([
 db.from("pt_players").select("id,full_name,jersey_number,grade,position,active").eq("active",true).limit(250),
 db.from("pt_drills").select("id,name,active").eq("active",true).limit(250),
 db.from("pt_shots").select("id,player_id,drill_id,made,practice_date,created_at").order("created_at",{ascending:false}).limit(10000)]);
 if(p.error||d.error||s.error)return fail("Shared data unavailable",500);
 return reply({players:p.data,drills:d.data,shots:s.data});
 }
 if(!["POST","PATCH","DELETE"].includes(req.method))return fail("Unknown operation",404);
 const body=await req.json();
 if(req.method==="POST"&&action==="shot"){
 if(!uuid.test(body.id||"")||!uuid.test(body.player_id||"")||!uuid.test(body.drill_id||"")||typeof body.made!=="boolean"||typeof body.practice_date!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(body.practice_date))return fail("Invalid shooting data");
 const [p,d]=await Promise.all([db.from("pt_players").select("id").eq("id",body.player_id).eq("active",true).maybeSingle(),db.from("pt_drills").select("id").eq("id",body.drill_id).eq("active",true).maybeSingle()]);
 if(!p.data||!d.data)return fail("Unknown player or drill",403);
 const {error}=await db.from("pt_shots").upsert({id:body.id,player_id:body.player_id,drill_id:body.drill_id,made:body.made,practice_date:body.practice_date,entered_by:null,notes:"Public courtside entry"},{onConflict:"id",ignoreDuplicates:true});
 return error?fail("Shot could not be saved",500):reply({ok:true,id:body.id});
 }
 const bearer=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
 if(!bearer)return fail("Coach sign in required",401);
 const {data:{user},error:authError}=await db.auth.getUser(bearer);
 if(authError||!user)return fail("Coach session invalid",401);
 const {data:coach}=await db.from("pt_coaches").select("user_id").eq("user_id",user.id).maybeSingle();
 if(!coach)return fail("Coach permission required",403);
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
