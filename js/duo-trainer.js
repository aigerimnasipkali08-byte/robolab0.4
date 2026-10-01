/**
 * RoboLab — Модуль «Практикум» (Duolingo-style STEM & Robotics Trainer)
 * Полностью изолированный модуль (/learn | #duoTrainerView), интегрированный с общим профилем RoboLabAuth.
 */
(function () {
  const STORAGE_KEY = "robolab_duo_progress_v1";

  // ==================== ЗВУКОВОЙ ДВИЖОК (Web Audio API — фирменные сигналы Duolingo) ====================
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playSound(type) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (type === "click") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.045);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.055);
      } else if (type === "success") {
        // Фирменный двунотный мажорный аккорд успеха Duolingo (E5 -> B5)
        const notes = [659.25, 987.77];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          const start = now + idx * 0.11;
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.18, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.34);
        });
      } else if (type === "error" || type === "short_circuit") {
        // Низкий гудок ошибки / треск КЗ
        const notes = type === "short_circuit" ? [190, 135, 98] : [240, 180];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          const start = now + idx * 0.1;
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.13, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.24);
        });
      } else if (type === "fanfare") {
        // Фанфары завершения урока
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          const start = now + idx * 0.1;
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.2, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.45);
        });
      }
    } catch (e) {}
  }

  // ==================== БАЗА УРОКОВ И УПРАЖНЕНИЙ (КАРТА НАВЫКОВ) ====================
  const DUO_LESSONS = [
    {
      id: "lesson_1_ohm_led",
      unit: 1,
      title: "Закон Ома и первый светодиод",
      subtitle: "Полярность, резистор 220 Ом и команда digitalWrite",
      icon: "💡",
      color: "green",
      offsetX: 0,
      rewardVolts: 25,
      steps: [
        {
          stepId: "l1_step1_breadboard",
          type: "breadboard_drag_drop",
          question: {
            title: "Защитите светодиод от перегорания на макетной плате",
            subtitle: "Выберите правильные радиодетали из банка и установите их в слоты цепи между пином D13 и GND.",
            mascotPose: "thinking",
            mascotBubble: "Пин Arduino выдаёт 5 Вольт! Без токоограничивающего резистора кристалл светодиода мгновенно сгорит."
          },
          boardDiagram: {
            sourceLabel: "Пин D13 (5V)",
            groundLabel: "Шины GND (0V)",
            slots: [
              { id: "slot_resistor", label: "Слот 1: Защита по току", expectedId: "part_res_220" },
              { id: "slot_led", label: "Слот 2: Излучатель света", expectedId: "part_led_red" }
            ],
            partsBank: [
              { id: "part_res_220", icon: "🟫🟥🟫", name: "Резистор 220 Ом", desc: "Ограничивает ток до ~15 мА" },
              { id: "part_led_red", icon: "🔴", name: "Светодиод (Анод → Катод)", desc: "Светится при прямом включении" },
              { id: "part_wire_short", icon: "⚡", name: "Прямая перемычка 0 Ом", desc: "Опасно: вызовет сверхток!", isHazard: true },
              { id: "part_cap", icon: "🔋", name: "Конденсатор 100 мкФ", desc: "Накопитель заряда" }
            ]
          },
          validation: {
            hazardPartId: "part_wire_short",
            hazardMessage: "⚡ Короткое замыкание / сверхток! Прямая перемычка вместо резистора сожгла светодиод. Заряд АКБ снижен на 2 ед.",
            successMessage: "Безупречно! Резистор 220 Ом ограничил ток до безопасных 15 мА, светодиод ярко светится.",
            errorMessage: "Проверьте порядок: сначала устанавливается Резистор 220 Ом, а затем Светодиод."
          }
        },
        {
          stepId: "l1_step2_wires",
          type: "circuit_wire_connect",
          question: {
            title: "Подключите выводы светодиода и резистора к Arduino Uno",
            subtitle: "Кликните на контакт слева, а затем на ответный пин платы справа, чтобы протянуть провод.",
            mascotPose: "thinking",
            mascotBubble: "Длинная ножка светодиода — это Анод (+), а короткая — Катод (-), который всегда идёт к земле GND!"
          },
          leftNodes: [
            { id: "led_anode", label: "Анод светодиода (+ через резистор)", badge: "ANODE" },
            { id: "led_cathode", label: "Катод светодиода (− короткая ножка)", badge: "CATHODE" },
            { id: "board_vcc_check", label: "Контрольная шина питания +5V", badge: "VCC" }
          ],
          rightNodes: [
            { id: "ard_d13", label: "Пин D13 (Цифровой выход)", badge: "D13" },
            { id: "ard_gnd", label: "Пин GND (Общий провод / Земля)", badge: "GND" },
            { id: "ard_5v", label: "Пин 5V (Стабилизатор питания)", badge: "5V" }
          ],
          expectedPairs: {
            led_anode: "ard_d13",
            led_cathode: "ard_gnd",
            board_vcc_check: "ard_5v"
          },
          hazardPairs: [
            {
              from: "board_vcc_check",
              to: "ard_gnd",
              message: "⚡ КОРОТКОЕ ЗАМЫКАНИЕ! Вы соединили шину +5V напрямую с GND. Сработала защита платы, заряд АКБ -2!"
            }
          ],
          validation: {
            successMessage: "Отличная коммутация! Анод подключён к управляющему пину D13, а катод — к земле GND.",
            errorMessage: "Полярность нарушена: соедините Анод (+) с D13, Катод (−) с GND, а шину +5V с пином 5V."
          }
        },
        {
          stepId: "l1_step3_code",
          type: "arduino_code_blocks",
          question: {
            title: "Напишите прошивку мигания светодиода на пине 13",
            subtitle: "Нажимайте на плашки с командами C++ внизу, чтобы заполнить пропуски в скетче.",
            mascotPose: "thinking",
            mascotBubble: "Сначала настраиваем пин как выход (OUTPUT), а в цикле loop() подаём высокий уровень напряжения (HIGH)!"
          },
          codeLines: [
            "void setup() {",
            "  {{SLOT_0}}(13, {{SLOT_1}});",
            "}",
            "void loop() {",
            "  {{SLOT_2}}(13, {{SLOT_3}});",
            "  delay(500);",
            "}"
          ],
          expectedSlots: ["pinMode", "OUTPUT", "digitalWrite", "HIGH"],
          tokenBank: ["pinMode", "OUTPUT", "digitalWrite", "HIGH", "INPUT", "analogRead", "LOW"],
          validation: {
            successMessage: "Код скомпилирован без ошибок! На пин 13 подано +5 Вольт, светодиод зажёгся.",
            errorMessage: "В setup() используйте pinMode(13, OUTPUT), а для включения светодиода — digitalWrite(13, HIGH)."
          }
        }
      ]
    },
    {
      id: "lesson_2_button_pullup",
      unit: 1,
      title: "Тактовая кнопка и защита от КЗ",
      subtitle: "Режим INPUT_PULLUP, дребезг контактов и чтение digitalRead",
      icon: "🔘",
      color: "blue",
      offsetX: -68,
      rewardVolts: 30,
      steps: [
        {
          stepId: "l2_step1_wires",
          type: "circuit_wire_connect",
          question: {
            title: "Подключите тактовую кнопку с внутренней подтяжкой INPUT_PULLUP",
            subtitle: "Соедините контакты кнопки и сигнального светодиода с пинами Arduino Uno без риска КЗ.",
            mascotPose: "thinking",
            mascotBubble: "При использовании INPUT_PULLUP кнопка замыкает цифровой пин прямо на GND — внешний резистор для кнопки не нужен!"
          },
          leftNodes: [
            { id: "btn_pin_a", label: "Контакт A тактовой кнопки", badge: "BTN_A" },
            { id: "btn_pin_b", label: "Контакт B тактовой кнопки", badge: "BTN_B" },
            { id: "status_led", label: "Анод сигнального LED (через 220 Ом)", badge: "LED+" }
          ],
          rightNodes: [
            { id: "ard_d2", label: "Пин D2 (Вход кнопки)", badge: "D2" },
            { id: "ard_gnd", label: "Пин GND (Общая земля)", badge: "GND" },
            { id: "ard_d8", label: "Пин D8 (Выход на светодиод)", badge: "D8" }
          ],
          expectedPairs: {
            btn_pin_a: "ard_d2",
            btn_pin_b: "ard_gnd",
            status_led: "ard_d8"
          },
          hazardPairs: [],
          validation: {
            successMessage: "Верно! При нажатии кнопки пин D2 притянется к земле (LOW), а в покое будет равен HIGH.",
            errorMessage: "Подключите Контакт A к D2, Контакт B к GND, а Анод LED к пину D8."
          }
        },
        {
          stepId: "l2_step2_code",
          type: "arduino_code_blocks",
          question: {
            title: "Считайте нажатие кнопки с подтяжкой к питанию",
            subtitle: "Заполните пропуски в коде так, чтобы включить внутренний подтягивающий резистор и проверить нажатие.",
            mascotPose: "thinking",
            mascotBubble: "В режиме INPUT_PULLUP нажатая кнопка возвращает уровень LOW (0)!"
          },
          codeLines: [
            "void setup() {",
            "  pinMode(2, {{SLOT_0}});",
            "  pinMode(8, OUTPUT);",
            "}",
            "void loop() {",
            "  if ({{SLOT_1}}(2) == {{SLOT_2}}) {",
            "    digitalWrite(8, HIGH);",
            "  }",
            "}"
          ],
          expectedSlots: ["INPUT_PULLUP", "digitalRead", "LOW"],
          tokenBank: ["INPUT_PULLUP", "digitalRead", "LOW", "HIGH", "analogWrite", "OUTPUT"],
          validation: {
            successMessage: "Отлично! Внутренний резистор 20 кОм защищает пин D2 от помех и наводок.",
            errorMessage: "Используйте режим INPUT_PULLUP, функцию чтения digitalRead(2) и сравнение с уровнем LOW."
          }
        }
      ]
    },
    {
      id: "lesson_3_ultrasonic_hcsr04",
      unit: 1,
      title: "Ультразвуковой сонар HC-SR04",
      subtitle: "Импульс TRIG, эхо-отклик ECHO и расчёт дистанции в см",
      icon: "📡",
      color: "purple",
      offsetX: 68,
      rewardVolts: 35,
      steps: [
        {
          stepId: "l3_step1_wires",
          type: "circuit_wire_connect",
          question: {
            title: "Скоммутируйте 4 пина ультразвукового дальномера HC-SR04",
            subtitle: "Внимательно соедините питание и сигнальные линии TRIG / ECHO с платой Arduino Uno.",
            mascotPose: "thinking",
            mascotBubble: "Не перепутай питание VCC и землю GND — обратная полярность выведет приёмопередатчик из строя!"
          },
          leftNodes: [
            { id: "hc_vcc", label: "HC-SR04: Пин VCC (+5V питание)", badge: "VCC" },
            { id: "hc_trig", label: "HC-SR04: Пин TRIG (Запуск импульса)", badge: "TRIG" },
            { id: "hc_echo", label: "HC-SR04: Пин ECHO (Приём эха)", badge: "ECHO" },
            { id: "hc_gnd", label: "HC-SR04: Пин GND (Земля)", badge: "GND" }
          ],
          rightNodes: [
            { id: "ard_5v", label: "Arduino: Пин 5V", badge: "5V" },
            { id: "ard_d9", label: "Arduino: Пин D9 (Выход импульса)", badge: "D9" },
            { id: "ard_d10", label: "Arduino: Пин D10 (Вход таймера)", badge: "D10" },
            { id: "ard_gnd", label: "Arduino: Пин GND", badge: "GND" }
          ],
          expectedPairs: {
            hc_vcc: "ard_5v",
            hc_trig: "ard_d9",
            hc_echo: "ard_d10",
            hc_gnd: "ard_gnd"
          },
          hazardPairs: [
            {
              from: "hc_vcc",
              to: "ard_gnd",
              message: "⚡ Ошибка питания! Вы подали землю на вход VCC датчика. Заряд АКБ снижен!"
            }
          ],
          validation: {
            successMessage: "Сонар подключён! Линия TRIG готова к отправке ультразвуковой пачки 40 кГц.",
            errorMessage: "Проверьте схему: VCC → 5V, TRIG → D9, ECHO → D10, GND → GND."
          }
        },
        {
          stepId: "l3_step2_code",
          type: "arduino_code_blocks",
          question: {
            title: "Сформируйте стартовый импульс 10 мкс и измерьте эхо",
            subtitle: "Подставьте команды генерации импульса на пине 9 и чтения длительности через pulseIn.",
            mascotPose: "thinking",
            mascotBubble: "Функция pulseIn(10, HIGH) возвращает время полёта звука туда и обратно в микросекундах!"
          },
          codeLines: [
            "void loop() {",
            "  digitalWrite(9, LOW);",
            "  delayMicroseconds(2);",
            "  {{SLOT_0}}(9, {{SLOT_1}});",
            "  delayMicroseconds(10);",
            "  digitalWrite(9, LOW);",
            "  long dur = {{SLOT_2}}(10, HIGH);",
            "  int cm = dur / 58;",
            "}"
          ],
          expectedSlots: ["digitalWrite", "HIGH", "pulseIn"],
          tokenBank: ["digitalWrite", "HIGH", "pulseIn", "analogRead", "LOW", "tone"],
          validation: {
            successMessage: "Блестяще! Деление микросекунд на 58 даёт точное расстояние до препятствия в сантиметрах.",
            errorMessage: "Для запуска сонара подайте digitalWrite(9, HIGH), а длительность считайте через pulseIn(10, HIGH)."
          }
        }
      ]
    },
    {
      id: "lesson_4_pwm_servo",
      unit: 1,
      title: "ШИМ (PWM) и Сервопривод SG90",
      subtitle: "Импульсное управление углом поворота и пины с тильдой (~)",
      icon: "🦾",
      color: "orange",
      offsetX: 0,
      rewardVolts: 45,
      steps: [
        {
          stepId: "l4_step1_breadboard",
          type: "breadboard_drag_drop",
          question: {
            title: "Соберите цепь управления сервоприводом манипулятора",
            subtitle: "Установите стабилизирующий конденсатор по питанию и подключите сервопривод SG90 к ШИМ-каналу.",
            mascotPose: "thinking",
            mascotBubble: "Серводвигатель потребляет импульсный ток при старте — конденсатор защищает МК от просадки напряжения!"
          },
          boardDiagram: {
            sourceLabel: "Шина 5V + Пин ~D9 (PWM)",
            groundLabel: "Общая шина GND",
            slots: [
              { id: "slot_filter", label: "Слот 1: Фильтр питания 5V", expectedId: "part_cap_100uf" },
              { id: "slot_actuator", label: "Слот 2: Исполнительный привод", expectedId: "part_servo_sg90" }
            ],
            partsBank: [
              { id: "part_cap_100uf", icon: "🔋", name: "Конденсатор 100 мкФ", desc: "Сглаживает скачки тока питания" },
              { id: "part_servo_sg90", icon: "🦾", name: "Сервопривод SG90 (0°–180°)", desc: "Управляется ШИМ-сигналом 50 Гц" },
              { id: "part_short_jumper", icon: "⚡", name: "Замыкатель 5V → GND", desc: "Опасно: вызовет КЗ питания!", isHazard: true },
              { id: "part_photo", icon: "☀️", name: "Фоторезистор LDR", desc: "Датчик освещённости" }
            ]
          },
          validation: {
            hazardPartId: "part_short_jumper",
            hazardMessage: "⚡ Короткое замыкание шины 5V! Стабилизатор Arduino перегрелся, заряд АКБ -2.",
            successMessage: "Схема привода собрана! Конденсатор сглаживает пусковые токи сервомотора.",
            errorMessage: "В первый слот установите Конденсатор 100 мкФ, а во второй — Сервопривод SG90."
          }
        },
        {
          stepId: "l4_step2_code",
          type: "arduino_code_blocks",
          question: {
            title: "Поверните вал сервопривода в центральное положение 90°",
            subtitle: "Привяжите объект сервопривода к ШИМ-пину 9 и передайте угол поворота.",
            mascotPose: "thinking",
            mascotBubble: "Метод attach(9) назначает пин управления, а метод write(угол) поворачивает качалку от 0 до 180 градусов!"
          },
          codeLines: [
            "#include <Servo.h>",
            "Servo armServo;",
            "void setup() {",
            "  armServo.{{SLOT_0}}({{SLOT_1}});",
            "}",
            "void loop() {",
            "  armServo.{{SLOT_2}}({{SLOT_3}});",
            "}"
          ],
          expectedSlots: ["attach", "9", "write", "90"],
          tokenBank: ["attach", "9", "write", "90", "read", "HIGH", "500"],
          validation: {
            successMessage: "Сервопривод плавно повернулся на 90°! Вы освоили управление приводами роботов.",
            errorMessage: "Используйте armServo.attach(9) в setup() и armServo.write(90) в loop()."
          }
        }
      ]
    }
  ];

  // ==================== ДЕТАЛИ КАСТОМИЗАЦИИ РОБОТА В МАСТЕРСКОЙ ====================
  const ROBOT_SHOP_ITEMS = [
    {
      id: "visor_neon",
      name: "Неоновый Кибер-Визор",
      slot: "visor",
      cost: 40,
      icon: "🥽",
      desc: "Голографический дисплей со сканером схем"
    },
    {
      id: "antenna_quantum",
      name: "Квантовая Телеметрия",
      slot: "antenna",
      cost: 50,
      icon: "📡",
      desc: "Двухдиапазонная антенна дальнего радиуса"
    },
    {
      id: "core_plasma",
      name: "Плазменный Реактор",
      slot: "core",
      cost: 70,
      icon: "⚛️",
      desc: "Золотое энергетическое ядро на груди робота"
    },
    {
      id: "armor_gold",
      name: "Золотой Корпус Легенды",
      slot: "armor",
      cost: 100,
      icon: "🛡️",
      desc: "Премиальное покрытие для чемпионов лиги"
    }
  ];

  // ==================== СОСТОЯНИЕ И ХРАНИЛИЩЕ ПРОГРЕССА ====================
  const defaultProgress = {
    streakDays: 7,
    volts: 120,
    battery: 5,
    maxBattery: 5,
    completedLessons: {
      lesson_1_ohm_led: 1
    },
    claimedChests: {},
    unlockedParts: ["visor_neon"],
    equippedParts: {
      visor: "visor_neon",
      antenna: null,
      core: null,
      armor: null
    },
    quests: {
      earnVolts: 35,
      noShortCircuits: 1,
      lessonsDone: 1
    }
  };

  let state = loadState();
  let session = null; // Активная полноэкранная сессия урока

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultProgress));
      const parsed = JSON.parse(raw);
      return {
        ...defaultProgress,
        ...parsed,
        completedLessons: { ...defaultProgress.completedLessons, ...(parsed.completedLessons || {}) },
        claimedChests: { ...(parsed.claimedChests || {}) },
        unlockedParts: Array.isArray(parsed.unlockedParts) ? parsed.unlockedParts : ["visor_neon"],
        equippedParts: { ...defaultProgress.equippedParts, ...(parsed.equippedParts || {}) },
        quests: { ...defaultProgress.quests, ...(parsed.quests || {}) }
      };
    } catch (e) {
      return JSON.parse(JSON.stringify(defaultProgress));
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // ==================== НАВИГАЦИЯ МЕЖДУ СТРАНИЦАМИ ПРИЛОЖЕНИЯ ====================
  function openDuoTrainerView() {
    const landing = document.getElementById("landingView");
    const sim = document.getElementById("simulatorView");
    const duo = document.getElementById("duoTrainerView");
    if (!duo) return;

    if (landing) landing.classList.add("hidden");
    if (sim) sim.classList.add("hidden");
    duo.classList.remove("hidden");

    renderAllDuoUI();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeDuoToLanding() {
    const landing = document.getElementById("landingView");
    const sim = document.getElementById("simulatorView");
    const duo = document.getElementById("duoTrainerView");
    if (duo) duo.classList.add("hidden");
    if (sim) sim.classList.add("hidden");
    if (landing) landing.classList.remove("hidden");
  }

  function closeDuoToSimulator() {
    const landing = document.getElementById("landingView");
    const sim = document.getElementById("simulatorView");
    const duo = document.getElementById("duoTrainerView");
    if (duo) duo.classList.add("hidden");
    if (landing) landing.classList.add("hidden");
    if (sim) sim.classList.remove("hidden");
    // Если еще не авторизован — включим демо-профиль жюри автоматически для бесшовного перехода
    if (window.RoboLabAuth && !window.RoboLabAuth.isVerified() && window.RoboLabAuth.loginAsJuryDemo) {
      window.RoboLabAuth.loginAsJuryDemo();
    }
  }

  // ==================== РЕНДЕР ГЛАВНОГО ЭКРАНА DUOLINGO (SKILL PATH + TOPBAR + SIDEBAR) ====================
  function renderAllDuoUI() {
    renderTopBar();
    renderSkillPath();
    renderRightSidebar();
  }

  function renderTopBar() {
    const streakEl = document.getElementById("duoStreakCount");
    const voltsEl = document.getElementById("duoVoltsCount");
    const batteryEl = document.getElementById("duoBatteryCount");
    const userBadgeEl = document.getElementById("duoUserNameBadge");

    if (streakEl) streakEl.textContent = state.streakDays;
    if (voltsEl) voltsEl.textContent = state.volts;
    if (batteryEl) batteryEl.textContent = `${state.battery}/${state.maxBattery}`;

    const currentUser = window.RoboLabAuth && window.RoboLabAuth.getUser ? window.RoboLabAuth.getUser() : null;
    if (userBadgeEl) {
      userBadgeEl.textContent = currentUser && currentUser.name ? currentUser.name : "Инженер RoboLab";
    }
  }

  function renderSkillPath() {
    const container = document.getElementById("duoSkillPathNodes");
    if (!container) return;

    // Определяем текущий активный (первый непройденный или следующий) урок
    let activeFound = false;
    const htmlParts = [];

    DUO_LESSONS.forEach((lesson, idx) => {
      const doneCount = state.completedLessons[lesson.id] || 0;
      const isCompleted = doneCount > 0;
      let status = "locked";
      if (isCompleted) {
        status = "completed";
      } else if (!activeFound) {
        status = "active";
        activeFound = true;
      }

      // Для демо-режима разрешаем кликать на любой урок, но визуально подсвечиваем текущий
      const nodeColorClass = isCompleted
        ? "duo-node-gold"
        : status === "active"
        ? `duo-node-${lesson.color}`
        : `duo-node-${lesson.color}`;

      const ringDash = isCompleted ? "276 276" : status === "active" ? "95 276" : "0 276";
      const ringStroke = isCompleted ? "#f7c954" : status === "active" ? "#2eb886" : "#2e374f";

      htmlParts.push(`
        <div class="duo-path-step-row" style="transform: translateX(${lesson.offsetX}px);">
          ${
            status === "active"
              ? `<div class="duo-start-floating-Tag" data-start-lesson="${lesson.id}">СТАРТ ▼</div>`
              : isCompleted
              ? `<div class="duo-crown-badge" title="Уровень пройден на золото!">👑</div>`
              : ""
          }
          <div class="duo-node-ring-wrap">
            <svg class="duo-progress-ring-svg" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="#22283b" stroke-width="8" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="${ringStroke}" stroke-width="8"
                stroke-linecap="round" stroke-dasharray="${ringDash}" transform="rotate(-90 50 50)" />
            </svg>
            <button type="button" class="duo-3d-node-btn ${nodeColorClass}" data-lesson-id="${lesson.id}">
              <span class="duo-node-emoji">${lesson.icon}</span>
            </button>
          </div>
          <div class="duo-node-caption-card" data-lesson-id="${lesson.id}">
            <div class="duo-node-caption-title">Урок ${idx + 1}: ${lesson.title}</div>
            <div class="duo-node-caption-sub">${lesson.subtitle}</div>
            <div class="duo-node-caption-meta">
              <span>+${lesson.rewardVolts} ⚙️ Вольт</span>
              <span>• ${lesson.steps.length} интерактива</span>
              ${isCompleted ? `<span class="duo-tag-done">✓ Пройдено</span>` : `<span class="duo-tag-play">▶ Играть</span>`}
            </div>
          </div>
        </div>
      `);

      // Между 2-м и 3-м уроком вставляем интерактивный сундук с наградой (как в Duolingo)
      if (idx === 1) {
        const chestId = "chest_unit_1";
        const isClaimed = Boolean(state.claimedChests[chestId]);
        htmlParts.push(`
          <div class="duo-chest-row">
            <button type="button" class="duo-chest-btn ${isClaimed ? "claimed" : ""}" data-chest-id="${chestId}">
              <span class="duo-chest-icon">${isClaimed ? "🔓" : "🎁"}</span>
              <div>
                <div class="duo-chest-title">${isClaimed ? "Сундук инженера открыт!" : "Бонусный сундук схемотехника"}</div>
                <div class="duo-chest-sub">${
                  isClaimed ? "Вы получили +50 ⚙️ Вольт на прокачку робота" : "Нажмите, чтобы забрать +50 ⚙️ Вольт!"
                }</div>
              </div>
            </button>
          </div>
        `);
      }
    });

    // Финальный кубок раздела
    const allCompleted = DUO_LESSONS.every((l) => (state.completedLessons[l.id] || 0) > 0);
    htmlParts.push(`
      <div class="duo-trophy-checkpoint ${allCompleted ? "unlocked" : ""}">
        <div class="duo-trophy-circle">🏆</div>
        <div>
          <h4>Сертификат Раздела 1: «Мастер цепей Arduino»</h4>
          <p>${
            allCompleted
              ? "Поздравляем! Вы прошли все уровни раздела без перегорания микроконтроллера!"
              : "Пройдите все 4 интерактивных урока на дорожке выше, чтобы зажечь кубок."
          }</p>
        </div>
      </div>
    `);

    container.innerHTML = htmlParts.join("");

    // Привязываем клики по нодам уроков
    container.querySelectorAll("[data-lesson-id], [data-start-lesson]").forEach((el) => {
      el.addEventListener("click", () => {
        const lessonId = el.getAttribute("data-lesson-id") || el.getAttribute("data-start-lesson");
        playSound("click");
        startLessonSession(lessonId);
      });
    });

    // Клик по сундуку
    container.querySelectorAll("[data-chest-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chestId = btn.getAttribute("data-chest-id");
        if (state.claimedChests[chestId]) return;
        state.claimedChests[chestId] = true;
        state.volts += 50;
        state.quests.earnVolts = Math.min(100, state.quests.earnVolts + 50);
        saveState();
        playSound("fanfare");
        renderAllDuoUI();
      });
    });
  }

  // ==================== РЕНДЕР ПРАВОЙ КОЛОНКИ (КАСТОМИЗАЦИЯ РОБОТА, КВЕСТЫ, ЛИГА) ====================
  function renderMascotRobotSvg(pose = "idle", customEquipped = null) {
    const eq = customEquipped || state.equippedParts || {};
    const hasNeonVisor = eq.visor === "visor_neon";
    const hasQuantumAntenna = eq.antenna === "antenna_quantum";
    const hasPlasmaCore = eq.core === "core_plasma";
    const hasGoldArmor = eq.armor === "armor_gold";

    const bodyFill = hasGoldArmor ? "#f59e0b" : "#1e293b";
    const bodyStroke = hasGoldArmor ? "#fde047" : "#38bdf8";
    const eyeColor = pose === "error" ? "#ff4b4b" : pose === "happy" ? "#58cc02" : "#00f5d4";

    return `
      <svg viewBox="0 0 140 140" width="115" height="115" class="duo-mascot-svg pose-${pose}">
        <!-- Свечение позади робота -->
        <circle cx="70" cy="74" r="52" fill="${
          pose === "error" ? "rgba(255,75,75,0.16)" : pose === "happy" ? "rgba(88,204,2,0.18)" : "rgba(28,176,246,0.14)"
        }" />

        <!-- Антенна -->
        <line x1="70" y1="28" x2="70" y2="12" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" />
        <circle cx="70" cy="10" r="${hasQuantumAntenna ? 7 : 4.5}" fill="${hasQuantumAntenna ? "#ffc800" : "#f97316"}" />
        ${
          hasQuantumAntenna
            ? `<circle cx="70" cy="10" r="11" fill="none" stroke="#ffc800" stroke-width="1.6" stroke-dasharray="3 3"/>`
            : ""
        }

        <!-- Голова робота -->
        <rect x="34" y="28" width="72" height="54" rx="16" fill="${bodyFill}" stroke="${bodyStroke}" stroke-width="3.5" />

        <!-- Боковые уши-разъёмы -->
        <rect x="24" y="45" width="10" height="20" rx="4" fill="#0ea5e9" />
        <rect x="106" y="45" width="10" height="20" rx="4" fill="#0ea5e9" />

        <!-- Визор / Глаза -->
        ${
          hasNeonVisor
            ? `<rect x="42" y="40" width="56" height="20" rx="8" fill="#090d16" stroke="#00f5d4" stroke-width="2"/>`
            : ""
        }
        ${
          pose === "error"
            ? `
              <path d="M49 45 L59 55 M59 45 L49 55" stroke="#ff4b4b" stroke-width="3.5" stroke-linecap="round"/>
              <path d="M81 45 L91 55 M91 45 L81 55" stroke="#ff4b4b" stroke-width="3.5" stroke-linecap="round"/>
            `
            : `
              <rect x="47" y="44" width="13" height="11" rx="4" fill="${eyeColor}" />
              <rect x="80" y="44" width="13" height="11" rx="4" fill="${eyeColor}" />
            `
        }

        <!-- Улыбка / Реакция -->
        ${
          pose === "error"
            ? `<path d="M54 71 Q70 62 86 71" fill="none" stroke="#ff4b4b" stroke-width="3.2" stroke-linecap="round" />`
            : pose === "happy"
            ? `<path d="M52 65 Q70 78 88 65" fill="none" stroke="#58cc02" stroke-width="3.8" stroke-linecap="round" />`
            : `<path d="M54 67 H64 L68 71 H72 L76 67 H86" fill="none" stroke="#f97316" stroke-width="2.8" stroke-linecap="round" />`
        }

        <!-- Торс робота -->
        <rect x="42" y="86" width="56" height="38" rx="11" fill="${bodyFill}" stroke="${bodyStroke}" stroke-width="3" />
        ${
          hasPlasmaCore
            ? `<circle cx="70" cy="105" r="10" fill="#ffc800" stroke="#ffffff" stroke-width="2" />`
            : `<circle cx="70" cy="105" r="7" fill="#0ea5e9" />`
        }
      </svg>
    `;
  }

  function renderRightSidebar() {
    // 1. Виджет кастомизации робота
    const robotPreviewEl = document.getElementById("duoRobotAvatarPreview");
    const shopListEl = document.getElementById("duoRobotShopList");
    if (robotPreviewEl) {
      robotPreviewEl.innerHTML = renderMascotRobotSvg("happy");
    }

    if (shopListEl) {
      shopListEl.innerHTML = ROBOT_SHOP_ITEMS.map((item) => {
        const unlocked = state.unlockedParts.includes(item.id);
        const equipped = state.equippedParts[item.slot] === item.id;
        return `
          <div class="duo-shop-item-row">
            <div class="duo-shop-icon">${item.icon}</div>
            <div class="duo-shop-info">
              <div class="duo-shop-name">${item.name}</div>
              <div class="duo-shop-desc">${item.desc}</div>
            </div>
            <button type="button" class="duo-shop-action-btn ${
              equipped ? "equipped" : unlocked ? "unlocked" : ""
            }" data-shop-item="${item.id}">
              ${equipped ? "✓ Надето" : unlocked ? "Надеть" : `${item.cost} ⚙️`}
            </button>
          </div>
        `;
      }).join("");

      shopListEl.querySelectorAll("[data-shop-item]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const itemId = btn.getAttribute("data-shop-item");
          const item = ROBOT_SHOP_ITEMS.find((x) => x.id === itemId);
          if (!item) return;

          if (state.unlockedParts.includes(item.id)) {
            // Переключаем экипировку
            state.equippedParts[item.slot] =
              state.equippedParts[item.slot] === item.id ? null : item.id;
            playSound("click");
            saveState();
            renderAllDuoUI();
          } else if (state.volts >= item.cost) {
            state.volts -= item.cost;
            state.unlockedParts.push(item.id);
            state.equippedParts[item.slot] = item.id;
            playSound("fanfare");
            saveState();
            renderAllDuoUI();
          } else {
            playSound("error");
            btn.textContent = "Мало ⚙️";
            setTimeout(() => renderRightSidebar(), 900);
          }
        });
      });
    }

    // 2. Ежедневные квесты
    const questsEl = document.getElementById("duoDailyQuestsList");
    if (questsEl) {
      const qVolts = Math.min(50, state.quests.earnVolts || 0);
      const qLessons = Math.min(2, Object.keys(state.completedLessons).length);
      const qSafe = Math.min(1, state.quests.noShortCircuits || 0);

      questsEl.innerHTML = `
        <div class="duo-quest-item">
          <div class="duo-quest-icon">⚡</div>
          <div class="duo-quest-body">
            <div class="duo-quest-row">
              <span>Добыть 50 Вольт в уроках</span>
              <strong>${qVolts} / 50 ⚙️</strong>
            </div>
            <div class="duo-quest-bar"><div style="width:${(qVolts / 50) * 100}%"></div></div>
          </div>
        </div>
        <div class="duo-quest-item">
          <div class="duo-quest-icon">🛡️</div>
          <div class="duo-quest-body">
            <div class="duo-quest-row">
              <span>Собрать цепь без короткого замыкания</span>
              <strong>${qSafe} / 1</strong>
            </div>
            <div class="duo-quest-bar"><div style="width:${qSafe * 100}%"></div></div>
          </div>
        </div>
        <div class="duo-quest-item">
          <div class="duo-quest-icon">🎯</div>
          <div class="duo-quest-body">
            <div class="duo-quest-row">
              <span>Пройти 2 модуля практикума</span>
              <strong>${qLessons} / 2</strong>
            </div>
            <div class="duo-quest-bar"><div style="width:${(qLessons / 2) * 100}%"></div></div>
          </div>
        </div>
      `;
    }

    // 3. Лига лидеров
    const leagueEl = document.getElementById("duoLeaderboardList");
    if (leagueEl) {
      const currentUser = window.RoboLabAuth && window.RoboLabAuth.getUser ? window.RoboLabAuth.getUser() : null;
      const myName = currentUser && currentUser.name ? currentUser.name : "Вы (Инженер)";
      const leaders = [
        { name: "Алихан · Кванториум", xp: 420, isMe: false, avatar: "🥇" },
        { name: myName, xp: state.volts + 210, isMe: true, avatar: "🚀" },
        { name: "Дария · РобоЛига", xp: 295, isMe: false, avatar: "🥉" },
        { name: "Тимур · Arduino Pro", xp: 240, isMe: false, avatar: "🔧" }
      ].sort((a, b) => b.xp - a.xp);

      leagueEl.innerHTML = leaders
        .map(
          (u, idx) => `
          <div class="duo-leader-row ${u.isMe ? "is-me" : ""}">
            <span class="duo-leader-rank">#${idx + 1}</span>
            <span class="duo-leader-avatar">${u.avatar}</span>
            <span class="duo-leader-name">${u.name}</span>
            <span class="duo-leader-xp">${u.xp} ⚙️</span>
          </div>
        `
        )
        .join("");
    }
  }

  // ==================== ПОЛНОЭКРАННАЯ СЕССИЯ УРОКА (FULLSCREEN LESSON SESSION) ====================
  function startLessonSession(lessonId) {
    const lesson = DUO_LESSONS.find((l) => l.id === lessonId) || DUO_LESSONS[0];
    if (state.battery <= 0) {
      state.battery = state.maxBattery;
      saveState();
      renderTopBar();
    }

    session = {
      lesson,
      stepIndex: 0,
      status: "answering", // answering | correct | error
      mistakes: 0,
      // Состояние текущего упражнения:
      breadboardSlots: {},
      selectedPartId: null,
      selectedLeftPin: null,
      wireConnections: {},
      codeSlotValues: []
    };

    const modal = document.getElementById("duoLessonModal");
    if (modal) modal.classList.remove("hidden");

    initCurrentStepState();
    renderSessionStep();
  }

  function initCurrentStepState() {
    if (!session) return;
    const step = session.lesson.steps[session.stepIndex];
    session.status = "answering";
    session.breadboardSlots = {};
    session.selectedPartId = null;
    session.selectedLeftPin = null;
    session.wireConnections = {};
    session.codeSlotValues = step && step.expectedSlots ? new Array(step.expectedSlots.length).fill(null) : [];
  }

  function renderSessionStep() {
    if (!session) return;
    const modal = document.getElementById("duoLessonModal");
    const progressFill = document.getElementById("duoSessionProgressFill");
    const batteryLabel = document.getElementById("duoSessionBatteryText");
    const stageArea = document.getElementById("duoSessionStageArea");
    const footer = document.getElementById("duoSessionFooter");

    const total = session.lesson.steps.length;
    if (session.stepIndex >= total) {
      renderLessonCompleteScreen();
      return;
    }

    const step = session.lesson.steps[session.stepIndex];
    const pct = Math.round((session.stepIndex / total) * 100);
    if (progressFill) progressFill.style.width = `${Math.max(10, pct)}%`;
    if (batteryLabel) batteryLabel.textContent = `${state.battery}/${state.maxBattery}`;

    // Определяем позу маскота
    const pose =
      session.status === "correct" ? "happy" : session.status === "error" ? "error" : "idle";

    let interactiveHtml = "";
    if (step.type === "breadboard_drag_drop") {
      interactiveHtml = renderBreadboardExercise(step);
    } else if (step.type === "circuit_wire_connect") {
      interactiveHtml = renderWireConnectExercise(step);
    } else if (step.type === "arduino_code_blocks") {
      interactiveHtml = renderCodeBlocksExercise(step);
    }

    stageArea.innerHTML = `
      <div class="duo-exercise-header">
        <span class="duo-step-type-pill">
          ${
            step.type === "breadboard_drag_drop"
              ? "🛠️ Сборка на макетной плате"
              : step.type === "circuit_wire_connect"
              ? "🔌 Коммутация пинов микроконтроллера"
              : "💻 Прошивка C++ / Arduino"
          }
        </span>
        <h2 class="duo-question-title">${step.question.title}</h2>
        <p class="duo-question-subtitle">${step.question.subtitle}</p>
      </div>

      <div class="duo-mascot-row">
        <div class="duo-mascot-box">
          ${renderMascotRobotSvg(pose)}
        </div>
        <div class="duo-speech-bubble">
          ${step.question.mascotBubble}
        </div>
      </div>

      <div class="duo-interactive-zone">
        ${interactiveHtml}
      </div>
    `;

    // Рендерим нижний футер с 3D-кнопкой «Проверить»
    renderSessionFooter(footer, step);
    bindExerciseEvents(step);
  }

  // ---- Тип 1: Сборка на мини-макетке (Breadboard Drag & Drop / Click-to-place) ----
  function renderBreadboardExercise(step) {
    const diag = step.boardDiagram;
    const slotsHtml = diag.slots
      .map((slot) => {
        const placedId = session.breadboardSlots[slot.id];
        const placedPart = diag.partsBank.find((p) => p.id === placedId);
        return `
          <div class="duo-breadboard-slot ${placedPart ? "filled" : ""}" data-slot-id="${slot.id}">
            <div class="duo-slot-label">${slot.label}</div>
            ${
              placedPart
                ? `
                  <div class="duo-placed-part-chip">
                    <span>${placedPart.icon}</span>
                    <strong>${placedPart.name}</strong>
                    <span class="duo-remove-x" title="Убрать деталь">✕</span>
                  </div>
                `
                : `<div class="duo-slot-placeholder">+ Нажмите сюда или выберите деталь ниже</div>`
            }
          </div>
        `;
      })
      .join(`<div class="duo-circuit-arrow">━━▶</div>`);

    const bankHtml = diag.partsBank
      .map((part) => {
        const isUsed = Object.values(session.breadboardSlots).includes(part.id);
        const isSelected = session.selectedPartId === part.id;
        return `
          <button type="button" class="duo-part-card-btn ${isUsed ? "used" : ""} ${
          isSelected ? "selected" : ""
        }" data-part-id="${part.id}">
            <span class="duo-part-emoji">${part.icon}</span>
            <div class="duo-part-meta">
              <strong>${part.name}</strong>
              <span>${part.desc}</span>
            </div>
          </button>
        `;
      })
      .join("");

    return `
      <div class="duo-breadboard-canvas">
        <div class="duo-board-terminal vcc">⚡ ${diag.sourceLabel}</div>
        <div class="duo-circuit-arrow">━━▶</div>
        ${slotsHtml}
        <div class="duo-circuit-arrow">━━▶</div>
        <div class="duo-board-terminal gnd">⏚ ${diag.groundLabel}</div>
      </div>
      <div class="duo-parts-bank-title">Доступные радиодетали (кликните для установки на макетку):</div>
      <div class="duo-parts-bank-grid">
        ${bankHtml}
      </div>
    `;
  }

  // ---- Тип 2: Коммутация проводов между датчиком и пинами Arduino ----
  function renderWireConnectExercise(step) {
    const leftHtml = step.leftNodes
      .map((node) => {
        const connectedTo = session.wireConnections[node.id];
        const targetObj = step.rightNodes.find((r) => r.id === connectedTo);
        const isSelected = session.selectedLeftPin === node.id;
        return `
          <button type="button" class="duo-pin-node-btn left ${isSelected ? "selected" : ""} ${
          connectedTo ? "connected" : ""
        }" data-left-pin="${node.id}">
            <span class="duo-pin-badge">${node.badge}</span>
            <span class="duo-pin-text">${node.label}</span>
            ${
              targetObj
                ? `<span class="duo-wire-tag">🔌 → ${targetObj.badge}</span>`
                : `<span class="duo-pin-dot">●</span>`
            }
          </button>
        `;
      })
      .join("");

    const rightHtml = step.rightNodes
      .map((node) => {
        const connectedLeftId = Object.keys(session.wireConnections).find(
          (k) => session.wireConnections[k] === node.id
        );
        const leftObj = step.leftNodes.find((l) => l.id === connectedLeftId);
        return `
          <button type="button" class="duo-pin-node-btn right ${
            connectedLeftId ? "connected" : ""
          }" data-right-pin="${node.id}">
            <span class="duo-pin-dot">●</span>
            <span class="duo-pin-text">${node.label}</span>
            <span class="duo-pin-badge">${node.badge}</span>
            ${leftObj ? `<span class="duo-wire-tag">${leftObj.badge}</span>` : ""}
          </button>
        `;
      })
      .join("");

    return `
      <div class="duo-wires-instruction">
        1. Выберите вывод компонента слева → 2. Кликните на ответный пин платы Arduino справа
      </div>
      <div class="duo-wires-columns">
        <div class="duo-wires-col">
          <div class="duo-wires-col-header">Выводы датчика / цепи</div>
          ${leftHtml}
        </div>
        <div class="duo-wires-col">
          <div class="duo-wires-col-header">Пины платы Arduino Uno</div>
          ${rightHtml}
        </div>
      </div>
    `;
  }

  // ---- Тип 3: Сборка C++ / Arduino кода из интерактивных плашек ----
  function renderCodeBlocksExercise(step) {
    const linesHtml = step.codeLines
      .map((line) => {
        const replaced = line.replace(/\{\{SLOT_(\d+)\}\}/g, (_, idxStr) => {
          const slotIdx = parseInt(idxStr, 10);
          const val = session.codeSlotValues[slotIdx];
          return val
            ? `<button type="button" class="duo-code-slot filled" data-code-slot="${slotIdx}">${val} ✕</button>`
            : `<button type="button" class="duo-code-slot empty" data-code-slot="${slotIdx}">___</button>`;
        });
        return `<div class="duo-code-line">${replaced}</div>`;
      })
      .join("");

    const bankHtml = step.tokenBank
      .map((tok) => {
        const usedCount = session.codeSlotValues.filter((v) => v === tok).length;
        const totalInBank = step.tokenBank.filter((t) => t === tok).length;
        const disabled = usedCount >= totalInBank;
        return `
          <button type="button" class="duo-code-pill-btn ${disabled ? "used" : ""}" data-code-token="${tok}" ${
          disabled ? "disabled" : ""
        }>
            ${tok}
          </button>
        `;
      })
      .join("");

    return `
      <div class="duo-ide-code-box">
        <div class="duo-ide-top-dots">
          <span></span><span></span><span></span>
          <small>sketch_robolab.ino — Arduino C++</small>
        </div>
        <div class="duo-ide-lines-wrap">
          ${linesHtml}
        </div>
      </div>
      <div class="duo-parts-bank-title">Банк блоков кода C++ (нажмите на блок, чтобы вставить в пропуск):</div>
      <div class="duo-code-pills-bank">
        ${bankHtml}
      </div>
    `;
  }

  function isStepReadyToCheck(step) {
    if (!session) return false;
    if (step.type === "breadboard_drag_drop") {
      return step.boardDiagram.slots.every((s) => Boolean(session.breadboardSlots[s.id]));
    }
    if (step.type === "circuit_wire_connect") {
      return step.leftNodes.every((l) => Boolean(session.wireConnections[l.id]));
    }
    if (step.type === "arduino_code_blocks") {
      return session.codeSlotValues.every((v) => Boolean(v));
    }
    return false;
  }

  function renderSessionFooter(footerEl, step) {
    if (!footerEl) return;
    const ready = isStepReadyToCheck(step);

    if (session.status === "answering") {
      footerEl.className = "duo-session-footer neutral";
      footerEl.innerHTML = `
        <div class="duo-footer-inner">
          <button type="button" class="duo-btn-secondary" id="duoHintFillBtn" title="Подсказать верное решение">
            💡 Подсказка
          </button>
          <button type="button" class="duo-btn-primary" id="duoCheckAnswerBtn" ${ready ? "" : "disabled"}>
            Проверить
          </button>
        </div>
      `;
    } else if (session.status === "correct") {
      footerEl.className = "duo-session-footer success";
      footerEl.innerHTML = `
        <div class="duo-footer-inner">
          <div class="duo-feedback-banner">
            <div class="duo-feedback-icon success">✓</div>
            <div>
              <div class="duo-feedback-title">Отлично! Цепь работает штатно</div>
              <div class="duo-feedback-text">${session.feedbackText || step.validation.successMessage}</div>
            </div>
          </div>
          <button type="button" class="duo-btn-primary" id="duoNextStepBtn">
            Продолжить
          </button>
        </div>
      `;
    } else if (session.status === "error") {
      footerEl.className = "duo-session-footer danger";
      footerEl.innerHTML = `
        <div class="duo-footer-inner">
          <div class="duo-feedback-banner">
            <div class="duo-feedback-icon danger">⚡</div>
            <div>
              <div class="duo-feedback-title">${session.feedbackTitle || "Ошибка в схеме или коде"}</div>
              <div class="duo-feedback-text">${session.feedbackText || step.validation.errorMessage}</div>
            </div>
          </div>
          <button type="button" class="duo-btn-danger" id="duoRetryStepBtn">
            Попробовать снова
          </button>
        </div>
      `;
    }
  }

  function bindExerciseEvents(step) {
    if (!session) return;

    // 1. События для макетки
    if (step.type === "breadboard_drag_drop") {
      document.querySelectorAll("[data-part-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (session.status !== "answering") return;
          const partId = btn.getAttribute("data-part-id");
          playSound("click");

          // Находим первый пустой слот и сразу ставим туда деталь
          const emptySlot = step.boardDiagram.slots.find((s) => !session.breadboardSlots[s.id]);
          if (emptySlot) {
            session.breadboardSlots[emptySlot.id] = partId;
          } else {
            session.selectedPartId = partId;
          }
          renderSessionStep();
        });
      });

      document.querySelectorAll("[data-slot-id]").forEach((slotEl) => {
        slotEl.addEventListener("click", () => {
          if (session.status !== "answering") return;
          const slotId = slotEl.getAttribute("data-slot-id");
          playSound("click");
          if (session.selectedPartId) {
            session.breadboardSlots[slotId] = session.selectedPartId;
            session.selectedPartId = null;
          } else if (session.breadboardSlots[slotId]) {
            delete session.breadboardSlots[slotId];
          }
          renderSessionStep();
        });
      });
    }

    // 2. События для соединения пинов проводами
    if (step.type === "circuit_wire_connect") {
      document.querySelectorAll("[data-left-pin]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (session.status !== "answering") return;
          const leftId = btn.getAttribute("data-left-pin");
          playSound("click");
          if (session.selectedLeftPin === leftId) {
            session.selectedLeftPin = null;
          } else {
            session.selectedLeftPin = leftId;
          }
          renderSessionStep();
        });
      });

      document.querySelectorAll("[data-right-pin]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (session.status !== "answering") return;
          const rightId = btn.getAttribute("data-right-pin");
          playSound("click");
          const leftId =
            session.selectedLeftPin ||
            step.leftNodes.find((l) => !session.wireConnections[l.id])?.id;
          if (!leftId) return;

          // Освобождаем правый пин, если он был занят другим проводом
          Object.keys(session.wireConnections).forEach((k) => {
            if (session.wireConnections[k] === rightId) {
              delete session.wireConnections[k];
            }
          });

          session.wireConnections[leftId] = rightId;
          session.selectedLeftPin = null;
          renderSessionStep();
        });
      });
    }

    // 3. События для плашек кода C++
    if (step.type === "arduino_code_blocks") {
      document.querySelectorAll("[data-code-token]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (session.status !== "answering") return;
          const token = btn.getAttribute("data-code-token");
          const emptyIdx = session.codeSlotValues.findIndex((v) => !v);
          if (emptyIdx === -1) return;
          playSound("click");
          session.codeSlotValues[emptyIdx] = token;
          renderSessionStep();
        });
      });

      document.querySelectorAll("[data-code-slot]").forEach((slotBtn) => {
        slotBtn.addEventListener("click", () => {
          if (session.status !== "answering") return;
          const idx = parseInt(slotBtn.getAttribute("data-code-slot"), 10);
          if (session.codeSlotValues[idx]) {
            playSound("click");
            session.codeSlotValues[idx] = null;
            renderSessionStep();
          }
        });
      });
    }

    // Кнопка «Подсказка» (автозаполнение правильного ответа для быстрой демонстрации)
    const hintBtn = document.getElementById("duoHintFillBtn");
    if (hintBtn) {
      hintBtn.addEventListener("click", () => {
        playSound("click");
        if (step.type === "breadboard_drag_drop") {
          step.boardDiagram.slots.forEach((s) => {
            session.breadboardSlots[s.id] = s.expectedId;
          });
        } else if (step.type === "circuit_wire_connect") {
          session.wireConnections = { ...step.expectedPairs };
        } else if (step.type === "arduino_code_blocks") {
          session.codeSlotValues = [...step.expectedSlots];
        }
        renderSessionStep();
      });
    }

    // Кнопка «Проверить»
    const checkBtn = document.getElementById("duoCheckAnswerBtn");
    if (checkBtn) {
      checkBtn.addEventListener("click", () => validateCurrentStep(step));
    }

    // Кнопка «Продолжить» после верного ответа
    const nextBtn = document.getElementById("duoNextStepBtn");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        playSound("click");
        session.stepIndex += 1;
        initCurrentStepState();
        renderSessionStep();
      });
    }

    // Кнопка «Попробовать снова» после ошибки
    const retryBtn = document.getElementById("duoRetryStepBtn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        playSound("click");
        session.status = "answering";
        renderSessionStep();
      });
    }
  }

  function validateCurrentStep(step) {
    let isCorrect = false;
    let isShortCircuit = false;
    let customErrorMsg = "";

    if (step.type === "breadboard_drag_drop") {
      const placedValues = Object.values(session.breadboardSlots);
      if (step.validation.hazardPartId && placedValues.includes(step.validation.hazardPartId)) {
        isShortCircuit = true;
        customErrorMsg = step.validation.hazardMessage;
      } else {
        isCorrect = step.boardDiagram.slots.every(
          (s) => session.breadboardSlots[s.id] === s.expectedId
        );
      }
    } else if (step.type === "circuit_wire_connect") {
      if (Array.isArray(step.hazardPairs)) {
        for (const hz of step.hazardPairs) {
          if (session.wireConnections[hz.from] === hz.to) {
            isShortCircuit = true;
            customErrorMsg = hz.message;
            break;
          }
        }
      }
      if (!isShortCircuit) {
        isCorrect = Object.keys(step.expectedPairs).every(
          (leftKey) => session.wireConnections[leftKey] === step.expectedPairs[leftKey]
        );
      }
    } else if (step.type === "arduino_code_blocks") {
      isCorrect = step.expectedSlots.every((exp, i) => session.codeSlotValues[i] === exp);
    }

    if (isCorrect) {
      session.status = "correct";
      session.feedbackText = step.validation.successMessage;
      playSound("success");
    } else {
      session.status = "error";
      session.mistakes += 1;
      const damage = isShortCircuit ? 2 : 1;
      state.battery = Math.max(0, state.battery - damage);
      session.feedbackTitle = isShortCircuit
        ? `⚡ Короткое замыкание! (-${damage} 🔋 Заряда АКБ)`
        : `Ошибка в схеме (-1 🔋 Заряда АКБ)`;
      session.feedbackText = customErrorMsg || step.validation.errorMessage;
      saveState();
      renderTopBar();
      playSound(isShortCircuit ? "short_circuit" : "error");
    }

    renderSessionStep();
  }

  function renderLessonCompleteScreen() {
    const progressFill = document.getElementById("duoSessionProgressFill");
    const stageArea = document.getElementById("duoSessionStageArea");
    const footer = document.getElementById("duoSessionFooter");

    if (progressFill) progressFill.style.width = "100%";
    playSound("fanfare");

    const lesson = session.lesson;
    const accuracy = Math.max(
      65,
      Math.round((lesson.steps.length / (lesson.steps.length + session.mistakes)) * 100)
    );

    // Начисляем награды
    state.volts += lesson.rewardVolts;
    state.completedLessons[lesson.id] = (state.completedLessons[lesson.id] || 0) + 1;
    state.quests.earnVolts = Math.min(100, (state.quests.earnVolts || 0) + lesson.rewardVolts);
    if (session.mistakes === 0) {
      state.quests.noShortCircuits = 1;
    }
    saveState();
    renderAllDuoUI();

    stageArea.innerHTML = `
      <div class="duo-complete-card">
        <div class="duo-complete-mascot">
          ${renderMascotRobotSvg("happy")}
        </div>
        <h2 class="duo-complete-title">Урок блестяще пройден!</h2>
        <p class="duo-complete-sub">Вы освоили тему «${lesson.title}» без перегорания микроконтроллера.</p>

        <div class="duo-complete-stats-grid">
          <div class="duo-stat-box gold">
            <span class="duo-stat-head">НАГРАДА</span>
            <strong>+${lesson.rewardVolts} ⚙️</strong>
          </div>
          <div class="duo-stat-box green">
            <span class="duo-stat-head">ТОЧНОСТЬ СХЕМЫ</span>
            <strong>${accuracy}% 🎯</strong>
          </div>
          <div class="duo-stat-box orange">
            <span class="duo-stat-head">УДАРНЫЙ РЕЖИМ</span>
            <strong>${state.streakDays} дней 🔥</strong>
          </div>
        </div>
      </div>
    `;

    footer.className = "duo-session-footer success";
    footer.innerHTML = `
      <div class="duo-footer-inner">
        <div class="duo-feedback-banner">
          <div class="duo-feedback-icon success">🏆</div>
          <div>
            <div class="duo-feedback-title">Золотое кольцо прогресса обновлено!</div>
            <div class="duo-feedback-text">Полученные Вольты ⚙️ можно потратить на апгрейд робота в правой панели.</div>
          </div>
        </div>
        <button type="button" class="duo-btn-primary" id="duoFinishLessonBtn">
          Забрать награду
        </button>
      </div>
    `;

    const finishBtn = document.getElementById("duoFinishLessonBtn");
    if (finishBtn) {
      finishBtn.addEventListener("click", () => {
        playSound("click");
        document.getElementById("duoLessonModal").classList.add("hidden");
        session = null;
      });
    }
  }

  // ==================== ИНИЦИАЛИЗАЦИЯ И ПРИВЯЗКА КНОПОК ====================
  function initDuoTrainer() {
    // Кнопки открытия вкладки «Практикум (Duolingo)» из шапки Лендинга и из Симулятора
    ["openDuoTabFromLanding", "openDuoTabFromSim", "heroDuoCourseBtn"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          openDuoTrainerView();
        });
      }
    });

    // Кнопки возврата из Практикума на Главную или в Симулятор
    const backLandingBtn = document.getElementById("duoNavToLandingBtn");
    if (backLandingBtn) backLandingBtn.addEventListener("click", closeDuoToLanding);

    const toSimBtn = document.getElementById("duoNavToSimulatorBtn");
    if (toSimBtn) toSimBtn.addEventListener("click", closeDuoToSimulator);

    // Быстрая зарядка аккумулятора 🔋 при клике по индикатору батареи
    const rechargeBtn = document.getElementById("duoRechargeBatteryBtn");
    if (rechargeBtn) {
      rechargeBtn.addEventListener("click", () => {
        state.battery = state.maxBattery;
        saveState();
        playSound("fanfare");
        renderTopBar();
      });
    }

    // Закрытие полноэкранного урока (крестик)
    const closeLessonBtn = document.getElementById("duoCloseLessonBtn");
    if (closeLessonBtn) {
      closeLessonBtn.addEventListener("click", () => {
        document.getElementById("duoLessonModal").classList.add("hidden");
        session = null;
      });
    }

    // Кнопка «Справочник модуля»
    const guideBtn = document.getElementById("duoUnitGuideBtn");
    if (guideBtn) {
      guideBtn.addEventListener("click", () => {
        playSound("click");
        startLessonSession(DUO_LESSONS[0].id);
      });
    }

    renderAllDuoUI();

    // Если URL содержит #learn или #duo — открываем вкладку сразу
    if (window.location.hash === "#learn" || window.location.hash === "#duo") {
      openDuoTrainerView();
    }
  }

  window.RoboLabDuo = {
    open: openDuoTrainerView,
    startLesson: startLessonSession
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDuoTrainer);
  } else {
    initDuoTrainer();
  }
})();
