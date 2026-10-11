(() => {
  const toggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  const stage = document.querySelector("[data-trace-stage]");
  if (!stage) return;

  const rowsEl = stage.querySelector("[data-trace-rows]");
  const formulaEl = stage.querySelector("[data-trace-formula]");
  const titleEl = stage.querySelector("[data-trace-title]");
  const footEl = stage.querySelector("[data-trace-foot]");
  const hintEl = stage.querySelector("[data-key-hint]");
  const glow = stage.querySelector("[data-cell-glow]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Logo marquee is CSS-driven (infinite scroll + pause-on-hover).

  const scenes = [
    {
      title: "Trace precedents",
      formula: "=Forecasts!D58*Valuation!H12",
      foot: "ArrowDown moves · Enter drills",
      glow: { top: 100, left: 52 },
      rows: [
        { addr: "M13", val: "12.4%", nested: false },
        { addr: "Forecasts!D58", val: "48.2", nested: true },
        { addr: "Valuation!H12", val: "0.257", nested: true },
        { addr: "M12", val: "11.1%", nested: false },
      ],
    },
    {
      title: "Trace precedents",
      formula: "=B6*(1+Assumptions!C3)",
      foot: "Cross-sheet links stay visible",
      glow: { top: 70, left: 92 },
      rows: [
        { addr: "B6", val: "1,250", nested: false },
        { addr: "Assumptions!C3", val: "8.0%", nested: false },
        { addr: "Assumptions!C2", val: "Growth", nested: true },
        { addr: "B5", val: "1,157", nested: false },
      ],
    },
    {
      title: "Trace dependents",
      formula: "Who uses Revenue!E14?",
      foot: "Find every cell that depends on you",
      glow: { top: 130, left: 172 },
      rows: [
        { addr: "Summary!B4", val: "—", nested: false },
        { addr: "Bridge!F9", val: "—", nested: false },
        { addr: "Deck!C12", val: "—", nested: false },
        { addr: "Checks!A2", val: "OK", nested: true },
      ],
    },
  ];

  let sceneIndex = 0;
  let rowIndex = 0;
  let timers = [];

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }

  function renderRows(scene, active) {
    rowsEl.replaceChildren(
      ...scene.rows.map((row, i) => {
        const el = document.createElement("div");
        el.className = "trace-row" + (row.nested ? " nested" : "") + (i === active ? " active" : "");
        el.innerHTML = `<span class="addr">${row.addr}</span><span class="val">${row.val}</span>`;
        return el;
      })
    );
  }

  function flashHint(symbol) {
    if (!hintEl) return;
    hintEl.textContent = symbol;
    hintEl.classList.add("flash");
    timers.push(setTimeout(() => hintEl.classList.remove("flash"), 180));
  }

  function applyGlow(scene) {
    if (!glow) return;
    glow.style.top = scene.glow.top + "px";
    glow.style.left = scene.glow.left + "px";
  }

  function loadScene(index) {
    const scene = scenes[index];
    titleEl.textContent = scene.title;
    formulaEl.textContent = scene.formula;
    footEl.textContent = scene.foot;
    rowIndex = 0;
    renderRows(scene, 0);
    applyGlow(scene);
  }

  function step() {
    const scene = scenes[sceneIndex];
    if (rowIndex < scene.rows.length - 1) {
      rowIndex += 1;
      flashHint("↓");
      renderRows(scene, rowIndex);
      return;
    }
    flashHint("↵");
    sceneIndex = (sceneIndex + 1) % scenes.length;
    timers.push(
      setTimeout(() => {
        loadScene(sceneIndex);
      }, 420)
    );
  }

  loadScene(0);

  if (reduce) return;

  function loop() {
    step();
    timers.push(setTimeout(loop, rowIndex === 0 ? 1600 : 1100));
  }

  timers.push(setTimeout(loop, 1400));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimers();
    else if (!timers.length) {
      loadScene(sceneIndex);
      timers.push(setTimeout(loop, 800));
    }
  });
})();
