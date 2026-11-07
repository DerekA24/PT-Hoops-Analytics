// Practice drill outcomes are stored separately from shooting and game stats.
(()=>{
 'use strict';
 const form=$('drillResultsForm');if(!form)return;
 const draft=new Map();let rosterSignature='';
 $('drillResultsDate').value=today();
 function render(){
  const signature=JSON.stringify(state.players.map(p=>[p.id,p.name,p.number]));
  if(signature===rosterSignature)return;rosterSignature=signature;
  const players=new Set(state.players.map(p=>p.id));
  for(const id of draft.keys())if(!players.has(id))draft.delete(id);
  const lastName=player=>String(player.name||'').trim().split(/\s+/).at(-1)||'';
  const sortedPlayers=[...state.players].sort((a,b)=>lastName(a).localeCompare(lastName(b),undefined,{sensitivity:'base'})||String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
  const trophy='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3h8v6a4 4 0 0 1-8 0V3Z M8 5H4v2a4 4 0 0 0 4 4 M16 5h4v2a4 4 0 0 1-4 4 M12 13v6 M8 21h8 M9 19h6"/></svg>';
  $('drillResultsRoster').innerHTML=state.players.length?sortedPlayers.map(p=>`<div class="drill-result-player" role="group" aria-label="Drill result for ${esc(p.name)}"><div class="drill-result-heading"><span class="drill-result-jersey">#${esc(p.number)}</span><strong>${esc(p.name)}</strong></div><div class="drill-result-options"><label class="drill-result-win"><input type="radio" name="drill-result-${esc(p.id)}" data-drill-player="${esc(p.id)}" value="win" ${draft.get(p.id)==='win'?'checked':''}><span>${trophy} Win</span></label><label class="drill-result-loss"><input type="radio" name="drill-result-${esc(p.id)}" data-drill-player="${esc(p.id)}" value="loss" ${draft.get(p.id)==='loss'?'checked':''}><span><span aria-hidden="true" class="drill-result-icon">&#215;</span> Lose</span></label><button type="button" data-drill-clear="${esc(p.id)}" aria-label="Clear result for ${esc(p.name)}"><span aria-hidden="true">&#8635;</span> Clear</button></div></div>`).join(''):'<p class="muted">Add players through Coach Review to record drill results.</p>';
  $('drillResultsSubmit').disabled=!state.players.length;
 }
 form.addEventListener('change',e=>{const input=e.target.closest('[data-drill-player]');if(input){draft.set(input.dataset.drillPlayer,input.value);$('drillResultsStatus').textContent=''}});
 form.addEventListener('click',e=>{const button=e.target.closest('[data-drill-clear]');if(!button)return;draft.delete(button.dataset.drillClear);rosterSignature='';render()});
 form.addEventListener('submit',e=>{
  e.preventDefault();const date=$('drillResultsDate').value;
  if(!date||!form.reportValidity())return;
  const selected=state.players.filter(p=>['win','loss'].includes(draft.get(p.id)));
  if(!selected.length){$('drillResultsStatus').textContent='Choose Win or Lose for at least one player.';return}
  const batchId=uid(),recordedAt=new Date().toISOString();
  state.drillResults=Array.isArray(state.drillResults)?state.drillResults:[];
  const records=selected.map(p=>({id:uid(),batchId,playerId:p.id,date,result:draft.get(p.id),recordedAt}));
  // Confirm browser storage succeeds before clearing the selections.
  const next={...state,drillResults:[...state.drillResults,...records]};
  try{localStorage.setItem(KEY,JSON.stringify(next))}catch{ $('drillResultsStatus').textContent='Could not save results. Keep this page open and try again.';return }
  state.drillResults=next.drillResults;
  draft.clear();rosterSignature='';save();
  const wins=records.filter(r=>r.result==='win').length;
  $('drillResultsStatus').textContent=`Saved ${wins} drill wins and ${records.length-wins} drill losses for ${date}.`;
 });
 window.renderDrillResults=render;render();
})();
