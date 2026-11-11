const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','PT_Hub_Complete_Handoff_2026-11-04','01_STUDENTS','frontend','assets','live-game-resets.js'),'utf8');
const context={window:{},Date};
vm.runInNewContext(code,context);
const resets=context.window.PTLiveGameResets;

test('reset score keeps shots and Undo restores the previous score',()=>{
 const shot={id:'shot',type:'TWO_M',source:'game-situation'};
 const game={events:[shot],teamScore:8,opponentScore:5,oppScore:5};
 resets.score(game,'reset','game-situation',{pt:8,opponent:5});
 assert.equal(game.teamScore,0);assert.equal(game.opponentScore,0);
 assert.equal(game.events.length,2);assert.equal(game.events[0],shot);
 assert.equal(resets.undo(game),true);
 assert.equal(game.teamScore,8);assert.equal(game.opponentScore,5);
 assert.equal(game.events.length,1);assert.equal(game.events[0],shot);
});

test('reset roster clears both teams and Undo restores lineups and selection',()=>{
 const shot={id:'shot',type:'TWO_M',source:'game-situation'};
 const lineups={pt:['p1','p2','','',''],opponent:['p3','','','','']};
 const active={team:'pt',slot:0,playerId:'p1'};
 const game={events:[shot],liveLineups:lineups,liveActive:active};
 resets.roster(game,'reset','game-situation',lineups,active);
 assert.ok([...game.liveLineups.pt,...game.liveLineups.opponent].every(id=>!id));
 assert.equal(game.liveActive,null);
 assert.equal(resets.undo(game),true);
 assert.deepEqual(JSON.parse(JSON.stringify(game.liveLineups)),lineups);
 assert.deepEqual(JSON.parse(JSON.stringify(game.liveActive)),active);
 assert.equal(game.events.length,1);
 assert.equal(resets.undo(game),false);
});

test('consecutive resets undo in reverse order',()=>{
 const game={events:[],teamScore:4,opponentScore:2,liveLineups:{pt:['p1','','','',''],opponent:['','','','','']},liveActive:{team:'pt',slot:0,playerId:'p1'}};
 resets.score(game,'score','game-situation',{pt:4,opponent:2});
 resets.roster(game,'roster','game-situation',game.liveLineups,game.liveActive);
 assert.equal(resets.undo(game),true);
 assert.equal(game.teamScore,0);
 assert.equal(game.liveLineups.pt[0],'p1');
 assert.equal(resets.undo(game),true);
 assert.equal(game.teamScore,4);
 assert.equal(game.opponentScore,2);
});
