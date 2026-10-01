// Каталог готовых примеров и лабораторных проектов для симулятора микроконтроллеров
// Каждый проект содержит контроллер, радиодетали, провода, код C++ и диагностику для «✦ Ассистента»

window.STEM_PROJECTS = [
  {
    id: "led-blink",
    number: 1,
    title: "Мигание светодиода (Blink)",
    titleKz: "Жарықдиодты жыпылықтату (Blink)",
    boardType: "arduino_uno",
    board: "Arduino Uno R3",
    difficulty: "Начальный",
    category: "Базовые примеры",
    summary: "Классический скетч Blink: управление внешним 5-мм светодиодом через токоограничивающий резистор 220 Ом.",
    goal: "Собрать цепь светодиода с защитным резистором 220 Ом на пине D13 и протестировать частоту мигания.",
    theory: `
      <h4>Закон Ома и защита светодиода</h4>
      <p>Цифровой пин <code>D13</code> платы Arduino Uno выдаёт напряжение <strong>5 В</strong>. Прямое падение напряжения на красном светодиоде составляет около <strong>2 В</strong>, а безопасный рабочий ток — <strong>15–20 мА</strong>.</p>
      <p>Токоограничивающий резистор на <strong>220 Ом</strong> включается последовательно с анодом (+) светодиода и защищает полупроводниковый кристалл от перегорания.</p>
    `,
    steps: [
      "Соедини пин <strong>D13</strong> платы Arduino Uno с левым выводом резистора <strong>R1 (220 Ом)</strong>.",
      "Соедини правый вывод резистора <strong>R1</strong> с длинной ножкой светодиода — <strong>Анодом (+)</strong>.",
      "Подключи короткую ножку светодиода — <strong>Катод (–)</strong> к пину земли <strong>GND</strong>.",
      "Нажми зелёную кнопку <strong>«▶ Старт»</strong> в верхнем тулбаре."
    ],
    initialController: { id: "mcu", type: "arduino_uno", x: 65, y: 120, rotation: 0 },
    initialComponents: [
      { id: "comp_res1", type: "resistor", x: 380, y: 80, rotation: 0, props: { resistance: 220, label: "R1" } },
      { id: "comp_led1", type: "led", x: 540, y: 55, rotation: 0, props: { color: "red", label: "LED1" } }
    ],
    targetWires: [
      { from: "mcu:D13", to: "comp_res1:t1", color: "#ef4444" },
      { from: "comp_res1:t2", to: "comp_led1:anode", color: "#f97316" },
      { from: "comp_led1:cathode", to: "mcu:GND3", color: "#3b82f6" }
    ],
    brokenScenario: {
      description: "Светодиод подключён к пину D13 напрямую БЕЗ резистора 220 Ом! Ток превышает предел, и кристалл перегорает.",
      wires: [
        { from: "mcu:D13", to: "comp_led1:anode", color: "#ef4444" },
        { from: "comp_led1:cathode", to: "mcu:GND3", color: "#3b82f6" }
      ],
      code: `void setup() {\n  pinMode(13, OUTPUT);\n  Serial.begin(9600);\n  Serial.println("Тест подключения без резистора...");\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(800);\n  digitalWrite(13, LOW);\n  delay(800);\n}`
    },
    starterCode: `// Пример 1: Классический Blink (Мигание светодиода)
const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Arduino Uno: Скетч Blink запущен!");
}

void loop() {
  digitalWrite(LED_PIN, HIGH); // Включить светодиод (5V)
  Serial.println("LED -> HIGH (Вкл)");
  delay(1000);                 // Пауза 1000 мс (1 сек)

  digitalWrite(LED_PIN, LOW);  // Выключить светодиод (0V)
  Serial.println("LED -> LOW (Выкл)");
  delay(1000);                 // Пауза 1000 мс (1 сек)
}`,
    challenge: {
      title: "Задание: Ускорь частоту мигания в 2 раза",
      description: "Измени аргумент функции delay(...) с 1000 на 500 мс и запусти симуляцию с правильно подключённым резистором.",
      xp: 100
    }
  },

  {
    id: "button-led",
    number: 2,
    title: "Тактовая кнопка и светодиод",
    titleKz: "Түйме және жарықдиод",
    boardType: "arduino_uno",
    board: "Arduino Uno R3",
    difficulty: "Начальный",
    category: "Цифровой ввод/вывод",
    summary: "Считывание состояния тактовой кнопки через digitalRead(2) и включение светодиода по нажатию.",
    goal: "Подключить кнопку к пину D2 и зажигать зелёный светодиод на пине D13 при нажатии.",
    theory: `
      <h4>Чтение цифрового входа digitalRead()</h4>
      <p>Тактовая кнопка замыкает сигнальную линию при нажатии. Микроконтроллер проверяет состояние пина <code>D2</code> в каждом цикле <code>loop()</code> и управляет светодиодом через условный оператор <code>if / else</code>.</p>
    `,
    steps: [
      "Подключи вывод <strong>SIG</strong> кнопки к пину <strong>D2</strong>, а <strong>GND</strong> кнопки — к <strong>GND</strong> платы.",
      "Подключи пин <strong>D13</strong> через резистор <strong>220 Ом</strong> к аноду (+) светодиода.",
      "Запусти симуляцию и кликни мышкой по кнопке <strong>CLICK</strong> на холсте!"
    ],
    initialController: { id: "mcu", type: "arduino_uno", x: 65, y: 125, rotation: 0 },
    initialComponents: [
      { id: "comp_res1", type: "resistor", x: 380, y: 75, rotation: 0, props: { resistance: 220, label: "R1" } },
      { id: "comp_led1", type: "led", x: 545, y: 50, rotation: 0, props: { color: "green", label: "LED1" } },
      { id: "comp_btn1", type: "button", x: 430, y: 215, rotation: 0, props: { pressed: false, label: "BTN1" } }
    ],
    targetWires: [
      { from: "mcu:D13", to: "comp_res1:t1", color: "#22c55e" },
      { from: "comp_res1:t2", to: "comp_led1:anode", color: "#22c55e" },
      { from: "comp_led1:cathode", to: "mcu:GND3", color: "#3b82f6" },
      { from: "comp_btn1:out", to: "mcu:D2", color: "#a855f7" },
      { from: "comp_btn1:gnd", to: "mcu:GND1", color: "#3b82f6" }
    ],
    brokenScenario: {
      description: "Кнопка подключена к пину D4 вместо D2 — программа не видит нажатий!",
      wires: [
        { from: "mcu:D13", to: "comp_res1:t1", color: "#22c55e" },
        { from: "comp_res1:t2", to: "comp_led1:anode", color: "#22c55e" },
        { from: "comp_led1:cathode", to: "mcu:GND3", color: "#3b82f6" },
        { from: "comp_btn1:out", to: "mcu:D4", color: "#a855f7" },
        { from: "comp_btn1:gnd", to: "mcu:GND1", color: "#3b82f6" }
      ],
      code: `void setup() {\n  pinMode(2, INPUT);\n  pinMode(13, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int btn = digitalRead(2);\n  if (btn == HIGH) {\n    digitalWrite(13, HIGH);\n  } else {\n    digitalWrite(13, LOW);\n  }\n  delay(150);\n}`
    },
    starterCode: `// Пример 2: Управление светодиодом с помощью тактовой кнопки
void setup() {
  pinMode(2, INPUT);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("Нажмите на тактовую кнопку на холсте!");
}

void loop() {
  int state = digitalRead(2);
  if (state == HIGH) {
    digitalWrite(13, HIGH);
    Serial.println("Кнопка нажата -> LED ВКЛ");
  } else {
    digitalWrite(13, LOW);
  }
  delay(200);
}`,
    challenge: {
      title: "Задание: Включи светодиод нажатием кнопки",
      description: "Запусти симуляцию и нажми мышкой на кнопку на холсте, чтобы светодиод загорелся.",
      xp: 120
    }
  },

  {
    id: "servo-control",
    number: 3,
    title: "Управление сервоприводом SG90",
    titleKz: "SG90 сервожетегін басқару",
    boardType: "arduino_uno",
    board: "Arduino Uno R3",
    difficulty: "Средний",
    category: "Приводы и моторы",
    summary: "Точное позиционирование вала микро-сервопривода TowerPro SG90 по ШИМ-сигналу на пине D9.",
    goal: "Подключить сервопривод SG90 к пину D9 и запрограммировать поворот качалки от 0° до 180°.",
    theory: `
      <h4>ШИМ-управление сервоприводом SG90</h4>
      <p>Сервопривод имеет три провода: <strong>коричневый (GND)</strong>, <strong>красный (VCC 5V)</strong> и <strong>оранжевый (PWM сигнал)</strong>. Команда <code>servo.write(угол)</code> задаёт угол поворота от 0 до 180 градусов.</p>
    `,
    steps: [
      "Подключи оранжевый пин <strong>PWM</strong> сервопривода к пину <strong>D9~</strong>.",
      "Подключи красный пин <strong>VCC</strong> к <strong>5V</strong>, а коричневый <strong>GND</strong> — к <strong>GND</strong>.",
      "Запусти симуляцию и наблюдай за плавным вращением качалки сервопривода!"
    ],
    initialController: { id: "mcu", type: "arduino_uno", x: 65, y: 120, rotation: 0 },
    initialComponents: [
      { id: "comp_servo1", type: "servo", x: 430, y: 130, rotation: 0, props: { angle: 0, label: "SG90" } }
    ],
    targetWires: [
      { from: "comp_servo1:pwm", to: "mcu:D9", color: "#f97316" },
      { from: "comp_servo1:vcc", to: "mcu:5V", color: "#ef4444" },
      { from: "comp_servo1:gnd", to: "mcu:GND1", color: "#3b82f6" }
    ],
    brokenScenario: {
      description: "Забыли подключить провод земли GND сервопривода!",
      wires: [
        { from: "comp_servo1:pwm", to: "mcu:D9", color: "#f97316" },
        { from: "comp_servo1:vcc", to: "mcu:5V", color: "#ef4444" }
      ],
      code: `void setup() {\n  servo.attach(9);\n  Serial.begin(9600);\n}\nvoid loop() {\n  servo.write(90);\n  delay(1000);\n  servo.write(0);\n  delay(1000);\n}`
    },
    starterCode: `// Пример 3: Тест микро-сервопривода TowerPro SG90
#include <Servo.h>

void setup() {
  servo.attach(9); // Подключаем ШИМ сервопривода к пину D9
  Serial.begin(9600);
  Serial.println("Привод SG90 инициализирован.");
}

void loop() {
  Serial.println("Поворот вала -> 0°");
  servo.write(0);
  delay(800);

  Serial.println("Поворот вала -> 90°");
  servo.write(90);
  delay(800);

  Serial.println("Поворот вала -> 180°");
  servo.write(180);
  delay(800);
}`,
    challenge: {
      title: "Задание: Поверни сервопривод",
      description: "Запусти симуляцию с подключённым к D9 сервоприводом, чтобы качалка повернулась.",
      xp: 150
    }
  },

  {
    id: "lcd1602-display",
    number: 4,
    title: "Дисплей LCD 1602 (Шина I2C)",
    titleKz: "LCD 1602 дисплейі (I2C шинасы)",
    boardType: "arduino_uno",
    board: "Arduino Uno R3",
    difficulty: "Средний",
    category: "Дисплеи и индикация",
    summary: "Вывод текстовых сообщений и счётчика времени на двухстрочный жидкокристаллический экран LCD 1602.",
    goal: "Подключить экран LCD 1602 по шине I2C (SDA -> A4, SCL -> A5) и вывести свой текст.",
    theory: `
      <h4>Символьный экран LCD 1602 I2C</h4>
      <p>Экран содержит 2 строки по 16 знакомест. Благодаря I2C-адаптеру для подключения данных достаточно двух линий: <code>SDA (A4)</code> и <code>SCL (A5)</code>.</p>
    `,
    steps: [
      "Соедини пин <strong>SDA</strong> дисплея с пином <strong>A4/SDA</strong> платы Arduino.",
      "Соедини пин <strong>VCC</strong> с <strong>5V</strong>, а пин <strong>GND</strong> — с <strong>GND</strong>.",
      "Запусти симуляцию — подсветка экрана загорится и появится текст!"
    ],
    initialController: { id: "mcu", type: "arduino_uno", x: 65, y: 120, rotation: 0 },
    initialComponents: [
      { id: "comp_lcd1", type: "lcd1602", x: 410, y: 135, rotation: 0, props: { line1: "Arduino Uno R3", line2: "LCD 1602 OK!", label: "LCD1" } }
    ],
    targetWires: [
      { from: "comp_lcd1:sda", to: "mcu:A4", color: "#22c55e" },
      { from: "comp_lcd1:scl", to: "mcu:A5", color: "#eab308" },
      { from: "comp_lcd1:vcc", to: "mcu:5V", color: "#ef4444" },
      { from: "comp_lcd1:gnd", to: "mcu:GND1", color: "#3b82f6" }
    ],
    brokenScenario: {
      description: "Не подключена линия данных SDA к пину A4!",
      wires: [
        { from: "comp_lcd1:vcc", to: "mcu:5V", color: "#ef4444" },
        { from: "comp_lcd1:gnd", to: "mcu:GND1", color: "#3b82f6" }
      ],
      code: `void setup() {\n  Serial.begin(9600);\n}\nvoid loop() {\n  lcd.print("Hello STEM Lab!");\n  delay(1000);\n}`
    },
    starterCode: `// Пример 4: Вывод текста на экран LCD 1602 по шине I2C
#include <LiquidCrystal_I2C.h>

void setup() {
  Serial.begin(9600);
  Serial.println("Инициализация матрицы LCD 1602...");
}

void loop() {
  lcd.print("Privet, Arduino!Sistema Vkluchen");
  Serial.println("Текст обновлён на дисплее LCD 1602");
  delay(1200);
}`,
    challenge: {
      title: "Задание: Выведи сообщение на LCD 1602",
      description: "Собери схему экрана LCD 1602 и запусти симуляцию.",
      xp: 150
    }
  },

  {
    id: "dht11-oled-station",
    number: 5,
    title: "Метеостанция: Датчик DHT11 + OLED 0.96\"",
    titleKz: "Метеостанция: DHT11 датчигі + OLED 0.96\"",
    boardType: "esp32_devkit",
    board: "ESP32 DevKit V1",
    difficulty: "Средний",
    category: "Датчики и IoT",
    summary: "Считывание температуры и влажности воздуха с датчика DHT11 на контроллере ESP32 и вывод на графический OLED-экран.",
    goal: "Собрать цифровую метеостанцию на базе ESP32 DevKit V1, датчика DHT11 и экрана OLED SSD1306.",
    theory: `
      <h4>Цифровой датчик DHT11 и экран OLED SSD1306</h4>
      <p>Датчик <strong>DHT11</strong> передаёт температуру (°C) и влажность (%) по одному сигнальному проводу <code>DATA</code>. Контроллер <strong>ESP32</strong> выводит значения на контрастный OLED-дисплей.</p>
    `,
    steps: [
      "Подключи вывод <strong>DATA</strong> датчика DHT11 к пину <strong>A1/35</strong> платы ESP32, а <strong>GND</strong> — к <strong>GND</strong>.",
      "Подключи вывод <strong>SDA</strong> экрана OLED к пину <strong>SDA/21 (A4)</strong> платы ESP32, а <strong>GND</strong> — к <strong>GND</strong>.",
      "Запусти симуляцию и меняй температуру ползунком под датчиком DHT11!"
    ],
    initialController: { id: "mcu", type: "esp32_devkit", x: 65, y: 150, rotation: 0 },
    initialComponents: [
      { id: "comp_dht1", type: "dht11", x: 370, y: 95, rotation: 0, props: { temp: 24, humidity: 55, label: "DHT11" } },
      { id: "comp_oled1", type: "oled", x: 540, y: 100, rotation: 0, props: { line1: "ESP32 METEO", line2: "T:24C H:55%", label: "OLED1" } }
    ],
    targetWires: [
      { from: "comp_dht1:out", to: "mcu:A1", color: "#f97316" },
      { from: "comp_dht1:gnd", to: "mcu:GND2", color: "#3b82f6" },
      { from: "comp_oled1:sda", to: "mcu:A4", color: "#22c55e" },
      { from: "comp_oled1:gnd", to: "mcu:GND1", color: "#3b82f6" }
    ],
    brokenScenario: {
      description: "Датчик DHT11 не соединён с пином чтения данных!",
      wires: [
        { from: "comp_oled1:sda", to: "mcu:A4", color: "#22c55e" },
        { from: "comp_oled1:gnd", to: "mcu:GND1", color: "#3b82f6" }
      ],
      code: `void setup() {\n  Serial.begin(9600);\n}\nvoid loop() {\n  int t = readTemp(A1);\n  lcd.print("Temp: " + t + " C");\n  delay(500);\n}`
    },
    starterCode: `// Пример 5: Метеостанция на ESP32 + DHT11 + OLED 0.96"
void setup() {
  Serial.begin(9600);
  Serial.println("[ESP32] Метеостанция DHT11 + OLED запущена!");
}

void loop() {
  int temp = readTemp(A1); // Читаем температуру с DHT11
  Serial.print("DHT11 Температура: ");
  Serial.print(temp);
  Serial.println(" °C");

  lcd.print("METEO ESP32     Temp: " + temp + " C");
  delay(600);
}`,
    challenge: {
      title: "Задание: Протестируй датчик DHT11",
      description: "Запусти симуляцию и измени ползунок температуры на датчике DHT11.",
      xp: 180
    }
  },

  {
    id: "neopixel-strip",
    number: 6,
    title: "Адресная лента NeoPixel 8×RGB (WS2812B)",
    titleKz: "NeoPixel 8×RGB адрестік жолағы",
    boardType: "arduino_nano",
    board: "Arduino Nano",
    difficulty: "Средний",
    category: "Светодиодные матрицы",
    summary: "Управление 8 адресными RGB-светодиодами WS2812B по одной цифровой линии DIN с помощью компактной платы Arduino Nano.",
    goal: "Подключить вход DIN полосы NeoPixel к пину D6/D13 платы Arduino Nano и запустить цветовую анимацию.",
    theory: `
      <h4>Адресные светодиоды WS2812B (NeoPixel)</h4>
      <p>Внутри каждого корпуса <code>5050 RGB</code> находится собственный микрочип-драйвер. Это позволяет управлять сотнями полноцветных светодиодов всего по одному проводу <code>DIN</code>.</p>
    `,
    steps: [
      "Подключи вход <strong>DIN</strong> полосы NeoPixel к цифровому пину <strong>D13</strong> платы Arduino Nano.",
      "Подключи <strong>5V</strong> к <strong>5V</strong>, а <strong>GND</strong> полосы — к <strong>GND</strong>.",
      "Нажми <strong>«▶ Старт»</strong> — адресные светодиоды начнут переливаться всеми цветами спектра!"
    ],
    initialController: { id: "mcu", type: "arduino_nano", x: 75, y: 155, rotation: 0 },
    initialComponents: [
      { id: "comp_neo1", type: "neopixel", x: 390, y: 165, rotation: 0, props: { offset: 0, label: "WS2812B" } }
    ],
    targetWires: [
      { from: "comp_neo1:din", to: "mcu:D13", color: "#22c55e" },
      { from: "comp_neo1:vcc", to: "mcu:5V", color: "#ef4444" },
      { from: "comp_neo1:gnd", to: "mcu:GND2", color: "#3b82f6" }
    ],
    brokenScenario: {
      description: "Полоса NeoPixel не подключена к земле GND!",
      wires: [
        { from: "comp_neo1:din", to: "mcu:D13", color: "#22c55e" }
      ],
      code: `void setup() {\n  pinMode(13, OUTPUT);\n  Serial.begin(9600);\n}\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(300);\n}`
    },
    starterCode: `// Пример 6: Управление полосой NeoPixel 8×RGB (WS2812B) на Arduino Nano
#include <Adafruit_NeoPixel.h>

void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("NeoPixel WS2812B (8 пикселей): старт радуги!");
}

void loop() {
  digitalWrite(13, HIGH); // Передача кадра в шину DIN
  Serial.println("Кадр RGB отправлен в ленту WS2812B");
  delay(350);
}`,
    challenge: {
      title: "Задание: Запусти радугу на NeoPixel",
      description: "Собери цепь питания и данных полосы NeoPixel и запусти симуляцию.",
      xp: 160
    }
  },

  {
    id: "ultrasonic-radar",
    number: 7,
    title: "Ультразвуковой радар HC-SR04 + Сервопривод",
    titleKz: "HC-SR04 ультрадыбыстық радары + Сервожетек",
    boardType: "arduino_uno",
    board: "Arduino Uno R3",
    difficulty: "Продвинутый",
    category: "Робототехника",
    summary: "Автоматический шлагбаум: дальномер HC-SR04 измеряет дистанцию до препятствия и поворачивает сервопривод SG90 на 90°.",
    goal: "Настроить срабатывание сервопривода на пине D9 при уменьшении дистанции на датчике HC-SR04 менее 50 см.",
    theory: `
      <h4>Эхолокация датчиком HC-SR04</h4>
      <p>Излучатель <code>T (Trigger)</code> посылает ультразвуковой пакет частотой 40 кГц, а приёмник <code>R (Echo)</code> улавливает отражённый сигнал. По времени задержки вычисляется расстояние в сантиметрах.</p>
    `,
    steps: [
      "Подключи вывод <strong>ECHO</strong> датчика HC-SR04 к пину <strong>D7</strong>, а <strong>GND</strong> — к <strong>GND</strong>.",
      "Подключи вывод <strong>PWM</strong> сервопривода SG90 к пину <strong>D9~</strong>, а <strong>GND</strong> — к <strong>GND</strong>.",
      "Запусти симуляцию и уменьши ползунок дистанции на датчике HC-SR04 ниже 50 см!"
    ],
    initialController: { id: "mcu", type: "arduino_uno", x: 65, y: 125, rotation: 0 },
    initialComponents: [
      { id: "comp_us1", type: "ultrasonic", x: 390, y: 65, rotation: 0, props: { distance: 90, label: "HC-SR04" } },
      { id: "comp_servo1", type: "servo", x: 410, y: 220, rotation: 0, props: { angle: 0, label: "SG90" } }
    ],
    targetWires: [
      { from: "comp_us1:out", to: "mcu:D7", color: "#06b6d4" },
      { from: "comp_us1:gnd", to: "mcu:GND3", color: "#3b82f6" },
      { from: "comp_servo1:pwm", to: "mcu:D9", color: "#f97316" },
      { from: "comp_servo1:gnd", to: "mcu:GND1", color: "#3b82f6" }
    ],
    brokenScenario: {
      description: "Сервопривод подключён к пину D10 вместо D9!",
      wires: [
        { from: "comp_us1:out", to: "mcu:D7", color: "#06b6d4" },
        { from: "comp_us1:gnd", to: "mcu:GND3", color: "#3b82f6" },
        { from: "comp_servo1:pwm", to: "mcu:D10", color: "#f97316" },
        { from: "comp_servo1:gnd", to: "mcu:GND1", color: "#3b82f6" }
      ],
      code: `void setup() {\n  servo.attach(9);\n  Serial.begin(9600);\n}\nvoid loop() {\n  int dist = readDistance(7);\n  if (dist < 50) {\n    servo.write(90);\n  } else {\n    servo.write(0);\n  }\n  delay(350);\n}`
    },
    starterCode: `// Пример 7: Умный шлагбаум (Дальномер HC-SR04 + Сервопривод SG90)
void setup() {
  servo.attach(9);
  Serial.begin(9600);
  Serial.println("Ультразвуковой радар HC-SR04 активен.");
}

void loop() {
  int dist = readDistance(7);
  Serial.print("Дистанция: ");
  Serial.print(dist);
  Serial.println(" см");

  if (dist < 50) {
    servo.write(90); // Препятствие близко -> открыть (90°)
    Serial.println("Шлагбаум ОТКРЫТ (90°)");
  } else {
    servo.write(0);  // Закрыть (0°)
  }
  delay(400);
}`,
    challenge: {
      title: "Задание: Испытай радар",
      description: "Запусти симуляцию и уменьши ползунок расстояния на датчике HC-SR04 до значения < 50 см.",
      xp: 200
    }
  }
];
