const KEY='pt-basketball-app-rebuild-v1';
let state;
try{state=JSON.parse(localStorage.getItem(KEY))}catch{}
if(!state||!Array.isArray(state.players)||!Array.isArray(state.games))state={players:[],games:[],shooting:[],court:[]};
state.shooting=Array.isArray(state.shooting)?state.shooting:[];
state.court=Array.isArray(state.court)?state.court:[];
state.schedule=Array.isArray(state.schedule)?state.schedule:[];
state.corrections=Array.isArray(state.corrections)?state.corrections:[];
state.hiddenBoards=Array.isArray(state.hiddenBoards)?state.hiddenBoards:[];
const $=id=>document.getElementById(id),uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),pct=(m,a)=>a?(100*m/a).toFixed(1)+'%':'—',today=()=>new Date().toLocaleDateString('en-CA');
let editPlayer=null;
function toast(v){$('notice').textContent=v;$('notice').style.display='block';setTimeout(()=>$('notice').style.display='none',1900)}
function save(){try{const json=JSON.stringify(state);localStorage.setItem(KEY,json);localStorage.setItem('pt-basketball-safety-copy-v1',json);setStorageStatus('Saved on this device · Not synchronized',false)}catch(err){setStorageStatus('Save failed: export backup before closing',true);alert('This browser could not save your statistics. Export a JSON backup before leaving the page.')}render()}
function setStorageStatus(text,isError){const el=$('storageStatus');if(el){el.textContent=text;el.classList.toggle('warn',!!isError)}}
function playerName(id){return state.players.find(p=>p.id===id)?.name||'Removed player'}
function opts(){return '<option value="">Select player</option>'+state.players.map(p=>`<option value="${esc(p.id)}">#${esc(p.number)} ${esc(p.name)}</option>`).join('')}
function refreshOptions(id){const el=$(id),old=el?.value;if(!el)return;el.innerHTML=opts();if(state.players.some(p=>p.id===old))el.value=old}
function table(headers,rows){return `<div class="scroll"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
function dateInRange(date,prefix){
 const start=$(prefix+'StartDate')?.value||'',end=$(prefix+'EndDate')?.value||'';
 if((start||end)&&(!date||typeof date!=='string'))return false;
 return !(start&&end&&start>end)&&(!start||date>=start)&&(!end||date<=end);
}
function dateRangeValid(prefix){
 const start=$(prefix+'StartDate'),end=$(prefix+'EndDate');if(!start||!end)return true;
 const invalid=!!(start.value&&end.value&&start.value>end.value),message=invalid?'Start Date must be on or before End Date.':'';
 start.max=end.value;end.min=start.value;end.setCustomValidity(message);start.setAttribute('aria-invalid',String(invalid));end.setAttribute('aria-invalid',String(invalid));
 const error=$(prefix+'RangeError');if(error){error.textContent=message;error.hidden=!invalid}
 return !invalid;
}
function dateRangeLabel(prefix){
 const start=$(prefix+'StartDate')?.value||'',end=$(prefix+'EndDate')?.value||'';
 if(start&&end)return start>end?'Invalid date range':start+' to '+end;
 return start?'From '+start:end?'Through '+end:'All dates';
}
function isNewLiveEvent(game,event){
 if(event.source!=='live-game')return false;
 const imported=Date.parse(game.statsImport?.importedAt||'1970-01-01T00:00:00Z');
 return Number.isFinite(Date.parse(event.recordedAt))&&Date.parse(event.recordedAt)>imported;
}
function render(){
 if($('profiles')){refreshOptions('profilePlayer');if($('profilePlayer')&&!$('profilePlayer').value&&state.players.length)$('profilePlayer').value=state.players[0].id;renderProfile()}
 renderRoster();renderSchedule();renderLeaderboards();renderCoachReview();renderBoardManager();if(window.renderOtherLeaderboards)window.renderOtherLeaderboards();if(window.renderSchedulePage)window.renderSchedulePage();if(window.renderLiveGame)window.renderLiveGame();
 if($('athlete')){const current=athleteId;const options=$('athletePlayer');if(options.options.length!==state.players.length+1)athleteRefreshRoster();else{options.value=current;updateAthleteDisplay()}}
}
function renderRoster(){if(!$('roster'))return;$('rosterRows').innerHTML=state.players.map(p=>`<tr><td>${esc(p.number)}</td><td>${esc(p.name)}</td><td>${esc(p.grade)}</td><td>${esc(p.position)}</td><td><button data-edit-player="${esc(p.id)}">Edit</button> <button data-remove-player="${esc(p.id)}">Delete</button></td></tr>`).join('')}
function validNumber(s){return /^\d{1,2}$/.test(String(s))}
;
if($('addPlayer')&&$('name')&&$('number')&&$('grade')&&$('position')){$('addPlayer').onclick=()=>{const name=$('name').value.trim(),number=$('number').value.trim();if(!name||!validNumber(number))return toast('Name and jersey 0–99 required');if(state.players.some(p=>+p.number===+number))return toast('Jersey already assigned');state.players.push({id:uid(),name,number,grade:$('grade').value,position:$('position').value});$('name').value='';$('number').value='';save()};}
if($('rosterRows')&&$('editName')&&$('editNumber')&&$('editGrade')&&$('editPosition')&&$('rosterEditor')){$('rosterRows').onclick=e=>{const a=e.target.closest('[data-edit-player]'),b=e.target.closest('[data-remove-player]');if(a){const p=state.players.find(p=>p.id===a.dataset.editPlayer);editPlayer=p.id;$('editName').value=p.name;$('editNumber').value=p.number;$('editGrade').value=p.grade;$('editPosition').value=p.position;$('rosterEditor').hidden=false;return}if(b&&confirm('Delete player? Previous records may lose their player label.')){state.players=state.players.filter(p=>p.id!==b.dataset.removePlayer);save()}};}
if($('cancelPlayer')&&$('rosterEditor')){$('cancelPlayer').onclick=()=>$('rosterEditor').hidden=true;}
if($('savePlayer')&&$('editName')&&$('editNumber')&&$('editGrade')&&$('editPosition')&&$('rosterEditor')){$('savePlayer').onclick=()=>{const p=state.players.find(p=>p.id===editPlayer),name=$('editName').value.trim(),number=$('editNumber').value.trim();if(!p||!name||!validNumber(number))return toast('Enter valid name and jersey');if(state.players.some(x=>x.id!==p.id&&+x.number===+number))return toast('Jersey already used');Object.assign(p,{name,number,grade:$('editGrade').value,position:$('editPosition').value});$('rosterEditor').hidden=true;save()};}
if($('export')){$('export').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='PT_Basketball_Backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};}
if($('import')){$('import').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const v=JSON.parse(await f.text());if(!Array.isArray(v.players)||!Array.isArray(v.games)||!Array.isArray(v.shooting)||!Array.isArray(v.court))throw Error('Invalid file format');if(confirm('Replace all data on this device with this backup?')){state=v;state.schedule=Array.isArray(state.schedule)?state.schedule:[];save()}}catch(err){alert('Import failed: '+err.message)}e.target.value=''};}
window.addEventListener('offline',()=>setStorageStatus('Offline · Saved on this device · No shared sync',false));
window.addEventListener('online',()=>setStorageStatus('Online · Saved on this device · No shared sync',false));
const RECENT_KEY='pt-basketball-recent-athletes-v1';
let athleteRecent=[];
try{athleteRecent=JSON.parse(localStorage.getItem(RECENT_KEY))||[]}catch{}
;
if(!Array.isArray(athleteRecent))athleteRecent=[];
let athleteId='',athleteSessionIds=[],athleteBusy=false;
function athleteSessionRows(){return state.shooting.filter(x=>athleteSessionIds.includes(x.id)&&x.playerId===athleteId)}
function updateAthleteDisplay(){if(!$('athlete'))return;const items=athleteSessionRows();const m=items.reduce((a,x)=>a+x.makes,0);$('athleteMakes').textContent=m;$('athleteAttempts').textContent=items.length;$('athletePct').textContent=pct(m,items.length);$('athleteUndo').disabled=!items.length;$('athleteMade').disabled=!athleteId;$('athleteMiss').disabled=!athleteId;$('athleteSessionInfo').textContent=athleteId?`${esc(playerName(athleteId))} · ${items.length} shot${items.length===1?'':'s'} entered this session`:'Select an athlete to begin.'}
function selectAthlete(id){if(!$('athlete'))return;if(!state.players.some(x=>x.id===id))id='';athleteId=id;athleteSessionIds=[];$('athletePlayer').value=id;if(id){athleteRecent=[id,...athleteRecent.filter(v=>v!==id)].slice(0,4);try{localStorage.setItem(RECENT_KEY,JSON.stringify(athleteRecent))}catch{};}$('recentAthletes').innerHTML=athleteRecent.filter(id=>state.players.some(p=>p.id===id)).map(id=>`<button type="button" data-recent-athlete="${esc(id)}" aria-pressed="${id===athleteId}">${esc(playerName(id))}</button>`).join('')||'<span class="muted">No recent athletes yet.</span>';updateAthleteDisplay()}
function athleteRefreshRoster(){if(!$('athlete'))return;const old=athleteId;$('athletePlayer').innerHTML=opts();if(state.players.some(p=>p.id===old))$('athletePlayer').value=old;else athleteId='';selectAthlete(athleteId)}
if($('athletePlayer')){$('athletePlayer').onchange=e=>selectAthlete(e.target.value);}
if($('recentAthletes')){$('recentAthletes').onclick=e=>{const b=e.target.closest('[data-recent-athlete]');if(b)selectAthlete(b.dataset.recentAthlete)};}
function athleteEntry(made){if(athleteBusy||!athleteId)return;const date=$('athleteDate').value;if(!date)return toast('Select a practice date');athleteBusy=true;const x={id:uid(),playerId:athleteId,date,type:$('athleteCategory').value,drill:$('athleteDrill').value.trim()||'Athlete Quick Entry',makes:made?1:0,attempts:1,source:'athlete-quick-entry',recordedAt:new Date().toISOString()};state.shooting.push(x);try{const json=JSON.stringify(state);localStorage.setItem(KEY,json);localStorage.setItem('pt-basketball-safety-copy-v1',json);athleteSessionIds.push(x.id);$('athleteSaveStatus').textContent='✓ Saved on this device';$('athleteSaveStatus').classList.remove('error');updateAthleteDisplay();setStorageStatus('Saved on this device · Not synchronized',false);renderProfile();if(typeof window.ptCloudQueueSave==='function')window.ptCloudQueueSave();}catch(e){state.shooting=state.shooting.filter(y=>y.id!==x.id);$('athleteSaveStatus').textContent='Save failed · Try again';$('athleteSaveStatus').classList.add('error');setStorageStatus('Save failed',true)}finally{athleteBusy=false}}
if($('athleteMade')){$('athleteMade').onclick=()=>athleteEntry(true);}
if($('athleteMiss')){$('athleteMiss').onclick=()=>athleteEntry(false);}
if($('athleteUndo')&&$('athleteSaveStatus')){$('athleteUndo').onclick=()=>{const id=athleteSessionIds.at(-1);if(!id)return;const prev=state.shooting;state.shooting=state.shooting.filter(x=>x.id!==id);try{const json=JSON.stringify(state);localStorage.setItem(KEY,json);localStorage.setItem('pt-basketball-safety-copy-v1',json);athleteSessionIds.pop();updateAthleteDisplay();renderProfile();}catch(e){state.shooting=prev;$('athleteSaveStatus').textContent='Undo could not be saved';$('athleteSaveStatus').classList.add('error')}};}
if($('athleteEnd')){$('athleteEnd').onclick=()=>{athleteSessionIds=[];updateAthleteDisplay();toast('Session finished · Data retained')};}
if($('athleteDate')){$('athleteDate').value=today();}
athleteRefreshRoster();
function parseCSV(src){const rows=[],row=[];let cell='',quoted=false;for(let i=0;i<src.length;i++){const c=src[i];if(quoted){if(c==='"'&&src[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell.trim());cell=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell.trim());if(row.some(x=>x!==''))rows.push([...row]);row.length=0;cell=''}else cell+=c}if(quoted)throw Error('Unclosed CSV quote');row.push(cell.trim());if(row.some(x=>x!==''))rows.push(row);return rows}
function csvData(rows){return rows.map(row=>row.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n'}
function downloadText(name,body,mime='text/csv;charset=utf-8'){const blob=new Blob(['\ufeff'+body],{type:mime}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function getCSV(file,required){return file.text().then(text=>{const rows=parseCSV(text);if(!rows.length)throw Error('CSV is empty');const headings=rows.shift().map(s=>s.toLowerCase().replace(/[^a-z0-9]/g,''));const expected=required.map(s=>s.toLowerCase().replace(/[^a-z0-9]/g,''));const inds=expected.map(x=>headings.indexOf(x));if(inds.includes(-1))throw Error('Required columns: '+required.join(', '));return rows.map((r,i)=>({line:i+2,values:inds.map(j=>(r[j]||'').trim())}))})}
if($('rosterCsv')){$('rosterCsv').onclick=()=>downloadText('PT_Roster_Template.csv',csvData([['Name','Jersey Number','Grade','Position']]));}
if($('scheduleCsv')){$('scheduleCsv').onclick=()=>downloadText('PT_Schedule_Template.csv',csvData([['Date','Opponent','Location','Start Time','Notes']]));}
if($('rosterUpload')&&$('rosterUploadStatus')){$('rosterUpload').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const rows=await getCSV(f,['Name','Jersey Number','Grade','Position']);const incoming=[],errors=[];const knownNumbers=new Set(state.players.map(p=>Number(p.number))),knownNames=new Set(state.players.map(p=>p.name.trim().toLowerCase()));for(const row of rows){const [name,number,grade,position]=row.values;if(!name||!/^\d{1,2}$/.test(number)||!['Senior','Junior','Sophomore','Freshman'].includes(grade)||!['Guard','Wing','Forward','Center'].includes(position)){errors.push('Row '+row.line+': invalid roster values');continue}if(knownNumbers.has(Number(number))||knownNames.has(name.toLowerCase())){errors.push('Row '+row.line+': duplicate jersey or name');continue}incoming.push({id:uid(),name,number,grade,position});knownNumbers.add(Number(number));knownNames.add(name.toLowerCase())}if(errors.length){$('rosterUploadStatus').textContent='Nothing imported. '+errors.slice(0,8).join('; ');return}if(!incoming.length)throw Error('No new roster entries');if(!confirm('Add '+incoming.length+' athletes to roster? Existing players will not change.'))return;state.players.push(...incoming);save();$('rosterUploadStatus').textContent=incoming.length+' athletes imported successfully'}catch(err){$('rosterUploadStatus').textContent='Import failed: '+err.message}e.target.value=''};}
if($('scheduleUpload')&&$('scheduleStatus')){$('scheduleUpload').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const rows=await getCSV(f,['Date','Opponent','Location','Start Time','Notes']);const incoming=[],errors=[];const signatures=new Set(state.schedule.map(s=>s.date+'|'+s.opponent.toLowerCase()));for(const r of rows){const [date,opponent,location,time,notes]=r.values;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00').toString()==='Invalid Date'||!opponent||!['Home','Away','Neutral'].includes(location)){errors.push('Row '+r.line+': invalid date, opponent or location');continue}const signature=date+'|'+opponent.toLowerCase();if(signatures.has(signature)){errors.push('Row '+r.line+': duplicate schedule item');continue}signatures.add(signature);incoming.push({id:uid(),date,opponent,location,time,notes,importedAt:new Date().toISOString()})}if(errors.length){$('scheduleStatus').textContent='Nothing imported. '+errors.slice(0,8).join('; ');return}if(!incoming.length)throw Error('No new games');if(!confirm('Add '+incoming.length+' schedule entries? Existing schedule stays unchanged.'))return;state.schedule.push(...incoming);save();$('scheduleStatus').textContent=incoming.length+' schedule entries imported'}catch(err){$('scheduleStatus').textContent='Import failed: '+err.message}e.target.value=''};}
function renderSchedule(){if(!$('schedule'))return;const rows=state.schedule.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(g=>`<tr><td>${esc(g.date)}</td><td>${esc(g.opponent)}</td><td>${esc(g.location)}</td><td>${esc(g.time)}</td><td>${esc(g.notes)}</td><td><button data-delete-schedule="${esc(g.id)}">Remove</button></td></tr>`);$('scheduleTable').innerHTML=rows.length?table(['Date','Opponent','Location','Start','Notes','Manage'],rows):'<p class="muted">Upload the schedule CSV to see games here.</p>'}
if($('scheduleTable')){$('scheduleTable').onclick=e=>{const b=e.target.closest('[data-delete-schedule]');if(b&&confirm('Remove this schedule entry? This does not delete game statistics.')){state.schedule=state.schedule.filter(x=>x.id!==b.dataset.deleteSchedule);save()}};}
function printRegion(id,title){const node=$(id),win=window.open('','_blank');if(!win){alert('Allow pop-ups to print');return}win.document.write('<!doctype html><html><head><title>'+esc(title)+'</title><style>body{font:13px Arial;margin:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:7px;text-align:left}button{display:none}h1{color:#C63527}@page{size:landscape}</style><style>.lb-panel{border-top:4px solid #C63527!important;background:linear-gradient(145deg,#1c2736,#131b29)!important}.lb-panel-head strong{color:#fff;letter-spacing:.025em}.lb-panel-head button{background:#C63527;border-color:#ea695d}.lb-panel .lb-top:first-child{background:#473324}.lb-feature-title{color:#fff;border-left:5px solid #C63527;padding:12px!important;letter-spacing:.055em}#lbChampions{margin-top:20px;border-top:4px solid #C63527}#lbWall td:nth-child(3),#lbWall td:nth-child(4){font-variant-numeric:tabular-nums}</style></head><body><h1>'+esc(title)+'</h1><p>Printed '+new Date().toLocaleString()+'</p>'+node.innerHTML+'');win.document.close();win.focus();win.print()}
if($('schedulePrint')){$('schedulePrint').onclick=()=>printRegion('scheduleTable','Park Tudor Basketball Schedule');}
function drawQuickCategories(){const dropdown=$('athleteCategory'),target=$('quickCategories');if(!dropdown||!target)return;target.innerHTML=Array.from(dropdown.options).map(o=>`<button type="button" data-quick-category="${esc(o.value||o.textContent)}" aria-pressed="${dropdown.value===(o.value||o.textContent)}">${esc(o.textContent)}</button>`).join('')}
if($('quickCategories')&&$('athleteCategory')){$('quickCategories').addEventListener('click',e=>{const b=e.target.closest('[data-quick-category]');if(!b)return;$('athleteCategory').value=b.dataset.quickCategory;drawQuickCategories();updateAthleteDisplay()});}
if($('athleteCategory')){$('athleteCategory').addEventListener('change',drawQuickCategories);}
drawQuickCategories();
state.corrections=Array.isArray(state.corrections)?state.corrections:[];
function drillLabel(name){return name==='Midrange'?'Midrange (Unspecified)':name}
function getDrillTypes(){return [...new Set(['Free Throws','Top of Key 3','Wing 3','Slot 3','Corner 3','Midrange Low','Midrange High','Floaters','Finishing / Layups','Contested Shots','Custom Drill',...state.shooting.map(x=>String(x.type||'Other'))])].sort()}
function syncFilterSelect(id,options){const el=$(id);if(!el)return;const value=el.value;el.innerHTML='<option value="">All '+(id==='lbCategory'?'Shooting Drills':'Drills')+'</option>'+options.map(x=>`<option value="${esc(x)}">${esc(drillLabel(x))}</option>`).join('');el.value=options.includes(value)?value:''}
function leaderboardDrills(){
 const defaults=['Free Throws','Top of Key 3','Wing 3','Slot 3','Corner 3','Midrange Low','Midrange High','Floaters','Finishing / Layups','Contested Shots'];
 const extras=state.shooting.filter(x=>x.type==='Custom Drill'&&String(x.drill||'').trim()).map(x=>'Custom: '+String(x.drill).trim());
 const other=state.shooting.filter(x=>x.type!=='Custom Drill').map(x=>String(x.type||'Other'));
 const generic=state.shooting.some(x=>x.type==='Custom Drill'&&!String(x.drill||'').trim())?['Custom Drill']:[];
 return [...new Set([...defaults,...extras,...generic,...other])];
}
function isBoardHidden(name){return Array.isArray(state.hiddenBoards)&&state.hiddenBoards.includes(name)}
function visibleLeaderboardDrills(){return leaderboardDrills().filter(name=>!isBoardHidden(name))}
function renderBoardManager(){
 const root=$('boardManageRows');if(!root)return;
 const names=[...new Set([...leaderboardDrills(),...(state.hiddenBoards||[])])];
 root.innerHTML=names.length?names.map(name=>{
  const hidden=isBoardHidden(name),custom=name.startsWith('Custom: ')||name==='Custom Drill';
  return `<div class="board-manage-row"><div><strong>${esc(drillLabel(name))}</strong><small>${custom?'Custom drill':'Standard drill'} · ${hidden?'Hidden from leaderboard wall':'Visible on leaderboard wall'}</small></div><div class="row"><button type="button" data-board-toggle="${esc(name)}">${hidden?'Restore':'Hide'}</button>${custom&&!hidden?`<button class="danger" type="button" data-board-remove="${esc(name)}">Remove Board</button>`:''}</div></div>`
 }).join(''):'<p class="board-empty">No boards configured.</p>';
}
function setBoardVisibility(name,hidden){if(!leaderboardDrills().includes(name)&&!state.hiddenBoards.includes(name))return;
 state.hiddenBoards=Array.isArray(state.hiddenBoards)?state.hiddenBoards:[];
 state.hiddenBoards=state.hiddenBoards.filter(x=>x!==name);if(hidden)state.hiddenBoards.push(name);
 if(hidden&&$('lbCategory')?.value===name)$('lbCategory').value='';save();toast(hidden?'Board hidden; shooting data retained':'Board restored');
}
function drillMatches(x,category){
 if(!category)return true;
 if(category.startsWith('Custom: '))return x.type==='Custom Drill'&&String(x.drill||'').trim()===category.slice(8);
 if(category==='Custom Drill')return x.type==='Custom Drill'&&!String(x.drill||'').trim();
 return x.type===category;
}
function leaderboardRowsFor(category){
 const scope=$('lbScope').value,min=Math.max(20,Math.floor(Number($('lbMin').value)||20)),metric=$('lbMetric').value;
 const records=state.shooting.filter(x=>(scope!=='range'||dateInRange(x.date,'lb'))&&drillMatches(x,category));
 const grouped=new Map();
 for(const x of records){let r=grouped.get(x.playerId)||{id:x.playerId,makes:0,attempts:0,sets:0};r.makes+=Number(x.makes)||0;r.attempts+=Number(x.attempts)||0;r.sets++;grouped.set(x.playerId,r)}
 const score=r=>metric==='made'?r.makes:metric==='attempts'?r.attempts:r.makes/r.attempts;
 const rows=[...grouped.values()].filter(x=>x.attempts>=min).sort((a,b)=>score(b)-score(a)||b.attempts-a.attempts||playerName(a.id).localeCompare(playerName(b.id)));
 const total=records.reduce((a,x)=>({makes:a.makes+(Number(x.makes)||0),attempts:a.attempts+(Number(x.attempts)||0)}),{makes:0,attempts:0});
 return {rows,total,records};
}
function dailyChampionWins(){
 // One win per athlete, drill and date. Tied first place athletes each receive one win.
 // A player must take at least 20 shots in that drill on that date.
 const buckets=new Map();
 const available=new Set(leaderboardDrills());
 for(const x of state.shooting){
  if($('lbScope')?.value==='range'&&!dateInRange(x.date,'lb'))continue;
  const category=x.type==='Custom Drill'?(String(x.drill||'').trim()?'Custom: '+String(x.drill).trim():'Custom Drill'):String(x.type||'Other');
  if(!available.has(category)||!x.date)continue;
  const key=JSON.stringify([x.date,category,x.playerId]);
  const rec=buckets.get(key)||{date:x.date,drill:category,id:x.playerId,makes:0,attempts:0};
  rec.makes+=Number(x.makes)||0;rec.attempts+=Number(x.attempts)||0;buckets.set(key,rec);
 }
 const groups=new Map();
 for(const rec of buckets.values()){
  if(rec.attempts<20)continue;
  const key=JSON.stringify([rec.date,rec.drill]);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(rec);
 }
 const wins=new Map();
 for(const entries of groups.values()){
  const top=Math.max(...entries.map(x=>x.makes/x.attempts));
  for(const entry of entries){if(Math.abs(entry.makes/entry.attempts-top)<1e-12)wins.set(entry.id,(wins.get(entry.id)||0)+1)}
 }
 return [...wins].map(([id,count])=>({id,count})).sort((a,b)=>b.count-a.count||playerName(a.id).localeCompare(playerName(b.id)));
}
function renderLeaderboards(){if(!$('leaderboards'))return;
 const all=visibleLeaderboardDrills();syncFilterSelect('lbCategory',all);
 const cat=$('lbCategory').value,scope=$('lbScope').value;
 dateRangeValid('lb');
 const minInput=$('lbMin');if(Number(minInput.value)<20)minInput.value='20';minInput.min='20';
 const view=leaderboardRowsFor(cat),total=view.total;
 $('lbSummary').innerHTML=[['Made',total.makes],['Attempts',total.attempts],['Shooting %',pct(total.makes,total.attempts)],['Qualified Athletes',view.rows.length]].map(([name,value])=>`<div class="card"><small>${esc(name)}</small><div class="stat">${value}</div></div>`).join('');
 const title=cat||'All Shooting Drills';
 const rows=view.rows.slice(0,20).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(playerName(x.id))}</td><td>${x.makes}</td><td>${x.attempts}</td><td>${pct(x.makes,x.attempts)}</td><td><button type="button" data-lb-edit="${esc(x.id)}">Coach Edit</button></td></tr>`);
 $('lbWall').innerHTML=all.map(drill=>{
   const d=leaderboardRowsFor(drill),selected=cat===drill;
   const ranked=d.rows.slice(0,20).map((x,i)=>`<tr class="${i<3?'lb-top':''}"><td>${i===0?'★ 1':i+1}</td><td title="${esc(playerName(x.id))}">${esc(playerName(x.id))}</td><td>${x.makes}/${x.attempts}</td><td>${pct(x.makes,x.attempts)}</td></tr>`).join('');
   return `<article class="lb-panel ${selected?'selected':''}"><div class="lb-panel-head"><strong>${esc(drillLabel(drill))}</strong><button type="button" data-lb-feature="${esc(drill)}">View</button></div><div class="lb-panel-meta">${d.rows.length} qualified · ${d.total.attempts} shots · MIN 20 · TOP 20</div>${ranked?`<table><thead><tr><th>#</th><th>Athlete</th><th>M/A</th><th>%</th></tr></thead><tbody>${ranked}</tbody></table>`:'<p class="lb-empty">No athletes with 20 attempts yet</p>'}</article>`;
 }).join('');
 const winners=dailyChampionWins();
 const dest=$('lbChampions');if(dest)dest.innerHTML=`<div class="lb-feature-title">DAILY SHOOTING CHAMPIONS</div><p class="muted">One win for finishing first in shooting percentage in a drill on a practice date with at least 20 attempts. Ties share a win. Counts recalculate after coach corrections.</p>`+(winners.length?table(['Rank','Athlete','Daily Shooting Wins'],winners.slice(0,20).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(playerName(x.id))}</td><td><strong>${x.count}</strong></td></tr>`)):'<p class="muted">Daily champions appear when athletes record at least 20 attempts in a drill on the same date.</p>');
}
function coachRows(){const p=$('coachPlayer').value,t=$('coachCategory').value;return state.shooting.filter(x=>(!p||x.playerId===p)&&dateInRange(x.date,'coach')&&(!t||x.type===t)).slice().sort((a,b)=>String(b.recordedAt||b.date).localeCompare(String(a.recordedAt||a.date)))}
function renderCoachReview(){if(!$('coach'))return;dateRangeValid('coach');const recovery=$('coachRecovery');if(recovery)recovery.style.display=state.players.length?'none':'block';const old=$('coachPlayer').value;refreshOptions('coachPlayer');if(old&&state.players.some(x=>x.id===old))$('coachPlayer').value=old;syncFilterSelect('coachCategory',getDrillTypes());const rows=coachRows();$('coachEntries').innerHTML='<h3>Individual Submissions ('+rows.length+')</h3><p class="muted">Select a submission and enter the correct Made and Missed totals. Athlete, date, and drill remain unchanged. Corrections appear in Correction History.</p>'+(rows.length?table(['Date','Athlete','Drill','Detail','Makes','Attempts','Actions'],rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(playerName(x.playerId))}</td><td>${esc(x.type)}</td><td>${esc(x.drill||'')}</td><td>${Number(x.makes)||0}</td><td>${Number(x.attempts)||0}</td><td><button data-coach-edit="${esc(x.id)}">Edit</button> <button data-coach-delete="${esc(x.id)}">Delete</button></td></tr>`)):'<p class="muted">No shooting submissions match these filters. Select Clear Filters to see all records. If this is a new HTML file, use Backup to import your JSON data first.</p>');
 $('coachAudit').innerHTML=state.corrections.length?table(['When','Action','Athlete','Reason','Before','After'],state.corrections.slice().reverse().slice(0,75).map(x=>`<tr><td>${esc(x.at)}</td><td>${esc(x.action)}</td><td>${esc(x.player)}</td><td>${esc(x.reason)}</td><td>${esc(x.before)}</td><td>${esc(x.after)}</td></tr>`)):'<p class="muted">No corrections recorded.</p>';
}
function describeShot(x){return x?`${x.date} | ${x.type} | ${x.drill||''} | ${x.makes}/${x.attempts}`:'Deleted'}
function coachEdit(id,remove){
 const item=state.shooting.find(x=>x.id===id);if(!item)return;
 if(remove){
  if(!confirm('Delete this submission? The original record will remain in Correction History.'))return;
  const old={...item};
  const applyLocal=()=>{state.shooting=state.shooting.filter(x=>x.id!==id);state.corrections.push({id:uid(),at:new Date().toISOString(),action:'Delete',player:playerName(old.playerId),playerId:old.playerId,recordId:old.id,reason:'Coach removed incorrect submission',before:describeShot(old),after:'Deleted',beforeRecord:old,afterRecord:null});save();toast('Submission deleted');};
  if(typeof window.ptCoachDeleteShot==='function'&&window.ptCloudHasShot?.(id)){
   window.ptCoachDeleteShot(id).then(applyLocal).catch(e=>{toast('Cloud deletion failed: '+e.message);alert('The shared shot was NOT deleted. '+e.message+' Sign in under Coach cloud permissions and try again.');});return;
  }
  applyLocal();return;
 }
 const open=document.getElementById('coachCountEditor');if(open)open.remove();
 const overlay=document.createElement('div');overlay.id='coachCountEditor';
 overlay.style.cssText='position:fixed;inset:0;background:#000c;z-index:999;display:grid;place-items:center;padding:16px';
 const misses=Number(item.attempts)-Number(item.makes);
 overlay.innerHTML=`<div role="dialog" aria-modal="true" aria-labelledby="coachCountTitle" style="width:min(460px,100%);padding:22px;border:1px solid #64748b;border-radius:16px;background:#1a2230;color:white;max-height:90vh;overflow:auto">
  <h2 id="coachCountTitle" style="margin:0 0 10px">Coach Master Edit</h2>
  <p class="muted">${esc(playerName(item.playerId))} · ${esc(item.type)} · ${esc(item.date)}</p>
  <p class="muted">Only change the shot totals. Athlete, drill and date remain the same.</p>
  <form id="coachCountForm"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0">
   <label>Made<input id="coachCountMade" type="number" inputmode="numeric" min="0" step="1" required value="${Number(item.makes)}" style="width:100%;font-size:22px"></label>
   <label>Missed<input id="coachCountMissed" type="number" inputmode="numeric" min="0" step="1" required value="${misses}" style="width:100%;font-size:22px"></label>
  </div><p id="coachCountError" role="alert" style="color:#ffb5b5;min-height:20px"></p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button type="button" id="coachCountCancel">Cancel</button><button type="submit" class="primary">Save Correction</button></div></form></div>`;
 const close=()=>overlay.remove();
 overlay.querySelector('#coachCountCancel').onclick=close;
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 overlay.querySelector('#coachCountForm').addEventListener('submit',e=>{
  e.preventDefault();
  const madeText=overlay.querySelector('#coachCountMade').value;
  const missedText=overlay.querySelector('#coachCountMissed').value;
  const made=Number(madeText),missed=Number(missedText);
  if(!/^\d+$/.test(madeText)||!/^\d+$/.test(missedText)||!Number.isSafeInteger(made)||!Number.isSafeInteger(missed)||!Number.isSafeInteger(made+missed)||made+missed===0){
   overlay.querySelector('#coachCountError').textContent='Enter valid whole numbers for Made and Missed. At least one attempt is required.';return;
  }
  const current=state.shooting.find(x=>x.id===id);
  if(!current){overlay.querySelector('#coachCountError').textContent='Submission no longer exists.';return}
  if(Number(current.makes)===made&&Number(current.attempts)===made+missed){close();toast('No changes needed');return}
  const old={...current};current.makes=made;current.attempts=made+missed;
  state.corrections.push({id:uid(),at:new Date().toISOString(),action:'Edit shot totals',player:playerName(old.playerId),playerId:old.playerId,recordId:old.id,reason:'Coach corrected made and missed totals',before:describeShot(old),after:describeShot(current),beforeRecord:old,afterRecord:{...current}});
  save();close();toast('Coach correction saved locally');
 });
 document.body.appendChild(overlay);overlay.querySelector('#coachCountMade').focus();
}
if($('boardManageRows')){$('boardManageRows').addEventListener('click',e=>{
 const toggle=e.target.closest('[data-board-toggle]'),remove=e.target.closest('[data-board-remove]');
 if(toggle)setBoardVisibility(toggle.dataset.boardToggle,!isBoardHidden(toggle.dataset.boardToggle));
 if(remove){const name=remove.dataset.boardRemove;if(!name.startsWith('Custom: ')&&name!=='Custom Drill')return;
  if(confirm('Remove "'+name+'" from the leaderboard wall? All recorded shots will be kept and the board can be restored later.'))setBoardVisibility(name,true);
 }
});}
if($('boardRestoreAll')){$('boardRestoreAll').addEventListener('click',()=>{if(!state.hiddenBoards.length){toast('All boards already visible');return}state.hiddenBoards=[];save();toast('All boards restored')});}
if($('coachEntries')){$('coachEntries').addEventListener('click',e=>{const edit=e.target.closest('[data-coach-edit]'),del=e.target.closest('[data-coach-delete]');if(edit)coachEdit(edit.dataset.coachEdit,false);if(del)coachEdit(del.dataset.coachDelete,true)});}
for(const id of ['coachPlayer','coachStartDate','coachEndDate','coachCategory'])$(id)?.addEventListener('change',renderCoachReview);
if($('coachClear')&&$('coachPlayer')&&$('coachStartDate')&&$('coachCategory')){$('coachClear').onclick=()=>{$('coachPlayer').value='';$('coachStartDate').value='';$('coachEndDate').value='';$('coachCategory').value='';renderCoachReview()};}
if($('coachExport')&&$('export')){$('coachExport').onclick=()=>$('export').click();}
if($('coachImport')){$('coachImport').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const incoming=JSON.parse(await f.text());if(!Array.isArray(incoming.players)||!Array.isArray(incoming.shooting))throw Error('Not a recognized basketball backup');if(!confirm('Import this basketball backup into this browser? Existing local records will be replaced.'))return;state={...incoming,players:incoming.players,games:Array.isArray(incoming.games)?incoming.games:[],shooting:incoming.shooting,court:Array.isArray(incoming.court)?incoming.court:[],schedule:Array.isArray(incoming.schedule)?incoming.schedule:[],corrections:Array.isArray(incoming.corrections)?incoming.corrections:[],hiddenBoards:Array.isArray(incoming.hiddenBoards)?incoming.hiddenBoards:[]};save();toast('Backup imported. Athlete and drill filters restored.')}catch(err){alert('Could not import backup: '+err.message)}finally{e.target.value=''}});}
for(const id of ['lbScope','lbCategory','lbMetric','lbMin'])$(id)?.addEventListener('change',()=>renderLeaderboards());
if($('lbMin')){$('lbMin').addEventListener('input',()=>renderLeaderboards());}
if($('lbWall')&&$('lbCategory')){$('lbWall').addEventListener('click',e=>{const b=e.target.closest('[data-lb-feature]');if(!b)return;$('lbCategory').value=b.dataset.lbFeature;renderLeaderboards();document.querySelector('#lbWall .selected')?.scrollIntoView({behavior:'smooth',block:'nearest'});});}
for(const id of ['athleteDate'])if($(id))$(id).value=today();
if($('coach')){const query=new URLSearchParams(location.search);$('coachPlayer').value=query.get('player')||'';$('coachStartDate').value=query.get('start')||query.get('date')||'';$('coachEndDate').value=query.get('end')||query.get('date')||'';syncFilterSelect('coachCategory',getDrillTypes());const drill=query.get('drill')||'';$('coachCategory').value=drill.startsWith('Custom: ')?'Custom Drill':drill;}
for(const id of ['lbStartDate','lbEndDate'])$(id)?.addEventListener('change',()=>{$('lbScope').value='range';renderLeaderboards()});
window.addEventListener('storage',event=>{if(event.key!==KEY||!event.newValue)return;try{const next=JSON.parse(event.newValue);if(Array.isArray(next.players)&&Array.isArray(next.shooting)){state=next;render()}}catch{}});
window.addEventListener('pageshow',event=>{if(event.persisted){try{state=JSON.parse(localStorage.getItem(KEY))||state;render()}catch{}}});
render();
