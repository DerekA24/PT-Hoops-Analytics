// User-provided 2026–27 varsity schedule. Asterisks are preserved as provided.
window.PT_SEASON_SCHEDULE=[
 {id:'pt-2026-11-25',date:'2026-11-25',time:'19:30',opponent:'University',location:'Home'},
 {id:'pt-2026-12-04',date:'2026-12-04',time:'19:30',opponent:'Herron*',location:'Away'},
 {id:'pt-2026-12-12',date:'2026-12-12',time:'19:30',opponent:'ISMHS',location:'Away'},
 {id:'pt-2027-01-02',date:'2027-01-02',time:'19:30',opponent:'Roncalli',location:'Away'},
 {id:'pt-2027-01-06',date:'2027-01-06',time:'19:30',opponent:'Lawrence Central',location:'Away'},
 {id:'pt-2027-01-08',date:'2027-01-08',time:'19:30',opponent:'Indian Creek',location:'Home'},
 {id:'pt-2027-01-09',date:'2027-01-09',time:'19:30',opponent:'Indianapolis Shortridge*',location:'Away'},
 {id:'pt-2027-01-12',date:'2027-01-12',time:'18:00',opponent:'Warren Central***',location:'Home'},
 {id:'pt-2027-01-22',date:'2027-01-22',time:'19:30',opponent:'GCA',location:'Home'},
 {id:'pt-2027-01-29',date:'2027-01-29',time:'19:30',opponent:'Bethesda Christian*',location:'Away'},
 {id:'pt-2027-02-04',date:'2027-02-04',time:'18:00',opponent:'International*',location:'Home'},
 {id:'pt-2027-02-06',date:'2027-02-06',time:'14:30',opponent:'BJPHS',location:'Away'},
 {id:'pt-2027-02-09',date:'2027-02-09',time:'19:30',opponent:'IBCHS',location:'Away'},
 {id:'pt-2027-02-17',date:'2027-02-17',time:'19:30',opponent:'Indianapolis Washington',location:'Home'},
 {id:'pt-2027-02-20',date:'2027-02-20',time:'19:30',opponent:'Indianapolis Lutheran',location:'Away'},
 {id:'pt-2027-02-26',date:'2027-02-26',time:'19:30',opponent:'Phalen Leadership Academy',location:'Home'}
];
window.seedSeasonSchedule=()=>{
 const key='pt-schedule-2026-27-seed-v1';if(localStorage.getItem(key))return;
 if(state.schedule.length||state.games.length){localStorage.setItem(key,'done');return}
 const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');let added=false;
 const matches=(a,b)=>a.id===b.id||a.date===b.date&&normalize(a.opponent)===normalize(b.opponent);
 for(const item of window.PT_SEASON_SCHEDULE)if(!state.schedule.some(s=>matches(s,item))&&!state.games.some(g=>matches(g,item))){state.schedule.push({...item});added=true}
 if(added)save();localStorage.setItem(key,'done');
};
