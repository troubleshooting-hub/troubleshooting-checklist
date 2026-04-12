const googleLoginBtn = document.getElementById("googleLoginBtn");
const emailLoginBtn = document.getElementById("emailLoginBtn");
const createAccountBtn = document.getElementById("createAccountBtn");
const sendResetBtn = document.getElementById("sendResetBtn");

const loginError = document.getElementById("loginError");
const authMessage = document.getElementById("authMessage");

const signInView = document.getElementById("signInView");
const signUpView = document.getElementById("signUpView");
const forgotPasswordView = document.getElementById("forgotPasswordView");

const showSignUpBtn = document.getElementById("showSignUpBtn");
const showForgotBtn = document.getElementById("showForgotBtn");
const backToSignInFromSignUp = document.getElementById("backToSignInFromSignUp");
const backToSignInFromForgot = document.getElementById("backToSignInFromForgot");

const signInEmail = document.getElementById("signInEmail");
const signInPassword = document.getElementById("signInPassword");

const signUpFirstName = document.getElementById("signUpFirstName");
const signUpLastName = document.getElementById("signUpLastName");
const signUpUsername = document.getElementById("signUpUsername");
const signUpEmail = document.getElementById("signUpEmail");
const signUpPassword = document.getElementById("signUpPassword");
const signUpConfirmPassword = document.getElementById("signUpConfirmPassword");

const forgotEmail = document.getElementById("forgotEmail");

const themeToggle = document.getElementById("themeToggle");

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

function setAuthMessage(message = "") {
  if (!authMessage) return;

  if (!message) {
    authMessage.textContent = "";
    authMessage.classList.add("hidden");
    return;
  }

  authMessage.textContent = message;
  authMessage.classList.remove("hidden");
}

function clearMessages() {
  setLoginError("");
  setAuthMessage("");
}

function showView(viewName) {
  clearMessages();

  signInView?.classList.add("hidden");
  signUpView?.classList.add("hidden");
  forgotPasswordView?.classList.add("hidden");

  if (viewName === "signin") signInView?.classList.remove("hidden");
  if (viewName === "signup") signUpView?.classList.remove("hidden");
  if (viewName === "forgot") forgotPasswordView?.classList.remove("hidden");
}

function setButtonBusy(button, isBusy, busyText, normalHtml) {
  if (!button) return;

  button.disabled = isBusy;
  button.innerHTML = isBusy ? `<span>${busyText}</span>` : normalHtml;
}

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

function validateEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

async function handleGoogleLogin() {
  try {
    clearMessages();

    setButtonBusy(
      googleLoginBtn,
      true,
      "Signing in...",
      `<span class="google-icon">G</span><span>Continue with Google</span>`
    );

    const provider = new window.firebaseAuthFns.GoogleAuthProvider();
    await window.firebaseAuthFns.signInWithPopup(window.auth, provider);

    window.location.href = "./portal.html";
  } catch (error) {
    console.error(error);
    setLoginError("Google sign-in failed. Please try again.");
  } finally {
    setButtonBusy(
      googleLoginBtn,
      false,
      "Signing in...",
      `<span class="google-icon">G</span><span>Continue with Google</span>`
    );
  }
}

async function handleEmailLogin() {
  try {
    clearMessages();

    const email = String(signInEmail?.value || "").trim();
    const password = String(signInPassword?.value || "");

    if (!validateEmail(email)) {
      setLoginError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setLoginError("Please enter your password.");
      return;
    }

    setButtonBusy(
      emailLoginBtn,
      true,
      "Signing in...",
      `Sign In`
    );

    await window.firebaseAuthFns.signInWithEmailAndPassword(window.auth, email, password);

    window.location.href = "./portal.html";
  } catch (error) {
    console.error(error);

    if (error?.code === "auth/invalid-credential") {
      setLoginError("Invalid email or password.");
    } else if (error?.code === "auth/user-not-found") {
      setLoginError("No account found with this email.");
    } else if (error?.code === "auth/wrong-password") {
      setLoginError("Incorrect password.");
    } else {
      setLoginError("Email sign-in failed. Please try again.");
    }
  } finally {
    setButtonBusy(
      emailLoginBtn,
      false,
      "Signing in...",
      `Sign In`
    );
  }
}

async function handleCreateAccount() {
  try {
    clearMessages();

    const firstName = String(signUpFirstName?.value || "").trim();
    const lastName = String(signUpLastName?.value || "").trim();
    const username = String(signUpUsername?.value || "").trim();
    const email = String(signUpEmail?.value || "").trim();
    const password = String(signUpPassword?.value || "");
    const confirmPassword = String(signUpConfirmPassword?.value || "");

    if (!firstName || !lastName || !username || !email || !password || !confirmPassword) {
      setLoginError("Please fill in all fields.");
      return;
    }

    if (!validateEmail(email)) {
      setLoginError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setLoginError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setLoginError("Passwords do not match.");
      return;
    }

    setButtonBusy(
      createAccountBtn,
      true,
      "Creating account...",
      `Create Account`
    );

    const userCred = await window.firebaseAuthFns.createUserWithEmailAndPassword(
      window.auth,
      email,
      password
    );

    const user = userCred.user;
    const fullName = `${firstName} ${lastName}`.trim();

    await window.firebaseAuthFns.updateProfile(user, {
      displayName: fullName
    });

    await window.firebaseDbFns.setDoc(
      window.firebaseDbFns.doc(window.db, "users", user.uid),
      {
        uid: user.uid,
        firstName,
        lastName,
        username,
        email,
        fullName,
        createdAt: window.firebaseDbFns.serverTimestamp()
      }
    );

    await window.firebaseAuthFns.signOut(window.auth);

    signUpFirstName.value = "";
    signUpLastName.value = "";
    signUpUsername.value = "";
    signUpEmail.value = "";
    signUpPassword.value = "";
    signUpConfirmPassword.value = "";

    showView("signin");
    setAuthMessage("Account created successfully. Please sign in.");
  } catch (error) {
    console.error(error);

    if (error?.code === "auth/email-already-in-use") {
      setLoginError("This email is already registered.");
    } else {
      setLoginError("Could not create account. Please try again.");
    }
  } finally {
    setButtonBusy(
      createAccountBtn,
      false,
      "Creating account...",
      `Create Account`
    );
  }
}

async function handleForgotPassword() {
  try {
    clearMessages();

    const email = String(forgotEmail?.value || "").trim();

    if (!validateEmail(email)) {
      setLoginError("Please enter a valid email address.");
      return;
    }

    setButtonBusy(
      sendResetBtn,
      true,
      "Sending reset link...",
      `Send Reset Link`
    );

    await window.firebaseAuthFns.sendPasswordResetEmail(window.auth, email);

    forgotEmail.value = "";
    showView("signin");
    setAuthMessage("Password reset email sent. Please check your inbox.");
  } catch (error) {
    console.error(error);
    setLoginError("Could not send reset email. Please try again.");
  } finally {
    setButtonBusy(
      sendResetBtn,
      false,
      "Sending reset link...",
      `Send Reset Link`
    );
  }
}

function bindEvents() {
  showSignUpBtn?.addEventListener("click", () => showView("signup"));
  showForgotBtn?.addEventListener("click", () => showView("forgot"));
  backToSignInFromSignUp?.addEventListener("click", () => showView("signin"));
  backToSignInFromForgot?.addEventListener("click", () => showView("signin"));

  googleLoginBtn?.addEventListener("click", handleGoogleLogin);
  emailLoginBtn?.addEventListener("click", handleEmailLogin);
  createAccountBtn?.addEventListener("click", handleCreateAccount);
  sendResetBtn?.addEventListener("click", handleForgotPassword);

  signInPassword?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleEmailLogin();
  });

  signInEmail?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleEmailLogin();
  });

  signUpConfirmPassword?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCreateAccount();
  });

  forgotEmail?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleForgotPassword();
  });

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
}

function initLoginPage() {
  if (!window.auth || !window.firebaseAuthFns || !window.firebaseDbFns) {
    setTimeout(initLoginPage, 100);
    return;
  }

  applySavedTheme();
  bindEvents();
  showView("signin");

  window.firebaseAuthFns.onAuthStateChanged(window.auth, (user) => {
    if (user) {
      window.location.href = "./portal.html";
    }
  });
}

initLoginPage();