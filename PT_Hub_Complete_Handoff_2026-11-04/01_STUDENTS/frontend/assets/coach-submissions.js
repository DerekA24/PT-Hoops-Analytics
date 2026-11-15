(function(root){
 function counts(record){
  const attempts=Number(record.attempts)||0,makes=Number(record.makes)||0;
  return {attempts,makes};
 }
 function group(records){
  const groups=new Map();
  for(const record of records){
   const detail=String(record.drill||'').trim(),drill=detail===record.type||detail==='Athlete Quick Entry'?'':detail;
   const key=JSON.stringify([record.playerId,record.date,record.type,drill]);
   if(!groups.has(key))groups.set(key,{key,playerId:record.playerId,date:record.date,type:record.type,drill,records:[],makes:0,attempts:0});
   const item=groups.get(key),totals=counts(record);
   item.records.push(record);item.makes+=totals.makes;item.attempts+=totals.attempts;
  }
  return [...groups.values()].sort((a,b)=>String(b.records[0].recordedAt||b.date).localeCompare(String(a.records[0].recordedAt||a.date)));
 }
 function plan(records,made,missed){
  if(!Number.isSafeInteger(made)||!Number.isSafeInteger(missed)||made<0||missed<0||!Number.isSafeInteger(made+missed)||made+missed<1)throw Error('Enter valid whole numbers for Made and Missed. At least one attempt is required.');
  const ordered=records.slice().sort((a,b)=>String(a.recordedAt||'').localeCompare(String(b.recordedAt||''))||String(a.id).localeCompare(String(b.id)));
  const keep=[],remove=[];let remaining=made+missed;
  for(const record of ordered){
   const original=counts(record),attempts=Math.min(original.attempts,remaining);
   if(attempts)keep.push({record,attempts,makes:Math.min(original.makes,attempts)});
   else remove.push(record);
   remaining-=attempts;
  }
  const added=remaining,keptAttempts=keep.reduce((sum,item)=>sum+item.attempts,0),currentMakes=keep.reduce((sum,item)=>sum+item.makes,0);
  const minKeptMakes=Math.max(0,made-added),maxKeptMakes=Math.min(made,keptAttempts);
  let delta=Math.max(minKeptMakes,Math.min(maxKeptMakes,currentMakes))-currentMakes;
  for(const item of keep){
   if(delta>0){const change=Math.min(delta,item.attempts-item.makes);item.makes+=change;delta-=change}
   else if(delta<0){const change=Math.min(-delta,item.makes);item.makes-=change;delta+=change}
  }
  const addedMakes=made-keep.reduce((sum,item)=>sum+item.makes,0);
  return {keep,remove,added,addedMakes};
 }
 root.PTCoachSubmissions={group,plan};
 if(typeof module!=='undefined')module.exports={PTCoachSubmissions:root.PTCoachSubmissions};
})(typeof window==='undefined'?globalThis:window);
