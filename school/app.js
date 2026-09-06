/* ── לוח הלימודים המשפחתי · לוגיקה ───────────────────────────── */

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const TZ = "Asia/Jerusalem";

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, "0");

/* שעון ישראל — מדויק גם אם המכשיר באזור זמן אחר */
function isrNow() {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => (p.find((x) => x.type === t) || {}).value;
  const jsDow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    jsDow,                      // 0 = Sunday … 6 = Saturday
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    seconds: Number(get("second")),
    hm: `${get("hour")}:${get("minute")}`,
    hms: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function inRange(fromISO, toISO, dateStr) { return dateStr >= fromISO && dateStr <= toISO; }

function holidayFor(dateStr) {
  for (const h of HOLIDAYS) if (inRange(h.from, h.to, dateStr)) return h.label;
  return null;
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* ── חישוב מצב נוכחי לילד ── */
function kidStatus(kid, now) {
  const hol = holidayFor(now.dateStr);
  if (hol) return { type: "holiday", text: hol };

  if (now.jsDow === 6) return { type: "free", text: "שבת — אין לימודים" };
  const blocks = kid.days[now.jsDow];
  if (!blocks || blocks.length === 0) return { type: "free", text: "אין לימודים היום" };

  const cur = blocks.find((b) => now.minutes >= toMin(b.s) && now.minutes < toMin(b.e));
  if (cur) {
    const idx = blocks.indexOf(cur);
    const next = idx + 1 < blocks.length ? blocks[idx + 1] : null;
    return { type: "lesson", block: cur, next, endsDay: !next };
  }
  const next = blocks.find((b) => toMin(b.s) > now.minutes);
  if (next) {
    return { type: "before", next, first: blocks[0], started: now.minutes >= toMin(blocks[0].s) };
  }
  const last = blocks[blocks.length - 1];
  return { type: "done", end: last.e };
}

/* ── בניית טבלה ── */
function buildGrid(kid) {
  const maxP = Math.max(...kid.days.flat().map((b) => Math.max(...b.p)));
  // cellMap[period][dayIdx] = {block, isStart}
  const cellMap = Array.from({ length: maxP + 1 }, () => Array(6).fill(null));
  kid.days.forEach((blocks, d) => {
    blocks.forEach((b) => b.p.forEach((p, i) => { cellMap[p][d] = { block: b, isStart: i === 0 }; }));
  });
  return { maxP, cellMap };
}

function exitTime(kid, d) {
  const blocks = kid.days[d];
  if (!blocks || !blocks.length) return null;
  return blocks[blocks.length - 1].e;
}

function renderKid(kid) {
  const sec = document.createElement("section");
  sec.className = "kid";
  sec.id = `kid-${kid.id}`;
  sec.style.setProperty("--kid-accent", kid.accent);
  sec.style.setProperty("--kid-now-bg", hexToRgba(kid.accent, 0.07));
  sec.style.setProperty("--kid-now-line", hexToRgba(kid.accent, 0.22));
  sec.style.setProperty("--kid-bg", hexToRgba(kid.accent, 0.12));

  sec.innerHTML = `
    <div class="kid-card">
      <div class="kid-head">
        <div class="kid-avatar">${kid.emoji}</div>
        <div class="kid-title">
          <h2>${kid.name} <span class="kid-grade">${kid.grade}</span></h2>
          ${kid.note ? `<div class="kid-note">${kid.note}</div>` : ""}
        </div>
      </div>
      <div class="now" id="now-${kid.id}"></div>
      <div class="table-wrap">
        <table id="tbl-${kid.id}">
          <thead><tr><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`;
  document.getElementById("kids").appendChild(sec);
  return sec;
}

function renderTable(kid, now) {
  const { maxP, cellMap } = buildGrid(kid);
  const tbl = document.getElementById(`tbl-${kid.id}`);
  const todayIdx = now.jsDow < 6 ? now.jsDow : -1;
  const holToday = holidayFor(now.dateStr);

  // כותרת ימים
  let head = `<thead><tr><th></th>`;
  for (let d = 0; d < 6; d++) {
    const isToday = d === todayIdx && !holToday;
    const exit = exitTime(kid, d);
    head += `<th class="day-head ${isToday ? "today" : ""}">
      ${DAY_NAMES[d]}${isToday ? " <span style='font-size:.72rem;font-weight:600'>· היום</span>" : ""}
      ${exit ? `<span class="dsub">יציאה ${exit}</span>` : `<span class="dsub">אין לימודים</span>`}
    </th>`;
  }
  head += `</tr></thead>`;

  // גוף: שורות לפי periods, כולל שורת יציאה
  let body = "<tbody>";
  const skip = Array.from({ length: maxP + 1 }, () => Array(6).fill(false));

  for (let p = 1; p <= maxP; p++) {
    body += `<tr>`;
    body += `<th class="period-th"><b>שיעור ${p}</b></th>`;
    for (let d = 0; d < 6; d++) {
      if (skip[p][d]) { continue; }            // מכוסה ב-rowspan
      const entry = cellMap[p][d];
      if (!entry) { body += `<td class="cell-empty"></td>`; continue; }
      const b = entry.block;
      if (!entry.isStart) { continue; }        // rowspan כבר פתח
      const cat = CATS[b.cat] || { c: "#17191f", bg: "#fff" };
      const n = b.p.length;
      for (let k = 1; k < n; k++) skip[p + k][d] = true;
      const isNow = d === todayIdx && !holToday &&
        now.minutes >= toMin(b.s) && now.minutes < toMin(b.e);
      const title = b.sub ? `${b.label} — ${b.sub}` : b.label;
      body += `<td class="cell ${isNow ? "now-cell" : ""}" rowspan="${n}"
        style="--c:${cat.c};--c-bg:${cat.bg}" title="${title}">
        <span class="cls">${b.label}</span>
        ${b.sub ? `<div class="csub">${b.sub}</div>` : ""}
        <span class="ctime">${b.s}–${b.e}</span>
      </td>`;
    }
    body += `</tr>`;
  }

  // שורת יציאה אחרונה
  body += `<tr class="exit-row"><td></td>`;
  for (let d = 0; d < 6; d++) {
    const exit = exitTime(kid, d);
    const dayDone = d === todayIdx && exit && now.minutes >= toMin(exit) && !holToday;
    body += `<td class="${dayDone ? "done-today" : ""}">
      ${exit ? `<span class="exit-tag">🏠 <b>${exit}</b></span>` : `<span class="exit-tag">—</span>`}
    </td>`;
  }
  body += `</tr></tbody>`;

  tbl.innerHTML = head + body;
}

/* ── פס סטטוס חי ── */
function statusLine(kid, status, now) {
  const el = document.getElementById(`now-${kid.id}`);
  if (!el) return;
  const s = status;
  let icon = "", main = "", meta = "";

  if (s.type === "holiday") { icon = "🎉"; main = `${s.text} — אין לימודים`; meta = "מנוחה מוערכת 😌"; }
  else if (s.type === "free") { icon = "🛌"; main = s.text; }
  else if (s.type === "lesson") {
    icon = `<span class="dot pulse" style="background:${kid.accent}"></span>`;
    main = `עכשיו: <span class="now-subject">${s.block.label}</span> · עד ${s.block.e}`;
    meta = s.next ? `הבא: ${s.next.label} ב-${s.next.s}` : (s.endsDay ? `נגמר היום ב-${s.block.e} 🏠` : "");
  }
  else if (s.type === "before") {
    icon = s.started ? "☕" : "⏳";
    main = s.started ? `הפסקה · הבא: <span class="now-subject">${s.next.label}</span> ב-${s.next.s}` :
      `מתחילים ב-${s.next.s}: <span class="now-subject">${s.next.label}</span>`;
    meta = s.started ? "" : `התחלת היום ${s.first.s}`;
  }
  else if (s.type === "done") {
    icon = "✅";
    main = `סיימו את היום ב-${s.end}`;
    meta = tomorrowHint(kid, now);
  }
  el.innerHTML = `<span class="now-icon">${icon}</span>
    <span class="now-main">${main}</span>
    ${meta ? `<span class="now-meta">${meta}</span>` : ""}`;
}

function tomorrowHint(kid, now) {
  // מה קורה מחר (אם מחר יום לימודים)
  let d = now.jsDow + 1;
  const tomorrowDate = new Date(now.dateStr + "T12:00:00Z");
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tStr = tomorrowDate.toISOString().slice(0, 10);
  if (holidayFor(tStr)) return `מחר: חופש (${holidayFor(tStr)})`;
  if (d >= 6) { d = 0; }
  const blocks = kid.days[d];
  if (!blocks || !blocks.length) return "מחר אין לימודים";
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  return `מחר (${DAY_NAMES[d]}): ${first.label} ב-${first.s} · עד ${last.e}`;
}

/* ── שעון ראשי ── */
function renderClock(now) {
  const t = document.getElementById("clock-time");
  const d = document.getElementById("clock-date");
  if (!t) return;
  t.textContent = now.hms;
  const heb = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  if (d) d.textContent = heb;
}

/* ── עדכון מחזורי ── */
function tick() {
  const now = isrNow();
  renderClock(now);
  KIDS.forEach((kid) => {
    const status = kidStatus(kid, now);
    statusLine(kid, status, now);
    renderTable(kid, now);
  });
}

/* ── אתחול ── */
document.addEventListener("DOMContentLoaded", () => {
  const kidsEl = document.getElementById("kids");
  kidsEl.innerHTML = "";
  if (!KIDS.length) {
    kidsEl.innerHTML = `<div class="kid-card" style="padding:32px;text-align:center;color:var(--muted)">
      עוד אין מערכות שעות — מוסיפים בקרוב.</div>`;
    return;
  }
  KIDS.forEach((kid) => renderKid(kid));
  tick();
  setInterval(tick, 30000);
});
