const googleLoginBtn = document.getElementById("googleLoginBtn");
const loginError = document.getElementById("loginError");

function setLoginError(message = "") {
  if (!loginError) return;

  if (!message) {
    loginError.textContent = "";
    loginError.classList.add("hidden");
    return;
  }

  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function setLoginBusy(isBusy) {
  if (!googleLoginBtn) return;
  googleLoginBtn.disabled = isBusy;
  googleLoginBtn.textContent = isBusy ? "Signing in..." : "";
  googleLoginBtn.innerHTML = isBusy
    ? `<span>Signing in...</span>`
    : `<span class="google-icon">G</span><span>Continue with Google</span>`;
}

async function handleGoogleLogin() {
  try {
    setLoginError("");
    setLoginBusy(true);

    const provider = new window.firebaseAuthFns.GoogleAuthProvider();
    await window.firebaseAuthFns.signInWithPopup(window.auth, provider);

    window.location.href = "./portal.html";
  } catch (error) {
    console.error(error);
    setLoginBusy(false);
    setLoginError("Google sign-in failed. Please try again.");
  }
}

function initLoginPage() {
  if (!window.auth || !window.firebaseAuthFns) {
    setLoginError("Firebase is not ready. Please refresh the page.");
    return;
  }

  window.firebaseAuthFns.onAuthStateChanged(window.auth, (user) => {
    if (user) {
      window.location.href = "./portal.html";
    }
  });

  googleLoginBtn?.addEventListener("click", handleGoogleLogin);
}

initLoginPage();