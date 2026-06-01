// ─── api.js ────────────────────────────────────────────────────────────────
import { db, auth, FUNCTIONS_BASE } from "./app.js";
import {
  collection, doc, getDoc, getDocs,
  query, where, orderBy, limit,
  updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const COL = "timelog";

// ─── Auth 토큰 가져오기 ───────────────────────────────────────────────────
async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.getIdToken();
}

// ─── 헤더 공통 ────────────────────────────────────────────────────────────
async function authHeaders() {
  const token = await getToken();
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 조회
// ════════════════════════════════════════════════════════════════════════════

// 최근 N개 레코드 (~/log 리스트)
export async function fetchRecent(limitCount = 30) {
  const q = query(
    collection(db, COL),
    orderBy("date", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

// 특정 날짜 1건 (상세화면)
export async function fetchByDate(dateStr) {
  const snap = await getDoc(doc(db, COL, dateStr));
  return snap.exists() ? snap.data() : null;
}

// 연도별 전체
export async function fetchByYear(year) {
  const q = query(
    collection(db, COL),
    where("year", "==", year),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

// 월별
export async function fetchByMonth(year, month) {
  const q = query(
    collection(db, COL),
    where("year",  "==", year),
    where("month", "==", month),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

// 주차별
export async function fetchByWeek(year, week) {
  const q = query(
    collection(db, COL),
    where("year", "==", year),
    where("week", "==", week),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

// ════════════════════════════════════════════════════════════════════════════
// 통계 계산 (클라이언트 사이드)
// ════════════════════════════════════════════════════════════════════════════

// "H:MM" → 분
function hmToMin(hm) {
  if (!hm || hm === "0:00" || hm === "—") return 0;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

// 분 → "H:MM"
function minToHm(min) {
  if (min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const FIELDS = ["sleep", "work", "english", "violin", "reading", "exercise", "waste"];

// records 배열에서 카테고리별 합계 반환
export function calcCategoryTotals(records) {
  const totals = {};
  FIELDS.forEach(f => {
    const sum = records.reduce((acc, r) => acc + hmToMin(r[f] || "0:00"), 0);
    totals[f] = minToHm(sum);
  });
  return totals;
}

// sleep 평균
export function calcSleepAvg(records) {
  if (!records.length) return "0:00";
  const total = records.reduce((acc, r) => acc + hmToMin(r.sleep || "0:00"), 0);
  return minToHm(Math.round(total / records.length));
}

// delta 계산: {val, dir} dir = "up"|"down"|"flat"
export function calcDelta(currHm, prevHm) {
  const curr = hmToMin(currHm);
  const prev = hmToMin(prevHm);
  const diff = curr - prev;
  const dir  = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const abs  = Math.abs(diff);
  return { diff: minToHm(abs), dir, sign: diff > 0 ? "+" : diff < 0 ? "-" : "±" };
}

// ════════════════════════════════════════════════════════════════════════════
// 수정
// ════════════════════════════════════════════════════════════════════════════

// 개별 필드 직접 수정 (Cloud Functions 경유)
export async function updateField(dateStr, field, value) {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/updateEntry`, {
    method: "POST",
    headers,
    body: JSON.stringify({ date: dateStr, field, value }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Update failed");
  }
  return res.json();
}

// ════════════════════════════════════════════════════════════════════════════
// 캘린더 재조회 & 저장 (Cloud Functions)
// ════════════════════════════════════════════════════════════════════════════

export async function syncDate(dateStr) {
  const headers = await authHeaders();
  const res = await fetch(`${FUNCTIONS_BASE}/syncDate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ date: dateStr }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Sync failed");
  }
  return res.json();
}
