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
const niv = KIDS.find(k => k.id === 'niv');
const raz = KIDS.find(k => k.id === 'raz');
const noy = KIDS.find(k => k.id === 'noy');
expect(niv && raz && noy, 'all three kids present');
const exp = ['12:45','12:45','13:30','13:30','12:45','11:45'];
niv.days.forEach((b,d)=>{ const last=b[b.length-1]; expect(last && last.e===exp[d], 'niv exit d'+d+' = '+exp[d]+' got '+(last&&last.e)); });
// Noy exit times (derived from the photo's bell pattern)
const expNoy = ['13:45','14:45','13:45','13:45','14:45', null];
noy.days.forEach((b,d)=>{ const last=b[b.length-1];
  if (expNoy[d] === null) expect(!last, 'noy day '+d+' has no school');
  else expect(last && last.e===expNoy[d], 'noy exit d'+d+' = '+expNoy[d]+' got '+(last&&last.e)); });
// Raz exit times after dropping הנדסת תוכנה (2026-09-07): Sun 14:30, Thu 13:40
const expRaz = ['14:30','14:30','14:30','13:00','13:40', null];
raz.days.forEach((b,d)=>{ const last=b[b.length-1];
  if (expRaz[d] === null) expect(!last, 'raz day '+d+' has no school');
  else expect(last && last.e===expRaz[d], 'raz exit d'+d+' = '+expRaz[d]+' got '+(last&&last.e)); });

const mk = (dateStr, jsDow, hm) => { const [h,m]=hm.split(':').map(Number); return {dateStr, jsDow, minutes:h*60+m, seconds:0}; };
const S = (kid, now) => kidStatus(kid, now);

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
expect(S(raz, mk('2026-09-10',4,'15:00')).type==='done' && S(raz, mk('2026-09-10',4,'15:00')).end==='13:40', 'raz Thu(ה׳) 15:00 done 13:40 (after dropping SE)');
expect(S(raz, mk('2026-09-06',0,'15:00')).type==='done' && S(raz, mk('2026-09-06',0,'15:00')).end==='14:30', 'raz Sun 15:00 done 14:30 (after dropping SE)');
expect(S(raz, mk('2026-09-06',0,'14:10')).block.label==='תנ״ך', 'raz Sun 14:10 תנ״ך (13:50-14:30) still there');
expect(S(raz, mk('2026-09-07',1,'13:30')).block.label==='מדעי המחשב', 'raz Mon(ב׳) 13:30 מדעי המחשב (12:20-14:30)');
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

// Noy checks (grade 8, Bereshit Nesher)
expect(S(noy, mk('2026-09-07',1,'08:45')).block.label==='של״ח', 'noy Mon 08:45 של״ח (lesson 1 only)');
expect(S(noy, mk('2026-09-07',1,'09:30')).block.label==='תנ״ך', 'noy Mon 09:30 תנ״ך (lesson 2)');
expect(S(noy, mk('2026-09-07',1,'11:00')).block.label==='מתמטיקה', 'noy Mon 11:00 math');
expect(S(noy, mk('2026-09-07',1,'10:15')).type==='before' && S(noy, mk('2026-09-07',1,'10:15')).started===true, 'noy Mon 10:15 = big break 10:00-10:30');
expect(S(noy, mk('2026-09-07',1,'13:20')).block.label==='אנגלית', 'noy Mon 13:20 english (13:00-14:45)');
expect(S(noy, mk('2026-09-07',1,'14:15')).block.label==='אנגלית', 'noy Mon 14:15 english 7th lesson');
expect(S(noy, mk('2026-09-07',1,'20:00')).type==='done' && S(noy, mk('2026-09-07',1,'20:00')).end==='14:45', 'noy Mon done 14:45');
expect(S(noy, mk('2026-09-06',0,'13:20')).block.label==='להיות', 'noy Sun 13:20 להיות (6th lesson)');
expect(S(noy, mk('2026-09-06',0,'14:30')).type==='done' && S(noy, mk('2026-09-06',0,'14:30')).end==='13:45', 'noy Sun done 13:45');
expect(S(noy, mk('2026-09-08',2,'09:00')).block.label==='מדעים', 'noy Tue(ג׳) 09:00 science');
expect(S(noy, mk('2026-09-09',3,'12:30')).block.label==='שפה', 'noy Wed(ד׳) 12:30 שפה');
expect(S(noy, mk('2026-09-10',4,'08:45')).block.label==='בראשית', 'noy Thu(ה׳) 08:45 בראשית');
expect(S(noy, mk('2026-09-10',4,'14:15')).block.label==='תנ״ך', 'noy Thu(ה׳) 14:15 תנ״ך');
expect(S(noy, mk('2026-09-10',4,'15:00')).type==='done', 'noy Thu done 14:45');
expect(S(noy, mk('2026-09-11',5,'10:00')).type==='holiday', 'noy Fri 11.9 RH holiday');
expect(S(noy, mk('2026-09-04',5,'10:00')).type==='free', 'noy regular Fri free (no school)');
expect(S(noy, mk('2026-09-13',0,'09:30')).type==='holiday', 'noy Sun 13.9 RH holiday');

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
