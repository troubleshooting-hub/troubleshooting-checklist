/* =========================================================
   Troubleshooting Checklist Portal — AUTH + USER PROFILES
   Implements:
   1) Signup view fields: First/Last/Email/Password + inline field errors
   2) Password signup:
      - Firestore uniqueness check on fullNameKey BEFORE auth creation
      - Create users/{uid} profile doc
      - updateProfile(displayName)
   3) Google sign-in:
      - Ensure users/{uid} exists
      - Enforce fullNameKey uniqueness; on collision -> sign out + block
   4) Header: show firstName in top-right (#userProfileName if present)
   5) Stable auth gate <-> app transition + loading overlay

   IMPORTANT: Your index.html Firebase module MUST expose these Firestore fns:
   - getDoc, where, limit
   Optional but recommended for stronger uniqueness:
   - runTransaction

   i.e. add to imports and window.firebaseFns:
     getDoc, where, limit, runTransaction
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
  // simple, safe email shape check
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
   DOM — Portal (existing)
========= */

// Tabs / sections etc are already in your current script;
// keep your portal logic below as-is.
// (I’m only adding auth + profile parts + minimal hooks.)

/* =========
   Auth DOM (from your provided index.html)
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

/* Header profile name (add in HTML if you want the pill) */
const userProfileNameEl = document.getElementById("userProfileName");

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
   Inline field errors (no alert)
========= */

function ensureInlineErrorEl(inputEl) {
  if (!inputEl) return null;

  const id = inputEl.id || "";
  const existing = document.getElementById(`${id}Error`);
  if (existing) return existing;

  const div = document.createElement("div");
  div.id = `${id}Error`;
  div.className = "auth-inline-error hidden";
  // insert right after input
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
    .forEach((b) => (b.disabled = authBusy));

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

  // Toggle form blocks
  if (authFormView) authFormView.classList.toggle("hidden", authView === AUTH_VIEW.RESET);
  if (authResetView) authResetView.classList.toggle("hidden", authView !== AUTH_VIEW.RESET);

  // Signup-only name fields
  authNameRow?.classList.toggle("hidden", authView !== AUTH_VIEW.SIGNUP);

  // Forgot link only on login
  authForgotBtn?.classList.toggle("hidden", authView !== AUTH_VIEW.LOGIN);

  // Password eye only when password input visible (login/signup)
  authTogglePwBtn?.classList.toggle("hidden", authView === AUTH_VIEW.RESET);

  // Titles + copy
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
    // Reset view has its own title/sub in your HTML
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
  const need = requireFirestoreFns(["doc", "setDoc", "serverTimestamp"]);
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

  // If the only hit is the same uid, it's not a collision
  const hit = snap.docs[0];
  if (exceptUid && hit.id === exceptUid) return false;

  return true;
}

/**
 * Recommended: name locks to reduce race conditions
 * userNameLocks/{fullNameKey} with { uid, createdAt }
 */
async function tryAcquireNameLock(fullNameKey, uid) {
  const hasTx = !!window.firebaseFns?.runTransaction;
  const hasGetDoc = !!window.firebaseFns?.getDoc;
  const hasSetDoc = !!window.firebaseFns?.setDoc;
  const hasDoc = !!window.firebaseFns?.doc;
  const hasServerTimestamp = !!window.firebaseFns?.serverTimestamp;

  if (!(hasTx && hasGetDoc && hasSetDoc && hasDoc && hasServerTimestamp)) {
    // Fall back to simple pre-check (lower safety)
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
      // If already locked by same uid, treat as ok
      return { ok: true, reason: "already-locked" };
    }

    tx.set(lockRef, { uid, createdAt: serverTimestamp() });
    return { ok: true, reason: "locked" };
  });

  return res;
}

/* =========
   Ensure profile exists (Google or post-login)
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

  // If profile already exists -> done
  try {
    const snap = await getUserDoc(user.uid);
    if (snap.exists()) return;
  } catch (e) {
    // If getDoc missing, surface clean error
    console.error(e);
    setAuthError("Firestore user profile check failed. Ensure getDoc is exported in index.html.");
    throw e;
  }

  // Need to create profile
  const authProvider = providerHint || (user?.providerData?.[0]?.providerId === "password" ? "password" : "google");

  let firstName = "";
  let lastName = "";

  // From displayName if possible
  if (user.displayName) {
    const parts = splitName(user.displayName);
    firstName = parts.firstName;
    lastName = parts.lastName;
  }

  // If Google sometimes has no displayName, fall back to email prefix
  if (!firstName) firstName = firstNameFallbackFromAuth(user);

  const norm = normalizeFullName(firstName, lastName);
  const collision = await checkFullNameKeyCollision(norm.fullNameKey, user.uid);

  if (collision) {
    // Requirement: block + sign out immediately
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

  // Prefer Firestore
  try {
    const snap = await getUserDoc(user.uid);
    if (snap.exists()) {
      const data = snap.data() || {};
      first = String(data.firstName || "").trim();
      const last = String(data.lastName || "").trim();

      if (first) {
        const initials = initialsFromName(first, last);
        userProfileNameEl.innerHTML = `
          <span class="user-pill">
            <span class="user-initials" aria-hidden="true">${escapeHtml(initials)}</span>
            <span class="user-first">${escapeHtml(first)}</span>
          </span>
        `;
        return;
      }
    }
  } catch {
    // ignore, use fallback
  }

  // Fallback: Auth displayName
  first = firstNameFallbackFromAuth(user);

  const initials = initialsFromName(first, "");
  userProfileNameEl.innerHTML = `
    <span class="user-pill">
      <span class="user-initials" aria-hidden="true">${escapeHtml(initials)}</span>
      <span class="user-first">${escapeHtml(first)}</span>
    </span>
  `;
}

/* =========
   Signup validation
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

  const need = requireFirestoreFns(["where", "limit", "getDoc"]);
  if (!need.ok) {
    setAuthError(
      `Missing Firestore exports in index.html: ${need.missing.join(
        ", "
      )}. Add them to Firebase imports and window.firebaseFns.`
    );
    return;
  }

  const { ok, first, last, email, pw } = validateSignupFields();
  if (!ok) return;

  const norm = normalizeFullName(first, last);

  // Pre-check before creating auth user (requirement)
  setAuthBusy(true, "Checking name availability…");
  try {
    const collision = await checkFullNameKeyCollision(norm.fullNameKey);
    if (collision) {
      setAuthBusy(false);
      setFieldError(
        authLastName,
        "An account with this name already exists. Please contact admin or use a different name."
      );
      return;
    }
  } catch (e) {
    console.error(e);
    setAuthBusy(false);
    setAuthError("Could not verify name uniqueness. Please check Firestore exports and try again.");
    return;
  }

  // Create auth user
  let userCred = null;
  try {
    setAuthBusy(true, "Creating account…");
    userCred = await window.firebaseAuthFns.createUserWithEmailAndPassword(window.auth, email, pw);

    const user = userCred.user;

    // Acquire lock (best effort; blocks race when available)
    const lockRes = await tryAcquireNameLock(norm.fullNameKey, user.uid);
    if (!lockRes.ok) {
      // Collision after auth user created -> best effort cleanup
      setAuthBusy(false);
      setAuthError("An account with this name already exists. Please contact admin.");

      // best-effort: sign out so portal access is blocked
      try {
        await window.firebaseAuthFns.signOut(window.auth);
      } catch {}

      // optional best-effort delete (only if your index.html exports deleteUser)
      if (window.firebaseAuthFns.deleteUser) {
        try {
          await window.firebaseAuthFns.deleteUser(user);
        } catch {}
      }

      showAuthGate();
      renderAuthView(AUTH_VIEW.SIGNUP);
      return;
    }

    // Update Auth displayName
    const displayName = norm.fullName;
    await window.firebaseAuthFns.updateProfile(user, { displayName });

    // Create user profile doc
    const profileDoc = {
      uid: user.uid,
      firstName: first,
      lastName: last,
      fullName: norm.fullName,
      fullNameKey: norm.fullNameKey,
      email,
      createdAt: window.firebaseFns.serverTimestamp(),
      authProvider: "password"
    };

    await createOrUpdateUserDoc(user.uid, profileDoc);

    setAuthBusy(false);
    // UI transition will happen in onAuthStateChanged
  } catch (e) {
    console.error(e);
    setAuthBusy(false);

    const msg = mapAuthError(e);
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
    // onAuthStateChanged will run ensureUserProfileForAuthUser()
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

    // Continue URL should land back on your GitHub Pages base
    const basePath = document.baseURI.replace(location.origin, "").replace(/\/+$/, "");
    const continueUrl = `${location.origin}${basePath}`;

    await window.firebaseAuthFns.sendPasswordResetEmail(window.auth, email, { url: continueUrl });

    setAuthBusy(false);
    // Safe generic message
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
  // Toggle login <-> signup
  authToggleModeBtn?.addEventListener("click", () => {
    if (authBusy) return;

    if (authView === AUTH_VIEW.LOGIN) renderAuthView(AUTH_VIEW.SIGNUP);
    else if (authView === AUTH_VIEW.SIGNUP) renderAuthView(AUTH_VIEW.LOGIN);
  });

  // Forgot -> reset view
  authForgotBtn?.addEventListener("click", () => {
    if (authBusy) return;

    // copy email if present
    if (authResetEmail && authEmail) authResetEmail.value = String(authEmail.value || "").trim();
    renderAuthView(AUTH_VIEW.RESET);
  });

  // Reset back
  authResetBackBtn?.addEventListener("click", () => {
    if (authBusy) return;
    renderAuthView(AUTH_VIEW.LOGIN);
  });

  // Password toggle
  authTogglePwBtn?.addEventListener("click", () => {
    if (!authPassword) return;
    const isPw = authPassword.type === "password";
    authPassword.type = isPw ? "text" : "password";
    authTogglePwBtn.setAttribute("aria-label", isPw ? "Hide password" : "Show password");
  });

  // Primary action (login or create)
  authPrimaryBtn?.addEventListener("click", async () => {
    if (authBusy) return;

    if (authView === AUTH_VIEW.LOGIN) return handlePasswordLogin();
    if (authView === AUTH_VIEW.SIGNUP) return handlePasswordSignup();
  });

  // Google (works in login or signup views)
  googleSignInBtn?.addEventListener("click", async () => {
    if (authBusy) return;
    await handleGoogleSignIn();
  });

  // Reset send
  authResetSendBtn?.addEventListener("click", async () => {
    if (authBusy) return;
    await handlePasswordReset();
  });

  // Enter key submits appropriate CTA
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

  // Logout
  authLogoutBtn?.addEventListener("click", async () => {
    if (!ensureAuthReady()) return;
    try {
      await window.firebaseAuthFns.signOut(window.auth);
    } catch (e) {
      console.error(e);
      // no alerts; show banner on gate after sign-out attempt
    }
  });
}

/* =========
   Auth Gate init
========= */

async function initAuthGate({ onAuthed } = {}) {
  if (!authGate || !appRoot) {
    // No auth gate present -> run app normally
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
        // keep login view by default
        renderAuthView(AUTH_VIEW.LOGIN);
        return;
      }

      // Ensure Firestore profile exists (Google users especially)
      if (ensureFirestoreReady()) {
        await ensureUserProfileForAuthUser(user, { providerHint: "google" }).catch(() => {
          // ensureUserProfileForAuthUser handles sign-out + message on collision
        });
      }

      // Update header pill
      if (ensureFirestoreReady()) {
        await updateHeaderUserName(user);
      } else if (userProfileNameEl) {
        const first = firstNameFallbackFromAuth(user);
        userProfileNameEl.textContent = first;
      }

      showApp();
      setAuthBusy(false);

      if (typeof onAuthed === "function") await onAuthed(user);
    } catch (e) {
      console.error(e);
      setAuthBusy(false);
      showAuthGate();
      setAuthError("Something went wrong loading the portal. Please refresh.");
    }
  });
}

/* =========================================================
   YOUR EXISTING PORTAL LOGIC BELOW
   (No changes required here, except:
    - call initAuthGate({ onAuthed: loadIssuesFromFirestore })
    - and ensure loadIssuesFromFirestore exists)
========================================================= */

/* =========
   (Placeholder) Firestore issues loader hook
   Replace with your existing function if already present.
========= */

async function loadIssuesFromFirestore() {
  // If you already have this in your script, delete this stub.
  // This stub is here only to prevent runtime errors if you paste this file standalone.
}

/* =========
   Theme Toggle (keep your existing)
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

  // Auth gate: load issues only after authenticated + profile ensured
  await initAuthGate({
    onAuthed: async () => {
      // Call your real loader here
      await loadIssuesFromFirestore();
    }
  });
}

init();

/* =========================================================
   Minimal CSS hooks needed for inline field errors + pill
   (Add to your CSS if not present)
   .auth-inline-error { margin-top:6px; font-size:12px; color: rgba(239,68,68,1); font-weight:700; }
   .auth-input-error { border-color: rgba(239,68,68,0.55) !important; box-shadow: 0 0 0 4px rgba(239,68,68,0.10) !important; }
   .user-pill { display:inline-flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:999px; background: var(--panel); }
   .user-initials { width:26px; height:26px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--border2); font-weight:900; font-size:12px; }
   .user-first { font-weight:900; font-size:13px; color: var(--text); }
========================================================= */