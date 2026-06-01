const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const { getWeek, getYear, getMonth, format, parseISO, startOfDay, endOfDay } = require("date-fns");

admin.initializeApp();
const db = admin.firestore();
const secretClient = new SecretManagerServiceClient();

// ─── 리전 설정 (asia-northeast3 = 서울) ────────────────────────────────────
setGlobalOptions({ region: "asia-northeast3" });

// ─── 상수 ──────────────────────────────────────────────────────────────────
const PROJECT_ID = process.env.GCLOUD_PROJECT;
const SECRET_NAME = `projects/${PROJECT_ID}/secrets/google-refresh-token/versions/latest`;

// Google Calendar ID 설정 — Firebase 환경변수 또는 아래에 직접 입력
// 실제 캘린더 ID는 Google Calendar 설정 > 캘린더 정보에서 확인
const CALENDAR_IDS = {
  A: process.env.CAL_A || "primary",
  B: process.env.CAL_B || "mf1sl10aqmaql8ntjno373lc6g@group.calendar.google.com",
  C: process.env.CAL_C || "7m1dcpd7v0jcqk5v9i3bobl8rg@group.calendar.google.com",
  D: process.env.CAL_D || "ut4neisd8inoek9jj06rjj21d8@group.calendar.google.com",
};

const OAUTH_CLIENT_ID     = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

// ─── Secret Manager에서 Refresh Token 가져오기 ─────────────────────────────
async function getRefreshToken() {
  const [version] = await secretClient.accessSecretVersion({ name: SECRET_NAME });
  return version.payload.data.toString("utf8").trim();
}

// ─── OAuth2 클라이언트 생성 ────────────────────────────────────────────────
async function getOAuthClient() {
  const refreshToken = await getRefreshToken();
  const oauth2Client = new google.auth.OAuth2(
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    "https://oauth2.googleapis.com/token"
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// ─── 밀리초 → "H:MM" 형식 변환 ────────────────────────────────────────────
function msToHM(ms) {
  if (ms <= 0) return "0:00";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// ─── "H:MM" → 밀리초 ───────────────────────────────────────────────────────
function hmToMs(hm) {
  if (!hm || hm === "0:00") return 0;
  const [h, m] = hm.split(":").map(Number);
  return (h * 60 + m) * 60000;
}

// ─── ISO 주차 계산 (연도 포함) ─────────────────────────────────────────────
function getWeekNumber(date) {
  return getWeek(date, { weekStartsOn: 1 }); // 월요일 시작
}

// ─── 특정 날짜의 캘린더 이벤트 조회 및 합산 ──────────────────────────────
async function fetchTimeLogForDate(targetDate) {
  const auth = await getOAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const dayStart = startOfDay(targetDate).toISOString();
  const dayEnd   = endOfDay(targetDate).toISOString();

  // 각 카테고리별 이벤트 조회 함수
  async function getEvents(calendarId, filter) {
    try {
      const res = await calendar.events.list({
        calendarId,
        timeMin: dayStart,
        timeMax: dayEnd,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 100,
      });
      const events = res.data.items || [];
      return events.filter(filter);
    } catch (e) {
      console.error(`Calendar fetch error [${calendarId}]:`, e.message);
      return [];
    }
  }

  // 이벤트 시간 합산 (ms)
  function sumDuration(events) {
    return events.reduce((acc, ev) => {
      const start = new Date(ev.start.dateTime || ev.start.date);
      const end   = new Date(ev.end.dateTime   || ev.end.date);
      return acc + Math.max(0, end - start);
    }, 0);
  }

  // ── 수면: A캘린더, 제목 "Sleep", 종료일이 오늘 내 포함 ──────────────────
  // timeMax로 오늘 자정까지 종료되는 이벤트만 가져옴
  const sleepEvents = await getEvents(
    CALENDAR_IDS.A,
    ev => (ev.summary || "").trim().toLowerCase() === "sleep"
  );

  // ── 업무: B캘린더, 제목 "Work" ───────────────────────────────────────────
  const workEvents = await getEvents(
    CALENDAR_IDS.B,
    ev => (ev.summary || "").trim().toLowerCase() === "work"
  );

  // ── C캘린더 이벤트 일괄 조회 ─────────────────────────────────────────────
  const cAllEvents = await getEvents(CALENDAR_IDS.C, () => true);

  const englishEvents  = cAllEvents.filter(ev => (ev.summary || "").startsWith("🇺🇸"));
  const violinEvents   = cAllEvents.filter(ev => (ev.summary || "").includes("바이올린 연습"));
  const readingEvents  = cAllEvents.filter(ev => (ev.summary || "").startsWith("📚"));
  const exerciseEvents = cAllEvents.filter(ev => (ev.summary || "").startsWith("💪"));

  // ── 낭비: D캘린더, 제목 "waste" ─────────────────────────────────────────
  const wasteEvents = await getEvents(
    CALENDAR_IDS.D,
    ev => (ev.summary || "").trim().toLowerCase() === "waste"
  );

  return {
    sleep:    msToHM(sumDuration(sleepEvents)),
    work:     msToHM(sumDuration(workEvents)),
    english:  msToHM(sumDuration(englishEvents)),
    violin:   msToHM(sumDuration(violinEvents)),
    reading:  msToHM(sumDuration(readingEvents)),
    exercise: msToHM(sumDuration(exerciseEvents)),
    waste:    msToHM(sumDuration(wasteEvents)),
  };
}

// ─── Firestore에 날짜 데이터 저장 ─────────────────────────────────────────
async function saveToFirestore(targetDate, data) {
  const dateStr = format(targetDate, "yyyy-MM-dd");
  const year    = getYear(targetDate);
  const month   = getMonth(targetDate) + 1; // 1-based
  const week    = getWeekNumber(targetDate);

  const docRef = db.collection("timelog").doc(dateStr);
  await docRef.set({
    date:      dateStr,
    year,
    month,
    week,
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source:    "auto", // "auto" | "manual"
  }, { merge: true });

  console.log(`Saved [${dateStr}]:`, data);
  return { dateStr, year, month, week, ...data };
}

// ════════════════════════════════════════════════════════════════════════════
// [1] 스케줄 함수 — 매일 오전 6시 (KST = UTC+9 → UTC 21:00 전날)
//     한국 시간 기준 매일 06:00에 전날 데이터를 저장
// ════════════════════════════════════════════════════════════════════════════
exports.dailySync = onSchedule(
  {
    schedule: "0 21 * * *", // UTC 21:00 = KST 06:00
    timeZone: "UTC",
    memory: "256MiB",
  },
  async () => {
    // 어제 날짜 (KST 기준 오늘 06:00에 전날 데이터 집계)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // KST 보정: UTC+9
    const kstYesterday = new Date(yesterday.getTime() + 9 * 60 * 60 * 1000);
    kstYesterday.setHours(0, 0, 0, 0);

    const data = await fetchTimeLogForDate(kstYesterday);
    await saveToFirestore(kstYesterday, data);
    console.log("Daily sync complete:", format(kstYesterday, "yyyy-MM-dd"));
  }
);

// ════════════════════════════════════════════════════════════════════════════
// [2] 수동 sync API — 특정 날짜 데이터 업데이트 (프론트엔드 ~/sync 탭에서 호출)
// ════════════════════════════════════════════════════════════════════════════
exports.syncDate = onRequest(
  {
    memory: "256MiB",
    cors: true, // GitHub Pages 도메인에서 호출 허용
  },
  async (req, res) => {
    // Firebase Auth 토큰 검증
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const idToken = authHeader.split("Bearer ")[1];
      await admin.auth().verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { date } = req.body; // "YYYY-MM-DD"
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    try {
      const targetDate = parseISO(date);
      const data = await fetchTimeLogForDate(targetDate);
      const saved = await saveToFirestore(targetDate, {
        ...data,
        source: "manual",
      });
      return res.json({ success: true, data: saved });
    } catch (e) {
      console.error("syncDate error:", e);
      return res.status(500).json({ error: e.message });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// [3] 특정 날짜 데이터 직접 수정 API (상세화면 edit 기능)
// ════════════════════════════════════════════════════════════════════════════
exports.updateEntry = onRequest(
  { memory: "256MiB", cors: true },
  async (req, res) => {
    // Auth 검증
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { date, field, value } = req.body;
    const validFields = ["sleep", "work", "english", "violin", "reading", "exercise", "waste"];

    if (!date || !field || !validFields.includes(field)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    // "H:MM" 형식 검증
    if (!/^\d+:\d{2}$/.test(value)) {
      return res.status(400).json({ error: "Invalid time format. Use H:MM" });
    }

    try {
      const docRef = db.collection("timelog").doc(date);
      await docRef.update({
        [field]: value,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "edited",
      });
      return res.json({ success: true, date, field, value });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);
