// Браузерный интерпретатор и отладчик кода Arduino C++ / ESP32 (ArduinoInterpreter)
// Поддерживает setup(), loop(), пошаговую отладку (Step), ввод из Serial Monitor,
// а также светодиоды, сервопривод SG90, дисплеи LCD 1602 и OLED, NeoPixel WS2812B, DHT11 и HC-SR04.

class ArduinoInterpreter {
  constructor(circuitEngine, callbacks = {}) {
    this.circuit = circuitEngine;
    this.callbacks = callbacks; // onSerialOut, onStateUpdate, onStepHighlight
    this.running = false;
    this.abortController = null;
    this.pinModes = {};
    this.servoPin = null;
    this.stepIndex = 0;
  }

  normalizePinName(rawPin, env = {}) {
    const s = String(rawPin).trim();
    if (env[s] !== undefined) return this.normalizePinName(env[s]);
    if (s === "LED_BUILTIN" || s === "LED_PIN") return "D13";
    if (s.startsWith("A")) return s;
    const num = parseInt(s, 10);
    if (!isNaN(num)) return "D" + num;
    return s;
  }

  analyzeCodeAndCircuit(code, circuitAnalysis) {
    const issues = [];
    const clean = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    if (!/void\s+setup\s*\(\s*\)/.test(clean)) {
      issues.push({
        severity: "error",
        title: "В скетче отсутствует void setup()",
        explanation: "Добавь функцию void setup() { ... } для начальной конфигурации пинов."
      });
    }
    if (!/void\s+loop\s*\(\s*\)/.test(clean)) {
      issues.push({
        severity: "error",
        title: "В скетче отсутствует void loop()",
        explanation: "Добавь функцию void loop() { ... } для основного цикла программы."
      });
    }

    // Разрешаем глобальные константы вида const int LED_PIN = 13;
    const constMap = {};
    const constRegex = /(?:const\s+)?int\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z0-9]+)\s*;/g;
    let cm;
    while ((cm = constRegex.exec(clean)) !== null) {
      constMap[cm[1]] = cm[2];
    }

    const declaredPinModes = {};
    const pmRegex = /pinMode\s*\(\s*([A-Za-z0-9_]+)\s*,\s*(OUTPUT|INPUT|INPUT_PULLUP)\s*\)/g;
    let m;
    while ((m = pmRegex.exec(clean)) !== null) {
      declaredPinModes[this.normalizePinName(m[1], constMap)] = m[2];
    }

    const dwRegex = /digitalWrite\s*\(\s*([A-Za-z0-9_]+)\s*,\s*(HIGH|LOW|1|0)\s*\)/g;
    while ((m = dwRegex.exec(clean)) !== null) {
      const pName = this.normalizePinName(m[1], constMap);
      if (!declaredPinModes[pName]) {
        issues.push({
          severity: "warning",
          title: `Не вызван pinMode(${m[1]}, OUTPUT) в setup()`,
          explanation: `Перед подачей напряжения через digitalWrite на пин ${pName} рекомендуется настроить его как выход.`
        });
      }
    }

    // Проверка чтения датчиков
    const readRegex = /(digitalRead|analogRead|readTemp|readDistance|readMoisture)\s*\(\s*([A-Za-z0-9_]+)\s*\)/g;
    while ((m = readRegex.exec(clean)) !== null) {
      const fn = m[1];
      const pName = this.normalizePinName(m[2], constMap);
      const connectedComp = circuitAnalysis.sensorBindings[pName];
      if (!connectedComp && this.circuit.wires.length > 0) {
        const entries = Object.entries(circuitAnalysis.sensorBindings);
        const hint = entries.find(([, c]) => ["button", "dht11", "ultrasonic", "ldr", "potentiometer"].includes(c.type));
        issues.push({
          severity: "error",
          title: `Чтение ${fn}(${m[2]}) с неподключённого пина ${pName}`,
          explanation: hint
            ? `В коде опрашивается пин ${pName}, а на холсте датчик «${hint[1].props.label}» подключён к пину ${hint[0]}.`
            : `К пину ${pName} не подключён датчик.`
        });
      }
    }

    return issues;
  }

  extractGlobalConstants(code) {
    const clean = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const env = {};
    const regex = /(?:const\s+)?int\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z0-9]+)\s*;/g;
    let m;
    while ((m = regex.exec(clean)) !== null) {
      env[m[1]] = isNaN(Number(m[2])) ? m[2] : Number(m[2]);
    }
    return env;
  }

  extractFunctionBody(code, fnName) {
    const clean = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const regex = new RegExp(`void\\s+${fnName}\\s*\\(\\s*\\)\\s*\\{`);
    const match = regex.exec(clean);
    if (!match) return "";
    let idx = match.index + match[0].length;
    let depth = 1;
    let body = "";
    while (idx < clean.length && depth > 0) {
      const ch = clean[idx];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth > 0) body += ch;
      idx++;
    }
    return body.trim();
  }

  parseStatements(body) {
    const statements = [];
    let i = 0;
    const n = body.length;
    const skipWs = () => { while (i < n && /\s/.test(body[i])) i++; };

    const readParen = () => {
      skipWs();
      if (body[i] !== "(") return "";
      i++;
      let depth = 1;
      let res = "";
      while (i < n && depth > 0) {
        if (body[i] === "(") depth++;
        else if (body[i] === ")") depth--;
        if (depth > 0) res += body[i];
        i++;
      }
      return res.trim();
    };

    const readBlock = () => {
      skipWs();
      if (body[i] !== "{") return "";
      i++;
      let depth = 1;
      let res = "";
      while (i < n && depth > 0) {
        if (body[i] === "{") depth++;
        else if (body[i] === "}") depth--;
        if (depth > 0) res += body[i];
        i++;
      }
      return res.trim();
    };

    while (i < n) {
      skipWs();
      if (i >= n) break;
      if (body.slice(i).startsWith("if") && /[\s(]/.test(body[i + 2] || "")) {
        i += 2;
        const cond = readParen();
        const thenBlock = readBlock();
        let elseBlock = "";
        skipWs();
        if (body.slice(i).startsWith("else") && /[\s{]/.test(body[i + 4] || "")) {
          i += 4;
          elseBlock = readBlock();
        }
        statements.push({
          type: "if",
          cond,
          thenStmts: this.parseStatements(thenBlock),
          elseStmts: elseBlock ? this.parseStatements(elseBlock) : []
        });
      } else {
        let stmt = "";
        while (i < n && body[i] !== ";") {
          stmt += body[i];
          i++;
        }
        if (body[i] === ";") i++;
        stmt = stmt.trim();
        if (stmt) statements.push({ type: "line", text: stmt });
      }
    }
    return statements;
  }

  readSensorValue(fnName, rawPin, env, circuitAnalysis) {
    const pName = this.normalizePinName(rawPin, env);
    const comp = circuitAnalysis.sensorBindings[pName];
    if (!comp) return 0;

    if (fnName === "digitalRead") {
      return comp.type === "button" && comp.props.pressed ? 1 : 0;
    }
    if (fnName === "analogRead") {
      if (comp.type === "ldr") return Math.round((comp.props.light ?? 75) * 10.23);
      if (comp.type === "potentiometer") return Math.round((comp.props.value ?? 50) * 10.23);
      if (comp.type === "dht11") return comp.props.temp ?? 24;
      return 512;
    }
    if (fnName === "readTemp") {
      return comp.props.temp ?? 24;
    }
    if (fnName === "readDistance") {
      return comp.props.distance ?? 90;
    }
    return 0;
  }

  evalExpression(expr, env, circuitAnalysis) {
    const s = expr.trim();
    if (s === "HIGH" || s === "true") return 1;
    if (s === "LOW" || s === "false") return 0;

    const fnMatch = /^(digitalRead|analogRead|readTemp|readDistance)\s*\(\s*([A-Za-z0-9_]+)\s*\)$/.exec(s);
    if (fnMatch) {
      return this.readSensorValue(fnMatch[1], fnMatch[2], env, circuitAnalysis);
    }

    if (s.includes('"')) {
      const parts = s.split("+").map(p => p.trim());
      return parts.map(p => {
        if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1);
        if (env[p] !== undefined) return env[p];
        return p;
      }).join("");
    }

    const cmpMatch = /^(.+?)\s*(<=|>=|==|!=|<|>)\s*(.+)$/.exec(s);
    if (cmpMatch) {
      const left = this.evalExpression(cmpMatch[1], env, circuitAnalysis);
      const op = cmpMatch[2];
      const right = this.evalExpression(cmpMatch[3], env, circuitAnalysis);
      if (op === "<") return left < right;
      if (op === ">") return left > right;
      if (op === "<=") return left <= right;
      if (op === ">=") return left >= right;
      if (op === "==") return left == right;
      if (op === "!=") return left != right;
    }

    if (env[s] !== undefined) return env[s];
    const num = Number(s);
    if (!isNaN(num)) return num;
    return s;
  }

  async executeStatements(stmts, env, signal) {
    for (const st of stmts) {
      if (!this.running || (signal && signal.aborted)) return;
      const circuitAnalysis = this.circuit.analyzeCircuit();

      if (st.type === "if") {
        const cond = Boolean(this.evalExpression(st.cond, env, circuitAnalysis));
        if (cond) await this.executeStatements(st.thenStmts, env, signal);
        else if (st.elseStmts.length > 0) await this.executeStatements(st.elseStmts, env, signal);
        continue;
      }

      const line = st.text;

      const varMatch = /^(?:const\s+)?(?:int|float|long|bool|String)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (varMatch) {
        env[varMatch[1]] = this.evalExpression(varMatch[2], env, circuitAnalysis);
        continue;
      }

      const assignMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (assignMatch) {
        env[assignMatch[1]] = this.evalExpression(assignMatch[2], env, circuitAnalysis);
        continue;
      }

      const pmMatch = /^pinMode\s*\(\s*([A-Za-z0-9_]+)\s*,\s*([A-Z_]+)\s*\)$/.exec(line);
      if (pmMatch) {
        this.pinModes[this.normalizePinName(pmMatch[1], env)] = pmMatch[2];
        continue;
      }

      const dwMatch = /^digitalWrite\s*\(\s*([A-Za-z0-9_]+)\s*,\s*(.+)\s*\)$/.exec(line);
      if (dwMatch) {
        const pName = this.normalizePinName(dwMatch[1], env);
        const val = this.evalExpression(dwMatch[2], env, circuitAnalysis);
        this.applyPinOutput(pName, val ? 1 : 0, circuitAnalysis);
        continue;
      }

      const saMatch = /^servo\.attach\s*\(\s*([A-Za-z0-9_]+)\s*\)$/.exec(line);
      if (saMatch) {
        this.servoPin = this.normalizePinName(saMatch[1], env);
        continue;
      }

      const swMatch = /^servo\.write\s*\(\s*(.+)\s*\)$/.exec(line);
      if (swMatch) {
        const angle = Number(this.evalExpression(swMatch[1], env, circuitAnalysis)) || 0;
        const targetPin = this.servoPin || "D9";
        const servoComp = circuitAnalysis.sensorBindings[targetPin];
        if (servoComp && servoComp.type === "servo") {
          servoComp.props.angle = Math.max(0, Math.min(180, angle));
          this.circuit.render();
          if (this.callbacks.onStateUpdate) this.callbacks.onStateUpdate({ servoMoved: angle > 0 });
        }
        continue;
      }

      const lcdMatch = /^(?:lcd|oled|display)\.print\s*\(\s*(.+)\s*\)$/.exec(line);
      if (lcdMatch) {
        const text = String(this.evalExpression(lcdMatch[1], env, circuitAnalysis));
        Object.values(circuitAnalysis.sensorBindings).forEach(c => {
          if (c.type === "lcd1602" || c.type === "oled") {
            c.props.line1 = text.slice(0, 16);
            c.props.line2 = text.length > 16 ? text.slice(16, 32) : "OK · I2C 0x27";
            this.circuit.render();
          }
        });
        continue;
      }

      const serMatch = /^Serial\.(print|println)\s*\(\s*(.+)\s*\)$/.exec(line);
      if (serMatch) {
        const isLn = serMatch[1] === "println";
        const val = this.evalExpression(serMatch[2], env, circuitAnalysis);
        if (this.callbacks.onSerialOut) this.callbacks.onSerialOut(String(val), isLn);
        continue;
      }

      const delayMatch = /^delay\s*\(\s*(.+)\s*\)$/.exec(line);
      if (delayMatch && signal) {
        const ms = Math.max(60, Math.min(5000, Number(this.evalExpression(delayMatch[1], env, circuitAnalysis)) || 300));
        await new Promise((resolve) => {
          const t = setTimeout(resolve, ms);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            resolve();
          }, { once: true });
        });
        continue;
      }
    }
  }

  applyPinOutput(pName, isHigh, circuitAnalysis) {
    this.circuit.mcuPinStates[pName] = isHigh;
    let anyLedLit = false;
    let anyBurned = false;

    circuitAnalysis.ledBindings.forEach(b => {
      if (b.mcuPin === pName) {
        if (!b.comp.runtime) b.comp.runtime = {};
        if (isHigh) {
          if (!b.hasResistor) {
            b.comp.runtime.burned = true;
            b.comp.runtime.lit = false;
            anyBurned = true;
          } else {
            b.comp.runtime.burned = false;
            b.comp.runtime.lit = true;
            anyLedLit = true;
          }
        } else {
          b.comp.runtime.lit = false;
        }
      }
    });

    // Обновление адресной ленты NeoPixel на этом пине
    const bound = circuitAnalysis.sensorBindings[pName];
    if (bound && bound.type === "neopixel" && isHigh) {
      bound.props.offset = ((bound.props.offset || 0) + 1) % 8;
    }

    this.circuit.render();
    if (this.callbacks.onStateUpdate) {
      this.callbacks.onStateUpdate({ ledLit: anyLedLit, burnedLed: anyBurned });
    }
  }

  async start(code) {
    this.stop();
    this.running = true;
    this.circuit.isRunning = true;
    this.circuit.resetSimulationVisuals();
    this.pinModes = {};
    this.servoPin = null;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const env = this.extractGlobalConstants(code);
    const setupStmts = this.parseStatements(this.extractFunctionBody(code, "setup"));
    const loopStmts = this.parseStatements(this.extractFunctionBody(code, "loop"));

    this.circuit.render();
    await this.executeStatements(setupStmts, env, signal);

    while (this.running && !signal.aborted) {
      await this.executeStatements(loopStmts, env, signal);
      await new Promise(r => setTimeout(r, 60));
    }
  }

  // Пошаговая отладка («⏭ Шаг отладки»)
  async stepOnce(code) {
    if (this.running) this.stop();
    this.circuit.isRunning = true;
    const env = this.extractGlobalConstants(code);
    const loopStmts = this.parseStatements(this.extractFunctionBody(code, "loop"))
      .filter(s => s.type !== "line" || !s.text.startsWith("delay"));

    if (loopStmts.length === 0) return;
    const st = loopStmts[this.stepIndex % loopStmts.length];
    this.stepIndex++;
    this.running = true;
    await this.executeStatements([st], env, null);
    this.running = false;
    if (this.callbacks.onSerialOut) {
      this.callbacks.onSerialOut(`[Отладка · Шаг #${this.stepIndex}] Выполнено: ${st.text || 'if (...)'}`, true);
    }
  }

  // Обработка команды, отправленной пользователем в Serial Monitor
  handleSerialInput(cmdText) {
    const trimmed = cmdText.trim();
    if (!trimmed) return;
    if (this.callbacks.onSerialOut) {
      this.callbacks.onSerialOut(`> ${trimmed}`, true);
    }
    const upper = trimmed.toUpperCase();
    const circuitAnalysis = this.circuit.analyzeCircuit();
    if (upper === "ON" || upper === "1" || upper === "HIGH") {
      this.circuit.isRunning = true;
      this.applyPinOutput("D13", 1, circuitAnalysis);
      if (this.callbacks.onSerialOut) this.callbacks.onSerialOut("[MCU RX] Пин D13 переведён в HIGH (5V)", true);
    } else if (upper === "OFF" || upper === "0" || upper === "LOW") {
      this.applyPinOutput("D13", 0, circuitAnalysis);
      if (this.callbacks.onSerialOut) this.callbacks.onSerialOut("[MCU RX] Пин D13 переведён в LOW (0V)", true);
    } else if (upper === "STATUS" || upper === "HELP") {
      if (this.callbacks.onSerialOut) {
        this.callbacks.onSerialOut(`[MCU RX] Плата: ${this.circuit.controller.type.toUpperCase()} | Команды: ON, OFF, STATUS`, true);
      }
    } else {
      if (this.callbacks.onSerialOut) {
        this.callbacks.onSerialOut(`[MCU RX] Получено ${trimmed.length} байт: "${trimmed}"`, true);
      }
    }
  }

  stop() {
    this.running = false;
    this.circuit.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.circuit.resetSimulationVisuals();
    this.circuit.render();
  }
}

window.ArduinoInterpreter = ArduinoInterpreter;
