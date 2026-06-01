// ─── firebase-config.js ────────────────────────────────────────────────────
// Firebase 프로젝트 설정값 — Firebase Console > 프로젝트 설정 > 앱에서 복사

export const firebaseConfig = {
  apiKey: "AIzaSyD5IjBzbHjnMA5CH_u-xZqN398580Lz2lQ",
  authDomain: "timelog-5a0f0.firebaseapp.com",
  projectId: "timelog-5a0f0",
  storageBucket: "timelog-5a0f0.firebasestorage.app",
  messagingSenderId: "655075096362",
  appId: "1:655075096362:web:9b0db42564a786ceb71053"
};

// Cloud Functions 베이스 URL
// 배포 후 Firebase Console > Functions에서 확인
export const FUNCTIONS_BASE = "https://asia-northeast3-timelog-5a0f0.cloudfunctions.net";
