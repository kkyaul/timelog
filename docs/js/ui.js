// ─── ui.js ─────────────────────────────────────────────────────────────────
import { signIn, signOut } from "./app.js";
import {
  fetchRecent, fetchByDate, fetchByYear, fetchByMonth, fetchByWeek,
  calcCategoryTotals, calcSleepAvg, calcDelta,
  updateField, syncDate,
} from "./api.js";

// ─── 아이콘 ID 매핑 ───────────────────────────────────────────────────────
const ICON = {
  sleep:    "ico-sleep",
  work:     "ico-work",
  english:  "ico-english",
  violin:   "ico-violin",
  reading:  "ico-reading",
  exercise: "ico-exercise",
  waste:    "ico-waste",
};

const FIELDS = ["sleep", "work", "english", "violin", "reading", "exercise", "waste"];

// ─── SVG 아이콘 헬퍼 ──────────────────────────────────────────────────────
function icon(id, cls = "icon", color = "") {
  return `<svg class="${cls}"${color ? ` style="stroke:${color}"` : ""}><use href="#${id}"/></svg>`;
}

// ─── 뷰 전환 ──────────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nb").forEach(b => b.classList.remove("on"));
  document.getElementById(`v-${id}`)?.classList.add("active");
  document.querySelector(`.nb[data-view="${id}"]`)?.classList.add("on");
}

// ─── 토스트 메시지 ────────────────────────────────────────────────────────
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  setTimeout(() => el.classList.remove("show"), 2500);
}

// ════════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ════════════════════════════════════════════════════════════════════════════

let listCache = [];

async function renderList() {
  const container = document.getElementById("list-body");
  if (!container) return;
  container.innerHTML = `<div class="loading">// loading...</div>`;

  try {
    listCache = await fetchRecent(50);
    if (!listCache.length) {
      container.innerHTML = `<div class="empty">// no records yet</div>`;
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    container.innerHTML = listCache.map(r => rowHTML(r, r.date === today)).join("");

    // 클릭 이벤트
    container.querySelectorAll(".lr").forEach(el => {
      el.addEventListener("click", () => {
        const d = el.dataset.date;
        renderDetail(d);
        showView("detail");
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="error">// error: ${e.message}</div>`;
  }
}

function rowHTML(r, isToday) {
  const cells = FIELDS.map(f => {
    const val = r[f] && r[f] !== "0:00" ? r[f] : null;
    return `
      <div class="lg-cell ${val ? "has-data" : "empty"}">
        ${icon(ICON[f], "icon", val ? `var(--${f})` : "")}
        <span class="lg-val" style="${val ? `color:var(--${f})` : ""}">${val || "—"}</span>
      </div>`;
  }).join("");

  return `
    <div class="lr" data-date="${r.date}">
      <div class="lr-top">
        <span class="lr-date${isToday ? " today" : ""}">${r.date}</span>
        <span class="lr-wk">W${String(r.week).padStart(2,"0")}</span>
        <span class="lr-arr">›</span>
      </div>
      <div class="lr-grid">${cells}</div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// DETAIL VIEW
// ════════════════════════════════════════════════════════════════════════════

let currentDetailDate = null;

async function renderDetail(dateStr) {
  currentDetailDate = dateStr;
  const container = document.getElementById("detail-body");
  document.getElementById("d-date").textContent = dateStr;
  document.getElementById("d-cmd").textContent  = `cat ${dateStr}.log`;
  container.innerHTML = `<div class="loading">// loading...</div>`;

  try {
    const r = await fetchByDate(dateStr);
    if (!r) {
      container.innerHTML = `<div class="empty">// no data for ${dateStr}</div>`;
      return;
    }
    document.getElementById("d-wk").textContent = `W${String(r.week).padStart(2,"0")}`;

    container.innerHTML = FIELDS.map(f => {
      const val = r[f] || "0:00";
      const isEmpty = val === "0:00";
      return `
        <div class="di">
          <div class="di-l">
            <div class="di-bar" style="background:var(--${f})"></div>
            <div class="di-icon-wrap">
              ${icon(ICON[f], "icon-lg")}
              <span>${f}</span>
            </div>
          </div>
          <div class="di-r">
            <span class="di-time${isEmpty ? " zero" : ""}" id="dt-${f}">${isEmpty ? "—" : val}</span>
            <button class="eb" data-field="${f}" data-date="${dateStr}">[ edit ]</button>
          </div>
        </div>`;
    }).join("");

    // edit 버튼
    container.querySelectorAll(".eb").forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field;
        const date  = btn.dataset.date;
        openEditModal(date, field, r[field] || "0:00");
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="error">// error: ${e.message}</div>`;
  }
}

// sync calendar 버튼
document.getElementById("btn-sync-detail")?.addEventListener("click", async () => {
  if (!currentDetailDate) return;
  const btn = document.getElementById("btn-sync-detail");
  btn.textContent = "syncing...";
  btn.disabled = true;
  try {
    await syncDate(currentDetailDate);
    toast(`${currentDetailDate} synced`, "success");
    await renderDetail(currentDetailDate);
  } catch (e) {
    toast(`sync failed: ${e.message}`, "error");
  } finally {
    btn.textContent = "▶ sync calendar";
    btn.disabled = false;
  }
});

// back 버튼
document.getElementById("btn-back")?.addEventListener("click", () => showView("list"));

// ─── Edit Modal ────────────────────────────────────────────────────────────
function openEditModal(date, field, currentVal) {
  const modal    = document.getElementById("edit-modal");
  const input    = document.getElementById("edit-input");
  const fieldLbl = document.getElementById("edit-field-label");
  const dateLbl  = document.getElementById("edit-date-label");

  fieldLbl.textContent = field;
  dateLbl.textContent  = date;
  input.value = currentVal === "—" ? "0:00" : currentVal;
  modal.classList.remove("hidden");
  input.focus();
  input.select();

  document.getElementById("edit-confirm").onclick = async () => {
    const val = input.value.trim();
    if (!/^\d+:\d{2}$/.test(val)) {
      toast("형식: H:MM (예: 7:30)", "error");
      return;
    }
    try {
      await updateField(date, field, val);
      document.getElementById(`dt-${field}`).textContent = val;
      document.getElementById(`dt-${field}`).classList.remove("zero");
      modal.classList.add("hidden");
      toast("저장됐어요", "success");
    } catch (e) {
      toast(`저장 실패: ${e.message}`, "error");
    }
  };

  document.getElementById("edit-cancel").onclick = () => modal.classList.add("hidden");
}

// ════════════════════════════════════════════════════════════════════════════
// STAT VIEW
// ════════════════════════════════════════════════════════════════════════════

let statMode = "week"; // "year" | "month" | "week"
let statYear  = new Date().getFullYear();
let statMonth = new Date().getMonth() + 1;
let statWeek  = getWeekNumber(new Date());

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// ─── 선택기 초기화 ────────────────────────────────────────────────────────
function initStatSelectors() {
  const now   = new Date();
  const curY  = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => curY - i); // 최근 5년

  // year 선택기
  const yearSel = document.getElementById("sel-year-val");
  years.forEach(y => {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    if (y === statYear) opt.selected = true;
    yearSel.appendChild(opt);
  });
  yearSel.addEventListener("change", () => {
    statYear = parseInt(yearSel.value);
    renderStat();
  });
  document.getElementById("year-prev")?.addEventListener("click", () => {
    statYear--;
    syncSelectValue("sel-year-val", statYear, years);
    renderStat();
  });
  document.getElementById("year-next")?.addEventListener("click", () => {
    if (statYear >= curY) return;
    statYear++;
    syncSelectValue("sel-year-val", statYear, years);
    renderStat();
  });

  // month 연도 선택기
  const monthYearSel = document.getElementById("sel-month-year");
  years.forEach(y => {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    if (y === statYear) opt.selected = true;
    monthYearSel.appendChild(opt);
  });
  monthYearSel.addEventListener("change", () => {
    statYear = parseInt(monthYearSel.value);
    renderStat();
  });
  // month 값 선택기 (HTML에 이미 옵션 있음)
  const monthSel = document.getElementById("sel-month-val");
  monthSel.value = statMonth;
  monthSel.addEventListener("change", () => {
    statMonth = parseInt(monthSel.value);
    renderStat();
  });

  // week 연도 선택기
  const weekYearSel = document.getElementById("sel-week-year");
  years.forEach(y => {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    if (y === statYear) opt.selected = true;
    weekYearSel.appendChild(opt);
  });
  weekYearSel.addEventListener("change", () => {
    statYear = parseInt(weekYearSel.value);
    buildWeekOptions(statYear);
    renderStat();
  });
  // week 값 선택기 — 동적 생성
  buildWeekOptions(statYear);
}

function buildWeekOptions(year) {
  const sel = document.getElementById("sel-week-val");
  const totalWeeks = weeksInYear(year);
  sel.innerHTML = "";
  for (let w = 1; w <= totalWeeks; w++) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `W${String(w).padStart(2, "0")}`;
    if (w === statWeek) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => {
    statWeek = parseInt(sel.value);
    renderStat();
  });
}

// ISO 기준 해당 연도의 총 주차 수
function weeksInYear(year) {
  const d = new Date(year, 11, 28); // 12월 28일은 항상 마지막 주
  return getWeekNumber(d);
}

function syncSelectValue(id, val, options) {
  const sel = document.getElementById(id);
  if (!sel) return;
  // 옵션에 없으면 추가
  if (!options.includes(val)) {
    const opt = document.createElement("option");
    opt.value = val; opt.textContent = val;
    sel.appendChild(opt);
  }
  sel.value = val;
}

// 모드에 따라 선택기 표시/숨기기
function updateSelectorVisibility() {
  document.getElementById("sel-year").classList.toggle("hidden",  statMode !== "year");
  document.getElementById("sel-month").classList.toggle("hidden", statMode !== "month");
  document.getElementById("sel-week").classList.toggle("hidden",  statMode !== "week");
}

async function renderStat() {
  const body = document.getElementById("stat-body");
  body.innerHTML = `<div class="loading">// loading...</div>`;

  try {
    let currRecords = [], prevRecords = [];
    let currLabel = "", prevLabel = "";

    if (statMode === "year") {
      currRecords = await fetchByYear(statYear);
      prevRecords = await fetchByYear(statYear - 1);
      currLabel = `${statYear}`;
      prevLabel = `${statYear - 1}`;
    } else if (statMode === "month") {
      currRecords = await fetchByMonth(statYear, statMonth);
      const pm = statMonth === 1 ? 12 : statMonth - 1;
      const py = statMonth === 1 ? statYear - 1 : statYear;
      prevRecords = await fetchByMonth(py, pm);
      currLabel = `${statYear}-${String(statMonth).padStart(2,"0")}`;
      prevLabel = `${py}-${String(pm).padStart(2,"0")}`;
    } else {
      currRecords = await fetchByWeek(statYear, statWeek);
      const pw = statWeek === 1 ? 52 : statWeek - 1;
      const py = statWeek === 1 ? statYear - 1 : statYear;
      prevRecords = await fetchByWeek(py, pw);
      currLabel = `W${String(statWeek).padStart(2,"0")}`;
      prevLabel = `W${String(pw).padStart(2,"0")}`;
    }

    const curr = calcCategoryTotals(currRecords);
    const prev = calcCategoryTotals(prevRecords);
    const currSleep = calcSleepAvg(currRecords);
    const prevSleep = calcSleepAvg(prevRecords);
    const sleepDelta = calcDelta(currSleep, prevSleep);

    // sleep avg 섹션
    const sleepHTML = `
      <div class="sec">sleep avg</div>
      <div class="sleep-row">
        <div class="sl-cell">
          <div class="sl-label">${icon("ico-sleep")} ${currLabel}</div>
          <div class="sl-val">${currSleep}</div>
        </div>
        <div class="sl-cell prev">
          <div class="sl-label">${prevLabel}</div>
          <div class="sl-val">${prevSleep}</div>
        </div>
      </div>`;

    // 카테고리별 breakdown
    const maxMin = Math.max(
      ...FIELDS.map(f => {
        const [h, m] = (curr[f] || "0:00").split(":").map(Number);
        return h * 60 + m;
      }), 1
    );

    const barsHTML = FIELDS.map(f => {
      const delta = calcDelta(curr[f], prev[f]);
      const currMin = (() => { const [h,m] = (curr[f]||"0:00").split(":").map(Number); return h*60+m; })();
      const prevMin = (() => { const [h,m] = (prev[f]||"0:00").split(":").map(Number); return h*60+m; })();
      const currPct = Math.round((currMin / maxMin) * 100);
      const prevPct = Math.round((prevMin / maxMin) * 100);
      const deltaSymbol = delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "━";

      return `
        <div class="cat-row">
          <div class="cat-icon">${icon(ICON[f])}</div>
          <div class="cat-bars">
            <div class="cat-bar-wrap">
              <div class="cat-bar-label" style="color:var(--accent);font-size:8px;">${currLabel}</div>
              <div class="cat-bar-track">
                <div class="cat-bar-fill" style="width:${currPct}%;background:var(--${f})"></div>
              </div>
            </div>
            <div class="cat-bar-wrap">
              <div class="cat-bar-label" style="color:var(--dim2);font-size:8px;">${prevLabel}</div>
              <div class="cat-bar-track">
                <div class="cat-bar-fill" style="width:${prevPct}%;background:var(--dim2)"></div>
              </div>
            </div>
          </div>
          <div class="cat-vals">
            <div class="cat-val-curr" style="color:var(--${f})">${curr[f]}</div>
            <div class="cat-val-prev">${prev[f]}</div>
          </div>
          <div class="cat-delta-col">
            <div class="cat-delta ${delta.dir}">${deltaSymbol}${delta.diff}</div>
            <div style="height:17px"></div>
          </div>
        </div>`;
    }).join("");

    body.innerHTML = sleepHTML + `<div class="sec">category · ${currLabel} vs ${prevLabel}</div>` + barsHTML;

    // period selector 업데이트
    updatePeriodDisplay(currLabel);

  } catch (e) {
    body.innerHTML = `<div class="error">// error: ${e.message}</div>`;
  }
}

function updatePeriodDisplay(label) {
  // selector visibility handles display — label shown in stat body sections
}

// ─── stat 모드 탭 버튼 ───────────────────────────────────────────────────
document.querySelectorAll(".fb").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".fb").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    statMode = btn.dataset.mode;
    updateSelectorVisibility();
    renderStat();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SYNC VIEW (~/sync 탭)
// ════════════════════════════════════════════════════════════════════════════

document.getElementById("btn-do-sync")?.addEventListener("click", async () => {
  const input = document.getElementById("sync-date-input");
  const dateStr = input.value;
  if (!dateStr) { toast("날짜를 입력해주세요", "error"); return; }

  const btn = document.getElementById("btn-do-sync");
  const resultArea = document.getElementById("sync-result");
  btn.textContent = "syncing...";
  btn.disabled = true;

  try {
    const res = await syncDate(dateStr);
    const d = res.data;

    // 결과 표시
    const cells = FIELDS.map(f => `
      <div class="sr-cell">
        ${icon(ICON[f])}
        <span class="sr-val" style="${d[f] && d[f] !== "0:00" ? `color:var(--${f})` : "color:var(--dim2)"}">${d[f] || "—"}</span>
      </div>`).join("");

    resultArea.innerHTML = `
      <div class="sr-date">// result · ${dateStr}</div>
      <div class="sr-grid">${cells}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--exercise)">✓ saved to firestore</div>`;

    // sync 이력 갱신
    addSyncHistory(dateStr, "manual sync");
    toast(`${dateStr} sync 완료`, "success");
  } catch (e) {
    resultArea.innerHTML = `<div class="error">// error: ${e.message}</div>`;
    toast(`sync 실패: ${e.message}`, "error");
  } finally {
    btn.textContent = "▶ sync";
    btn.disabled = false;
  }
});

function addSyncHistory(dateStr, label) {
  const list = document.getElementById("sync-history");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "sync-hist-row";
  const now = new Date().toTimeString().slice(0,5);
  row.innerHTML = `<span>${dateStr}</span><span style="color:var(--dim2)">${label} ${now}</span>`;
  list.prepend(row);
}

// ════════════════════════════════════════════════════════════════════════════
// NAV
// ════════════════════════════════════════════════════════════════════════════

document.querySelectorAll(".nb").forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    showView(view);
    if (view === "list")   renderList();
    if (view === "stat")   renderStat();
  });
});

// ─── 로그인 버튼 ──────────────────────────────────────────────────────────
document.getElementById("btn-login")?.addEventListener("click", signIn);
document.getElementById("btn-signout")?.addEventListener("click", signOut);

// ─── 앱 준비 시 최초 렌더 ────────────────────────────────────────────────
window.addEventListener("app:ready", () => {
  initStatSelectors();
  updateSelectorVisibility(); // default: week selector visible
  showView("list");
  renderList();
});
