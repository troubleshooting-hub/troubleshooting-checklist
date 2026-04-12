/* =========================================================
   Troubleshooting Checklist Portal — AUTH + USER PROFILES
   FIXED:
   - Prevents infinite "Checking session..." state
   - Fast auth resolution with safe fallback to login
   - Email login / signup / reset password
   - Google sign-in
   - User profile creation in Firestore
   - Header first-name + avatar initials
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
  return {
    fullName: collapsed,
    fullNameKey: collapsed.toLowerCase()
  };
}

function looksLikeEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function firstNameFallbackFromAuth(user) {
  const displayName = String(user?.displayName || "").trim();
  if (displayName) return displayName.split(/\s+/)[0] || "User";

  const email = String(user?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0] || "User";

  return "User";
}

function initialsFromName(first = "", last = "") {
  const a = (first || "").trim()[0] || "";
  const b = (last || "").trim()[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase() || "U";
}

function splitName(displayName = "") {
  const clean = String(displayName || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };

  const parts = clean.split(" ");
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ").trim()
  };
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
   Optional portal DOM hooks
========= */

const themeToggle = document.getElementById("themeToggle");

/* =========
   Firebase readiness
========= */

function ensureAuthReady() {
  return !!(window.auth && window.firebaseAuthFns);
}

function ensureFirestoreReady() {
  return !!(window.db && window.firebaseFns);
}

function requireFirestoreFns(names = []) {
  if (!ensureFirestoreReady()) return { ok: false, missing: names };

  const missing = names.filter((name) => !window.firebaseFns?.[name]);
  return { ok: missing.length === 0, missing };
}

/* =========
   UI state
========= */

const AUTH_VIEW = {
  LOGIN: "login",
  SIGNUP: "signup",
  RESET: "reset"
};

let authView = AUTH_VIEW.LOGIN;
let authBusy = false;
let authSessionResolved = false;
let authFallbackTimer = null;

function showAuthGate() {
  authGate?.classList.remove("hidden");
  appRoot?.classList.add("hidden");
}

function showApp() {
  authGate?.classList.add("hidden");
  appRoot?.classList.remove("hidden");
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

function ensureInlineErrorEl(inputEl) {
  if (!inputEl) return null;

  const id = inputEl.id || "";
  let el = document.getElementById(`${id}Error`);
  if (el) return el;

  el = document.createElement("div");
  el.id = `${id}Error`;
  el.className = "auth-inline-error hidden";
  inputEl.insertAdjacentElement("afterend", el);
  return el;
}

function setFieldError(inputEl, msg = "") {
  const errEl = ensureInlineErrorEl(inputEl);
  if (!errEl) return;

  if (!msg) {
    errEl.textContent = "";
    errEl.classList.add("hidden");
    inputEl.classList.remove("auth-input-error");
    return;
  }

  errEl.textContent = msg;
  errEl.classList.remove("hidden");
  inputEl.classList.add("auth-input-error");
}

function clearAllFieldErrors() {
  [authFirstName, authLastName, authEmail, authPassword, authResetEmail].forEach((el) => {
    if (el) setFieldError(el, "");
  });
}

function setAuthBusy(isBusy, label = "Loading…") {
  authBusy = !!isBusy;

  [
    authPrimaryBtn,
    googleSignInBtn,
    authToggleModeBtn,
    authForgotBtn,
    authTogglePwBtn,
    authResetSendBtn,
    authResetBackBtn,
    authLogoutBtn
  ]
    .filter(Boolean)
    .forEach((btn) => {
      btn.disabled = authBusy;
    });

  if (!authLoading) return;

  if (authBusy) {
    authLoading.classList.remove("hidden");
    const txt = authLoading.querySelector(".auth-loading-text");
    if (txt) txt.textContent = label;
  } else {
    authLoading.classList.add("hidden");
  }
}

function renderAuthView(nextView) {
  authView = nextView;
  setAuthError("");
  clearAllFieldErrors();

  authFormView?.classList.toggle("hidden", authView === AUTH_VIEW.RESET);
  authResetView?.classList.toggle("hidden", authView !== AUTH_VIEW.RESET);
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

function mapAuthError(error) {
  const code = error?.code || "";

  if (code === "auth/invalid-email") return "Please enter a valid email address.";
  if (code === "auth/missing-password") return "Please enter your password.";
  if (code === "auth/wrong-password") return "Incorrect password. Please try again.";
  if (code === "auth/user-not-found") return "No account found for this email.";
  if (code === "auth/email-already-in-use") return "This email is already registered. Please login instead.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a bit and try again.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was closed. Please try again.";
  if (code === "auth/cancelled-popup-request") return "";
  if (code === "auth/network-request-failed") return "Network error. Please check your internet connection.";
  return error?.message || "Authentication failed. Please try again.";
}

/* =========
   Firestore user profile helpers
========= */

async function getUserDoc(uid) {
  const need = requireFirestoreFns(["doc", "getDoc"]);
  if (!need.ok) throw new Error(`Missing Firestore fns: ${need.missing.join(", ")}`);

  const { doc, getDoc } = window.firebaseFns;
  return await getDoc(doc(window.db, "users", uid));
}

async function createOrUpdateUserDoc(uid, data) {
  const need = requireFirestoreFns(["doc", "setDoc"]);
  if (!need.ok) throw new Error(`Missing Firestore fns: ${need.missing.join(", ")}`);

  const { doc, setDoc } = window.firebaseFns;
  await setDoc(doc(window.db, "users", uid), data, { merge: true });
}

async function checkFullNameKeyCollision(fullNameKey, exceptUid = "") {
  const need = requireFirestoreFns(["collection", "query", "where", "limit", "getDocs"]);
  if (!need.ok) throw new Error(`Missing Firestore fns: ${need.missing.join(", ")}`);

  const { collection, query, where, limit, getDocs } = window.firebaseFns;
  const q = query(
    collection(window.db, "users"),
    where("fullNameKey", "==", fullNameKey),
    limit(1)
  );

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

  return await runTransaction(window.db, async (tx) => {
    const snap = await tx.get(lockRef);

    if (snap.exists()) {
      const existingUid = snap.data()?.uid || "";
      if (existingUid && existingUid !== uid) return { ok: false, reason: "collision" };
      return { ok: true, reason: "already-locked" };
    }

    tx.set(lockRef, {
      uid,
      createdAt: serverTimestamp()
    });

    return { ok: true, reason: "locked" };
  });
}

async function ensureUserProfileForAuthUser(user, providerHint = "") {
  if (!user?.uid || !ensureFirestoreReady()) return;

  let existingSnap = null;

  try {
    existingSnap = await getUserDoc(user.uid);
    if (existingSnap.exists()) return existingSnap.data();
  } catch (error) {
    console.warn("User profile lookup failed:", error);
    return null;
  }

  const authProvider =
    providerHint ||
    (user?.providerData?.[0]?.providerId === "password" ? "password" : "google");

  let firstName = "";
  let lastName = "";

  if (user.displayName) {
    const parts = splitName(user.displayName);
    firstName = parts.firstName;
    lastName = parts.lastName;
  }

  if (!firstName) {
    firstName = firstNameFallbackFromAuth(user);
  }

  const norm = normalizeFullName(firstName, lastName);

  try {
    const collision = await checkFullNameKeyCollision(norm.fullNameKey, user.uid);
    if (collision) {
      setAuthError("Your name already exists in the system. Please contact admin.");
      await window.firebaseAuthFns.signOut(window.auth);
      showAuthGate();
      renderAuthView(AUTH_VIEW.LOGIN);
      return null;
    }

    await createOrUpdateUserDoc(user.uid, {
      uid: user.uid,
      firstName: String(firstName || "").trim(),
      lastName: String(lastName || "").trim(),
      fullName: norm.fullName,
      fullNameKey: norm.fullNameKey,
      email: user.email || "",
      createdAt: window.firebaseFns.serverTimestamp(),
      authProvider
    });
  } catch (error) {
    console.warn("User profile creation skipped:", error);
  }

  return null;
}

async function updateHeaderUserName(user) {
  if (!userProfileNameEl) return;

  let first = "";
  let last = "";

  try {
    const snap = await getUserDoc(user.uid);
    if (snap.exists()) {
      const data = snap.data() || {};
      first = String(data.firstName || "").trim();
      last = String(data.lastName || "").trim();
    }
  } catch {}

  if (!first) {
    first = firstNameFallbackFromAuth(user);
  }

  const initials = initialsFromName(first, last);

  if (userProfileAvatarEl) userProfileAvatarEl.textContent = initials;
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
    setAuthBusy(true, "Creating account…");
    const userCred = await window.firebaseAuthFns.createUserWithEmailAndPassword(window.auth, email, pw);
    createdUser = userCred.user;

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

      renderAuthView(AUTH_VIEW.SIGNUP);
      showAuthGate();
      setAuthBusy(false);
      return;
    }

    await window.firebaseAuthFns.updateProfile(createdUser, {
      displayName: norm.fullName
    });

    await createOrUpdateUserDoc(createdUser.uid, {
      uid: createdUser.uid,
      firstName: first,
      lastName: last,
      fullName: norm.fullName,
      fullNameKey: norm.fullNameKey,
      email,
      createdAt: window.firebaseFns.serverTimestamp(),
      authProvider: "password"
    });

    setAuthBusy(false);
  } catch (error) {
    console.error(error);
    setAuthBusy(false);

    if (createdUser) {
      try {
        await window.firebaseAuthFns.signOut(window.auth);
      } catch {}
    }

    const msg = mapAuthError(error);
    if (msg) setAuthError(msg);
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
  } catch (error) {
    console.error(error);
    setAuthBusy(false);
    const msg = mapAuthError(error);
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
  } catch (error) {
    console.error(error);
    setAuthBusy(false);
    const msg = mapAuthError(error);
    if (msg) setAuthError(msg);
  }
}

async function handlePasswordReset() {
  if (!ensureAuthReady()) {
    setAuthError("Auth is not ready. Please verify Firebase Auth wiring in index.html.");
    return;
  }

  clearAllFieldErrors();
  const email = String(authResetEmail?.value || "").trim();

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
  } catch (error) {
    console.error(error);
    setAuthBusy(false);
    const msg = mapAuthError(error);
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
    if (authResetEmail && authEmail) authResetEmail.value = String(authEmail.value || "").trim();
    renderAuthView(AUTH_VIEW.RESET);
  });

  authResetBackBtn?.addEventListener("click", () => {
    if (authBusy) return;
    renderAuthView(AUTH_VIEW.LOGIN);
  });

  authTogglePwBtn?.addEventListener("click", () => {
    if (!authPassword) return;
    const isPassword = authPassword.type === "password";
    authPassword.type = isPassword ? "text" : "password";
    authTogglePwBtn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
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
    } catch (error) {
      console.error(error);
    }
  });
}

/* =========
   Issues loader hook
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
  } catch (error) {
    console.warn("OrderBy(createdAt) failed, falling back to unsorted getDocs()", error);
    const snap = await getDocs(colRef);
    window.allIssues = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  if (typeof splitActiveDeleted === "function") splitActiveDeleted();
  if (typeof renderIssueList === "function") renderIssueList();
  if (typeof renderBinList === "function") renderBinList();
  if (typeof renderDuplicateSuggestions === "function") renderDuplicateSuggestions();

  if (
    typeof isInDetailScreen === "function" &&
    typeof renderSelectedIssueDetails === "function" &&
    isInDetailScreen() &&
    window.selectedIssueId
  ) {
    renderSelectedIssueDetails();
  }
}

/* =========
   Auth init
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
  authSessionResolved = false;

  // Safe fallback: never let the page hang forever
  authFallbackTimer = window.setTimeout(() => {
    if (authSessionResolved) return;

    console.warn("Auth session check timed out. Falling back to login.");
    authSessionResolved = true;
    setAuthBusy(false);
    showAuthGate();
    renderAuthView(AUTH_VIEW.LOGIN);
  }, 6000);

  onAuthStateChanged(window.auth, async (user) => {
    if (authSessionResolved) return;
    authSessionResolved = true;

    if (authFallbackTimer) {
      clearTimeout(authFallbackTimer);
      authFallbackTimer = null;
    }

    try {
      setAuthBusy(false);

      if (!user) {
        showAuthGate();
        renderAuthView(AUTH_VIEW.LOGIN);
        return;
      }

      // Show app immediately so user never feels stuck
      showApp();

      // Background profile work
      if (ensureFirestoreReady()) {
        try {
          const providerId = user?.providerData?.[0]?.providerId || "";
          const providerHint = providerId === "password" ? "password" : "google";
          await ensureUserProfileForAuthUser(user, providerHint);
          await updateHeaderUserName(user);
        } catch (error) {
          console.warn("Background profile setup error:", error);
        }
      } else if (userProfileNameEl) {
        userProfileNameEl.textContent = firstNameFallbackFromAuth(user);
        if (userProfileAvatarEl) {
          userProfileAvatarEl.textContent = initialsFromName(firstNameFallbackFromAuth(user), "");
        }
      }

      if (typeof onAuthed === "function") {
        await onAuthed(user);
      }
    } catch (error) {
      console.error(error);
      setAuthBusy(false);
      showAuthGate();
      renderAuthView(AUTH_VIEW.LOGIN);
      setAuthError("Something went wrong loading the portal. Please refresh.");
    }
  });
}

/* =========
   Theme
========= */

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