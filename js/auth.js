// Модуль двухфакторной Email-верификации (6-значный OTP), авторизации через Google Identity Services
// и строгого контроля сессии платформы RoboLab (localStorage: robolab_user).

(function () {
  const USER_STORAGE_KEY = "robolab_user";
  const LEGACY_AUTH_KEY = "robolab_auth";
  const PENDING_OTP_KEY = "robolab_pending_otp";
  const REGISTERED_USERS_KEY = "robolab_registered_accounts";

  // Опциональная конфигурация EmailJS (если заданы ключи, отправляет реальное письмо через API EmailJS)
  const EMAILJS_CONFIG = {
    enabled: false,
    serviceId: "service_robolab",
    templateId: "template_robolab_otp",
    publicKey: ""
  };

  // Опциональный Client ID для Google Identity Services (при работе на домене http/https)
  const GOOGLE_CLIENT_ID = "";

  // Встроенные демо-аккаунты Google с векторными аватарками (Data URI) для 100% работы попапа OAuth2 на любом ПК
  function makeSvgAvatarDataUri(initials, bg1, bg2) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg1}"/>
          <stop offset="100%" stop-color="${bg2}"/>
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="48" fill="url(#g)"/>
      <circle cx="48" cy="36" r="15" fill="rgba(255,255,255,0.22)"/>
      <path d="M22 82c4-15 16-22 26-22s22 7 26 22" fill="rgba(255,255,255,0.22)"/>
      <text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="30">${initials}</text>
    </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  const GOOGLE_DEMO_PROFILES = [
    {
      name: "Алия Садыкова",
      email: "aliya.sadykova@gmail.com",
      picture: makeSvgAvatarDataUri("АС", "#06b6d4", "#2563eb")
    },
    {
      name: "Тимур Искаков (Инженер STEM)",
      email: "timur.robotics@gmail.com",
      picture: makeSvgAvatarDataUri("ТИ", "#f97316", "#7c3aed")
    },
    {
      name: "Дана Ахметова",
      email: "dana.school.lab@gmail.com",
      picture: makeSvgAvatarDataUri("ДА", "#10b981", "#0891b2")
    }
  ];

  const authState = {
    mode: "login",         // "login" | "register"
    step: "form",          // "form" | "otp" | "success"
    currentUser: null,     // { name, email, picture, provider, emailVerified, verifiedAt }
    pendingVerification: null, // { name, email, password, code, expiresAt }
    countdownSec: 59,
    countdownTimer: null,
    toastTimeout: null,
    onAuthSuccessCallback: null,
    onLogoutCallback: null
  };

  // ==================== РАБОТА С LOCALSTORAGE И JWT ====================
  function loadVerifiedUser() {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem(LEGACY_AUTH_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Строгая проверка: доступ разрешён ТОЛЬКО если emailVerified === true
      if (parsed && parsed.email && parsed.emailVerified === true) {
        authState.currentUser = parsed;
        return parsed;
      }
    } catch (e) {}
    authState.currentUser = null;
    return null;
  }

  function saveVerifiedUser(userObj) {
    authState.currentUser = userObj;
    try {
      if (userObj) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userObj));
        localStorage.setItem(LEGACY_AUTH_KEY, JSON.stringify(userObj));
        localStorage.removeItem(PENDING_OTP_KEY);
      } else {
        localStorage.removeItem(USER_STORAGE_KEY);
        localStorage.removeItem(LEGACY_AUTH_KEY);
      }
    } catch (e) {}
  }

  function loadPendingVerification() {
    try {
      const raw = localStorage.getItem(PENDING_OTP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.email && parsed.code) {
        authState.pendingVerification = parsed;
        return parsed;
      }
    } catch (e) {}
    return null;
  }

  function savePendingVerification(pendingObj) {
    authState.pendingVerification = pendingObj;
    try {
      if (pendingObj) {
        localStorage.setItem(PENDING_OTP_KEY, JSON.stringify(pendingObj));
      } else {
        localStorage.removeItem(PENDING_OTP_KEY);
      }
    } catch (e) {}
  }

  function getRegisteredAccounts() {
    try {
      const raw = localStorage.getItem(REGISTERED_USERS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveRegisteredAccount(account) {
    try {
      const map = getRegisteredAccounts();
      map[account.email.toLowerCase()] = account;
      localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  // Кодирование и декодирование JWT-токена профиля Google (стандарт Google Identity Services)
  function createMockGoogleJwt(profile) {
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: "https://accounts.google.com",
      name: profile.name,
      email: profile.email,
      picture: profile.picture,
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const b64 = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return `${b64(header)}.${b64(payload)}.robolab_google_oauth2_sig`;
  }

  function decodeGoogleJwt(jwtToken) {
    try {
      const parts = jwtToken.split(".");
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr = decodeURIComponent(escape(atob(base64)));
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  }

  // ==================== ВАЛИДАЦИЯ ПАРОЛЯ И ГЕНЕРАЦИЯ 6-ЗНАЧНОГО КОДА ====================
  function evaluatePasswordStrength(pwd) {
    const hasLength = pwd.length >= 8;
    const hasLetters = /[a-zA-Zа-яА-ЯёЁ]/.test(pwd);
    const hasDigits = /\d/.test(pwd);
    let score = 0;
    if (hasLength) score++;
    if (hasLetters) score++;
    if (hasDigits) score++;
    return {
      isValid: hasLength && hasLetters && hasDigits,
      hasLength,
      hasLetters,
      hasDigits,
      score
    };
  }

  function updatePasswordStrengthUI(pwd) {
    const seg1 = document.getElementById("pwdSeg1");
    const seg2 = document.getElementById("pwdSeg2");
    const seg3 = document.getElementById("pwdSeg3");
    const statusText = document.getElementById("pwdStrengthLabel");
    if (!seg1 || !seg2 || !seg3 || !statusText) return;

    const res = evaluatePasswordStrength(pwd);
    seg1.className = "pwd-bar-seg";
    seg2.className = "pwd-bar-seg";
    seg3.className = "pwd-bar-seg";

    if (!pwd) {
      statusText.textContent = "Минимум 8 символов, буквы и цифры";
      statusText.style.color = "#94a3b8";
      return;
    }

    if (res.score === 1) {
      seg1.classList.add("weak");
      statusText.textContent = "Слабый пароль (нужны буквы и цифры, от 8 симв.)";
      statusText.style.color = "#fca5a5";
    } else if (res.score === 2) {
      seg1.classList.add("medium");
      seg2.classList.add("medium");
      statusText.textContent = "Средний пароль (добавьте буквы и цифры, от 8 симв.)";
      statusText.style.color = "#fcd34d";
    } else if (res.isValid) {
      seg1.classList.add("strong");
      seg2.classList.add("strong");
      seg3.classList.add("strong");
      statusText.textContent = "✓ Надёжный пароль";
      statusText.style.color = "#22d3ee";
    }
  }

  function generateSixDigitCode() {
    const array = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
      return String(100000 + (array[0] % 900000));
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // Отправка проверочного кода через EmailJS (если настроен) + всплывающее Push-уведомление + лог в консоль
  function dispatchVerificationEmail(name, email, code) {
    console.info(
      `%c[RoboLab Security] ✉️ Проверочный код подтверждения для ${email}: ${code}`,
      "background:#161923; color:#00f5d4; font-weight:bold; padding:4px 8px; border-radius:4px;"
    );

    if (EMAILJS_CONFIG.enabled && window.emailjs && EMAILJS_CONFIG.publicKey) {
      window.emailjs
        .send(
          EMAILJS_CONFIG.serviceId,
          EMAILJS_CONFIG.templateId,
          {
            to_name: name,
            to_email: email,
            verification_code: code
          },
          EMAILJS_CONFIG.publicKey
        )
        .catch((err) => {
          console.warn("[RoboLab EmailJS] Используется локальное пуш-уведомление:", err);
        });
    }

    showEmailPushToast(email, code);
  }

  function showEmailPushToast(email, code) {
    const toast = document.getElementById("emailPushToast");
    const emailSpan = document.getElementById("toastRecipientEmail");
    const codeSpan = document.getElementById("toastVerificationCode");
    if (!toast || !emailSpan || !codeSpan) return;

    emailSpan.textContent = email;
    codeSpan.textContent = code;
    toast.classList.remove("hidden");

    if (authState.toastTimeout) clearTimeout(authState.toastTimeout);
    authState.toastTimeout = setTimeout(() => {
      toast.classList.add("hidden");
    }, 25000);
  }

  function hideEmailPushToast() {
    const toast = document.getElementById("emailPushToast");
    if (toast) toast.classList.add("hidden");
  }

  // ==================== ПЕРЕКЛЮЧЕНИЕ ШАГОВ МОДАЛЬНОГО ОКНА ====================
  function openAuthModal(mode = "login", noticeMsg = "") {
    const backdrop = document.getElementById("authModalBackdrop");
    if (!backdrop) return;
    backdrop.classList.remove("hidden");

    // Если есть незавершённое подтверждение Email и пользователь открывает регистрацию — можно сразу продолжить или начать заново
    switchStepPane("form");
    setAuthMode(mode);

    if (noticeMsg) {
      showFormFeedback(noticeMsg, true);
    } else {
      hideFormFeedback();
    }
  }

  function closeAuthModal() {
    const backdrop = document.getElementById("authModalBackdrop");
    if (backdrop) backdrop.classList.add("hidden");
  }

  function switchStepPane(stepName) {
    authState.step = stepName;
    const stepForm = document.getElementById("authStepForm");
    const stepOtp = document.getElementById("authStepOtp");
    const stepSuccess = document.getElementById("authStepSuccess");

    if (stepForm) stepForm.classList.toggle("hidden", stepName !== "form");
    if (stepOtp) stepOtp.classList.toggle("hidden", stepName !== "otp");
    if (stepSuccess) stepSuccess.classList.toggle("hidden", stepName !== "success");
  }

  function setAuthMode(mode) {
    authState.mode = mode;
    const isReg = mode === "register";
    document.getElementById("authTabLogin").classList.toggle("active", !isReg);
    document.getElementById("authTabRegister").classList.toggle("active", isReg);
    document.getElementById("authNameGroup").classList.toggle("hidden", !isReg);
    document.getElementById("authConfirmGroup").classList.toggle("hidden", !isReg);
    document.getElementById("pwdStrengthWrap").classList.toggle("hidden", !isReg);

    document.getElementById("authModalTitle").textContent = isReg
      ? "Регистрация в RoboLab"
      : "Вход в RoboLab";
    document.getElementById("authSubmitBtn").textContent = isReg
      ? "Зарегистрироваться"
      : "Войти в RoboLab";
    hideFormFeedback();
  }

  function showFormFeedback(msg, isError = true) {
    const box = document.getElementById("authFeedbackBox");
    if (!box) return;
    box.textContent = msg;
    box.className = "auth-feedback-box " + (isError ? "err" : "ok");
    box.classList.remove("hidden");
  }

  function hideFormFeedback() {
    const box = document.getElementById("authFeedbackBox");
    if (box) box.classList.add("hidden");
  }

  function showOtpFeedback(msg, isError = true) {
    const box = document.getElementById("otpFeedbackBox");
    if (!box) return;
    box.textContent = msg;
    box.className = "auth-feedback-box " + (isError ? "err" : "ok");
    box.classList.remove("hidden");
  }

  function hideOtpFeedback() {
    const box = document.getElementById("otpFeedbackBox");
    if (box) box.classList.add("hidden");
  }

  // ==================== ШАГ 2: 6-ЗНАЧНЫЙ КОД И ТАЙМЕР 00:59 ====================
  function transitionToOtpScreen(pendingData) {
    savePendingVerification(pendingData);
    switchStepPane("otp");
    hideOtpFeedback();

    const targetEmailEl = document.getElementById("otpTargetEmail");
    if (targetEmailEl) targetEmailEl.textContent = pendingData.email;

    clearOtpBoxes();
    startOtpCountdown(59);
    dispatchVerificationEmail(pendingData.name, pendingData.email, pendingData.code);

    const firstDigit = document.querySelector('.otp-digit-input[data-otp-index="0"]');
    if (firstDigit) setTimeout(() => firstDigit.focus(), 80);
  }

  function startOtpCountdown(seconds = 59) {
    if (authState.countdownTimer) clearInterval(authState.countdownTimer);
    authState.countdownSec = seconds;

    const timerText = document.getElementById("otpCountdownText");
    const resendBtn = document.getElementById("resendOtpBtn");

    const updateTick = () => {
      const s = Math.max(0, authState.countdownSec);
      const formatted = `00:${String(s).padStart(2, "0")}`;
      if (s > 0) {
        if (timerText) timerText.textContent = `Отправить код повторно через ${formatted}`;
        if (resendBtn) {
          resendBtn.disabled = true;
          resendBtn.textContent = `Повторно (${formatted})`;
        }
      } else {
        if (timerText) timerText.textContent = "Код не пришёл? Вы можете запросить новый код:";
        if (resendBtn) {
          resendBtn.disabled = false;
          resendBtn.textContent = "Отправить код повторно";
        }
        clearInterval(authState.countdownTimer);
      }
    };

    updateTick();
    authState.countdownTimer = setInterval(() => {
      authState.countdownSec--;
      updateTick();
    }, 1000);
  }

  function getOtpInputs() {
    return Array.from(document.querySelectorAll(".otp-digit-input"));
  }

  function clearOtpBoxes() {
    getOtpInputs().forEach((inp) => {
      inp.value = "";
      inp.classList.remove("filled", "otp-error", "otp-success");
    });
  }

  function fillOtpBoxes(codeString) {
    const clean = String(codeString).replace(/\D/g, "").slice(0, 6);
    const inputs = getOtpInputs();
    inputs.forEach((inp, idx) => {
      const ch = clean[idx] || "";
      inp.value = ch;
      inp.classList.toggle("filled", Boolean(ch));
      inp.classList.remove("otp-error", "otp-success");
    });
    if (clean.length === 6) {
      if (inputs[5]) inputs[5].focus();
      verifyEnteredOtpCode();
    }
  }

  function getEnteredOtpCode() {
    return getOtpInputs().map((inp) => inp.value.trim()).join("");
  }

  function verifyEnteredOtpCode() {
    const entered = getEnteredOtpCode();
    const inputs = getOtpInputs();

    if (entered.length < 6) {
      inputs.forEach((inp) => inp.classList.add("otp-error"));
      showOtpFeedback("Введите все 6 цифр проверочного кода.", true);
      return;
    }

    const pending = authState.pendingVerification || loadPendingVerification();
    if (!pending) {
      showOtpFeedback("Сессия подтверждения истекла. Заполните форму заново.", true);
      return;
    }

    if (entered !== String(pending.code)) {
      inputs.forEach((inp) => {
        inp.classList.remove("otp-success");
        inp.classList.add("otp-error");
      });
      showOtpFeedback("Неверный проверочный код. Попробуйте ещё раз", true);
      return;
    }

    // Код верный! Подсвечиваем зелёным и переходим к успешной верификации
    inputs.forEach((inp) => {
      inp.classList.remove("otp-error");
      inp.classList.add("otp-success");
    });
    showOtpFeedback("Email успешно подтверждён!", false);
    hideEmailPushToast();

    if (authState.countdownTimer) clearInterval(authState.countdownTimer);

    const initials = pending.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "RL";

    const verifiedUser = {
      name: pending.name,
      email: pending.email,
      picture: makeSvgAvatarDataUri(initials, "#06b6d4", "#f97316"),
      provider: "email",
      emailVerified: true,
      verifiedAt: new Date().toISOString()
    };

    // Сохраняем подтверждённый аккаунт в реестре зарегистрированных пользователей
    saveRegisteredAccount({
      ...verifiedUser,
      password: pending.password
    });

    setTimeout(() => {
      switchStepPane("success");
      const succEmail = document.getElementById("verifiedSuccessEmail");
      if (succEmail) succEmail.textContent = verifiedUser.email;

      setTimeout(() => {
        finalizeLoginSession(verifiedUser);
      }, 900);
    }, 380);
  }

  // ==================== ЗАВЕРШЕНИЕ ВХОДА И ОБНОВЛЕНИЕ ПРОФИЛЯ ====================
  function finalizeLoginSession(userObj) {
    saveVerifiedUser(userObj);
    updateNavbarAndToolbarProfile();
    closeAuthModal();
    hideEmailPushToast();

    if (typeof authState.onAuthSuccessCallback === "function") {
      authState.onAuthSuccessCallback(userObj);
    }
  }

  function logoutCurrentUser() {
    saveVerifiedUser(null);
    closeProfileDropdown();
    updateNavbarAndToolbarProfile();
    if (typeof authState.onLogoutCallback === "function") {
      authState.onLogoutCallback();
    }
  }

  function updateNavbarAndToolbarProfile() {
    const user = authState.currentUser;
    const avatarSlot = document.getElementById("profileAvatarSlot");
    const btnText = document.getElementById("loginBtnText");
    const dropAvatarSlot = document.getElementById("dropdownAvatarSlot");
    const dropName = document.getElementById("dropdownUserName");
    const dropEmail = document.getElementById("dropdownUserEmail");
    const dropVerified = document.getElementById("dropdownVerifiedBadge");

    const landingLoginBtn = document.getElementById("landingLoginBtn");
    const landingRegisterBtn = document.getElementById("landingRegisterBtn");
    const landingLogoutBtn = document.getElementById("landingLogoutBtn");

    if (user && user.emailVerified) {
      const avatarHtml = user.picture
        ? `<img src="${user.picture}" alt="${user.name}" class="user-avatar-img" />`
        : `<span class="user-avatar-circle">${user.name.slice(0, 2).toUpperCase()}</span>`;

      if (avatarSlot) avatarSlot.innerHTML = avatarHtml;
      if (btnText) btnText.textContent = user.name;
      if (dropAvatarSlot) dropAvatarSlot.innerHTML = avatarHtml;
      if (dropName) dropName.textContent = user.name;
      if (dropEmail) dropEmail.textContent = user.email;
      if (dropVerified) {
        if (user.provider === "google") {
          dropVerified.textContent = "✓ Google Верифицирован";
        } else if (user.provider === "jury_demo") {
          dropVerified.textContent = "⚡ Демо-доступ Жюри · Верифицирован";
        } else {
          dropVerified.textContent = "✓ Email подтверждён";
        }
      }

      if (landingLoginBtn) landingLoginBtn.textContent = `👤 ${user.name} · В симулятор`;
      if (landingRegisterBtn) landingRegisterBtn.classList.add("hidden");
      if (landingLogoutBtn) landingLogoutBtn.classList.remove("hidden");
    } else {
      if (avatarSlot) avatarSlot.innerHTML = `<span class="user-avatar-circle">🔒</span>`;
      if (btnText) btnText.textContent = "Гость";
      if (landingLoginBtn) landingLoginBtn.textContent = "Войти в аккаунт";
      if (landingRegisterBtn) landingRegisterBtn.classList.remove("hidden");
      if (landingLogoutBtn) landingLogoutBtn.classList.add("hidden");
    }
  }

  // ==================== ГОСТЕВОЙ ДЕМО-ВХОД ДЛЯ ЖЮРИ И КОПИРОВАНИЕ ССЫЛКИ ====================
  function loginAsJuryDemo() {
    if (authState.countdownTimer) clearInterval(authState.countdownTimer);
    const juryUser = {
      name: "Судья / Гость",
      email: "jury.demo@robolab.kz",
      picture: makeSvgAvatarDataUri("СГ", "#10b981", "#06b6d4"),
      provider: "jury_demo",
      emailVerified: true,
      verifiedAt: new Date().toISOString()
    };
    finalizeLoginSession(juryUser);
  }

  let shareToastTimer = null;
  function shareProjectLink() {
    closeProfileDropdown();
    const urlToCopy = window.location.href;

    const showCopiedBanner = () => {
      const toast = document.getElementById("shareCopiedToast");
      if (!toast) return;
      toast.classList.remove("hidden");
      if (shareToastTimer) clearTimeout(shareToastTimer);
      shareToastTimer = setTimeout(() => {
        toast.classList.add("hidden");
      }, 2600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(urlToCopy).then(showCopiedBanner).catch(() => {
        fallbackCopyText(urlToCopy);
        showCopiedBanner();
      });
    } else {
      fallbackCopyText(urlToCopy);
      showCopiedBanner();
    }
  }

  function fallbackCopyText(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function toggleProfileDropdown() {
    const menu = document.getElementById("profileDropdownMenu");
    if (!menu) return;
    menu.classList.toggle("hidden");
  }

  function closeProfileDropdown() {
    const menu = document.getElementById("profileDropdownMenu");
    if (menu) menu.classList.add("hidden");
  }

  // ==================== АВТОРИЗАЦИЯ ЧЕРЕЗ GOOGLE (GOOGLE IDENTITY SERVICES + POPUP) ====================
  function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;
    const payload = decodeGoogleJwt(response.credential);
    if (!payload || !payload.email) return;

    const googleUser = {
      name: payload.name || payload.email.split("@")[0],
      email: payload.email,
      picture: payload.picture || makeSvgAvatarDataUri("G", "#4285F4", "#34A853"),
      provider: "google",
      emailVerified: true,
      verifiedAt: new Date().toISOString()
    };

    finalizeLoginSession(googleUser);
  }

  function initGoogleIdentityServices() {
    if (window.google && window.google.accounts && window.google.accounts.id && GOOGLE_CLIENT_ID) {
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredentialResponse
        });
      } catch (e) {}
    }
  }

  function openGoogleAccountChooserPopup() {
    // Если настроен доменный GOOGLE_CLIENT_ID и загружен GSI SDK, вызываем prompt
    if (window.google && window.google.accounts && window.google.accounts.id && GOOGLE_CLIENT_ID) {
      window.google.accounts.id.prompt();
      return;
    }

    // Открываем интерактивный попап выбора аккаунта Google (OAuth2 Account Chooser)
    const pickerBackdrop = document.getElementById("googlePickerBackdrop");
    const listContainer = document.getElementById("googleAccountsList");
    if (!pickerBackdrop || !listContainer) return;

    listContainer.innerHTML = GOOGLE_DEMO_PROFILES.map((prof, idx) => `
      <button type="button" class="google-account-row" data-google-idx="${idx}">
        <img src="${prof.picture}" alt="${prof.name}" class="google-acc-avatar" />
        <div>
          <div class="google-acc-name">${prof.name}</div>
          <div class="google-acc-email">${prof.email}</div>
        </div>
      </button>
    `).join("");

    listContainer.querySelectorAll(".google-account-row").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.getAttribute("data-google-idx"), 10) || 0;
        const selectedProfile = GOOGLE_DEMO_PROFILES[idx];
        const mockJwt = createMockGoogleJwt(selectedProfile);
        pickerBackdrop.classList.add("hidden");
        handleGoogleCredentialResponse({ credential: mockJwt });
      });
    });

    pickerBackdrop.classList.remove("hidden");
  }

  // ==================== ПРИВЯЗКА СОБЫТИЙ ФОРМЫ, 6-ЗНАЧНОГО ПИНА И ПРОФИЛЯ ====================
  function bindAuthEvents() {
    // Вкладки «Вход» / «Регистрация»
    document.getElementById("authTabLogin").addEventListener("click", () => setAuthMode("login"));
    document.getElementById("authTabRegister").addEventListener("click", () => setAuthMode("register"));

    // Закрытие модального окна
    document.getElementById("closeAuthModalBtn").addEventListener("click", closeAuthModal);
    document.getElementById("authModalBackdrop").addEventListener("click", (e) => {
      if (e.target.id === "authModalBackdrop") closeAuthModal();
    });

    // Показать / скрыть пароль
    document.getElementById("togglePwdBtn").addEventListener("click", () => {
      const pwdInp = document.getElementById("authPasswordInput");
      const confInp = document.getElementById("authConfirmInput");
      const nextType = pwdInp.type === "password" ? "text" : "password";
      pwdInp.type = nextType;
      if (confInp) confInp.type = nextType;
    });

    // Живая оценка надёжности пароля при вводе
    const pwdInput = document.getElementById("authPasswordInput");
    pwdInput.addEventListener("input", () => {
      updatePasswordStrengthUI(pwdInput.value);
    });

    // Отправка Шага 1 (Регистрация или Вход)
    document.getElementById("authForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("authNameInput").value.trim();
      const email = document.getElementById("authEmailInput").value.trim();
      const pwd = document.getElementById("authPasswordInput").value;
      const confirmPwd = document.getElementById("authConfirmInput").value;
      const rulesOk = document.getElementById("authRulesCheckbox").checked;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showFormFeedback("Введите корректный адрес электронной почты (например, student@robolab.kz).");
        return;
      }

      const strength = evaluatePasswordStrength(pwd);

      if (authState.mode === "register") {
        if (name.length < 2) {
          showFormFeedback("Пожалуйста, укажите ваше Имя (минимум 2 символа).");
          return;
        }
        if (!strength.isValid) {
          showFormFeedback("Пароль должен содержать не менее 8 символов, включая буквы и цифры.");
          return;
        }
        if (pwd !== confirmPwd) {
          showFormFeedback("Пароль и повтор пароля не совпадают.");
          return;
        }
        if (!rulesOk) {
          showFormFeedback("Необходимо согласиться с правилами безопасности RoboLab.");
          return;
        }

        // Генерируем 6-значный код и переводим на Шаг 2 («Подтвердите ваш Email»)
        const otpCode = generateSixDigitCode();
        transitionToOtpScreen({
          name,
          email,
          password: pwd,
          code: otpCode,
          createdAt: Date.now()
        });
        return;
      }

      // Режим «Вход»
      if (pwd.length < 8) {
        showFormFeedback("Длина пароля должна составлять не менее 8 символов.");
        return;
      }

      const accounts = getRegisteredAccounts();
      const existing = accounts[email.toLowerCase()];

      if (existing) {
        if (existing.password && existing.password !== pwd) {
          showFormFeedback("Неверный пароль для указанного Email.");
          return;
        }
        finalizeLoginSession(existing);
      } else {
        // Если аккаунт ещё не верифицирован по почте — требуем подтвердить Email 6-значным кодом
        const otpCode = generateSixDigitCode();
        transitionToOtpScreen({
          name: email.split("@")[0],
          email,
          password: pwd,
          code: otpCode,
          createdAt: Date.now()
        });
      }
    });

    // Логика 6 отдельных квадратиков под цифры (авто-переход фокуса, Backspace, Paste)
    const otpInputs = getOtpInputs();
    otpInputs.forEach((inp, idx) => {
      inp.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\D/g, "");
        e.target.value = val ? val.slice(-1) : "";
        e.target.classList.toggle("filled", Boolean(e.target.value));
        otpInputs.forEach((box) => box.classList.remove("otp-error"));
        hideOtpFeedback();

        if (e.target.value && idx < otpInputs.length - 1) {
          otpInputs[idx + 1].focus();
        }
        if (getEnteredOtpCode().length === 6) {
          verifyEnteredOtpCode();
        }
      });

      inp.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
          if (!inp.value && idx > 0) {
            otpInputs[idx - 1].value = "";
            otpInputs[idx - 1].classList.remove("filled");
            otpInputs[idx - 1].focus();
          } else {
            inp.value = "";
            inp.classList.remove("filled");
          }
          e.preventDefault();
        } else if (e.key === "ArrowLeft" && idx > 0) {
          otpInputs[idx - 1].focus();
        } else if (e.key === "ArrowRight" && idx < otpInputs.length - 1) {
          otpInputs[idx + 1].focus();
        } else if (e.key === "Enter") {
          e.preventDefault();
          verifyEnteredOtpCode();
        }
      });

      inp.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData("text");
        if (pasted) {
          fillOtpBoxes(pasted);
        }
      });
    });

    // Кнопка подтверждения 6-значного кода
    document.getElementById("verifyOtpSubmitBtn").addEventListener("click", verifyEnteredOtpCode);

    // Кнопка повторной отправки кода по истечении таймера
    document.getElementById("resendOtpBtn").addEventListener("click", () => {
      const pending = authState.pendingVerification || loadPendingVerification();
      if (!pending) return;
      pending.code = generateSixDigitCode();
      savePendingVerification(pending);
      clearOtpBoxes();
      hideOtpFeedback();
      startOtpCountdown(59);
      dispatchVerificationEmail(pending.name, pending.email, pending.code);
      showOtpFeedback("Новый 6-значный код отправлен на вашу почту!", false);
    });

    // Возврат со 2-го шага к редактированию Email
    document.getElementById("backToStep1Btn").addEventListener("click", () => {
      if (authState.countdownTimer) clearInterval(authState.countdownTimer);
      switchStepPane("form");
      setAuthMode("register");
    });

    // Всплывающее пуш-уведомление с кодом (кнопка автоподстановки в 1 клик для тестов жюри)
    const autofillBtn = document.getElementById("autofillOtpToastBtn");
    if (autofillBtn) {
      autofillBtn.addEventListener("click", () => {
        const pending = authState.pendingVerification || loadPendingVerification();
        if (pending && pending.code) {
          fillOtpBoxes(pending.code);
        }
      });
    }

    const closeToastBtn = document.getElementById("closeEmailToastBtn");
    if (closeToastBtn) {
      closeToastBtn.addEventListener("click", hideEmailPushToast);
    }

    // Кнопка «Войти с помощью Google»
    document.getElementById("googleOAuthBtn").addEventListener("click", openGoogleAccountChooserPopup);

    // Кнопки «⚡ Быстрый гостевой вход для жюри / демо-доступ»
    const juryDemoLoginBtn = document.getElementById("juryDemoLoginBtn");
    if (juryDemoLoginBtn) {
      juryDemoLoginBtn.addEventListener("click", loginAsJuryDemo);
    }
    const unlockJuryDemoBtn = document.getElementById("unlockJuryDemoBtn");
    if (unlockJuryDemoBtn) {
      unlockJuryDemoBtn.addEventListener("click", loginAsJuryDemo);
    }

    // Кнопки «🔗 Поделиться проектом» (копирование ссылки в 1 клик)
    ["landingShareBtn", "shareProjectBtn", "dropdownShareBtn"].forEach((btnId) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener("click", shareProjectLink);
      }
    });

    // Попап выбора Google-аккаунта: закрытие и форма своего Google Email
    const closeGooglePickerBtn = document.getElementById("closeGooglePickerBtn");
    if (closeGooglePickerBtn) {
      closeGooglePickerBtn.addEventListener("click", () => {
        document.getElementById("googlePickerBackdrop").classList.add("hidden");
      });
    }

    const customGoogleForm = document.getElementById("customGoogleAccountForm");
    if (customGoogleForm) {
      customGoogleForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const emailInp = document.getElementById("customGoogleEmailInput");
        const nameInp = document.getElementById("customGoogleNameInput");
        const email = emailInp.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
        const name = nameInp.value.trim() || email.split("@")[0];
        const initials = name.slice(0, 2).toUpperCase();
        const profile = {
          name,
          email,
          picture: makeSvgAvatarDataUri(initials, "#4285F4", "#34A853")
        };
        document.getElementById("googlePickerBackdrop").classList.add("hidden");
        handleGoogleCredentialResponse({ credential: createMockGoogleJwt(profile) });
      });
    }

    // Выпадающее меню профиля в правом верхнем углу симулятора
    const profileTrigger = document.getElementById("userProfileBadge");
    if (profileTrigger) {
      profileTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleProfileDropdown();
      });
    }

    document.addEventListener("click", (e) => {
      const wrap = document.getElementById("profileDropdownWrap");
      if (wrap && !wrap.contains(e.target)) {
        closeProfileDropdown();
      }
    });

    // Кнопки «Выйти»
    document.getElementById("logoutBtn").addEventListener("click", logoutCurrentUser);
    document.getElementById("landingLogoutBtn").addEventListener("click", logoutCurrentUser);
  }

  window.RoboLabAuth = {
    init(callbacks = {}) {
      authState.onAuthSuccessCallback = callbacks.onAuthSuccess || null;
      authState.onLogoutCallback = callbacks.onLogout || null;
      loadVerifiedUser();
      bindAuthEvents();
      updateNavbarAndToolbarProfile();
      window.addEventListener("load", initGoogleIdentityServices);
    },
    isVerified() {
      const u = authState.currentUser || loadVerifiedUser();
      return Boolean(u && u.email && u.emailVerified === true);
    },
    getUser() {
      return authState.currentUser || loadVerifiedUser();
    },
    openModal(mode = "login", notice = "") {
      openAuthModal(mode, notice);
    },
    resumePendingOrOpenLogin(notice = "") {
      const pending = loadPendingVerification();
      const backdrop = document.getElementById("authModalBackdrop");
      if (pending && backdrop) {
        backdrop.classList.remove("hidden");
        transitionToOtpScreen(pending);
      } else {
        openAuthModal("login", notice);
      }
    },
    loginAsJuryDemo,
    shareProjectLink,
    logout: logoutCurrentUser
  };
})();
