/* Whiteboard: draw, drag players, and pull the team's sets, actions, triggers,
   formations and defenses onto the call bar to show them on the court. */
(function () {
  const BH = window.BH;
  const { esc, icons } = BH;
  const D = () => BH.diagram;
  const SAVE_KEY = "bh.board";
  const STYLE_KEY = "bh.boardStyle";

  const TOOLS = [
    { id: "move", label: "Move", key: "v", icon: "move" },
    { id: "cut", label: "Cut", key: "c", icon: "cut" },
    { id: "dribble", label: "Dribble", key: "d", icon: "dribble" },
    { id: "pass", label: "Pass", key: "p", icon: "pass" },
    { id: "screen", label: "Screen", key: "s", icon: "screen" },
    { id: "pen", label: "Marker", key: "m", icon: "pen" },
    { id: "erase", label: "Erase", key: "e", icon: "eraser" },
  ];
  const COLORS = [
    { id: "", label: "Ink" },
    { id: "#5b2f9e", label: "Purple" },
    { id: "#c62828", label: "Red" },
    { id: "#1565c0", label: "Blue" },
  ];
  const TRAY = [
    ...[1, 2, 3, 4, 5].map((n) => ({ id: "o" + n, t: "o", n: String(n), label: "Offense " + n })),
    ...[1, 2, 3, 4, 5].map((n) => ({ id: "x" + n, t: "x", n: String(n), label: "Defense " + n })),
    { id: "ball", t: "ball", n: "", label: "Ball" },
    { id: "cone", t: "cone", n: "", label: "Cone" },
  ];

  const S = {
    tabs: [],
    active: null,
    tool: "move",
    color: "",
    style: BH.local.get(STYLE_KEY, "floor"),
    libKind: "all",
    libQ: "",
    pendingOpen: null,
    sheetOpen: false,
    infoOpen: true,
  };
  let root = null;
  let svg = null;
  let playToken = { cancelled: true };

  /* ---------- tabs ---------- */
  function newTab(itemId) {
    const it = itemId ? BH.store.get(itemId) : null;
    const board = it && BH.hasDiagram(it) ? BH.clone(it.diagram) : D().empty("half");
    return { key: BH.uid("t"), itemId: itemId || null, board, step: 0, history: [] };
  }
  function loadTabs() {
    const saved = BH.local.get(SAVE_KEY, null);
    if (saved && Array.isArray(saved.tabs) && saved.tabs.length) {
      S.tabs = saved.tabs
        .filter((t) => t && t.board && Array.isArray(t.board.frames) && t.board.frames.length)
        .map((t) => ({ key: t.key || BH.uid("t"), itemId: t.itemId || null, board: t.board, step: Math.min(t.step || 0, t.board.frames.length - 1), history: [] }));
      S.active = saved.active;
      S.tool = saved.tool || "move";
    }
    if (!S.tabs.some((t) => !t.itemId)) S.tabs.unshift(scratchStarter());
    if (!S.tabs.find((t) => t.key === S.active)) S.active = S.tabs[0].key;
  }
  function scratchStarter() {
    const t = newTab(null);
    // A friendly start: our five on the floor with the ball at the top.
    const sp = BH.court.SPOTS;
    t.board.frames[0].tokens = ["o1", "o2", "o3", "o4", "o5"].map((id) => ({ id, t: "o", n: id.slice(1), x: sp[id][0], y: sp[id][1] })).concat([{ id: "ball", t: "ball", n: "", x: sp.ball[0], y: sp.ball[1] }]);
    return t;
  }
  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      BH.local.set(SAVE_KEY, {
        active: S.active,
        tool: S.tool,
        tabs: S.tabs.map((t) => ({ key: t.key, itemId: t.itemId, board: t.board, step: t.step })),
      });
    }, 300);
  }
  const tab = () => S.tabs.find((t) => t.key === S.active) || S.tabs[0];
  const frame = () => {
    const t = tab();
    return t.board.frames[t.step];
  };
  function snapshot() {
    const t = tab();
    t.history.push(JSON.stringify({ board: t.board, step: t.step }));
    if (t.history.length > 60) t.history.shift();
  }
  function undo() {
    const t = tab();
    const last = t.history.pop();
    if (!last) return BH.toast("Nothing to undo.");
    const s = JSON.parse(last);
    t.board = s.board;
    t.step = s.step;
    changed();
  }
  function changed() {
    persist();
    drawBoard();
    renderSteps();
    renderInfo();
    renderCallBar();
  }
  function isModified(t) {
    if (!t.itemId) return false;
    const it = BH.store.get(t.itemId);
    if (!it) return false;
    const base = BH.hasDiagram(it) ? it.diagram : D().empty("half");
    return JSON.stringify(base) !== JSON.stringify(t.board);
  }

  function openItem(id, at) {
    stopPlay();
    let t = S.tabs.find((x) => x.itemId === id);
    if (!t) {
      t = newTab(id);
      if (at == null || at > S.tabs.length) S.tabs.push(t);
      else S.tabs.splice(at, 0, t);
    }
    S.active = t.key;
    changedAll();
  }
  function closeTab(key) {
    stopPlay();
    const i = S.tabs.findIndex((t) => t.key === key);
    if (i < 0 || !S.tabs[i].itemId) return;
    S.tabs.splice(i, 1);
    if (S.active === key) S.active = (S.tabs[i] || S.tabs[i - 1] || S.tabs[0]).key;
    changedAll();
  }
  function changedAll() {
    persist();
    drawBoard();
    renderToolbar();
    renderSteps();
    renderInfo();
    renderCallBar();
  }

  /* ---------- court drawing ---------- */
  function drawBoard() {
    if (!svg) return;
    const t = tab();
    const mode = t.board.court || "half";
    svg.setAttribute("viewBox", BH.court.viewBox(mode));
    svg.setAttribute("class", `court board-svg ${S.style} tool-${S.tool}`);
    const courtG = svg.querySelector(".court-host");
    if (courtG.dataset.mode !== mode) {
      courtG.innerHTML = BH.court.markup(mode);
      courtG.dataset.mode = mode;
    }
    svg.querySelector(".diagram-layer").innerHTML = D().frameMarkup(frame(), { interactive: true });
    const stage = BH.$(".board-stage", root);
    if (stage) stage.dataset.mode = mode;
  }

  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = pt.matrixTransform(m.inverse());
    const h = BH.court.height(tab().board.court);
    return [Math.max(-6, Math.min(506, p.x)), Math.max(-6, Math.min(h + 6, p.y))];
  }

  /* ---------- pointer handling on the court ---------- */
  let gesture = null;
  function onDown(evt) {
    if (evt.button && evt.button !== 0) return;
    stopPlay();
    const p = svgPoint(evt);
    const tokEl = evt.target.closest && evt.target.closest(".tok");
    if (S.tool === "move") {
      if (!tokEl) return;
      const id = tokEl.dataset.tok;
      const tk = frame().tokens.find((x) => x.id === id);
      if (!tk) return;
      snapshot();
      gesture = { type: "drag", id, el: tokEl, dx: tk.x - p[0], dy: tk.y - p[1], moved: false };
      tokEl.classList.add("dragging");
    } else if (S.tool === "erase") {
      snapshot();
      gesture = { type: "erase", any: false };
      eraseAt(evt);
    } else {
      let start = p;
      if (tokEl) {
        const tk = frame().tokens.find((x) => x.id === tokEl.dataset.tok);
        if (tk) start = [tk.x, tk.y];
      }
      gesture = { type: "draw", pts: [start] };
      const draft = svg.querySelector(".draft-layer");
      draft.innerHTML = `<path class="draft-line${S.tool === "pass" ? " dashed" : ""}" d="" style="${S.color ? "--ink:" + S.color : ""}" />`;
    }
    try {
      svg.setPointerCapture(evt.pointerId);
    } catch (e) {}
    evt.preventDefault();
  }
  function onMove(evt) {
    if (!gesture) return;
    const p = svgPoint(evt);
    if (gesture.type === "drag") {
      const x = p[0] + gesture.dx,
        y = p[1] + gesture.dy;
      gesture.el.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      gesture.x = x;
      gesture.y = y;
      gesture.moved = true;
    } else if (gesture.type === "draw") {
      const last = gesture.pts[gesture.pts.length - 1];
      if (D().dist(last, p) < 3) return;
      gesture.pts.push(p);
      const pts = S.tool === "pass" ? [gesture.pts[0], p] : gesture.pts;
      svg.querySelector(".draft-line").setAttribute("d", pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" "));
    } else if (gesture.type === "erase") {
      eraseAt(evt);
    }
  }
  function onUp() {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (g.type === "drag") {
      g.el.classList.remove("dragging");
      if (g.moved) {
        const tk = frame().tokens.find((x) => x.id === g.id);
        if (tk) {
          tk.x = Math.round(g.x);
          tk.y = Math.round(g.y);
        }
        changed();
      } else tab().history.pop();
    } else if (g.type === "draw") {
      svg.querySelector(".draft-layer").innerHTML = "";
      const pts = D().simplify(g.pts, S.tool === "pen" ? 1.2 : 2.5);
      const len = g.pts.reduce((a, q, i) => (i ? a + D().dist(g.pts[i - 1], q) : 0), 0);
      if (len < 14) return;
      snapshot();
      const stroke = { id: BH.uid("s"), t: S.tool, pts: S.tool === "pass" ? [pts[0], pts[pts.length - 1]] : pts };
      if (S.color) stroke.c = S.color;
      frame().strokes.push(stroke);
      changed();
    } else if (g.type === "erase") {
      if (!g.any) tab().history.pop();
      else changed();
    }
  }
  function eraseAt(evt) {
    const el = document.elementFromPoint(evt.clientX, evt.clientY);
    if (!el || !svg.contains(el)) return;
    const s = el.closest("[data-stroke]");
    const tk = el.closest(".tok");
    const f = frame();
    if (s) {
      f.strokes = f.strokes.filter((x) => x.id !== s.dataset.stroke);
      s.remove();
      gesture.any = true;
    } else if (tk) {
      f.tokens = f.tokens.filter((x) => x.id !== tk.dataset.tok);
      tk.remove();
      gesture.any = true;
    }
  }

  /* ---------- floating drag (tray players, library items) ---------- */
  function startFloatDrag(evt, kind, payload, ghostHtml) {
    const startX = evt.clientX,
      startY = evt.clientY;
    const src = evt.currentTarget;
    let ghost = null;
    try {
      src.setPointerCapture(evt.pointerId);
    } catch (e) {}
    const move = (e) => {
      if (!ghost && Math.hypot(e.clientX - startX, e.clientY - startY) > 6) {
        ghost = BH.h(`<div class="drag-ghost">${ghostHtml}</div>`);
        document.body.appendChild(ghost);
        document.body.classList.add("is-dragging");
      }
      if (ghost) {
        ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        const over = document.elementFromPoint(e.clientX, e.clientY);
        BH.$$(".drop-hot").forEach((x) => x.classList.remove("drop-hot"));
        const zone = over && (over.closest("#call-bar") || over.closest(".board-stage"));
        if (zone) zone.classList.add("drop-hot");
      }
    };
    const up = (e) => {
      src.removeEventListener("pointermove", move);
      src.removeEventListener("pointerup", up);
      src.removeEventListener("pointercancel", up);
      BH.$$(".drop-hot").forEach((x) => x.classList.remove("drop-hot"));
      document.body.classList.remove("is-dragging");
      if (!ghost) {
        if (e.type === "pointerup") onFloatClick(kind, payload);
        return;
      }
      ghost.remove();
      if (e.type !== "pointerup") return;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (!over) return;
      if (kind === "tray" && over.closest("#board-svg")) placeToken(payload, svgPoint(e));
      if (kind === "item") {
        const bar = over.closest("#call-bar");
        if (bar) {
          const chips = BH.$$(".call-chip", bar);
          let at = chips.length;
          for (let i = 0; i < chips.length; i++) {
            const r = chips[i].getBoundingClientRect();
            if (e.clientX < r.left + r.width / 2) {
              at = i;
              break;
            }
          }
          openItem(payload, Math.max(1, at));
          BH.toast(`${BH.store.get(payload).name} is on the board.`);
        } else if (over.closest(".board-stage")) {
          openItem(payload);
        }
      }
    };
    src.addEventListener("pointermove", move);
    src.addEventListener("pointerup", up);
    src.addEventListener("pointercancel", up);
  }
  function onFloatClick(kind, payload) {
    if (kind === "tray") {
      const spot = BH.court.SPOTS[payload.t === "cone" ? "cone" : payload.id] || [250, 300];
      placeToken(payload, spot, true);
    } else if (kind === "item") {
      openItem(payload);
      if (S.sheetOpen) toggleSheet(false);
    }
  }
  function placeToken(def, p, fromClick) {
    stopPlay();
    const f = frame();
    snapshot();
    if (def.t === "cone") {
      f.tokens.push({ id: BH.uid("cone"), t: "cone", n: "", x: Math.round(p[0]), y: Math.round(p[1]) });
    } else {
      const ex = f.tokens.find((x) => x.id === def.id);
      if (ex) {
        if (fromClick) {
          tab().history.pop();
          BH.toast(`${def.label} is already on the court. Drag it to move it.`);
          return;
        }
        ex.x = Math.round(p[0]);
        ex.y = Math.round(p[1]);
      } else f.tokens.push({ id: def.id, t: def.t, n: def.n, x: Math.round(p[0]), y: Math.round(p[1]) });
    }
    changed();
  }

  /* ---------- steps + playback ---------- */
  function addStep() {
    stopPlay();
    snapshot();
    const t = tab();
    const next = D().advanceFrame(frame());
    t.board.frames.splice(t.step + 1, 0, next);
    t.step += 1;
    changed();
    BH.toast(`Step ${t.step + 1}: everyone moved to the end of their line. Draw what happens next.`);
  }
  function deleteStep() {
    const t = tab();
    if (t.board.frames.length < 2) return;
    stopPlay();
    snapshot();
    t.board.frames.splice(t.step, 1);
    t.step = Math.max(0, t.step - 1);
    changed();
  }
  function goStep(i) {
    stopPlay();
    const t = tab();
    t.step = Math.max(0, Math.min(t.board.frames.length - 1, i));
    changed();
  }
  async function play() {
    const t = tab();
    if (t.board.frames.length < 2) return BH.toast("Add a second step to run this.");
    if (t.step >= t.board.frames.length - 1) t.step = 0;
    drawBoard();
    playToken = { cancelled: false };
    const tok = playToken;
    renderSteps();
    await new Promise((r) => setTimeout(r, 200));
    while (!tok.cancelled && t.step < t.board.frames.length - 1) {
      if (BH.prefersReducedMotion()) await new Promise((r) => setTimeout(r, 700));
      else if (!(await D().animateStep(svg, t.board, t.step, tok))) break;
      if (tok.cancelled) break;
      t.step += 1;
      drawBoard();
      renderSteps();
      await new Promise((r) => setTimeout(r, 600));
    }
    if (tok === playToken) {
      playToken = { cancelled: true };
      renderSteps();
      persist();
    }
  }
  function stopPlay() {
    if (!playToken.cancelled) {
      playToken.cancelled = true;
      drawBoard();
      renderSteps();
    }
  }

  /* ---------- UI pieces ---------- */
  function renderToolbar() {
    const bar = BH.$(".board-toolbar", root);
    if (!bar) return;
    const mode = tab().board.court || "half";
    bar.innerHTML = `
      <div class="tool-group" role="radiogroup" aria-label="Drawing tool">
        ${TOOLS.map((t) => `<button class="tool${S.tool === t.id ? " on" : ""}" role="radio" aria-checked="${S.tool === t.id}" data-tool="${t.id}" title="${t.label} (${t.key.toUpperCase()})">${icons[t.icon]}<span>${t.label}</span></button>`).join("")}
      </div>
      <div class="tool-group colors" aria-label="Line color">
        ${COLORS.map((c) => `<button class="swatch${S.color === c.id ? " on" : ""}" data-color="${c.id}" title="${c.label}" aria-label="${c.label} lines" style="--sw:${c.id || "var(--ink-strong)"}"></button>`).join("")}
      </div>
      <div class="tool-group">
        <button class="tool" data-act="undo" title="Undo (Ctrl+Z)">${icons.undo}<span>Undo</span></button>
        <button class="tool" data-act="clear" title="Clear this step">${icons.trash}<span>Clear</span></button>
      </div>
      <div class="tool-group seg" aria-label="Court">
        <button class="${mode === "half" ? "on" : ""}" data-court="half">Half</button>
        <button class="${mode === "full" ? "on" : ""}" data-court="full">Full</button>
      </div>
      <div class="tool-group seg" aria-label="Look">
        <button class="${S.style === "floor" ? "on" : ""}" data-style="floor">Floor</button>
        <button class="${S.style === "board" ? "on" : ""}" data-style="board">Board</button>
      </div>`;
    BH.$$("[data-tool]", bar).forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
    BH.$$("[data-color]", bar).forEach((b) =>
      b.addEventListener("click", () => {
        S.color = b.dataset.color;
        if (S.tool === "move" || S.tool === "erase") S.tool = "pen";
        renderToolbar();
        drawBoard();
      })
    );
    BH.$('[data-act="undo"]', bar).addEventListener("click", undo);
    const clr = BH.$('[data-act="clear"]', bar);
    clr.addEventListener("click", () => {
      if (clr.dataset.armed) {
        snapshot();
        const f = frame();
        f.strokes = [];
        f.tokens = [];
        changed();
        renderToolbar();
        return;
      }
      clr.dataset.armed = "1";
      clr.querySelector("span").textContent = "Tap again";
      clr.classList.add("armed");
      setTimeout(() => {
        if (!clr.isConnected) return;
        delete clr.dataset.armed;
        clr.querySelector("span").textContent = "Clear";
        clr.classList.remove("armed");
      }, 2500);
    });
    BH.$$("[data-court]", bar).forEach((b) =>
      b.addEventListener("click", () => {
        snapshot();
        tab().board.court = b.dataset.court;
        changedAll();
      })
    );
    BH.$$("[data-style]", bar).forEach((b) =>
      b.addEventListener("click", () => {
        S.style = b.dataset.style;
        BH.local.set(STYLE_KEY, S.style);
        renderToolbar();
        drawBoard();
      })
    );
  }
  function setTool(id) {
    S.tool = id;
    persist();
    renderToolbar();
    drawBoard();
  }

  function trayChip(d) {
    const mini = `<svg viewBox="-16 -16 32 32" width="30" height="30" aria-hidden="true">${D().tokenMarkup({ id: d.id, t: d.t, n: d.n, x: 0, y: 0 })}</svg>`;
    return `<button class="tray-chip" data-tray="${d.id}" title="${esc(d.label)}" aria-label="Add ${esc(d.label)}">${mini}</button>`;
  }
  function renderTray() {
    const tray = BH.$(".token-tray", root);
    tray.innerHTML = `<span class="tray-label">Players</span>${TRAY.map(trayChip).join("")}<span class="tray-hint">Tap to add · drag to place</span>`;
    BH.$$("[data-tray]", tray).forEach((b) => {
      const def = TRAY.find((x) => x.id === b.dataset.tray);
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        startFloatDrag(e, "tray", def, b.innerHTML);
      });
      b.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFloatClick("tray", def);
        }
      });
    });
  }

  function renderSteps() {
    const el = BH.$(".step-bar", root);
    if (!el) return;
    const t = tab();
    const n = t.board.frames.length;
    const playing = !playToken.cancelled;
    el.innerHTML = `
      <div class="steps">
        <button class="btn icon" data-act="prev" aria-label="Previous step" ${t.step === 0 ? "disabled" : ""}>${icons.prev}</button>
        <span class="step-label" aria-live="polite">Step <b>${t.step + 1}</b> of ${n}</span>
        <button class="btn icon" data-act="next" aria-label="Next step" ${t.step >= n - 1 ? "disabled" : ""}>${icons.next}</button>
      </div>
      <button class="btn play" data-act="play" ${n < 2 ? "disabled" : ""}>${playing ? icons.pause + "<span>Pause</span>" : icons.play + "<span>Run it</span>"}</button>
      <button class="btn" data-act="add" title="Copy this step, with everyone moved to the end of their line">${icons.plus}<span>Next step</span></button>
      ${n > 1 ? `<button class="btn ghost" data-act="del">${icons.trash}<span>Delete step</span></button>` : ""}`;
    BH.$('[data-act="prev"]', el).addEventListener("click", () => goStep(t.step - 1));
    BH.$('[data-act="next"]', el).addEventListener("click", () => goStep(t.step + 1));
    BH.$('[data-act="play"]', el).addEventListener("click", () => (playToken.cancelled ? play() : stopPlay()));
    BH.$('[data-act="add"]', el).addEventListener("click", addStep);
    const del = BH.$('[data-act="del"]', el);
    if (del) del.addEventListener("click", deleteStep);
  }

  function renderCallBar() {
    const bar = BH.$("#call-bar", root);
    if (!bar) return;
    bar.innerHTML = `
      <span class="bar-label">Call bar</span>
      <div class="call-chips">
        ${S.tabs
          .map((t) => {
            const it = t.itemId ? BH.store.get(t.itemId) : null;
            const name = t.itemId ? (it ? it.name : "Removed item") : "Scratch board";
            const kind = it ? it.kind : "scratch";
            return `<div class="call-chip${t.key === S.active ? " on" : ""} k-${esc(kind)}" data-key="${t.key}">
              <button class="chip-main" data-pick="${t.key}" aria-pressed="${t.key === S.active}"><i class="dot"></i>${esc(name)}${isModified(t) ? '<em title="Changed on this device">•</em>' : ""}</button>
              ${t.itemId ? `<button class="chip-x" data-close="${t.key}" aria-label="Take ${esc(name)} off the bar">${icons.x}</button>` : ""}
            </div>`;
          })
          .join("")}
        <span class="drop-hint">Drag a play here</span>
      </div>
      <button class="btn lib-toggle" data-act="lib">${icons.library}<span>Library</span></button>`;
    BH.$$("[data-pick]", bar).forEach((b) =>
      b.addEventListener("click", () => {
        stopPlay();
        S.active = b.dataset.pick;
        changedAll();
      })
    );
    BH.$$("[data-close]", bar).forEach((b) => b.addEventListener("click", () => closeTab(b.dataset.close)));
    BH.$('[data-act="lib"]', bar).addEventListener("click", () => toggleSheet());
  }

  function renderLibrary() {
    const lib = BH.$("#lib-drawer", root);
    if (!lib) return;
    const kinds = ["set", "action", "trigger", "formation", "defense"];
    const items = BH.store.items();
    const q = S.libQ.toLowerCase();
    const list = items.filter((i) => (S.libKind === "all" ? true : i.kind === S.libKind) && (!q || (i.name + " " + i.call).toLowerCase().includes(q)));
    const order = (k) => {
      const i = kinds.indexOf(k);
      return i < 0 ? 9 : i;
    };
    list.sort((a, b) => order(a.kind) - order(b.kind) || a.name.localeCompare(b.name));
    lib.innerHTML = `
      <header class="lib-head">
        <h2>Library</h2>
        <button class="btn icon sheet-close" data-act="close" aria-label="Close library">${icons.x}</button>
      </header>
      <label class="search small">${icons.search}<input id="lib-search" type="search" placeholder="Find a set or action" value="${esc(S.libQ)}" autocomplete="off" /></label>
      <div class="lib-kinds">
        <button class="chip${S.libKind === "all" ? " on" : ""}" data-lk="all">All</button>
        ${kinds.map((k) => `<button class="chip${S.libKind === k ? " on" : ""}" data-lk="${k}">${esc(BH.kind(k).label)}</button>`).join("")}
      </div>
      <ul class="lib-list">
        ${
          list.length
            ? list
                .map(
                  (it) => `<li><button class="lib-item k-${esc(it.kind)}" data-lib="${esc(it.id)}">
                  <span class="lib-grip">${icons.grip}</span>
                  <span class="lib-text"><b>${esc(it.name)}</b><small>${esc(BH.kind(it.kind).one)}${it.call ? " · " + esc(it.call) : ""}</small></span>
                  ${BH.hasDiagram(it) ? `<span class="lib-has" title="Has a diagram">${icons.board}</span>` : ""}
                </button></li>`
                )
                .join("")
            : `<li class="lib-empty">${items.length ? "No matches." : "Nothing installed yet."}</li>`
        }
      </ul>
      <p class="lib-hint">Drag onto the call bar, or tap to put it on the court.</p>`;
    const input = BH.$("#lib-search", lib);
    input.addEventListener("input", () => {
      S.libQ = input.value;
      const pos = input.selectionStart;
      renderLibrary();
      const again = BH.$("#lib-search", root);
      again.focus();
      try {
        again.setSelectionRange(pos, pos);
      } catch (e) {}
    });
    BH.$$("[data-lk]", lib).forEach((b) =>
      b.addEventListener("click", () => {
        S.libKind = b.dataset.lk;
        renderLibrary();
      })
    );
    BH.$('[data-act="close"]', lib).addEventListener("click", () => toggleSheet(false));
    BH.$$("[data-lib]", lib).forEach((b) => {
      const it = BH.store.get(b.dataset.lib);
      b.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        startFloatDrag(e, "item", it.id, `<span class="ghost-chip k-${esc(it.kind)}"><i class="dot"></i>${esc(it.name)}</span>`);
      });
      b.addEventListener("click", (e) => {
        // Keyboard activation (pointer clicks are handled by the drag helper).
        if (e.detail === 0) onFloatClick("item", it.id);
      });
    });
  }

  function renderInfo() {
    const box = BH.$("#board-info", root);
    if (!box) return;
    const t = tab();
    const it = t.itemId ? BH.store.get(t.itemId) : null;
    const coach = BH.store.isCoach;
    const modified = isModified(t);
    if (!it) {
      box.innerHTML = `
        <div class="info-card">
          <p class="eyebrow">On the court</p>
          <h2>${t.itemId ? "Removed from the playbook" : "Scratch board"}</h2>
          <p>Draw anything here. Pick a tool, then drag on the court. Lines that start on a player move that player when you hit <b>Run it</b>.</p>
          <ol class="howto">
            <li><b>Players:</b> tap one in the tray, then drag it where it goes.</li>
            <li><b>Lines:</b> Cut, Dribble, Pass and Screen each draw our standard symbol.</li>
            <li><b>Next step</b> moves everyone to the end of their line so you can draw the next part.</li>
            <li><b>Library:</b> drag our sets, actions, triggers and defenses onto the call bar to put them up.</li>
          </ol>
          ${coach ? `<div class="coach-box"><p class="eyebrow">Coach</p><button class="btn primary" data-act="save-new">${icons.save} Save as a new item</button></div>` : ""}
        </div>`;
    } else {
      const k = BH.kind(it.kind);
      box.innerHTML = `
        <div class="info-card">
          <div class="card-meta"><span class="kind-chip k-${esc(it.kind)}">${esc(k.one)}</span>${it.example ? '<span class="ex-chip">Example</span>' : ""}</div>
          <h2>${esc(it.name)}</h2>
          ${it.call ? `<p class="call"><span>Call</span> ${esc(it.call)}</p>` : ""}
          ${it.summary ? `<p>${esc(it.summary)}</p>` : ""}
          ${it.keys.length ? `<h3>Keys</h3><ul class="keys">${it.keys.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${it.reads.length ? `<h3>Reads</h3><ul class="reads">${it.reads.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${!BH.hasDiagram(it) ? `<p class="muted">No diagram yet${coach ? ". Draw it on the court and save it here." : "."}</p>` : ""}
          <div class="info-actions">
            <a class="btn ghost" href="#item-${esc(it.id)}">${icons.book} Open in playbook</a>
            ${modified ? `<button class="btn ghost" data-act="reset">${icons.undo} Reset to coach's version</button>` : ""}
          </div>
          ${modified && !coach ? `<p class="muted small">Your drawing stays on this device.</p>` : ""}
          ${coach ? `<div class="coach-box"><p class="eyebrow">Coach</p><button class="btn primary" data-act="save-to" ${modified || !BH.hasDiagram(it) ? "" : "disabled"}>${icons.save} Save diagram to “${esc(it.name)}”</button><button class="btn ghost" data-act="save-new">${icons.plus} Save as a new item</button></div>` : ""}
        </div>`;
    }
    const reset = BH.$('[data-act="reset"]', box);
    if (reset)
      reset.addEventListener("click", () => {
        snapshot();
        t.board = BH.hasDiagram(it) ? BH.clone(it.diagram) : D().empty("half");
        t.step = 0;
        changedAll();
      });
    const saveTo = BH.$('[data-act="save-to"]', box);
    if (saveTo)
      saveTo.addEventListener("click", async () => {
        if (!saveTo.dataset.armed) {
          saveTo.dataset.armed = "1";
          saveTo.innerHTML = `${icons.save} Tap again to replace the diagram`;
          setTimeout(() => {
            if (saveTo.isConnected) renderInfo();
          }, 3000);
          return;
        }
        saveTo.disabled = true;
        const ok = await BH.store.saveItem({ ...it, diagram: BH.clone(t.board) }, `Saved the diagram for ${it.name}.`);
        if (ok) changedAll();
        else renderInfo();
      });
    const saveNew = BH.$('[data-act="save-new"]', box);
    if (saveNew)
      saveNew.addEventListener("click", () => {
        if (BH.install) BH.install.queueNew({ diagram: BH.clone(t.board), kind: it ? it.kind : "set" });
        location.hash = "#install";
      });
  }

  function toggleSheet(force) {
    S.sheetOpen = force == null ? !S.sheetOpen : force;
    const v = BH.$(".view-board", root);
    if (v) v.classList.toggle("sheet-open", S.sheetOpen);
  }

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (!root || !root.isConnected || !BH.$(".view-board", root)) return;
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return undo();
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
    if (t) return setTool(t.id);
    if (e.key === "ArrowRight") goStep(tab().step + 1);
    if (e.key === "ArrowLeft") goStep(tab().step - 1);
    if (e.key === "Escape" && S.sheetOpen) toggleSheet(false);
  }
  document.addEventListener("keydown", onKey);

  /* ---------- view ---------- */
  function render(host) {
    root = host;
    if (!S.tabs.length) loadTabs();
    // Drop tabs whose item was deleted (but keep scratch).
    S.tabs = S.tabs.filter((t) => !t.itemId || BH.store.get(t.itemId));
    if (!S.tabs.find((t) => t.key === S.active)) S.active = S.tabs[0].key;
    if (S.pendingOpen) {
      const id = S.pendingOpen;
      S.pendingOpen = null;
      if (BH.store.get(id)) {
        let t = S.tabs.find((x) => x.itemId === id);
        if (!t) S.tabs.push((t = newTab(id)));
        S.active = t.key;
      }
    }
    host.innerHTML = `
      <section class="view-board${S.sheetOpen ? " sheet-open" : ""}">
        <aside class="lib-drawer" id="lib-drawer" aria-label="Library"></aside>
        <div class="board-main">
          <div class="board-toolbar"></div>
          <div class="token-tray"></div>
          <div class="call-bar" id="call-bar"></div>
          <div class="board-stage">
            <svg id="board-svg" class="court board-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Basketball court whiteboard">
              <g class="court-host"></g>
              <g class="diagram-layer"></g>
              <g class="draft-layer"></g>
            </svg>
          </div>
          <div class="step-bar"></div>
        </div>
        <aside class="board-info" id="board-info"></aside>
        <div class="sheet-scrim" data-act="scrim"></div>
      </section>`;
    svg = BH.$("#board-svg", host);
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    BH.$('[data-act="scrim"]', host).addEventListener("click", () => toggleSheet(false));
    renderTray();
    renderLibrary();
    changedAll();
  }

  BH.on("program", () => {
    if (root && root.isConnected && BH.$(".view-board", root)) {
      renderLibrary();
      renderCallBar();
      renderInfo();
    }
  });
  BH.on("role", () => {
    if (root && root.isConnected && BH.$(".view-board", root)) renderInfo();
  });

  BH.board = {
    render,
    leave() {
      stopPlay();
      S.sheetOpen = false;
    },
    queueOpen(id) {
      S.pendingOpen = id;
    },
  };
})();
