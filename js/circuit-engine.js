// Движок интерактивного холста, трассировки проводов и электрической верификации (CircuitEngine)
// Использует фотореалистичные векторные модели из window.SVG_MODELS

class CircuitEngine {
  constructor(containerEl, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks; // onCircuitChange, onSensorChange, onSelectChange

    this.controller = { id: "mcu", type: "arduino_uno", x: 65, y: 120, rotation: 0 };
    this.components = [];
    this.wires = [];
    this.targetWires = [];
    this.showHints = false;
    this.isRunning = false;

    // Зум, активный инструмент и выделение
    this.zoom = 1.0;
    this.activeTool = "wire"; // "wire" | "scissors"
    this.selectedId = null;   // id выбранного компонента или "mcu"
    this.selectedWireColor = "#ef4444";

    // История для Undo / Redo
    this.history = [];
    this.historyIndex = -1;

    // Протяжка провода и перетаскивание
    this.activePin = null;
    this.mousePos = { x: 0, y: 0 };
    this.draggingItem = null;
    this.dragOffset = { x: 0, y: 0 };

    // Состояния пинов во время симуляции
    this.mcuPinStates = {};

    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="canvas-viewport" id="canvasViewport">
        <div class="canvas-stage" id="canvasStage">
          <svg class="wires-svg" id="wiresSvg" viewBox="0 0 920 560">
            <defs>
              <pattern id="lightGridDots" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.15" fill="#cbd5e1" />
              </pattern>
            </defs>
            <rect width="920" height="560" fill="url(#lightGridDots)" />
            <g id="hintWiresLayer"></g>
            <g id="wiresLayer"></g>
            <g id="activeWireLayer"></g>
          </svg>
          <div class="components-layer" id="componentsLayer"></div>
        </div>
        <div class="pin-tooltip hidden" id="pinTooltip"></div>
      </div>
    `;
    this.viewport = this.container.querySelector("#canvasViewport");
    this.stage = this.container.querySelector("#canvasStage");
    this.wiresSvg = this.container.querySelector("#wiresSvg");
    this.wiresLayer = this.container.querySelector("#wiresLayer");
    this.hintWiresLayer = this.container.querySelector("#hintWiresLayer");
    this.activeWireLayer = this.container.querySelector("#activeWireLayer");
    this.componentsLayer = this.container.querySelector("#componentsLayer");
    this.pinTooltip = this.container.querySelector("#pinTooltip");
  }

  // Сохранение снимка состояния для Undo / Redo
  pushHistory() {
    const snap = JSON.stringify({
      controller: this.controller,
      components: this.components,
      wires: this.wires
    });
    if (this.historyIndex >= 0 && this.history[this.historyIndex] === snap) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snap);
    if (this.history.length > 40) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreSnapshot(this.history[this.historyIndex]);
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreSnapshot(this.history[this.historyIndex]);
    }
  }

  restoreSnapshot(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      this.controller = data.controller;
      this.components = data.components;
      this.wires = data.wires;
      this.activePin = null;
      this.render();
      if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
    } catch (e) {}
  }

  setZoom(newZoom) {
    this.zoom = Math.max(0.6, Math.min(1.5, Math.round(newZoom * 10) / 10));
    this.stage.style.transform = `scale(${this.zoom})`;
    return Math.round(this.zoom * 100);
  }

  getPinCoords(fullPinId) {
    const [ownerId, pinId] = fullPinId.split(":");
    let item = ownerId === "mcu" ? this.controller : this.components.find(c => c.id === ownerId);
    if (!item) return null;
    const pins = window.SVG_MODELS.getPins(item);
    const p = pins.find(pin => pin.id === pinId);
    if (!p) return null;
    return {
      x: item.x + p.x,
      y: item.y + p.y,
      label: p.label
    };
  }

  loadProject(project) {
    this.controller = JSON.parse(JSON.stringify(
      project.initialController || { id: "mcu", type: project.boardType || "arduino_uno", x: 65, y: 120, rotation: 0 }
    ));
    this.components = JSON.parse(JSON.stringify(project.initialComponents || []));
    this.targetWires = JSON.parse(JSON.stringify(project.targetWires || []));
    this.wires = JSON.parse(JSON.stringify(project.targetWires || []));
    this.activePin = null;
    this.selectedId = null;
    this.history = [];
    this.historyIndex = -1;
    this.pushHistory();
    this.resetSimulationVisuals();
    this.render();
    if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
  }

  clearWires() {
    this.pushHistory();
    this.wires = [];
    this.activePin = null;
    this.resetSimulationVisuals();
    this.render();
    this.pushHistory();
    if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
  }

  autoWireTarget() {
    this.wires = JSON.parse(JSON.stringify(this.targetWires || []));
    this.activePin = null;
    this.resetSimulationVisuals();
    this.render();
    this.pushHistory();
    if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
  }

  loadBrokenScenario(broken) {
    if (!broken) return;
    this.wires = JSON.parse(JSON.stringify(broken.wires || []));
    this.activePin = null;
    this.resetSimulationVisuals();
    this.render();
    this.pushHistory();
    if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
  }

  addComponent(type, dropX = null, dropY = null) {
    // Если добавляется контроллер — заменяем текущий контроллер с сохранением координат
    const isController = window.SVG_MODELS.CATALOG.controllers.some(c => c.type === type);
    if (isController) {
      this.controller = {
        id: "mcu",
        type,
        x: dropX !== null ? Math.max(20, Math.min(620, dropX - 120)) : this.controller.x,
        y: dropY !== null ? Math.max(20, Math.min(360, dropY - 80)) : this.controller.y,
        rotation: 0
      };
      this.selectedId = "mcu";
      this.render();
      this.pushHistory();
      if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
      return;
    }

    const id = "comp_" + type + "_" + Math.floor(Math.random() * 9000 + 1000);
    const x = dropX !== null ? Math.max(40, Math.min(760, Math.round(dropX - 50))) : 400 + Math.floor(Math.random() * 160);
    const y = dropY !== null ? Math.max(30, Math.min(420, Math.round(dropY - 45))) : 110 + Math.floor(Math.random() * 160);

    const defaults = {
      resistor: { resistance: 220, label: "R" + (this.components.filter(c => c.type === "resistor").length + 1) },
      led: { color: "red", label: "LED" + (this.components.filter(c => c.type === "led").length + 1) },
      button: { pressed: false, label: "BTN" },
      servo: { angle: 0, label: "SG90" },
      lcd1602: { line1: "Arduino Uno R3", line2: "LCD 1602 Ready", label: "LCD1" },
      oled: { line1: "OLED 128x64", line2: "Ready I2C", label: "OLED1" },
      neopixel: { offset: 0, label: "WS2812B" },
      dht11: { temp: 24, humidity: 55, label: "DHT11" },
      ultrasonic: { distance: 85, label: "HC-SR04" },
      ldr: { light: 75, label: "LDR1" },
      potentiometer: { value: 50, label: "POT1" }
    };

    this.components.push({
      id,
      type,
      x,
      y,
      rotation: 0,
      props: Object.assign({}, defaults[type] || { label: type.toUpperCase() })
    });
    this.selectedId = id;
    this.render();
    this.pushHistory();
    if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
  }

  rotateSelected(deltaDeg) {
    if (!this.selectedId) return;
    const item = this.selectedId === "mcu" ? this.controller : this.components.find(c => c.id === this.selectedId);
    if (!item) return;
    item.rotation = ((item.rotation || 0) + deltaDeg + 360) % 360;
    this.render();
    this.pushHistory();
  }

  deleteSelected() {
    if (this.selectedId && this.selectedId !== "mcu") {
      const idToRemove = this.selectedId;
      this.components = this.components.filter(c => c.id !== idToRemove);
      this.wires = this.wires.filter(w => !w.from.startsWith(idToRemove + ":") && !w.to.startsWith(idToRemove + ":"));
      this.selectedId = null;
      this.render();
      this.pushHistory();
      if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
    } else if (this.wires.length > 0) {
      // Если компонент не выбран, удаляем последний проведённый провод
      this.wires.pop();
      this.render();
      this.pushHistory();
      if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
    }
  }

  resetSimulationVisuals() {
    this.mcuPinStates = {};
    this.components.forEach(c => {
      c.runtime = { lit: false, burned: false, brightness: 1 };
      if (c.type === "servo") c.props.angle = 0;
    });
  }

  bindEvents() {
    const getLogicalCoords = (e) => {
      const rect = this.stage.getBoundingClientRect();
      const scaleX = 920 / rect.width;
      const scaleY = 560 / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    this.stage.addEventListener("mousemove", (e) => {
      const pos = getLogicalCoords(e);
      this.mousePos = pos;

      if (this.draggingItem) {
        this.draggingItem.x = Math.max(10, Math.min(760, Math.round(pos.x - this.dragOffset.x)));
        this.draggingItem.y = Math.max(10, Math.min(430, Math.round(pos.y - this.dragOffset.y)));
        this.render();
        return;
      }

      if (this.activePin) {
        this.renderActiveWire();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.draggingItem) {
        this.draggingItem = null;
        this.pushHistory();
        if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
      }
    });

    // Поддержка Drag-and-Drop из центральной колонки «Библиотека»
    this.viewport.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    this.viewport.addEventListener("drop", (e) => {
      e.preventDefault();
      const compType = e.dataTransfer.getData("text/plain");
      if (!compType) return;
      const pos = getLogicalCoords(e);
      this.addComponent(compType, pos.x, pos.y);
    });

    // Сброс протяжки провода по клику на пустое поле
    this.stage.addEventListener("click", (e) => {
      if (e.target === this.stage || e.target === this.wiresSvg || e.target.tagName === "rect") {
        if (this.activePin) {
          this.activePin = null;
          this.activeWireLayer.innerHTML = "";
        }
        this.selectedId = null;
        this.render();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.activePin) {
        this.activePin = null;
        this.activeWireLayer.innerHTML = "";
        this.render();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && this.selectedId && document.activeElement.tagName !== "TEXTAREA" && document.activeElement.tagName !== "INPUT") {
        this.deleteSelected();
      }
    });
  }

  handlePinClick(fullPinId, e) {
    e.stopPropagation();
    if (!this.activePin) {
      const coords = this.getPinCoords(fullPinId);
      if (!coords) return;
      this.activePin = { fullPinId, x: coords.x, y: coords.y };
      this.render();
      this.renderActiveWire();
    } else {
      if (this.activePin.fullPinId === fullPinId) {
        this.activePin = null;
        this.activeWireLayer.innerHTML = "";
        this.render();
        return;
      }
      const exists = this.wires.some(
        w => (w.from === this.activePin.fullPinId && w.to === fullPinId) ||
             (w.from === fullPinId && w.to === this.activePin.fullPinId)
      );
      if (!exists) {
        let color = this.selectedWireColor || "#ef4444";
        const combined = (this.activePin.fullPinId + "|" + fullPinId).toUpperCase();
        if (combined.includes("GND")) color = "#2563eb";
        else if (combined.includes("5V") || combined.includes("3V3") || combined.includes("VCC")) color = "#dc2626";
        this.wires.push({
          from: this.activePin.fullPinId,
          to: fullPinId,
          color
        });
        this.pushHistory();
      }
      this.activePin = null;
      this.activeWireLayer.innerHTML = "";
      this.render();
      if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
    }
  }

  removeWire(index) {
    this.wires.splice(index, 1);
    this.render();
    this.pushHistory();
    if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
  }

  buildWirePath(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1) * 0.42 + 20;
    const dy = (y2 - y1) * 0.18;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1 + dy}, ${x2 - dx} ${y2 - dy}, ${x2} ${y2}`;
  }

  renderActiveWire() {
    if (!this.activePin) {
      this.activeWireLayer.innerHTML = "";
      return;
    }
    const d = this.buildWirePath(this.activePin.x, this.activePin.y, this.mousePos.x, this.mousePos.y);
    this.activeWireLayer.innerHTML = `
      <path d="${d}" fill="none" stroke="${this.selectedWireColor}" stroke-width="3.5" stroke-dasharray="6,4" stroke-linecap="round" />
      <circle cx="${this.mousePos.x}" cy="${this.mousePos.y}" r="4.5" fill="${this.selectedWireColor}" />
    `;
  }

  renderWires() {
    if (this.showHints && this.targetWires.length > 0) {
      this.hintWiresLayer.innerHTML = this.targetWires.map(tw => {
        const p1 = this.getPinCoords(tw.from);
        const p2 = this.getPinCoords(tw.to);
        if (!p1 || !p2) return "";
        const d = this.buildWirePath(p1.x, p1.y, p2.x, p2.y);
        return `<path d="${d}" fill="none" stroke="${tw.color || '#64748b'}" stroke-width="3" stroke-dasharray="5,5" opacity="0.45" />`;
      }).join("");
    } else {
      this.hintWiresLayer.innerHTML = "";
    }

    this.wiresLayer.innerHTML = this.wires.map((w, idx) => {
      const p1 = this.getPinCoords(w.from);
      const p2 = this.getPinCoords(w.to);
      if (!p1 || !p2) return "";
      const d = this.buildWirePath(p1.x, p1.y, p2.x, p2.y);
      const col = w.color || "#ef4444";
      return `
        <g class="wire-group" data-wire-index="${idx}">
          <path d="${d}" fill="none" stroke="transparent" stroke-width="14" />
          <path d="${d}" fill="none" stroke="rgba(15,23,42,0.18)" stroke-width="5.5" stroke-linecap="round" />
          <path d="${d}" fill="none" stroke="${col}" stroke-width="3.5" stroke-linecap="round" class="wire-main-stroke" />
          <circle cx="${p1.x}" cy="${p1.y}" r="4" fill="${col}" stroke="#ffffff" stroke-width="1.2" />
          <circle cx="${p2.x}" cy="${p2.y}" r="4" fill="${col}" stroke="#ffffff" stroke-width="1.2" />
        </g>
      `;
    }).join("");

    this.wiresLayer.querySelectorAll(".wire-group").forEach(g => {
      g.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(g.getAttribute("data-wire-index"), 10);
        this.removeWire(idx);
      });
    });
  }

  renderItemWithPins(item, isController = false) {
    const svgMarkup = window.SVG_MODELS.renderSVG(item, this.isRunning, this.mcuPinStates);
    const pins = window.SVG_MODELS.getPins(item);
    const isSelected = this.selectedId === item.id;
    const rot = item.rotation || 0;

    // Интерактивные оверлеи для датчиков (ползунки температуры, дистанции, света, кнопки настройки)
    let controlsHtml = "";
    if (!isController) {
      if (item.type === "resistor") {
        controlsHtml = `<button class="comp-mini-action" data-action="cycle-ohms" title="Сменить номинал (100 / 220 / 1к / 10к Ом)">⚙️ Номинал</button>`;
      } else if (item.type === "led") {
        controlsHtml = `<button class="comp-mini-action" data-action="cycle-color" title="Сменить цвет свечения">🎨 Цвет</button>`;
      } else if (item.type === "button") {
        controlsHtml = `<button class="comp-mini-action" data-action="toggle-btn">${item.props.pressed ? 'Отпустить' : 'Нажать'}</button>`;
      } else if (item.type === "dht11") {
        const temp = item.props.temp ?? 24;
        controlsHtml = `
          <div class="comp-slider-pop">
            <span>🌡️ ${temp}°C</span>
            <input type="range" min="0" max="55" value="${temp}" data-slider="temp" />
          </div>
        `;
      } else if (item.type === "ultrasonic") {
        const dist = item.props.distance ?? 90;
        controlsHtml = `
          <div class="comp-slider-pop">
            <span>📏 ${dist} см</span>
            <input type="range" min="5" max="200" value="${dist}" data-slider="distance" />
          </div>
        `;
      } else if (item.type === "ldr") {
        const light = item.props.light ?? 75;
        controlsHtml = `
          <div class="comp-slider-pop">
            <span>☀️ ${light}%</span>
            <input type="range" min="0" max="100" value="${light}" data-slider="light" />
          </div>
        `;
      } else if (item.type === "potentiometer") {
        const val = item.props.value ?? 50;
        controlsHtml = `
          <div class="comp-slider-pop">
            <span>🎛️ ${val}%</span>
            <input type="range" min="0" max="100" value="${val}" data-slider="value" />
          </div>
        `;
      }
    }

    const pinsHtml = pins.map(p => {
      const fullId = `${item.id}:${p.id}`;
      const isPinSel = this.activePin && this.activePin.fullPinId === fullId;
      const isWired = this.wires.some(w => w.from === fullId || w.to === fullId);
      return `
        <button class="canvas-pin-hole pin-type-${p.type} ${isPinSel ? 'pin-selected' : ''} ${isWired ? 'pin-wired' : ''}"
                style="left:${item.x + p.x}px; top:${item.y + p.y}px;"
                data-pin-id="${fullId}"
                data-pin-title="${(item.props && item.props.label) || item.type.toUpperCase()} · ${p.label}">
        </button>
      `;
    }).join("");

    return `
      <div class="canvas-item ${isSelected ? 'item-selected' : ''}"
           style="left:${item.x}px; top:${item.y}px; transform: rotate(${rot}deg);"
           data-item-id="${item.id}">
        ${svgMarkup}
        ${controlsHtml}
      </div>
      ${pinsHtml}
    `;
  }

  render() {
    const mcuHtml = this.renderItemWithPins(this.controller, true);
    const compsHtml = this.components.map(c => this.renderItemWithPins(c, false)).join("");
    this.componentsLayer.innerHTML = mcuHtml + compsHtml;
    this.renderWires();
    this.attachItemListeners();
  }

  attachItemListeners() {
    // 1. Клики и наведение на пины
    this.componentsLayer.querySelectorAll(".canvas-pin-hole").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const pinId = btn.getAttribute("data-pin-id");
        this.handlePinClick(pinId, e);
      });
      btn.addEventListener("mouseenter", () => {
        const title = btn.getAttribute("data-pin-title");
        this.pinTooltip.textContent = title;
        this.pinTooltip.style.left = btn.style.left;
        this.pinTooltip.style.top = (parseInt(btn.style.top, 10) - 24) + "px";
        this.pinTooltip.classList.remove("hidden");
      });
      btn.addEventListener("mouseleave", () => {
        this.pinTooltip.classList.add("hidden");
      });
    });

    // 2. Перетаскивание и выбор компонентов
    this.componentsLayer.querySelectorAll(".canvas-item").forEach(el => {
      const id = el.getAttribute("data-item-id");
      const item = id === "mcu" ? this.controller : this.components.find(c => c.id === id);
      if (!item) return;

      el.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
        e.stopPropagation();

        if (this.activeTool === "scissors" && id !== "mcu") {
          this.selectedId = id;
          this.deleteSelected();
          return;
        }

        this.selectedId = id;
        const rect = this.stage.getBoundingClientRect();
        const scaleX = 920 / rect.width;
        const scaleY = 560 / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        this.draggingItem = item;
        this.dragOffset = { x: mx - item.x, y: my - item.y };
        this.render();
      });

      // Мини-действия (смена номинала резистора, цвета светодиода, нажатие кнопки)
      el.querySelectorAll("[data-action]").forEach(actBtn => {
        actBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const act = actBtn.getAttribute("data-action");
          if (act === "cycle-ohms") {
            const list = [100, 220, 1000, 10000];
            item.props.resistance = list[(list.indexOf(item.props.resistance || 220) + 1) % list.length];
            this.render();
            this.pushHistory();
            if (this.callbacks.onCircuitChange) this.callbacks.onCircuitChange();
          } else if (act === "cycle-color") {
            const colors = ["red", "green", "yellow", "blue"];
            item.props.color = colors[(colors.indexOf(item.props.color || "red") + 1) % colors.length];
            this.render();
          } else if (act === "toggle-btn") {
            item.props.pressed = !item.props.pressed;
            this.render();
            if (this.callbacks.onSensorChange) this.callbacks.onSensorChange(item);
          }
        });
      });

      // Ползунки датчиков
      el.querySelectorAll("input[type='range']").forEach(slider => {
        slider.addEventListener("input", (e) => {
          e.stopPropagation();
          const prop = slider.getAttribute("data-slider");
          item.props[prop] = parseInt(slider.value, 10);
          const span = slider.parentElement.querySelector("span");
          if (span) {
            if (prop === "temp") span.textContent = `🌡️ ${item.props.temp}°C`;
            else if (prop === "distance") span.textContent = `📏 ${item.props.distance} см`;
            else if (prop === "light") span.textContent = `☀️ ${item.props.light}%`;
            else if (prop === "value") span.textContent = `🎛️ ${item.props.value}%`;
          }
          if (this.callbacks.onSensorChange) this.callbacks.onSensorChange(item);
        });
      });
    });
  }

  // ==================== ГРАФОВЫЙ АНАЛИЗАТОР СХЕМЫ ====================
  analyzeCircuit() {
    const adj = {};
    const addEdge = (a, b) => {
      if (!adj[a]) adj[a] = [];
      if (!adj[b]) adj[b] = [];
      adj[a].push(b);
      adj[b].push(a);
    };

    this.wires.forEach(w => addEdge(w.from, w.to));
    this.components.filter(c => c.type === "resistor").forEach(r => {
      addEdge(`${r.id}:t1`, `${r.id}:t2`);
    });

    const isConnectedToGnd = (startPin) => {
      const visited = new Set();
      const queue = [startPin];
      while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.startsWith("mcu:GND")) return true;
        visited.add(curr);
        (adj[curr] || []).forEach(n => {
          if (!visited.has(n)) queue.push(n);
        });
      }
      return false;
    };

    const traceToMcuSignal = (startPin) => {
      const visited = new Set();
      const queue = [{ pin: startPin, resistorOhms: null }];
      while (queue.length > 0) {
        const { pin, resistorOhms } = queue.shift();
        if (pin.startsWith("mcu:") && !pin.includes("GND")) {
          return { mcuPin: pin.split(":")[1], hasResistor: resistorOhms !== null, resistorOhms };
        }
        visited.add(pin);
        for (const next of (adj[pin] || [])) {
          if (!visited.has(next)) {
            let nextOhms = resistorOhms;
            if (next.startsWith("comp_") && (next.endsWith(":t1") || next.endsWith(":t2"))) {
              const rId = next.split(":")[0];
              const rComp = this.components.find(c => c.id === rId);
              if (rComp && rComp.type === "resistor") {
                nextOhms = rComp.props.resistance || 220;
              }
            }
            queue.push({ pin: next, resistorOhms: nextOhms });
          }
        }
      }
      return null;
    };

    const diagnostics = [];
    const ledBindings = [];
    const sensorBindings = {};

    // 1. Проверка светодиодов
    this.components.filter(c => c.type === "led").forEach(led => {
      const anodeSig = traceToMcuSignal(`${led.id}:anode`);
      const cathodeGnd = isConnectedToGnd(`${led.id}:cathode`);
      const cathodeSig = traceToMcuSignal(`${led.id}:cathode`);
      const anodeGnd = isConnectedToGnd(`${led.id}:anode`);

      if (!anodeSig && !cathodeGnd && !cathodeSig && !anodeGnd) {
        diagnostics.push({
          severity: "error",
          title: `Светодиод ${led.props.label} не подключён`,
          explanation: `Соедини Анод (+) через резистор 220 Ом с цифровым пином контроллера, а Катод (–) — с пином GND.`
        });
      } else if (cathodeSig && anodeGnd) {
        diagnostics.push({
          severity: "error",
          title: `Перепутана полярность светодиода ${led.props.label}`,
          explanation: `Светодиод проводит ток только от Анода (+) к Катоду (–). Поменяй провода местами.`
        });
      } else if (anodeSig && !cathodeGnd) {
        diagnostics.push({
          severity: "error",
          title: `Разомкнута цепь GND у светодиода ${led.props.label}`,
          explanation: `Сигнал подан с пина ${anodeSig.mcuPin}, но Катод (–) не соединён с землёй GND.`
        });
      } else if (anodeSig && cathodeGnd) {
        if (!anodeSig.hasResistor) {
          diagnostics.push({
            severity: "danger",
            title: `Светодиод ${led.props.label} подключён БЕЗ резистора!`,
            explanation: `Пин ${anodeSig.mcuPin} выдаёт 5 В. Без резистора 220 Ом ток превышает допустимый предел, и светодиод перегорает!`
          });
        }
        ledBindings.push({
          comp: led,
          mcuPin: anodeSig.mcuPin,
          hasResistor: anodeSig.hasResistor,
          resistorOhms: anodeSig.resistorOhms || 0
        });
      }
    });

    // 2. Проверка модулей (серво, экраны, NeoPixel, датчики)
    this.components.filter(c => c.type !== "led" && c.type !== "resistor").forEach(comp => {
      const pins = window.SVG_MODELS.getPins(comp);
      const sigPin = pins.find(p => ["out", "pwm", "sda", "din"].includes(p.id));
      const gndPin = pins.find(p => p.id === "gnd");

      const sigTrace = sigPin ? traceToMcuSignal(`${comp.id}:${sigPin.id}`) : null;
      const gndOk = gndPin ? isConnectedToGnd(`${comp.id}:${gndPin.id}`) : true;

      if (!sigTrace) {
        diagnostics.push({
          severity: "error",
          title: `Модуль ${comp.props.label || comp.type} не подключён к сигнальному пину`,
          explanation: `Подключи вывод ${sigPin ? sigPin.label : 'SIG'} к соответствующему пину контроллера.`
        });
      } else if (!gndOk) {
        diagnostics.push({
          severity: "error",
          title: `У модуля ${comp.props.label || comp.type} не подключён провод GND`,
          explanation: `Подключи вывод GND модуля к любому пину GND на плате контроллера.`
        });
      } else {
        sensorBindings[sigTrace.mcuPin] = comp;
      }
    });

    return {
      diagnostics,
      ledBindings,
      sensorBindings,
      isCircuitValid: diagnostics.filter(d => d.severity === "error" || d.severity === "danger").length === 0 && this.wires.length > 0
    };
  }
}

window.CircuitEngine = CircuitEngine;
