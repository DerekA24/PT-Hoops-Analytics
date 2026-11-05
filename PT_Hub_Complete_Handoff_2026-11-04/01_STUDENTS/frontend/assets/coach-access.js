
(()=>{
'use strict';
const KEY='pt-coach-local-access-v2';
const $=id=>document.getElementById(id);
let unlocked=false, mode='unlock';
const record=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
const salt=()=>{let a=new Uint8Array(16);if(window.crypto&&crypto.getRandomValues)crypto.getRandomValues(a);else a.forEach((_,i)=>a[i]=Math.random()*256|0);return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('')};
async function digest(code,s){
 const bytes=new TextEncoder().encode(s+':'+code);
 if(window.crypto&&crypto.subtle){const raw=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(raw),x=>x.toString(16).padStart(2,'0')).join('')}
 let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619);return 'local-'+(h>>>0).toString(16);
}
function show(modeChoice='unlock'){
 mode=modeChoice;
 const first=!record(),changing=mode==='change';
 $('gateTitle').textContent=changing?'Change Coach Access Code':first?'Create Coach Access Code':'Coach Access Required';
 $('gateExplain').textContent=changing?'Enter your current code and create a new one.':first?'Create a code with at least six characters to unlock Coach Review.':'Enter your existing coach code to open Coach Review.';
 $('gateCurrentWrap').hidden=!changing;
 $('gateConfirmWrap').hidden=!(first||changing);
 $('gateCodeLabel').childNodes[0].textContent=first||changing?'New access code':'Access code';
 $('gateCode').minLength=first||changing?6:1;
 $('gateSubmit').textContent=changing?'Change Code':first?'Create Code & Unlock':'Unlock Coach Review';
 ['gateCode','gateCurrent','gateConfirm'].forEach(id=>$(id).value='');
 $('gateError').textContent='';
 $('coachGate').classList.add('open');
 $('coachGate').style.display='flex';
 $('coachGate').setAttribute('aria-hidden','false');
 (changing?$('gateCurrent'):$('gateCode')).focus();
}
function close(){ $('coachGate').classList.remove('open');$('coachGate').style.display='none';$('coachGate').setAttribute('aria-hidden','true') }
function displayCoach(){close();$('coachTools').hidden=false;$('coachLocked').hidden=true;if(location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView();}
$('coachUnlock').addEventListener('click',()=>show('unlock'));
$('gateCancel').addEventListener('click',close);
$('coachCodeForm').addEventListener('submit',async e=>{
 e.preventDefault();const existing=record(),changing=mode==='change',code=$('gateCode').value;
 const fail=m=>{$('gateError').textContent=m};
 try{
 if(changing){if(!existing)return fail('There is no current code.');if(await digest($('gateCurrent').value,existing.salt)!==existing.hash)return fail('Current code is incorrect.');}
 if(!existing||changing){
  if(code.length<6)return fail('Use at least 6 characters.');
  if(code!==$('gateConfirm').value)return fail('Codes do not match.');
  const s=salt();localStorage.setItem(KEY,JSON.stringify({salt:s,hash:await digest(code,s)}));
  unlocked=true;
  if(changing){close();return;}displayCoach();return;
 }
 if(await digest(code,existing.salt)!==existing.hash)return fail('Incorrect access code.');
 unlocked=true;displayCoach();
 }catch(err){fail('Could not access code storage: '+err.message)}
});
$('coachChangeCode').addEventListener('click',()=>show('change'));
$('coachLock').addEventListener('click',()=>{unlocked=false;close();$('coachTools').hidden=true;$('coachLocked').hidden=false;window.scrollTo(0,0)});
window.addEventListener('pagehide',()=>{unlocked=false;$('coachTools').hidden=true;$('coachLocked').hidden=false});
show('unlock');
})();
