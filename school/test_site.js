// Site logic+data tests for /opt/data/school-site (pure logic, no real DOM)
const fs = require("fs");
const vm = require("vm");

const ctx = vm.createContext({
  console,
  document: {
    addEventListener: () => {},
    getElementById: () => null,
    createElement: () => ({ style: {}, set innerHTML(v) {}, appendChild() {} }),
  },
});
vm.runInContext(fs.readFileSync(__dirname + "/data.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync(__dirname + "/app.js", "utf8"), ctx);

const test = vm.runInContext(`(() => {
let ok = true;
const expect = (cond, msg) => { if(!cond){ ok=false; console.log('FAIL:', msg);} };
const toMin2 = (h) => { const [hh,mm]=h.split(':').map(Number); return hh*60+mm; };

for (const kid of KIDS) {
  expect(kid.days.length === 6, kid.id + ': 6 days');
  kid.days.forEach((blocks, d) => {
    for (const b of blocks) {
      expect(toMin2(b.s) < toMin2(b.e), kid.id+' d'+d+' time order '+b.s+'-'+b.e);
      expect(b.p.length === b.p.filter((v,i,a)=>a.indexOf(v)===i).length, kid.id+' dup periods');
      for (let i=1;i<b.p.length;i++) expect(b.p[i]===b.p[i-1]+1, kid.id+' d'+d+' contiguous p '+JSON.stringify(b.p));
    }
    const sorted = [...blocks].sort((a,b)=>toMin2(a.s)-toMin2(b.s));
    for (let i=1;i<sorted.length;i++) expect(toMin2(sorted[i-1].e) <= toMin2(sorted[i].s), kid.id+' d'+d+' overlap '+sorted[i-1].label+'/'+sorted[i].label);
  });
}
// Niv exit times vs documented pickup times
const niv = KIDS[0];
const exp = ['12:45','12:45','13:30','13:30','12:45','11:45'];
niv.days.forEach((b,d)=>{ const last=b[b.length-1]; expect(last && last.e===exp[d], 'niv exit d'+d+' = '+exp[d]+' got '+(last&&last.e)); });

const mk = (dateStr, jsDow, hm) => { const [h,m]=hm.split(':').map(Number); return {dateStr, jsDow, minutes:h*60+m, seconds:0}; };
const S = (kid, now) => kidStatus(kid, now);
const raz = KIDS[1];

const mon = mk('2026-09-07', 1, '10:30');
expect(S(niv, mon).type==='lesson' && S(niv, mon).block.label==='תורה', 'niv Mon 10:30 = תורה got '+(S(niv,mon).block||{}).label);
expect(S(raz, mon).type==='lesson' && S(raz, mon).block.label==='אנגלית 5 יח״ל', 'raz Mon 10:30 english');
const mon12 = mk('2026-09-07',1,'12:00');
expect(S(niv, mon12).type==='lesson' && S(niv, mon12).block.label==='מתמטיקה', 'niv Mon 12:00 math');
expect(S(raz, mon12).type==='before' && S(raz, mon12).started===true, 'raz Mon 12:00 = break before 12:20');
const mon20 = mk('2026-09-07',1,'20:00');
expect(S(niv, mon20).type==='done' && S(niv, mon20).end==='12:45', 'niv Mon 20:00 done');
expect(S(raz, mon20).type==='done' && S(raz, mon20).end==='14:30', 'raz Mon 20:00 done 14:30');
expect(S(niv, mk('2026-09-11',5,'09:00')).type==='holiday', 'niv Fri 11.9 RH holiday');
expect(S(niv, mk('2026-09-12',6,'12:00')).type==='holiday', 'niv Sat 12.9 RH holiday (not free)');
expect(S(niv, mk('2026-09-19',6,'12:00')).type==='free', 'niv Sat 19.9 free');
expect(S(niv, mk('2026-09-13',0,'09:30')).type==='holiday', 'niv Sun 13.9 RH holiday (3 days)');
expect(S(niv, mk('2026-09-10',4,'10:30')).block.label==='ספורט', 'niv Thu 10:30 sport (3rd lesson)');
expect(S(niv, mk('2026-09-10',4,'11:00')).block.label==='שבילי מורשת', 'niv Thu 11:00 heritage');
expect(S(raz, mk('2026-09-10',4,'15:00')).type==='lesson', 'raz Thu(ה׳) 15:00 lesson (long day to 16:00)');
expect(S(raz, mk('2026-09-09',3,'15:00')).type==='done' && S(raz, mk('2026-09-09',3,'15:00')).end==='13:00', 'raz Wed(ד׳) 15:00 done 13:00 short day');
expect(S(raz, mk('2026-09-10',4,'12:05')).type==='before', 'raz Thu 12:05 break before 12:20');
expect(S(raz, mk('2026-09-08',2,'09:00')).block.label.includes('חדו'), 'raz Tue(ג׳) 09:00 calculus');
expect(S(raz, mk('2026-09-08',2,'14:00')).block.label==='חנ״ג', 'raz Tue(ג׳) 14:00 sport (13:50-14:30)');
expect(S(raz, mk('2026-09-09',3,'11:30')).block.label==='חנ״ג', 'raz Wed(ד׳) 11:30 sport (11:10-11:55)');
expect(S(raz, mk('2026-09-06',0,'09:00')).type==='before', 'raz Sun 09:00 before (starts 10:25)');
expect(S(raz, mk('2026-09-06',0,'10:40')).block.label==='אנגלית 5 יח״ל', 'raz Sun 10:40 english');
// free day: raz Friday
expect(S(raz, mk('2026-09-04',5,'10:00')).type==='free', 'raz Fri free');
// tomorrow hint for niv when done Monday
const hint = tomorrowHint(niv, mk('2026-09-07',1,'20:00'));
expect(typeof hint === 'string' && hint.includes('שלישי'), 'niv hint mentions Tuesday got: '+hint);

// grid: every period row/day maps correctly; maxP sensible
for (const kid of KIDS) {
  const { maxP, cellMap } = buildGrid(kid);
  expect(maxP >= 4 && maxP <= 9, kid.id+' maxP sane '+maxP);
  for (let d=0; d<6; d++) {
    for (const b of kid.days[d]) {
      expect(cellMap[b.p[0]][d] && cellMap[b.p[0]][d].isStart === true, kid.id+' d'+d+' start cell of '+b.label);
    }
  }
}
return ok;
})()`, ctx);

console.log(test ? "ALL DATA+LOGIC TESTS PASSED ✅" : "SOME TESTS FAILED ❌");
