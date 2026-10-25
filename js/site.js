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

  // Logo strip: static wrap/grid only (scroll+overflow/mask was mid-glyph chopping wordmarks).
  document.querySelectorAll("[data-marquee]").forEach((marquee) => {
    marquee.classList.add("is-static");
  });

  const stage = document.querySelector("[data-trace-stage]");
  if (!stage) return;

  const rowsEl = stage.querySelector("[data-trace-rows]");
  const formulaEl = stage.querySelector("[data-trace-formula]");
  const titleEl = stage.querySelector("[data-trace-title]");
  const footEl = stage.querySelector("[data-trace-foot]");
  const hintEl = stage.querySelector("[data-key-hint]");
  const glow = stage.querySelector("[data-cell-glow]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    }
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

// Install now: one option list for the hero button and every header button.
(() => {
  const OPTIONS = [
    {
      href: "https://chromewebstore.google.com/detail/ljlmgielacploapelnjhodicgbjipcaa",
      label: "For Google Sheets",
      sub: "Chrome add-on — free",
      store: true,
    },
    {
      href: "/downloads/SheetSpeed-Mac.zip",
      label: "For Excel on Mac",
      sub: "macOS app — free",
      download: true,
    },
    {
      href: "/datasniper/",
      label: "DataSniper",
      sub: "Excel add-in — free",
    },
  ];

  const widgets = new Set();
  const menus = new WeakMap();

  function fillMenu(menu) {
    menu.replaceChildren();
    menu.setAttribute("role", "menu");
    for (const opt of OPTIONS) {
      const link = document.createElement("a");
      link.href = opt.href;
      link.setAttribute("role", "menuitem");
      if (opt.store) {
        link.setAttribute("data-store-cta", "");
        link.rel = "noopener";
      }
      if (opt.download) link.setAttribute("download", "");
      link.append(opt.label);
      const sub = document.createElement("small");
      sub.textContent = opt.sub;
      link.append(sub);
      menu.append(link);
    }
  }

  function items(menu) {
    return [...menu.querySelectorAll('[role="menuitem"]')];
  }

  function placeHeaderMenu(btn, menu) {
    const rect = btn.getBoundingClientRect();
    const right = Math.max(12, window.innerWidth - rect.right);
    menu.style.position = "fixed";
    menu.style.top = `${Math.round(rect.bottom + 8)}px`;
    menu.style.right = `${Math.round(right)}px`;
    menu.style.left = "auto";
    menu.style.transform = "none";
    menu.style.zIndex = "80";
    menu.style.maxWidth = "calc(100vw - 24px)";
    document.body.appendChild(menu);
  }

  function clearPlace(menu) {
    menu.style.position = "";
    menu.style.top = "";
    menu.style.right = "";
    menu.style.left = "";
    menu.style.transform = "";
    menu.style.zIndex = "";
    menu.style.maxWidth = "";
  }

  function close(root, focusBtn) {
    const btn = root.querySelector("button");
    const menu = menus.get(root);
    if (!btn || !menu || menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (root.classList.contains("m-install--header")) {
      clearPlace(menu);
      root.appendChild(menu);
    }
    if (focusBtn) btn.focus();
  }

  function closeAll(except) {
    widgets.forEach((root) => {
      if (root !== except) close(root, false);
    });
  }

  function open(root) {
    const btn = root.querySelector("button");
    const menu = menus.get(root);
    closeAll(root);
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if (root.classList.contains("m-install--header")) placeHeaderMenu(btn, menu);
  }

  function bind(root) {
    const btn = root.querySelector("button");
    const menu = root.querySelector(".m-install-menu");
    if (!btn || !menu || root.dataset.bound) return;
    root.dataset.bound = "1";
    menus.set(root, menu);
    widgets.add(root);
    btn.setAttribute("aria-haspopup", "menu");
    if (!menu.id) menu.id = `install-menu-${widgets.size}`;
    btn.setAttribute("aria-controls", menu.id);

    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (menu.hidden) open(root);
      else close(root, false);
    });

    btn.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      open(root);
      const list = items(menu);
      const target = event.key === "ArrowUp" ? list[list.length - 1] : list[0];
      if (target) target.focus();
    });

    menu.addEventListener("keydown", (event) => {
      const list = items(menu);
      const index = list.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        close(root, true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        list[(index + 1) % list.length]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        list[(index - 1 + list.length) % list.length]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        list[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        list[list.length - 1]?.focus();
      } else if (event.key === "Tab") {
        close(root, false);
      }
    });
  }

  document.querySelectorAll("a.x-cta[data-store-cta]").forEach((link) => {
    const root = document.createElement("div");
    root.className = "m-install m-install--header";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "x-cta";
    btn.textContent = "Install now";
    const menu = document.createElement("div");
    menu.className = "m-install-menu";
    menu.hidden = true;
    root.append(btn, menu);
    link.replaceWith(root);
  });

  document.querySelectorAll(".m-install").forEach((root) => {
    const menu = root.querySelector(".m-install-menu");
    if (menu) fillMenu(menu);
    bind(root);
  });

  document.addEventListener("pointerdown", (event) => {
    widgets.forEach((root) => {
      const menu = menus.get(root);
      if (!menu || menu.hidden) return;
      if (!root.contains(event.target) && !menu.contains(event.target)) close(root, false);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    widgets.forEach((root) => close(root, false));
  });

  const reposition = () => {
    widgets.forEach((root) => {
      const menu = menus.get(root);
      const btn = root.querySelector("button");
      if (!menu || menu.hidden || !btn || !root.classList.contains("m-install--header")) return;
      placeHeaderMenu(btn, menu);
    });
  };
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
})();
