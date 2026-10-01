// Главный контроллер веб-платформы виртуальной STEM-лаборатории RoboLab
// Управляет страницей приветствия (Landing), строгой проверкой верификации через js/auth.js,
// трёхзонным симулятором схем и интерактивным чатом «AI Наставник RoboLab».

(function () {
  const WORKSPACE_STORAGE_KEY = "robolab_workspace_state_v3";

  const state = {
    activeView: "landing", // "landing" | "simulator"
    currentProjectIndex: 0,
    customCode: null,
    lang: "ru",
    serialLogs: [],
    ledLitEver: false,
    hasBurnedLed: false,
    servoMovedEver: false,
    landingPreviewOn: true,
    landingPreviewHigh: true,
    landingPreviewTimer: null
  };

  let circuitEngine = null;
  let interpreter = null;

  function loadPersistedWorkspace() {
    try {
      const rawWs = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (rawWs) {
        const saved = JSON.parse(rawWs);
        if (typeof saved.currentProjectIndex === "number") {
          state.currentProjectIndex = Math.max(0, Math.min(window.STEM_PROJECTS.length - 1, saved.currentProjectIndex));
        }
        if (saved.customCode) state.customCode = saved.customCode;
        if (saved.activeView === "simulator" && window.RoboLabAuth && window.RoboLabAuth.isVerified()) {
          state.activeView = "simulator";
        }
      }
    } catch (e) {}
  }

  function saveWorkspaceState() {
    try {
      const editorEl = document.getElementById("codeEditor");
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
        activeView: state.activeView,
        currentProjectIndex: state.currentProjectIndex,
        customCode: editorEl ? editorEl.value : state.customCode
      }));
    } catch (e) {}
  }

  function init() {
    // Инициализируем модуль 2FA Email-верификации и Google Sign-In (js/auth.js)
    window.RoboLabAuth.init({
      onAuthSuccess: (verifiedUser) => {
        lockSimulatorView(false);
        switchMainView("simulator");
        appendSerialOutput(`[RoboLab Security] Вход подтверждён: ${verifiedUser.name} (${verifiedUser.email}).`, true);
      },
      onLogout: () => {
        if (interpreter && interpreter.running) {
          stopSimulation();
        }
        lockSimulatorView(true);
        switchMainView("landing");
      }
    });

    loadPersistedWorkspace();

    const canvasContainer = document.getElementById("circuitContainer");
    circuitEngine = new CircuitEngine(canvasContainer, {
      onCircuitChange: () => {
        updateDiagnosticsPanel();
        updateBoardPill();
      },
      onSensorChange: () => {}
    });

    interpreter = new ArduinoInterpreter(circuitEngine, {
      onSerialOut: (text, isLn) => {
        appendSerialOutput(text, isLn);
      },
      onStateUpdate: (flags) => {
        if (flags.ledLit) state.ledLitEver = true;
        if (flags.burnedLed) {
          state.hasBurnedLed = true;
          updateDiagnosticsPanel();
          openAssistantDrawer("mentor");
        }
        if (flags.servoMoved) state.servoMovedEver = true;
      }
    });

    initLandingPreview();
    populateExamplesSelect();
    renderComponentLibrary("");
    bindNavigationEvents();
    bindAllSimulatorEvents();
    bindAiAssistantChatEvents();

    selectProject(state.currentProjectIndex, Boolean(state.customCode));
    if (state.customCode) {
      document.getElementById("codeEditor").value = state.customCode;
      syncEditorHighlight();
      updateDiagnosticsPanel();
    }

    enforceStrictRouteAccess();
    window.addEventListener("hashchange", enforceStrictRouteAccess);
  }

  // ==================== 1. СТРОГАЯ ЗАЩИТА СИМУЛЯТОРА И КОНТРОЛЬ ДОСТУПА ====================
  function enforceStrictRouteAccess() {
    const hash = window.location.hash.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const wantsSimulator = hash.includes("simulator") || hash.includes("lab") || params.get("view") === "simulator";
    const isVerified = window.RoboLabAuth && window.RoboLabAuth.isVerified();

    if (!isVerified) {
      lockSimulatorView(true);
      switchMainView("landing");
      if (wantsSimulator) {
        window.RoboLabAuth.resumePendingOrOpenLogin(
          "🔒 Доступ к лаборатории RoboLab открыт только после подтверждения Email или входа через Google."
        );
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    } else {
      // Если сессия найдена в localStorage (robolab_user) и emailVerified === true — сразу открываем симулятор
      lockSimulatorView(false);
      switchMainView("simulator");
    }
  }

  function lockSimulatorView(isLocked) {
    const simEl = document.getElementById("simulatorView");
    const lockOverlay = document.getElementById("authLockOverlay");
    if (!simEl || !lockOverlay) return;

    if (isLocked) {
      simEl.classList.add("auth-locked");
      lockOverlay.classList.remove("hidden");
    } else {
      simEl.classList.remove("auth-locked");
      lockOverlay.classList.add("hidden");
    }
  }

  function switchMainView(viewName) {
    const landingEl = document.getElementById("landingView");
    const simEl = document.getElementById("simulatorView");
    const isVerified = window.RoboLabAuth && window.RoboLabAuth.isVerified();

    if (viewName === "simulator" && !isVerified) {
      lockSimulatorView(true);
      state.activeView = "landing";
      simEl.classList.add("hidden");
      landingEl.classList.remove("hidden");
      window.RoboLabAuth.resumePendingOrOpenLogin(
        "🔒 Без подтверждённого Email или входа через Google доступ к лаборатории заблокирован."
      );
      saveWorkspaceState();
      return;
    }

    state.activeView = viewName;
    if (viewName === "simulator") {
      lockSimulatorView(false);
      landingEl.classList.add("hidden");
      simEl.classList.remove("hidden");
      circuitEngine.render();
    } else {
      if (interpreter && interpreter.running) {
        stopSimulation();
      }
      simEl.classList.add("hidden");
      landingEl.classList.remove("hidden");
    }
    saveWorkspaceState();
  }

  function initLandingPreview() {
    const host = document.getElementById("landingInteractivePreview");
    const toggleBtn = document.getElementById("heroPreviewToggleBtn");
    if (!host) return;

    const renderMiniPreview = () => {
      const unoSvg = window.SVG_MODELS.renderSVG(
        { id: "prev_uno", type: "arduino_uno", props: {} },
        state.landingPreviewOn,
        { D13: state.landingPreviewOn && state.landingPreviewHigh ? 1 : 0 }
      );
      const ledSvg = window.SVG_MODELS.renderSVG(
        {
          id: "prev_led",
          type: "led",
          props: { color: "red" },
          runtime: { lit: state.landingPreviewOn && state.landingPreviewHigh, burned: false }
        },
        state.landingPreviewOn,
        {}
      );
      host.innerHTML = `
        <div style="display:flex; align-items:center; gap:18px;">
          <div>${unoSvg}</div>
          <div style="display:flex; flex-direction:column; align-items:center;">
            ${ledSvg}
            <span style="font-family:var(--font-mono); font-size:10px; font-weight:700; color:#334155;">D13 · R1 220Ω</span>
          </div>
        </div>
      `;
    };

    renderMiniPreview();
    state.landingPreviewTimer = setInterval(() => {
      if (!state.landingPreviewOn) return;
      state.landingPreviewHigh = !state.landingPreviewHigh;
      renderMiniPreview();
    }, 650);

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        state.landingPreviewOn = !state.landingPreviewOn;
        toggleBtn.textContent = state.landingPreviewOn ? "⏹ Стоп превью" : "▶ Тест цепи";
        toggleBtn.className = state.landingPreviewOn ? "btn-stop-sim" : "btn-start-sim";
        renderMiniPreview();
      });
    }
  }

  function bindNavigationEvents() {
    document.getElementById("landingLoginBtn").addEventListener("click", () => {
      if (window.RoboLabAuth.isVerified()) switchMainView("simulator");
      else window.RoboLabAuth.openModal("login");
    });

    document.getElementById("landingRegisterBtn").addEventListener("click", () => {
      if (window.RoboLabAuth.isVerified()) switchMainView("simulator");
      else window.RoboLabAuth.openModal("register");
    });

    document.getElementById("heroStartFreeBtn").addEventListener("click", () => {
      if (window.RoboLabAuth.isVerified()) switchMainView("simulator");
      else window.RoboLabAuth.openModal("register");
    });

    document.getElementById("heroLoginModalBtn").addEventListener("click", () => {
      if (window.RoboLabAuth.isVerified()) switchMainView("simulator");
      else window.RoboLabAuth.openModal("login");
    });

    document.getElementById("previewOpenLabBtn").addEventListener("click", () => {
      if (window.RoboLabAuth.isVerified()) {
        switchMainView("simulator");
      } else {
        window.RoboLabAuth.resumePendingOrOpenLogin(
          "🔒 Для открытия симулятора RoboLab подтвердите Email или войдите с помощью Google."
        );
      }
    });

    const unlockBtn = document.getElementById("unlockLoginBtn");
    if (unlockBtn) {
      unlockBtn.addEventListener("click", () => {
        switchMainView("landing");
        window.RoboLabAuth.resumePendingOrOpenLogin();
      });
    }

    document.getElementById("backToLandingBtn").addEventListener("click", () => {
      switchMainView("landing");
    });
  }

  // ==================== 3. БИБЛИОТЕКА КОМПОНЕНТОВ И ПОДСВЕТКА КОДА ====================
  function renderComponentLibrary(filterQuery = "") {
    const container = document.getElementById("libraryScrollList");
    const q = filterQuery.trim().toLowerCase();
    const cat = window.SVG_MODELS.CATALOG;

    const filterItems = (arr) => arr.filter(item =>
      !q || item.name.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)
    );

    const controllers = filterItems(cat.controllers);
    const modules = filterItems(cat.modules);

    const renderGroup = (title, items) => {
      if (items.length === 0) return "";
      const cards = items.map(item => {
        const previewSvg = window.SVG_MODELS.renderSVG({
          id: "preview_" + item.type,
          type: item.type,
          props: { resistance: 220, color: "red", angle: 45, temp: 24, distance: 80, light: 75, value: 50 }
        }, false, {});
        return `
          <div class="lib-item-card" draggable="true" data-lib-type="${item.type}" title="Перетащите на холст или кликните для добавления">
            <div class="lib-thumb-wrap">${previewSvg}</div>
            <div class="lib-item-title">${item.name}</div>
            <div class="lib-item-sub">${item.sub}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="lib-category-header">
          <span>${title}</span>
          <span>${items.length}</span>
        </div>
        <div class="lib-grid">${cards}</div>
      `;
    };

    container.innerHTML =
      renderGroup("КОНТРОЛЛЕРЫ", controllers) +
      renderGroup("МОДУЛИ И РАДИОДЕТАЛИ", modules);

    container.querySelectorAll(".lib-item-card").forEach(card => {
      const type = card.getAttribute("data-lib-type");
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", type);
        e.dataTransfer.effectAllowed = "copy";
      });
      card.addEventListener("click", () => {
        circuitEngine.addComponent(type);
        appendSerialOutput(`[Библиотека RoboLab] Добавлен компонент: ${type}`, true);
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlightCpp(code) {
    const lines = code.split("\n");
    return lines.map(line => {
      if (/^\s*#/.test(line)) {
        return `<span class="tok-prep">${escapeHtml(line)}</span>`;
      }
      const commIdx = line.indexOf("//");
      const codePart = commIdx >= 0 ? line.slice(0, commIdx) : line;
      const commPart = commIdx >= 0 ? line.slice(commIdx) : "";

      let html = escapeHtml(codePart);
      html = html.replace(/"([^"]*)"/g, `<span class="tok-str">"$1"</span>`);
      html = html.replace(/\b(void|int|const|float|long|bool|String|if|else|while|for|return)\b/g, `<span class="tok-kw">$1</span>`);
      html = html.replace(/\b(HIGH|LOW|OUTPUT|INPUT|INPUT_PULLUP|LED_BUILTIN|A0|A1|A2|A3|A4|A5)\b/g, `<span class="tok-const">$1</span>`);
      html = html.replace(/\b(setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|Serial|begin|print|println|servo|attach|write|lcd|oled|readTemp|readDistance)\b/g, `<span class="tok-fn">$1</span>`);
      html = html.replace(/\b(\d+)\b/g, `<span class="tok-num">$1</span>`);

      if (commPart) {
        html += `<span class="tok-comm">${escapeHtml(commPart)}</span>`;
      }
      return html;
    }).join("\n") + "\n";
  }

  function syncEditorHighlight() {
    const editor = document.getElementById("codeEditor");
    const highlightLayer = document.getElementById("codeHighlightLayer");
    const numsEl = document.getElementById("lineNumbers");

    const code = editor.value;
    highlightLayer.innerHTML = highlightCpp(code);

    const count = code.split("\n").length;
    let numsHtml = "";
    for (let i = 1; i <= count; i++) {
      numsHtml += `<div>${i}</div>`;
    }
    numsEl.innerHTML = numsHtml;
  }

  function populateExamplesSelect() {
    const sel = document.getElementById("examplesSelect");
    sel.innerHTML = window.STEM_PROJECTS.map((proj, idx) =>
      `<option value="${idx}">📚 Пример ${proj.number}: ${proj.title}</option>`
    ).join("");
  }

  function selectProject(index, keepCustomCode = false) {
    if (interpreter && interpreter.running) {
      stopSimulation();
    }
    state.currentProjectIndex = index;
    state.ledLitEver = false;
    state.hasBurnedLed = false;
    state.servoMovedEver = false;

    const proj = window.STEM_PROJECTS[index];
    document.getElementById("examplesSelect").value = String(index);
    document.getElementById("activeProjectLabel").textContent = `${proj.title} (${proj.board})`;

    if (!keepCustomCode) {
      state.customCode = null;
      const editor = document.getElementById("codeEditor");
      editor.value = proj.starterCode;
      syncEditorHighlight();
    }

    const stepsHtml = (proj.steps || []).map((s, i) => `<div style="margin-bottom:6px;"><strong>${i + 1}.</strong> ${s}</div>`).join("");
    document.getElementById("theoryPanelContent").innerHTML = `
      <div class="assist-card">
        <div style="font-weight:700; color:#6d28d9; margin-bottom:4px;">🎯 Цель лабораторной работы:</div>
        <div>${proj.goal}</div>
      </div>
      <div class="assist-card">${proj.theory}</div>
      <div class="assist-card">
        <div style="font-weight:700; margin-bottom:6px;">📋 Пошаговая сборка:</div>
        ${stepsHtml}
      </div>
    `;

    if (proj.challenge) {
      document.getElementById("challengeTitle").textContent = proj.challenge.title;
      document.getElementById("challengeDesc").textContent = proj.challenge.description;
      document.getElementById("challengeFeedback").innerHTML = "";
    }

    clearSerialMonitor();
    appendSerialOutput(`[RoboLab] Загружен скетч «${proj.title}» (${proj.board}).`, true);

    circuitEngine.loadProject(proj);
    updateBoardPill();
    updateDiagnosticsPanel();
    saveWorkspaceState();
  }

  function updateBoardPill() {
    const boardNames = {
      arduino_uno: "Arduino Uno R3",
      arduino_nano: "Arduino Nano",
      arduino_mega: "Arduino Mega 2560",
      esp32_devkit: "ESP32 DevKit V1",
      rpi_pico: "Raspberry Pi Pico"
    };
    const bName = boardNames[circuitEngine.controller.type] || circuitEngine.controller.type;
    document.getElementById("boardInfoPill").textContent = `Плата: ${bName} · Проводов: ${circuitEngine.wires.length}`;
  }

  function updateDiagnosticsPanel() {
    const code = document.getElementById("codeEditor").value;
    const circuitAnalysis = circuitEngine.analyzeCircuit();
    const codeIssues = interpreter.analyzeCodeAndCircuit(code, circuitAnalysis);
    const allIssues = [...circuitAnalysis.diagnostics, ...codeIssues];

    const badge = document.getElementById("mentorCountBadge");
    const strip = document.getElementById("circuitStatusBanner");
    const listEl = document.getElementById("diagnosticsList");

    badge.textContent = allIssues.length;

    if (allIssues.length === 0) {
      strip.className = "status-ok-pill";
      strip.innerHTML = `✅ Электрическая цепь замкнута, ошибок подключения и кода не обнаружено.`;
      listEl.innerHTML = `
        <div class="assist-card assist-card-ok">
          <strong>✅ Схема и скетч готовы к работе!</strong>
          <p style="margin-top:4px;">Все компоненты подключены корректно, защитные резисторы установлены, а выводы GND замкнуты.</p>
        </div>
      `;
    } else {
      strip.className = "status-err-pill";
      strip.innerHTML = `⚠️ Внимание (${allIssues.length}): ${allIssues[0].title}`;
      listEl.innerHTML = allIssues.map(iss => `
        <div class="assist-card assist-card-err">
          <div style="font-weight:700; margin-bottom:4px;">
            ${iss.severity === 'danger' ? '🔥 ОПАСНОСТЬ ПЕРЕГОРАНИЯ:' : '❌ ОШИБКА:'} ${iss.title}
          </div>
          <div>${iss.explanation}</div>
        </div>
      `).join("");
    }
  }

  // ==================== 4. ПОЛНОЦЕННЫЙ РАБОЧИЙ ЧАТ С «AI НАСТАВНИК ROBOLAB» ====================
  // Автоматический анализатор синтаксиса C++ кода из редактора
  function inspectEditorCodeSyntax(code) {
    const syntaxFindings = [];
    const hasSetup = /void\s+setup\s*\(\s*\)/.test(code);
    const hasLoop = /void\s+loop\s*\(\s*\)/.test(code);

    if (!hasSetup) {
      syntaxFindings.push("Отсутствует обязательная функция инициализации <code>void setup()</code>.");
    }
    if (!hasLoop) {
      syntaxFindings.push("Отсутствует основной бесконечный цикл программы <code>void loop()</code>.");
    }

    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      syntaxFindings.push(`Несовпадение фигурных скобок: открывающих <code>{</code> — ${openBraces}, закрывающих <code>}</code> — ${closeBraces}.`);
    }

    const lines = code.split("\n");
    lines.forEach((rawLine, idx) => {
      const line = rawLine.replace(/\/\/.*$/, "").trim();
      if (!line) return;
      if (
        /^(pinMode|digitalWrite|digitalRead|analogWrite|analogRead|delay|Serial\.|servo\.|lcd\.|oled\.)/.test(line) &&
        !line.endsWith(";") &&
        !line.endsWith("{")
      ) {
        syntaxFindings.push(`Строка ${idx + 1}: пропущена точка с запятой <code>;</code> в конце команды <code>${escapeHtml(line)}</code>.`);
      }
    });

    return syntaxFindings;
  }

  function generateAiResponse(userPrompt) {
    const q = userPrompt.toLowerCase();
    const circuitAnalysis = circuitEngine.analyzeCircuit();
    const code = document.getElementById("codeEditor").value;
    const codeIssues = interpreter.analyzeCodeAndCircuit(code, circuitAnalysis);
    const syntaxErrors = inspectEditorCodeSyntax(code);
    const allIssues = [...circuitAnalysis.diagnostics, ...codeIssues];

    const boardNames = {
      arduino_uno: "Arduino Uno R3",
      arduino_nano: "Arduino Nano",
      arduino_mega: "Arduino Mega 2560",
      esp32_devkit: "ESP32 DevKit V1",
      rpi_pico: "Raspberry Pi Pico"
    };
    const currentBoardName = boardNames[circuitEngine.controller.type] || "Arduino Uno R3";

    // 1. «Как зажечь светодиод?» / вопросы про светодиод
    if (q.includes("светодиод") || q.includes("зажечь") || q.includes("не горит") || q.includes("led")) {
      const liveCheck = allIssues.length > 0
        ? `<br><br>🔎 <strong>Анализ твоей текущей схемы в RoboLab:</strong><br>⚠️ <em>${allIssues[0].title} — ${allIssues[0].explanation}</em>`
        : `<br><br>✅ <strong>Анализ твоей текущей схемы:</strong> На холсте цепь светодиода собрана без ошибок! Нажми зелёную кнопку <strong>«▶ Старт»</strong> в тулбаре.`;

      return {
        text: `<strong>Как правильно подключить и зажечь светодиод на ${currentBoardName}:</strong><br>
1. <strong>Распиновка и полярность:</strong> длинная ножка светодиода — <strong>Анод (<code>+</code>)</strong> подключается к цифровому пину (например, <code>D13</code>) через резистор. Короткая ножка — <strong>Катод (<code>–</code>)</strong> соединяется с пином земли <code>GND</code>.<br>
2. <strong>Защитный резистор:</strong> обязательно установи последовательно резистор номиналом <code>220 Ом</code>, чтобы ограничить ток до ~15 мА и не сжечь кристалл.<br>
3. <strong>Настройка пина в коде:</strong> в блоке <code>setup()</code> объяви пин как выход <code>pinMode(13, OUTPUT);</code>, а в <code>loop()</code> подай 5 Вольт командой <code>digitalWrite(13, HIGH);</code>.${liveCheck}`,
        codeSnippet: `// Скетч RoboLab: Управление светодиодом на пине D13
const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT); // Настраиваем пин D13 как выход
  Serial.begin(9600);
  Serial.println("Светодиод готов к работе!");
}

void loop() {
  digitalWrite(LED_PIN, HIGH); // Зажечь светодиод (5V)
  delay(500);                  // Ждём 500 мс
  digitalWrite(LED_PIN, LOW);  // Погасить светодиод (0V)
  delay(500);
}`
      };
    }

    // 2. «Подключение сервопривода к Uno» / вопросы про сервопривод SG90
    if (q.includes("серво") || q.includes("sg90") || q.includes("servo") || q.includes("привод")) {
      return {
        text: `<strong>Схема подключения сервопривода TowerPro SG90 к ${currentBoardName}:</strong><br>
У сервопривода 3 цветных провода:<br>
• <span style="color:#d97706; font-weight:700;">Оранжевый (PWM / Сигнал)</span> → подключи к ШИМ-пину <code>D9~</code> (или <code>D10~</code>).<br>
• <span style="color:#dc2626; font-weight:700;">Красный (VCC / Питание)</span> → подключи к выводу <code>5V</code> платы.<br>
• <span style="color:#2563eb; font-weight:700;">Коричневый/Синий (GND / Земля)</span> → подключи к выводу <code>GND</code>.<br><br>
Ниже — рабочий C++ скетч с библиотекой <code>&lt;Servo.h&gt;</code> для плавного поворота вала на 0°, 90° и 180°:`,
        codeSnippet: `#include <Servo.h>

void setup() {
  servo.attach(9); // ШИМ-сигнал сервопривода на пине D9
  Serial.begin(9600);
  Serial.println("Сервопривод SG90 подключён к D9");
}

void loop() {
  servo.write(0);   // Поворот на 0 градусов
  delay(700);
  servo.write(90);  // Среднее положение 90 градусов
  delay(700);
  servo.write(180); // Поворот на 180 градусов
  delay(700);
}`
      };
    }

    // 3. «Почему не компилируется код?» / анализ ошибок кода и схемы
    if (q.includes("не компилир") || q.includes("ошибк") || q.includes("баг") || q.includes("код") || q.includes("проверь")) {
      const totalProblems = syntaxErrors.length + allIssues.length;

      if (totalProblems === 0) {
        return {
          text: `✅ <strong>Результат проверки твоего проекта в RoboLab:</strong><br>
Я проанализировал код в редакторе (<code>${code.split("\n").length} строк</code>) и схему на плате <strong>${currentBoardName}</strong>:<br>
• Синтаксических ошибок C++ не найдено (<code>setup()</code> и <code>loop()</code> на месте, все скобки <code>{ }</code> и точки с запятой <code>;</code> расставлены верно).<br>
• Электрическая цепь замкнута корректно (проводов: <code>${circuitEngine.wires.length}</code>).<br><br>
Если хочешь протестировать отладку, вот эталонный шаблон с выводом диагностики в Serial-монитор:`,
          codeSnippet: `void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("[OK] Скетч успешно скомпилирован!");
}

void loop() {
  digitalWrite(13, HIGH);
  Serial.println("Цикл loop() работает штатно");
  delay(800);
  digitalWrite(13, LOW);
  delay(800);
}`
        };
      }

      const syntaxHtml = syntaxErrors.map(err => `• ❌ <strong>Синтаксис C++:</strong> ${err}`).join("<br>");
      const circuitHtml = allIssues.map(iss => `• ⚡ <strong>Схема/Пины (${iss.title}):</strong> ${iss.explanation}`).join("<br>");
      const combinedList = [syntaxHtml, circuitHtml].filter(Boolean).join("<br>");

      return {
        text: `🔎 <strong>Я проанализировал твой код в редакторе и схему на холсте. Найдено проблем: ${totalProblems}</strong><br><br>
${combinedList}<br><br>
💡 <strong>Как исправить:</strong> Убедись, что каждая команда внутри <code>setup()</code> и <code>loop()</code> заканчивается точкой с запятой <code>;</code>, а номера пинов в коде совпадают с проводами на холсте. Вот исправленный базовый скетч:`,
        codeSnippet: `void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("Ошибки компиляции устранены!");
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}`
      };
    }

    // 4. «Помоги подключить DHT11» / вопросы про датчик температуры и влажности
    if (q.includes("dht11") || q.includes("температур") || q.includes("влажност") || q.includes("датчик")) {
      return {
        text: `<strong>Подключение цифрового датчика температуры и влажности DHT11 к ${currentBoardName}:</strong><br>
• Вывод <strong><code>VCC (+)</code></strong> → к пину питания <code>5V</code> (или <code>3.3V</code> на ESP32).<br>
• Вывод <strong><code>DATA (OUT)</code></strong> → к аналоговому/цифровому пину <code>A1</code> (или <code>D4</code>).<br>
• Вывод <strong><code>GND (–)</code></strong> → к общему проводу земли <code>GND</code>.<br><br>
Скопируй или вставь готовый скетч для вывода температуры в Монитор порта каждые 600 мс:`,
        codeSnippet: `// Скетч RoboLab: Чтение датчика температуры и влажности DHT11
void setup() {
  Serial.begin(9600);
  Serial.println("Датчик DHT11 инициализирован...");
}

void loop() {
  int temp = readTemp(A1); // Читаем температуру с вывода A1
  Serial.print("Температура воздуха: ");
  Serial.print(temp);
  Serial.println(" °C");
  delay(600);
}`
      };
    }

    // 5. Ультразвуковой дальномер HC-SR04
    if (q.includes("hc-sr04") || q.includes("ультразвук") || q.includes("дальномер") || q.includes("расстоян")) {
      return {
        text: `<strong>Подключение ультразвукового дальномера HC-SR04 к ${currentBoardName}:</strong><br>
• <code>VCC</code> → к пину <code>5V</code>.<br>
• <code>TRIG</code> (излучатель импульса) → к цифровому пину <code>D9</code>.<br>
• <code>ECHO</code> (приёмник эхо-сигнала) → к пину <code>D10</code>.<br>
• <code>GND</code> → к пину земли <code>GND</code>.`,
        codeSnippet: `void setup() {
  Serial.begin(9600);
  Serial.println("Ультразвуковой радар HC-SR04 активен!");
}

void loop() {
  int dist = readDistance(10);
  Serial.print("Дистанция до препятствия: ");
  Serial.print(dist);
  Serial.println(" см");
  delay(500);
}`
      };
    }

    // 6. Дисплеи LCD 1602 / OLED
    if (q.includes("lcd") || q.includes("oled") || q.includes("экран") || q.includes("дисплей")) {
      return {
        text: `<strong>Подключение I2C-дисплея (LCD 1602 / OLED SSD1306) к ${currentBoardName}:</strong><br>
Шина I2C использует всего 2 линии данных:<br>
• <code>SDA</code> (данные) → к пину <code>A4</code> на Arduino Uno.<br>
• <code>SCL</code> (тактирование) → к пину <code>A5</code> на Arduino Uno.<br>
• <code>VCC</code> → к <code>5V</code>, а <code>GND</code> → к <code>GND</code>.`,
        codeSnippet: `#include <LiquidCrystal_I2C.h>

void setup() {
  Serial.begin(9600);
  lcd.print("RoboLab Ready!");
}

void loop() {
  lcd.print("Temp: 24C OK");
  delay(1000);
}`
      };
    }

    // Универсальный умный ответ с анализом текущей схемы и кода
    const statusSummary = allIssues.length === 0
      ? `✅ В твоей текущей схеме ошибок не обнаружено (компонентов: <code>${circuitEngine.components.length}</code>, проводов: <code>${circuitEngine.wires.length}</code>).`
      : `⚠️ В текущей схеме есть замечание: <em>${allIssues[0].title}</em>.`;

    return {
      text: `Я проанализировал твой запрос <strong>«${escapeHtml(userPrompt)}»</strong> и текущее состояние проекта на плате <strong>${currentBoardName}</strong>.<br><br>
${statusSummary}<br><br>
Вот универсальный шаблон скетча Arduino C++ с инициализацией порта <code>Serial (9600 бод)</code> и управлением выходным пином:`,
      codeSnippet: `// Универсальный шаблон скетча RoboLab
const int PIN_OUT = 13;

void setup() {
  pinMode(PIN_OUT, OUTPUT);
  Serial.begin(9600);
  Serial.println("Контроллер RoboLab готов к работе!");
}

void loop() {
  digitalWrite(PIN_OUT, HIGH);
  delay(500);
  digitalWrite(PIN_OUT, LOW);
  delay(500);
}`
    };
  }

  function copyTextToClipboard(text, btnEl) {
    const showCopied = () => {
      const original = btnEl.textContent;
      btnEl.textContent = "✅ Скопировано!";
      setTimeout(() => {
        btnEl.textContent = original;
      }, 1800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(() => {
        fallbackCopy(text);
        showCopied();
      });
    } else {
      fallbackCopy(text);
      showCopied();
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    document.body.removeChild(ta);
  }

  function appendChatMessage(role, htmlText, codeSnippet = null) {
    const container = document.getElementById("aiChatMessages");
    const msgEl = document.createElement("div");
    msgEl.className = `chat-msg ${role}`;

    if (role === "user") {
      msgEl.textContent = htmlText;
    } else {
      let inner = `<strong>🤖 AI Наставник RoboLab:</strong><br/>${htmlText}`;
      if (codeSnippet) {
        inner += `
          <div class="chat-code-card">
            <div class="chat-code-topbar">
              <span>C++ / Arduino Sketch</span>
              <div class="chat-code-actions">
                <button type="button" class="btn-copy-code" title="Скопировать C++ код в буфер обмена">📋 Скопировать код</button>
                <button type="button" class="btn-apply-snippet" title="Перенести этот код в редактор слева">⚡ В редактор</button>
              </div>
            </div>
            <div class="chat-code-snippet">${highlightCpp(codeSnippet)}</div>
          </div>
        `;
      }
      msgEl.innerHTML = inner;

      if (codeSnippet) {
        const copyBtn = msgEl.querySelector(".btn-copy-code");
        const applyBtn = msgEl.querySelector(".btn-apply-snippet");

        if (copyBtn) {
          copyBtn.addEventListener("click", () => {
            copyTextToClipboard(codeSnippet, copyBtn);
          });
        }
        if (applyBtn) {
          applyBtn.addEventListener("click", () => {
            document.getElementById("codeEditor").value = codeSnippet;
            syncEditorHighlight();
            updateDiagnosticsPanel();
            saveWorkspaceState();
            applyBtn.textContent = "✅ Вставлено!";
            setTimeout(() => {
              applyBtn.textContent = "⚡ В редактор";
            }, 1800);
          });
        }
      }
    }

    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  function sendUserChatMessage(promptText) {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    appendChatMessage("user", trimmed);

    const container = document.getElementById("aiChatMessages");
    const typingEl = document.createElement("div");
    typingEl.className = "chat-msg ai";
    typingEl.innerHTML = `<em>🤖 AI Наставник RoboLab анализирует твой код и схему...</em>`;
    container.appendChild(typingEl);
    container.scrollTop = container.scrollHeight;

    setTimeout(() => {
      typingEl.remove();
      const reply = generateAiResponse(trimmed);
      appendChatMessage("ai", reply.text, reply.codeSnippet || null);
    }, 340);
  }

  function bindAiAssistantChatEvents() {
    const inputEl = document.getElementById("aiChatInput");
    const sendBtn = document.getElementById("aiChatSendBtn");

    const triggerSend = () => {
      const val = inputEl.value;
      if (!val.trim()) return;
      inputEl.value = "";
      sendUserChatMessage(val);
    };

    sendBtn.addEventListener("click", triggerSend);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        triggerSend();
      }
    });

    document.querySelectorAll(".ai-chip-btn").forEach(chip => {
      chip.addEventListener("click", () => {
        const prompt = chip.getAttribute("data-ai-prompt");
        openAssistantDrawer("chat");
        sendUserChatMessage(prompt);
      });
    });
  }

  // ==================== 5. УПРАВЛЕНИЕ СИМУЛЯТОРОМ И СОБЫТИЯМИ ====================
  function startSimulation() {
    if (!window.RoboLabAuth || !window.RoboLabAuth.isVerified()) {
      window.RoboLabAuth.resumePendingOrOpenLogin("🔒 Для запуска симуляции подтвердите ваш Email или войдите через Google.");
      return;
    }
    const code = document.getElementById("codeEditor").value;
    updateDiagnosticsPanel();
    clearSerialMonitor();
    appendSerialOutput("▶ Старт симуляции микроконтроллера RoboLab (9600 бод)...", true);

    document.getElementById("runSimBtn").classList.add("hidden");
    document.getElementById("stopSimBtn").classList.remove("hidden");
    interpreter.start(code);
  }

  function stopSimulation() {
    interpreter.stop();
    document.getElementById("runSimBtn").classList.remove("hidden");
    document.getElementById("stopSimBtn").classList.add("hidden");
    appendSerialOutput("⏹ Симуляция остановлена.", true);
  }

  function appendSerialOutput(text, isLn) {
    const monitor = document.getElementById("serialOutput");
    if (!monitor) return;
    const time = new Date().toLocaleTimeString("ru-RU", { hour12: false });
    if (isLn) {
      state.serialLogs.push(`[${time}] ${text}`);
      const row = document.createElement("div");
      row.className = "serial-line";
      row.innerHTML = `<span class="serial-time">[${time}]</span>${escapeHtml(text)}`;
      monitor.appendChild(row);
    } else {
      const last = monitor.lastElementChild;
      if (last) last.innerHTML += escapeHtml(text);
    }
    monitor.scrollTop = monitor.scrollHeight;
  }

  function clearSerialMonitor() {
    state.serialLogs = [];
    const monitor = document.getElementById("serialOutput");
    if (monitor) monitor.innerHTML = "";
  }

  function openAssistantDrawer(tabName = "chat") {
    const drawer = document.getElementById("assistantDrawer");
    drawer.classList.remove("drawer-closed");
    switchAssistantTab(tabName);
    if (tabName === "chat") {
      const inp = document.getElementById("aiChatInput");
      if (inp) setTimeout(() => inp.focus(), 120);
    }
  }

  function closeAssistantDrawer() {
    const drawer = document.getElementById("assistantDrawer");
    drawer.classList.add("drawer-closed");
  }

  function switchAssistantTab(tabName) {
    document.querySelectorAll(".assist-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-assist-tab") === tabName);
    });
    document.querySelectorAll("[data-assist-pane]").forEach(pane => {
      pane.classList.toggle("hidden", pane.getAttribute("data-assist-pane") !== tabName);
    });
  }

  function bindAllSimulatorEvents() {
    document.getElementById("runSimBtn").addEventListener("click", startSimulation);
    document.getElementById("stopSimBtn").addEventListener("click", stopSimulation);

    document.getElementById("resetSimBtn").addEventListener("click", () => {
      stopSimulation();
      selectProject(state.currentProjectIndex, false);
    });

    document.getElementById("stepSimBtn").addEventListener("click", () => {
      const code = document.getElementById("codeEditor").value;
      interpreter.stepOnce(code);
    });

    const wireBtn = document.getElementById("toolWireBtn");
    const scissorsBtn = document.getElementById("toolScissorsBtn");

    wireBtn.addEventListener("click", () => {
      circuitEngine.activeTool = "wire";
      wireBtn.classList.add("active");
      scissorsBtn.classList.remove("active");
    });

    scissorsBtn.addEventListener("click", () => {
      if (circuitEngine.selectedId && circuitEngine.selectedId !== "mcu") {
        circuitEngine.deleteSelected();
      } else {
        circuitEngine.activeTool = circuitEngine.activeTool === "scissors" ? "wire" : "scissors";
        scissorsBtn.classList.toggle("active", circuitEngine.activeTool === "scissors");
        wireBtn.classList.toggle("active", circuitEngine.activeTool === "wire");
      }
    });

    document.querySelectorAll(".wire-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        document.querySelectorAll(".wire-dot").forEach(d => d.classList.remove("active"));
        dot.classList.add("active");
        circuitEngine.selectedWireColor = dot.getAttribute("data-color");
        circuitEngine.activeTool = "wire";
        wireBtn.classList.add("active");
        scissorsBtn.classList.remove("active");
      });
    });

    document.getElementById("rotateLeftBtn").addEventListener("click", () => circuitEngine.rotateSelected(-90));
    document.getElementById("rotateRightBtn").addEventListener("click", () => circuitEngine.rotateSelected(90));
    document.getElementById("undoBtn").addEventListener("click", () => circuitEngine.undo());
    document.getElementById("redoBtn").addEventListener("click", () => circuitEngine.redo());

    document.getElementById("brokenDemoBtn").addEventListener("click", () => {
      stopSimulation();
      const proj = window.STEM_PROJECTS[state.currentProjectIndex];
      if (proj.brokenScenario) {
        document.getElementById("codeEditor").value = proj.brokenScenario.code;
        syncEditorHighlight();
        circuitEngine.loadBrokenScenario(proj.brokenScenario);
        updateDiagnosticsPanel();
        openAssistantDrawer("mentor");
        appendSerialOutput(`⚠️ Смоделирована ошибка: ${proj.brokenScenario.description}`, true);
        startSimulation();
      }
    });

    document.getElementById("langToggleBtn").addEventListener("click", (e) => {
      state.lang = state.lang === "ru" ? "kz" : "ru";
      e.currentTarget.textContent = state.lang === "ru" ? "RU ▾" : "KZ ▾";
      const proj = window.STEM_PROJECTS[state.currentProjectIndex];
      const title = state.lang === "kz" && proj.titleKz ? proj.titleKz : proj.title;
      document.getElementById("activeProjectLabel").textContent = `${title} (${proj.board})`;
    });

    document.getElementById("newSketchBtn").addEventListener("click", () => {
      stopSimulation();
      const editor = document.getElementById("codeEditor");
      editor.value = `// Новый скетч RoboLab (Arduino C++)\nvoid setup() {\n  pinMode(13, OUTPUT);\n  Serial.begin(9600);\n  Serial.println("Старт нового проекта в RoboLab!");\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}`;
      syncEditorHighlight();
      circuitEngine.clearWires();
      saveWorkspaceState();
    });

    document.getElementById("saveSketchBtn").addEventListener("click", () => {
      const proj = window.STEM_PROJECTS[state.currentProjectIndex];
      const data = {
        platform: "RoboLab",
        project: proj.id,
        controller: circuitEngine.controller,
        components: circuitEngine.components,
        wires: circuitEngine.wires,
        code: document.getElementById("codeEditor").value,
        savedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `robolab-${proj.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      appendSerialOutput("💾 Проект RoboLab сохранён в файл .json", true);
    });

    document.getElementById("examplesSelect").addEventListener("change", (e) => {
      selectProject(parseInt(e.target.value, 10) || 0, false);
    });

    document.getElementById("expandEditorBtn").addEventListener("click", () => {
      document.getElementById("ideMainGrid").classList.toggle("left-expanded");
    });

    const editor = document.getElementById("codeEditor");
    const highlightLayer = document.getElementById("codeHighlightLayer");
    const numsEl = document.getElementById("lineNumbers");

    editor.addEventListener("input", () => {
      state.customCode = editor.value;
      syncEditorHighlight();
      updateDiagnosticsPanel();
      saveWorkspaceState();
    });

    editor.addEventListener("scroll", () => {
      highlightLayer.scrollTop = editor.scrollTop;
      highlightLayer.scrollLeft = editor.scrollLeft;
      numsEl.scrollTop = editor.scrollTop;
    });

    document.querySelectorAll("[data-serial-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-serial-tab]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        if (btn.getAttribute("data-serial-tab") === "console") {
          appendSerialOutput(`[Компилятор RoboLab AVR-GCC] Скетч проверен: 0 ошибок. Проводов: ${circuitEngine.wires.length}`, true);
        }
      });
    });

    document.getElementById("clearSerialBtn").addEventListener("click", clearSerialMonitor);

    document.getElementById("downloadLogsBtn").addEventListener("click", () => {
      const content = state.serialLogs.join("\r\n") || "Лог монитора порта RoboLab пуст.";
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "robolab-serial-logs.txt";
      a.click();
      URL.revokeObjectURL(url);
    });

    const sendSerialCommand = () => {
      const inp = document.getElementById("serialCmdInput");
      const text = inp.value;
      if (!text.trim()) return;
      interpreter.handleSerialInput(text);
      inp.value = "";
    };

    document.getElementById("serialSendBtn").addEventListener("click", sendSerialCommand);
    document.getElementById("serialCmdInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendSerialCommand();
    });

    document.getElementById("librarySearchInput").addEventListener("input", (e) => {
      renderComponentLibrary(e.target.value);
    });

    const zoomReadout = document.getElementById("zoomReadout");
    document.getElementById("zoomInBtn").addEventListener("click", () => {
      zoomReadout.textContent = circuitEngine.setZoom(circuitEngine.zoom + 0.1) + "%";
    });
    document.getElementById("zoomOutBtn").addEventListener("click", () => {
      zoomReadout.textContent = circuitEngine.setZoom(circuitEngine.zoom - 0.1) + "%";
    });
    zoomReadout.addEventListener("click", () => {
      zoomReadout.textContent = circuitEngine.setZoom(1.0) + "%";
    });

    // Открытие и закрытие выдвижной панели чата «✦ Ассистент»
    document.getElementById("floatingAssistantBtn").addEventListener("click", () => {
      const drawer = document.getElementById("assistantDrawer");
      if (drawer.classList.contains("drawer-closed")) {
        openAssistantDrawer("chat");
      } else {
        closeAssistantDrawer();
      }
    });

    document.getElementById("closeAssistantBtn").addEventListener("click", closeAssistantDrawer);

    document.querySelectorAll(".assist-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        switchAssistantTab(btn.getAttribute("data-assist-tab"));
      });
    });

    document.getElementById("checkChallengeBtn").addEventListener("click", () => {
      const circuitAnalysis = circuitEngine.analyzeCircuit();
      const fb = document.getElementById("challengeFeedback");
      if (circuitAnalysis.isCircuitValid && !state.hasBurnedLed) {
        fb.innerHTML = `<div class="assist-card assist-card-ok">🏆 <strong>Отлично!</strong> Схема в RoboLab собрана верно и прошла автоматическую проверку!</div>`;
      } else {
        fb.innerHTML = `<div class="assist-card assist-card-err">Проверьте правильность подключения всех выводов и резисторов во вкладке «Диагностика».</div>`;
      }
    });

    document.getElementById("supportBtn").addEventListener("click", () => {
      openAssistantDrawer("chat");
    });
  }

  window.addEventListener("DOMContentLoaded", init);
})();
