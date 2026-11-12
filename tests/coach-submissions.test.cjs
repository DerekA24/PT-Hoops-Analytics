const test=require('node:test');
const assert=require('node:assert/strict');
const {PTCoachSubmissions}=require('../PT_Hub_Complete_Handoff_2026-11-04/01_STUDENTS/frontend/assets/coach-submissions.js');

const shot=(id,makes,extra={})=>({id,playerId:'p1',date:'2026-11-11',type:'Free Throws',drill:'Athlete Quick Entry',makes,attempts:1,recordedAt:`2026-11-11T17:44:${String(id).padStart(2,'0')}Z`,...extra});

test('groups attempts by athlete, date, shot type, and drill without changing records',()=>{
 const records=[shot(1,1),shot(2,0),shot(3,1,{playerId:'p2'}),shot(4,1,{date:'2026-11-12'}),shot(5,0,{drill:'Other'}),shot(6,1,{drill:'Free Throws'})];
 const groups=PTCoachSubmissions.group(records);
 assert.equal(groups.length,4);
 const first=groups.find(group=>group.playerId==='p1'&&group.date==='2026-11-11'&&group.drill==='');
 assert.equal(first.records.length,3);
 assert.equal(first.makes,2);
 assert.equal(first.attempts,3);
 assert.equal(records.length,6);
});

test('group correction flips outcomes while retaining shot IDs and attempts',()=>{
 const records=[shot(1,1),shot(2,0),shot(3,0)];
 const plan=PTCoachSubmissions.plan(records,2,1);
 assert.equal(plan.remove.length,0);
 assert.equal(plan.added,0);
 assert.deepEqual(plan.keep.map(item=>item.record.id),[1,2,3]);
 assert.equal(plan.keep.reduce((sum,item)=>sum+item.makes,0),2);
});

test('group correction removes surplus records and adds missing attempts',()=>{
 const records=[shot(1,1),shot(2,0),shot(3,1)];
 const reduced=PTCoachSubmissions.plan(records,1,1);
 assert.deepEqual(reduced.remove.map(item=>item.id),[3]);
 assert.equal(reduced.keep.reduce((sum,item)=>sum+item.makes,0),1);
 const enlarged=PTCoachSubmissions.plan(records,3,2);
 assert.equal(enlarged.remove.length,0);
 assert.equal(enlarged.added,2);
 assert.equal(enlarged.keep.reduce((sum,item)=>sum+item.makes,0)+enlarged.addedMakes,3);
});

test('group correction can retain part of a local aggregate record',()=>{
 const plan=PTCoachSubmissions.plan([shot(1,3,{attempts:5})],2,0);
 assert.equal(plan.keep[0].attempts,2);
 assert.equal(plan.keep[0].makes,2);
 assert.equal(plan.added,0);
});
