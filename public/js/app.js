// ─── app.js ────────────────────────────────────────────────────────────────
import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig, FUNCTIONS_BASE } from "./firebase-config.js";

// ─── Firebase 초기화 ──────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export { FUNCTIONS_BASE };

// ─── Google 로그인 ────────────────────────────────────────────────────────
const provider = new GoogleAuthProvider();

export async function signIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error("Sign-in failed:", e);
    alert("로그인에 실패했습니다. 다시 시도해주세요.");
  }
}

export function signOut() {
  return auth.signOut();
}

// ─── 인증 상태 감지 → UI 라우팅 ──────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  const loginScreen = document.getElementById("login-screen");
  const appScreen   = document.getElementById("app-screen");

  if (user) {
    loginScreen?.classList.add("hidden");
    appScreen?.classList.remove("hidden");
    // 앱 초기화 이벤트
    window.dispatchEvent(new CustomEvent("app:ready", { detail: { user } }));
  } else {
    loginScreen?.classList.remove("hidden");
    appScreen?.classList.add("hidden");
  }
});
