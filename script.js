/* =========================================================
   Troubleshooting Checklist Portal — AUTH + USER PROFILES
   FIXED:
   - Signup no longer does Firestore uniqueness check before auth
   - Creates auth user first, then checks/acquires name lock
   - Prevents "Could not verify name uniqueness" under auth-required rules
   - Keeps Google sign-in, reset password, profile doc creation, and header name
========================================================= */

/* =========
   Helpers
========= */

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeFullName(firstName = "", lastName = "") {
  const full = `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
  const collapsed = full.replace(/\s+/g, " ").trim();
  const lower = collapsed.toLowerCase();
  return {
    fullName: collapsed,
    fullNameKey: lower
  };
}

function looksLikeEmail(email = "") {
  const e = String(email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function firstNameFallbackFromAuth(user) {
  const dn = String(user?.displayName || "").trim();
  if (dn) return dn.split(/\s+/)[0] || "";

  const email = String(user?.email || "").trim();
  if (email && email.includes("@")) return email.split("@")[0] || "";

  return "User";
}

function initialsFromName(first = "", last = "") {
  const a = (first || "").trim()[0] || "";
  const b = (last || "").trim()[0] || "";
  return (a + b).toUpperCase() || (a || "").toUpperCase() || "U";
}

/* =========
   Auth DOM
========= */

const authGate = document.getElementById("authGate");
const appRoot = document.getElementById("appRoot");

const authLoading = document.getElementById("authLoading");

const authCardTitle = document.getElementById("authCardTitle");
const authCardSub = document.getElementById("authCardSub");
const authError = document.getElementById("authError");

const authFormView = document.getElementById("authFormView");
const authResetView = document.getElementById("authResetView");

const authNameRow = document.getElementById("authNameRow");
const authFirstName = document.getElementById("authFirstName");
const authLastName = document.getElementById("authLastName");

const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");

const authPrimaryBtn = document.getElementById("authPrimaryBtn");
const googleSignInBtn = document.getElementById("googleSignInBtn");

const authBottomText = document.getElementById("authBottomText");
const authToggleModeBtn = document.getElementById("authToggleModeBtn");

const authForgotBtn = document.getElementById("authForgotBtn");
const authTogglePwBtn = document.getElementById("authTogglePwBtn");

const authResetEmail = document.getElementById("authResetEmail");
const authResetSendBtn = document.getElementById("authResetSendBtn");
const authResetBackBtn = document.getElementById("authResetBackBtn");

const authLogoutBtn = document.getElementById("authLogoutBtn");

const userProfileNameEl = document.getElementById("userProfileName");
const userProfileAvatarEl = document.getElementById("userProfileAvatar");

/* =========
   Firebase readiness
========= */

function ensureAuthReady() {
  return !!(window.auth && window.firebaseAuthFns);
}

function ensureFirestoreReady() {
  return !!(window.db && window.firebaseFns);
}

/* =========
   Inline field errors
========= */

function ensureInlineErrorEl(inputEl) {
  if (!inputEl) return null;

  const id = inputEl.id || "";
  const existing = document.getElementById(`${id}Error`);
  if (existing) return existing;

  const div = document.createElement("div");
  div.id = `${id}Error`;
  div.className = "auth-inline-error hidden";
  inputEl.insertAdjacentElement("afterend", div);
  return div;
}

function setFieldError(inputEl, msg = "") {
  const errEl = ensureInlineErrorEl(inputEl);
  if (!errEl) return;

  if (!msg) {
    errEl.textContent = "";
    errEl.classList.add("hidden");
    inputEl?.classList.remove("auth-input-error");
    return;
  }

  errEl.textContent = msg;
  errEl.classList.remove("hidden");
  inputEl?.classList.add("auth-input-error");
}

function clearAllFieldErrors() {
  [authFirstName, authLastName, authEmail, authPassword, authResetEmail].forEach((el) => setFieldError(el, ""));
}

function setAuthError(msg = "") {
  if (!authError) return;
  if (!msg) {
    authError.textContent = "";
    authError.classList.add("hidden");
    return;
  }
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

/* =========
   Busy / Loading overlay
========= */

let authBusy = false;

function setAuthBusy(isBusy, label = "Loading…") {
  authBusy = !!isBusy;

  [
    authPrimaryBtn,
    googleSignInBtn,
    authToggleModeBtn,
    authForgotBtn,
    authTogglePwBtn,
    authResetSendBtn,
    authResetBackBtn
  ]
    .filter(Boolean)
    .forEach((b) => {
      b.disabled = authBusy;
    });

  if (authLoading) {
    if (authBusy) {
      authLoading.classList.remove("hidden");
      const t = authLoading.querySelector(".auth-loading-text");
      if (t) t.textContent = label;
    } else {
      authLoading.classList.add("hidden");
    }
  }
}

/* =========
   Views
========= */

const AUTH_VIEW = {
  LOGIN: "login",
  SIGNUP: "signup",
  RESET: "reset"
};

let authView = AUTH_VIEW.LOGIN;

function showAuthGate() {
  authGate?.classList.remove("hidden");
  appRoot?.classList.add("hidden");
}

function showApp() {
  authGate?.classList.add("hidden");
  appRoot?.classList.remove("hidden");
}

function renderAuthView(nextView) {
  authView = nextView;

  setAuthError("");
  clearAllFieldErrors();

  if (authFormView) authFormView.classList.toggle("hidden", authView === AUTH_VIEW.RESET);
  if (authResetView) authResetView.classList.toggle("hidden", authView !== AUTH_VIEW.RESET);

  authNameRow?.classList.toggle("hidden", authView !== AUTH_VIEW.SIGNUP);
  authForgotBtn?.classList.toggle("hidden", authView !== AUTH_VIEW.LOGIN);
  authTogglePwBtn?.classList.toggle("hidden", authView === AUTH_VIEW.RESET);

  if (authView === AUTH_VIEW.LOGIN) {
    if (authCardTitle) authCardTitle.textContent = "Login to your account";
    if (authCardSub) authCardSub.textContent = "Sign in to continue";
    if (authPrimaryBtn) authPrimaryBtn.textContent = "Login now";
    if (authBottomText) authBottomText.textContent = "Don’t have an account?";
    if (authToggleModeBtn) authToggleModeBtn.textContent = "Sign up";
  }

  if (authView === AUTH_VIEW.SIGNUP) {
    if (authCardTitle) authCardTitle.textContent = "Create your account";
    if (authCardSub) authCardSub.textContent = "Sign up to continue";
    if (authPrimaryBtn) authPrimaryBtn.textContent = "Create account";
    if (authBottomText) authBottomText.textContent = "Already have an account?";
    if (authToggleModeBtn) authToggleModeBtn.textContent = "Login";
  }

  if (authView === AUTH_VIEW.RESET) {
    if (authCardTitle) authCardTitle.textContent = "Reset your password";
    if (authCardSub) authCardSub.textContent = "We’ll email you a reset link.";
  }
}

/* =========
   Firebase error mapping
========= */

function mapAuthError(e) {
  const code = e?.code || "";
  if (code === "auth/invalid-email") return "Please enter a valid email address.";
  if (code === "auth/missing-password") return "Please enter your password.";
  if (code === "auth/wrong-password") return "Incorrect password. Please try again.";
  if (code === "auth/user-not-found") return "No account found for this email.";
  if (code === "auth/email-already-in-use") return "This email is already registered. Please login instead.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a bit and try again.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was closed. Please try again.";
  if (code === "auth/cancelled-popup-request") return "";
  return e?.message || "Authentication failed. Please try again.";
}

/* =========
   Firestore user profile helpers
========= */

function requireFirestoreFns(names = []) {
  if (!ensureFirestoreReady()) return { ok: false, missing: names };

  const missing = [];
  for (const n of names) {
    if (!window.firebaseFns?.[n]) missing.push(n);
  }
  return { ok: missing.length === 0, missing };
}

async function getUserDoc(uid) {
  const need = requireFirestoreFns(["doc", "getDoc"]);
  if (!need.ok) throw new Error(`Missing Firestore fns: ${need.missing.join(", ")}`);

  const { doc, getDoc } = window.firebaseFns;
  const ref = doc(window.db, "users", uid);
  return await getDoc(ref);
}

async function createOrUpdateUserDoc(uid, data) {
  const need = requireFirestoreFns(["doc", "setDoc"]);
  if (!need.ok) throw new Error(`Missing Firestore fns: ${need.missing.join(", ")}`);

  const { doc, setDoc } = window.firebaseFns;
  const ref = doc(window.db, "users", uid);
  await setDoc(ref, data, { merge: true });
}

async function checkFullNameKeyCollision(fullNameKey, exceptUid = "") {
  const need = requireFirestoreFns(["collection", "query", "where", "limit", "getDocs"]);
  if (!need.ok) throw new Error(`Missing Firestore fns: ${need.missing.join(", ")}`);

  const { collection, query, where, limit, getDocs } = window.firebaseFns;
  const col = collection(window.db, "users");
  const q = query(col, where("fullNameKey", "==", fullNameKey), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) return false;

  const hit = snap.docs[0];
  if (exceptUid && hit.id === exceptUid) return false;

  return true;
}

async function tryAcquireNameLock(fullNameKey, uid) {
  const hasTx = !!window.firebaseFns?.runTransaction;
  const hasDoc = !!window.firebaseFns?.doc;
  const hasServerTimestamp = !!window.firebaseFns?.serverTimestamp;

  if (!(hasTx && hasDoc && hasServerTimestamp)) {
    const collision = await checkFullNameKeyCollision(fullNameKey, uid);
    if (collision) return { ok: false, reason: "collision" };
    return { ok: true, reason: "no-lock-fallback" };
  }

  const { doc, runTransaction, serverTimestamp } = window.firebaseFns;
  const lockRef = doc(window.db, "userNameLocks", fullNameKey);

  const res = await runTransaction(window.db, async (tx) => {
    const lockSnap = await tx.get(lockRef);

    if (lockSnap.exists()) {
      const lockUid = lockSnap.data()?.uid || "";
      if (lockUid && lockUid !== uid) return { ok: false, reason: "collision" };
      return { ok: true, reason: "already-locked" };
    }

    tx.set(lockRef, { uid, createdAt: serverTimestamp() });
    return { ok: true, reason: "locked" };
  });

  return res;
}

/* =========
   Ensure profile exists
========= */

function splitName(displayName = "") {
  const t = String(displayName || "").trim().replace(/\s+/g, " ");
  if (!t) return { firstName: "", lastName: "" };

  const parts = t.split(" ");
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ").trim();
  return { firstName, lastName };
}

async function ensureUserProfileForAuthUser(user, { providerHint = "" } = {}) {
  if (!user?.uid) return;

  try {
    const snap = await getUserDoc(user.uid);
    if (snap.exists()) return;
  } catch (e) {
    console.error(e);
    setAuthError("Firestore user profile check failed. Ensure getDoc is exported in index.html.");
    throw e;
  }

  const authProvider = providerHint || (user?.providerData?.[0]?.providerId === "password" ? "password" : "google");

  let firstName = "";
  let lastName = "";

  if (user.displayName) {
    const parts = splitName(user.displayName);
    firstName = parts.firstName;
    lastName = parts.lastName;
  }

  if (!firstName) firstName = firstNameFallbackFromAuth(user);

  const norm = normalizeFullName(firstName, lastName);
  const collision = await checkFullNameKeyCollision(norm.fullNameKey, user.uid);

  if (collision) {
    setAuthError("Your name already exists in the system. Please contact admin.");
    try {
      await window.firebaseAuthFns.signOut(window.auth);
    } catch {}
    showAuthGate();
    renderAuthView(AUTH_VIEW.LOGIN);
    throw new Error("Name collision");
  }

  const profileDoc = {
    uid: user.uid,
    firstName: String(firstName || "").trim(),
    lastName: String(lastName || "").trim(),
    fullName: norm.fullName,
    fullNameKey: norm.fullNameKey,
    email: user.email || "",
    createdAt: window.firebaseFns.serverTimestamp(),
    authProvider
  };

  await createOrUpdateUserDoc(user.uid, profileDoc);
}

/* =========
   Header user name
========= */

async function updateHeaderUserName(user) {
  if (!userProfileNameEl) return;

  let first = "";

  try {
    const snap = await getUserDoc(user.uid);
    if (snap.exists()) {
      const data = snap.data() || {};
      first = String(data.firstName || "").trim();
      const last = String(data.lastName || "").trim();

      if (first) {
        const initials = initialsFromName(first, last);

        if (userProfileAvatarEl) {
          userProfileAvatarEl.textContent = initials;
        }
        userProfileNameEl.textContent = first;
        return;
      }
    }
  } catch {}

  first = firstNameFallbackFromAuth(user);
  const initials = initialsFromName(first, "");

  if (userProfileAvatarEl) {
    userProfileAvatarEl.textContent = initials;
  }
  userProfileNameEl.textContent = first;
}

/* =========
   Validation
========= */

function validateSignupFields() {
  clearAllFieldErrors();

  const first = String(authFirstName?.value || "").trim();
  const last = String(authLastName?.value || "").trim();
  const email = String(authEmail?.value || "").trim();
  const pw = String(authPassword?.value || "");

  let ok = true;

  if (first.length < 2) {
    setFieldError(authFirstName, "First name must be at least 2 characters.");
    ok = false;
  }

  if (last.length < 2) {
    setFieldError(authLastName, "Last name must be at least 2 characters.");
    ok = false;
  }

  if (!looksLikeEmail(email)) {
    setFieldError(authEmail, "Please enter a valid email address.");
    ok = false;
  }

  if (pw.length < 6) {
    setFieldError(authPassword, "Password must be at least 6 characters.");
    ok = false;
  }

  return { ok, first, last, email, pw };
}

function validateLoginFields() {
  clearAllFieldErrors();

  const email = String(authEmail?.value || "").trim();
  const pw = String(authPassword?.value || "");

  let ok = true;

  if (!looksLikeEmail(email)) {
    setFieldError(authEmail, "Please enter a valid email address.");
    ok = false;
  }

  if (!pw) {
    setFieldError(authPassword, "Please enter your password.");
    ok = false;
  }

  return { ok, email, pw };
}

/* =========
   Auth actions
========= */

async function handlePasswordSignup() {
  if (!ensureAuthReady()) {
    setAuthError("Auth is not ready. Please verify Firebase Auth wiring in index.html.");
    return;
  }
  if (!ensureFirestoreReady()) {
    setAuthError("Firestore is not ready. Please verify Firestore wiring in index.html.");
    return;
  }

  const need = requireFirestoreFns(["getDoc", "where", "limit"]);
  if (!need.ok) {
    setAuthError(`Missing Firestore exports in index.html: ${need.missing.join(", ")}`);
    return;
  }

  const { ok, first, last, email, pw } = validateSignupFields();
  if (!ok) return;

  const norm = normalizeFullName(first, last);
  let createdUser = null;

  try {
    // Create auth user first so Firestore reads work under request.auth != null rules
    setAuthBusy(true, "Creating account…");
    const userCred = await window.firebaseAuthFns.createUserWithEmailAndPassword(window.auth, email, pw);
    createdUser = userCred.user;

    // After auth, verify/acquire uniqueness
    setAuthBusy(true, "Finalizing profile…");
    const lockRes = await tryAcquireNameLock(norm.fullNameKey, createdUser.uid);

    if (!lockRes.ok) {
      setFieldError(
        authLastName,
        "An account with this name already exists. Please contact admin or use a different name."
      );

      try {
        await window.firebaseAuthFns.signOut(window.auth);
      } catch {}

      if (window.firebaseAuthFns.deleteUser) {
        try {
          await window.firebaseAuthFns.deleteUser(createdUser);
        } catch {}
      }

      showAuthGate();
      renderAuthView(AUTH_VIEW.SIGNUP);
      setAuthBusy(false);
      return;
    }

    await window.firebaseAuthFns.updateProfile(createdUser, {
      displayName: norm.fullName
    });

    const profileDoc = {
      uid: createdUser.uid,
      firstName: first,
      lastName: last,
      fullName: norm.fullName,
      fullNameKey: norm.fullNameKey,
      email,
      createdAt: window.firebaseFns.serverTimestamp(),
      authProvider: "password"
    };

    await createOrUpdateUserDoc(createdUser.uid, profileDoc);

    setAuthBusy(false);
    // onAuthStateChanged will handle the UI transition
  } catch (e) {
    console.error(e);
    setAuthBusy(false);

    if (createdUser) {
      try {
        await window.firebaseAuthFns.signOut(window.auth);
      } catch {}

      if (window.firebaseAuthFns.deleteUser) {
        try {
          await window.firebaseAuthFns.deleteUser(createdUser);
        } catch {}
      }
    }

    const msg = mapAuthError(e);
    if (msg) setAuthError(msg);
    else setAuthError("Signup failed. Please try again.");
  }
}

async function handlePasswordLogin() {
  if (!ensureAuthReady()) {
    setAuthError("Auth is not ready. Please verify Firebase Auth wiring in index.html.");
    return;
  }

  const { ok, email, pw } = validateLoginFields();
  if (!ok) return;

  try {
    setAuthError("");
    setAuthBusy(true, "Signing in…");
    await window.firebaseAuthFns.signInWithEmailAndPassword(window.auth, email, pw);
    setAuthBusy(false);
  } catch (e) {
    console.error(e);
    setAuthBusy(false);
    const msg = mapAuthError(e);
    if (msg) setAuthError(msg);
  }
}

async function handleGoogleSignIn() {
  if (!ensureAuthReady()) {
    setAuthError("Auth is not ready. Please verify Firebase Auth wiring in index.html.");
    return;
  }

  try {
    setAuthError("");
    setAuthBusy(true, "Opening Google sign-in…");
    const provider = new window.firebaseAuthFns.GoogleAuthProvider();
    await window.firebaseAuthFns.signInWithPopup(window.auth, provider);
    setAuthBusy(false);
  } catch (e) {
    console.error(e);
    setAuthBusy(false);
    const msg = mapAuthError(e);
    if (msg) setAuthError(msg);
  }
}

async function handlePasswordReset() {
  if (!ensureAuthReady()) {
    setAuthError("Auth is not ready. Please verify Firebase Auth wiring in index.html.");
    return;
  }

  const email = String(authResetEmail?.value || "").trim();
  clearAllFieldErrors();

  if (!looksLikeEmail(email)) {
    setFieldError(authResetEmail, "Please enter a valid email address.");
    return;
  }

  try {
    setAuthBusy(true, "Sending reset email…");

    const basePath = document.baseURI.replace(location.origin, "").replace(/\/+$/, "");
    const continueUrl = `${location.origin}${basePath}`;

    await window.firebaseAuthFns.sendPasswordResetEmail(window.auth, email, { url: continueUrl });

    setAuthBusy(false);
    setAuthError("If an account exists for this email, a reset link has been sent.");
    authError?.classList.remove("hidden");
  } catch (e) {
    console.error(e);
    setAuthBusy(false);
    const msg = mapAuthError(e);
    if (msg) setAuthError(msg);
  }
}

/* =========
   Bind auth UI
========= */

function bindAuthUI() {
  authToggleModeBtn?.addEventListener("click", () => {
    if (authBusy) return;

    if (authView === AUTH_VIEW.LOGIN) renderAuthView(AUTH_VIEW.SIGNUP);
    else if (authView === AUTH_VIEW.SIGNUP) renderAuthView(AUTH_VIEW.LOGIN);
  });

  authForgotBtn?.addEventListener("click", () => {
    if (authBusy) return;

    if (authResetEmail && authEmail) {
      authResetEmail.value = String(authEmail.value || "").trim();
    }
    renderAuthView(AUTH_VIEW.RESET);
  });

  authResetBackBtn?.addEventListener("click", () => {
    if (authBusy) return;
    renderAuthView(AUTH_VIEW.LOGIN);
  });

  authTogglePwBtn?.addEventListener("click", () => {
    if (!authPassword) return;
    const isPw = authPassword.type === "password";
    authPassword.type = isPw ? "text" : "password";
    authTogglePwBtn.setAttribute("aria-label", isPw ? "Hide password" : "Show password");
  });

  authPrimaryBtn?.addEventListener("click", async () => {
    if (authBusy) return;

    if (authView === AUTH_VIEW.LOGIN) return handlePasswordLogin();
    if (authView === AUTH_VIEW.SIGNUP) return handlePasswordSignup();
  });

  googleSignInBtn?.addEventListener("click", async () => {
    if (authBusy) return;
    await handleGoogleSignIn();
  });

  authResetSendBtn?.addEventListener("click", async () => {
    if (authBusy) return;
    await handlePasswordReset();
  });

  authEmail?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") authPrimaryBtn?.click();
  });

  authPassword?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") authPrimaryBtn?.click();
  });

  authFirstName?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") authPrimaryBtn?.click();
  });

  authLastName?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") authPrimaryBtn?.click();
  });

  authResetEmail?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") authResetSendBtn?.click();
  });

  authLogoutBtn?.addEventListener("click", async () => {
    if (!ensureAuthReady()) return;
    try {
      await window.firebaseAuthFns.signOut(window.auth);
    } catch (e) {
      console.error(e);
    }
  });
}

/* =========
   Issues loader
========= */

async function loadIssuesFromFirestore() {
  if (!ensureFirestoreReady()) return;

  const need = requireFirestoreFns(["collection", "getDocs", "query", "orderBy"]);
  if (!need.ok) {
    console.warn("Missing Firestore functions for issues loader:", need.missing.join(", "));
    return;
  }

  const { collection, getDocs, query, orderBy } = window.firebaseFns;
  const colRef = collection(window.db, "issues");

  try {
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    window.allIssues = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("OrderBy(createdAt) failed, falling back to unsorted getDocs()", e);
    const snap = await getDocs(colRef);
    window.allIssues = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // If your main portal script defines these, they will run.
  if (typeof splitActiveDeleted === "function") splitActiveDeleted();
  if (typeof renderIssueList === "function") renderIssueList();
  if (typeof renderBinList === "function") renderBinList();
  if (typeof renderDuplicateSuggestions === "function") renderDuplicateSuggestions();
  if (typeof isInDetailScreen === "function" && typeof renderSelectedIssueDetails === "function") {
    if (isInDetailScreen() && window.selectedIssueId) {
      renderSelectedIssueDetails();
    }
  }
}

/* =========
   Auth Gate init
========= */

async function initAuthGate({ onAuthed } = {}) {
  if (!authGate || !appRoot) {
    if (typeof onAuthed === "function") await onAuthed(window.auth?.currentUser || null);
    return;
  }

  showAuthGate();
  renderAuthView(AUTH_VIEW.LOGIN);

  if (!ensureAuthReady()) {
    setAuthError("Auth is not ready. Please verify Firebase Auth imports and window.firebaseAuthFns in index.html.");
    return;
  }

  bindAuthUI();

  const { onAuthStateChanged } = window.firebaseAuthFns;

  setAuthBusy(true, "Checking session…");

  onAuthStateChanged(window.auth, async (user) => {
    try {
      if (!user) {
        showAuthGate();
        setAuthBusy(false);
        renderAuthView(AUTH_VIEW.LOGIN);
        return;
      }

      if (ensureFirestoreReady()) {
        await ensureUserProfileForAuthUser(user, { providerHint: "google" }).catch(() => {});
      }

      if (ensureFirestoreReady()) {
        await updateHeaderUserName(user);
      } else if (userProfileNameEl) {
        userProfileNameEl.textContent = firstNameFallbackFromAuth(user);
      }

      showApp();
      setAuthBusy(false);

      if (typeof onAuthed === "function") {
        await onAuthed(user);
      }
    } catch (e) {
      console.error(e);
      setAuthBusy(false);
      showAuthGate();
      setAuthError("Something went wrong loading the portal. Please refresh.");
    }
  });
}

/* =========
   Theme Toggle
========= */

const themeToggle = document.getElementById("themeToggle");

function applySavedTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.documentElement.classList.add("light-theme");
    if (themeToggle) themeToggle.textContent = "🌙";
  } else {
    document.documentElement.classList.remove("light-theme");
    if (themeToggle) themeToggle.textContent = "☀️";
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isLight = document.documentElement.classList.toggle("light-theme");
    if (isLight) {
      localStorage.setItem("theme", "light");
      themeToggle.textContent = "🌙";
    } else {
      localStorage.setItem("theme", "dark");
      themeToggle.textContent = "☀️";
    }
  });
}

/* =========
   Init
========= */

async function init() {
  applySavedTheme();

  await initAuthGate({
    onAuthed: async () => {
      await loadIssuesFromFirestore();
    }
  });
}

init();