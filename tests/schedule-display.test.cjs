const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'PT_Hub_Complete_Handoff_2026-11-04', '01_STUDENTS', 'frontend', 'assets', 'schedule.js'), 'utf8');
const fixedNow = '2026-11-10T12:00:00-05:00';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return new Date(fixedNow).getTime(); }
}

function renderSchedule(schedule, games) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {innerHTML:'', textContent:'', value:'', checked:false, hidden:false, addEventListener(){}, close(){}, showModal(){}, focus(){}});
    return elements.get(id);
  };
  const context = {
    state:{schedule,games,players:[]},
    document:{getElementById:element,querySelectorAll:()=>[],visibilityState:'visible'},
    window:{addEventListener(){},seedSeasonSchedule(){}},
    Date:FixedDate, Intl, URL,
    $:element, esc:value=>String(value),
    setInterval:()=>0,
  };
  vm.runInNewContext(source, context);
  return element('scheduleGameList').innerHTML;
}

test('duplicate schedule rows display once and future scores stay hidden', () => {
  const schedule = [
    {id:'seed',date:'2026-12-04',time:'19:30',opponent:'Herron*',location:'Away'},
    {id:'coach',date:'2026-12-04',time:'19:30',opponent:'Herron*',location:'Away'},
  ];
  const games = [{id:'game',scheduleId:'coach',date:'2026-12-04',time:'19:30',opponent:'Herron*',location:'Away',played:true,teamScore:0,opponentScore:0}];
  const html = renderSchedule(schedule,games);
  assert.equal((html.match(/class="schedule-game"/g)||[]).length,1);
  assert.match(html,/Upcoming/);
  assert.doesNotMatch(html,/>0 – 0</);
  assert.match(html,/data-game-key="s:coach"/);
});

test('a completed past game keeps its score', () => {
  const html = renderSchedule([{id:'past',date:'2026-11-01',time:'19:30',opponent:'University',location:'Home'}],
    [{id:'result',scheduleId:'past',date:'2026-11-01',opponent:'University',played:true,final:true,teamScore:72,opponentScore:65}]);
  assert.match(html,/72 – 65/);
  assert.doesNotMatch(html,/Result pending/);
});

test('a past game without a result remains visible', () => {
  const html = renderSchedule([{id:'past',date:'2026-11-01',time:'19:30',opponent:'University',location:'Home'}],[]);
  assert.match(html,/University/);
  assert.match(html,/Result pending/);
});

test('a game in progress today shows its live score instead of Upcoming', () => {
  const html = renderSchedule([{id:'today',date:'2026-11-10',time:'19:30',opponent:'Roncalli',location:'Home'}],
    [{id:'live',scheduleId:'today',date:'2026-11-10',opponent:'Roncalli',played:true,final:false,teamScore:41,opponentScore:38,events:[{id:'e1',type:'TWO_M'}]}]);
  assert.match(html,/41 – 38/);
  assert.match(html,/In progress/);
  assert.doesNotMatch(html,/Upcoming/);
});
