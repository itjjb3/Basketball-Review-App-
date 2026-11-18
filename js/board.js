/* Whiteboard: draw, drag players, and build the call. Sets, triggers and
   formations play as drawn. Actions like Rub, Twirl and Swing run from wherever
   the ball is, so a chain of them on the call bar plays as one possession. */
(function () {
  const BH = window.BH;
  const { esc, icons } = BH;
  const D = () => BH.diagram;
  const E = () => BH.engine;
  const SAVE_KEY = "bh.call";
  const OLD_KEY = "bh.board";
  const STYLE_KEY = "bh.boardStyle";

  const TOOLS = [
    { id: "move", label: "Move", key: "v", icon: "move" },
    { id: "cut", label: "Cut", key: "c", icon: "cut" },
    { id: "dribble", label: "Dribble", key: "d", icon: "dribble" },
    { id: "pass", label: "Pass", key: "p", icon: "pass" },
    { id: "handoff", label: "Handoff", key: "h", icon: "handoff" },
    { id: "shot", label: "Shot", key: "t", icon: "shot" },
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
    board: null,
    step: 0,
    segs: [], // the call: [{ id, itemId, start, base?, parts? }]
    history: [],
    note: null, // an item without a diagram whose notes are showing
    tool: "move",
    color: "",
    style: BH.local.get(STYLE_KEY, "floor"),
    libKind: "all",
    libQ: "",
    pendingOpen: null,
    sheetOpen: false,
  };
  let root = null;
  let svg = null;
  let playToken = { cancelled: true };

  /* ---------- the board ---------- */
  function scratchBoard() {
    // A friendly start: our five on the floor with the ball at the top.
    const sp = BH.court.SPOTS;
    return {
      court: "half",
      frames: [{ tokens: ["o1", "o2", "o3", "o4", "o5"].map((id) => ({ id, t: "o", n: id.slice(1), x: sp[id][0], y: sp[id][1] })).concat([{ id: "ball", t: "ball", n: "", x: sp.ball[0], y: sp.ball[1] }]), strokes: [] }],
    };
  }
  const okBoard = (b) => b && Array.isArray(b.frames) && b.frames.length;
  function load() {
    const saved = BH.local.get(SAVE_KEY, null);
    if (saved && okBoard(saved.board)) {
      S.board = saved.board;
      S.segs = Array.isArray(saved.segs) ? saved.segs : [];
      S.step = Math.min(saved.step || 0, S.board.frames.length - 1);
      S.tool = saved.tool || "move";
      return;
    }
    // Earlier versions kept a board per tab: carry over the one that was open.
    const old = BH.local.get(OLD_KEY, null);
    const t = old && Array.isArray(old.tabs) && (old.tabs.find((x) => x.key === old.active) || old.tabs[0]);
    if (t && okBoard(t.board)) {
      S.board = t.board;
      S.step = Math.min(t.step || 0, t.board.frames.length - 1);
      S.segs = t.itemId ? [{ id: BH.uid("g"), itemId: t.itemId, start: 0, base: true }] : [];
      S.tool = old.tool || "move";
    } else {
      S.board = scratchBoard();
      S.segs = [];
      S.step = 0;
    }
  }
  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => BH.local.set(SAVE_KEY, { board: S.board, step: S.step, segs: S.segs, tool: S.tool }), 300);
  }
  const frame = () => S.board.frames[S.step];
  function snapshot() {
    S.history.push(JSON.stringify({ board: S.board, step: S.step, segs: S.segs }));
    if (S.history.length > 60) S.history.shift();
  }
  function undo() {
    const last = S.history.pop();
    if (!last) return BH.toast("Nothing to undo.");
    const v = JSON.parse(last);
    S.board = v.board;
    S.step = v.step;
    S.segs = v.segs;
    changedAll();
  }
  function changed() {
    persist();
    drawBoard();
    renderSteps();
    renderInfo();
    renderCallBar();
  }
  function changedAll() {
    persist();
    drawBoard();
    renderToolbar();
    renderSteps();
    renderInfo();
    renderCallBar();
  }

  /* ---------- the call ---------- */
  const segItem = (seg) => (seg ? BH.store.get(seg.itemId) : null);
  function segAt(step) {
    let cur = null;
    S.segs.forEach((g) => {
      if (g.start <= step) cur = g;
    });
    return cur;
  }
  /* The item whose notes go with a step (inside Continuity, the action it's replaying). */
  function itemAt(step) {
    const g = segAt(step);
    if (!g) return null;
    if (g.parts) {
      let p = g.parts[0];
      g.parts.forEach((x) => {
        if (x.start <= step) p = x;
      });
      return BH.store.get(p.itemId);
    }
    return segItem(g);
  }
  function isModified() {
    const g = S.segs.length === 1 && S.segs[0].base ? S.segs[0] : null;
    const it = segItem(g);
    return !!(it && BH.hasDiagram(it) && JSON.stringify(it.diagram) !== JSON.stringify(S.board));
  }

  /* Add an item to the end of the call. Returns true if it went on the court. */
  function addToCall(itemId, opts = {}) {
    const it = BH.store.get(itemId);
    if (!it) return false;
    const rule = BH.isAuto(it) ? it.rule : null;
    if (!opts.silent) {
      stopPlay();
      snapshot();
    }
    let ok;
    if (rule === "continuity") ok = runContinuity(it, opts);
    else if (rule) ok = appendRule(it, opts);
    else if (BH.hasDiagram(it)) ok = appendDrawn(it);
    else {
      if (!opts.silent) {
        S.history.pop();
        S.note = it.id;
        renderInfo();
        BH.toast(`${it.name} doesn't have a diagram yet. Its notes are on the right.`);
      }
      return false;
    }
    if (!opts.silent) {
      if (!ok) S.history.pop();
      S.note = null;
      changedAll();
    }
    return ok;
  }
  function appendRule(it, opts) {
    // Straight out of a trigger (a Thru), its down screen is the backside action.
    const prev = segItem(S.segs[S.segs.length - 1]);
    const res = E().extend(S.board.frames, it.rule, { noBackside: !!(prev && prev.kind === "trigger") });
    if (res.error) {
      if (!opts.silent) BH.toast(`Couldn't run ${it.name}: ${res.error}`);
      return false;
    }
    S.board.frames = res.frames;
    S.segs.push({ id: BH.uid("g"), itemId: it.id, start: res.start });
    S.step = res.start;
    return true;
  }
  function appendDrawn(it) {
    const dg = BH.clone(it.diagram);
    if (!S.segs.length) {
      S.board = dg;
      S.segs = [{ id: BH.uid("g"), itemId: it.id, start: 0, base: true }];
      S.step = 0;
      return true;
    }
    // Players walk from where they are into the play's first spots, then run it.
    const fr = S.board.frames;
    const last = fr[fr.length - 1];
    if (last.strokes && last.strokes.length) fr.push(D().advanceFrame(last));
    const start = fr.length - 1;
    fr.push(...dg.frames);
    if (dg.court === "full") S.board.court = "full";
    S.segs.push({ id: BH.uid("g"), itemId: it.id, start });
    S.step = start;
    return true;
  }
  /* The Auto actions in the call since the last drawn play (what Continuity repeats). */
  function baseActions(upto) {
    let from = 0;
    S.segs.slice(0, upto).forEach((g, i) => {
      if (!BH.isAuto(segItem(g))) from = i + 1;
    });
    return S.segs
      .slice(from, upto)
      .map(segItem)
      .filter((x) => x && BH.isAuto(x) && x.rule !== "continuity")
      .map((x) => x.id);
  }
  /* Run the actions once more inside a Continuity piece. Returns how many ran. */
  function runCycle(cont, actions) {
    const before = S.segs.length;
    actions.forEach((id) => appendRule(BH.store.get(id), { silent: true }));
    const parts = S.segs.splice(before);
    cont.parts.push(...parts.map((p) => ({ itemId: p.itemId, start: p.start })));
    if (parts.length) cont.cycles = (cont.cycles || 0) + 1;
    return parts.length;
  }
  const MAX_CYCLES = 10;
  function runContinuity(it, opts) {
    const actions = baseActions(S.segs.length);
    if (!actions.length) {
      if (!opts.silent) BH.toast("Add some actions first. Continuity keeps running them side to side.");
      return false;
    }
    const cont = { id: BH.uid("g"), itemId: it.id, start: 0, parts: [], cycles: 0 };
    // Over to the other side and back; Run it keeps going from there.
    for (let c = 0; c < 2; c++) if (!runCycle(cont, actions)) break;
    if (!cont.parts.length) {
      if (!opts.silent) BH.toast("Continuity can't run from here.");
      return false;
    }
    cont.start = cont.parts[0].start;
    S.segs.push(cont);
    S.step = cont.start;
    return true;
  }
  /* While Run it plays a call that ends in Continuity, keep adding trips side to side. */
  function keepGoing() {
    const cont = S.segs[S.segs.length - 1];
    const it = segItem(cont);
    if (!cont || !it || it.rule !== "continuity" || !cont.parts || (cont.cycles || 0) >= MAX_CYCLES) return false;
    const ran = runCycle(cont, baseActions(S.segs.length - 1));
    if (ran) renderCallBar();
    return ran > 0;
  }
  /* Take one item out of the call; everything after it is rebuilt. */
  function removeSeg(i) {
    stopPlay();
    snapshot();
    const g = S.segs[i];
    const rest = S.segs.slice(i + 1).map((x) => x.itemId);
    if (g.base) {
      S.board = scratchBoard();
      S.segs = [];
    } else {
      S.board.frames.length = g.start + 1;
      S.board.frames[g.start].strokes = [];
      S.segs = S.segs.slice(0, i);
    }
    const skipped = rest.filter((id) => !addToCall(id, { silent: true }));
    S.step = Math.min(S.step, S.board.frames.length - 1);
    if (skipped.length) BH.toast(`Couldn't run ${skipped.map((id) => (BH.store.get(id) || {}).name).join(", ")} from here, so it came off the call.`);
    changedAll();
  }
  function newCall() {
    stopPlay();
    snapshot();
    S.board = scratchBoard();
    S.segs = [];
    S.step = 0;
    S.note = null;
    changedAll();
  }
  /* Start a fresh call with one item. Actions start from 4-Out so there's a possession to run. */
  function startCall(id) {
    const it = BH.store.get(id);
    if (!it) return;
    S.board = scratchBoard();
    S.segs = [];
    S.step = 0;
    S.note = null;
    if (BH.isAuto(it) && BH.store.get("4-out")) addToCall("4-out", { silent: true });
    if (!addToCall(id, { silent: true }) && !BH.hasDiagram(it)) S.note = id;
    S.step = 0;
  }

  /* ---------- court drawing ---------- */
  function drawBoard() {
    if (!svg) return;
    const mode = S.board.court || "half";
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
    const h = BH.court.height(S.board.court);
    return [Math.max(-6, Math.min(506, p.x)), Math.max(-6, Math.min(h + 6, p.y))];
  }

  /* Snap a point to a player, or to the end of a line already drawn this step,
     so a pass can start where a dribble ends and finish where a cut ends. */
  function snapPoint(p, exceptTok) {
    const f = frame();
    let best = null,
      bd = 24;
    (f.tokens || []).forEach((t) => {
      if (t.id === exceptTok || t.t === "cone") return;
      const dd = D().dist(p, [t.x, t.y]);
      if (dd < bd) (bd = dd), (best = { pt: [t.x, t.y], tok: t.id });
    });
    (f.strokes || []).forEach((st) => {
      if (st.t === "pen" || st.t === "shot" || !st.pts || st.pts.length < 2) return;
      const e = st.pts[st.pts.length - 1];
      const dd = D().dist(p, e);
      if (dd < bd) (bd = dd), (best = { pt: e.slice(), tok: null });
    });
    return best;
  }
  const STRAIGHT = ["pass", "handoff"];
  const pathD = (pts) => pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ");

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
      let fromTok = null;
      const tk = tokEl && frame().tokens.find((x) => x.id === tokEl.dataset.tok);
      if (tk) {
        start = [tk.x, tk.y];
        fromTok = tk.id;
      } else if (S.tool !== "pen") {
        const snap = snapPoint(p);
        if (snap) {
          start = snap.pt;
          fromTok = snap.tok;
        }
      }
      gesture = { type: "draw", pts: [start], fromTok, snapped: start !== p };
      const draft = svg.querySelector(".draft-layer");
      const cls = S.tool === "pass" ? " dashed" : S.tool === "shot" ? " dotted" : "";
      draft.innerHTML = `<path class="draft-line${cls}" d="" style="${S.color ? "--ink:" + S.color : ""}" />`;
      if (S.tool === "shot") svg.querySelector(".draft-line").setAttribute("d", pathD(D().shotCurve(start, D().nearestRim(start, S.board.court))));
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
      let pts = gesture.pts;
      if (STRAIGHT.includes(S.tool)) pts = [gesture.pts[0], p];
      if (S.tool === "shot") pts = D().shotCurve(gesture.pts[0], D().nearestRim(p, S.board.court));
      svg.querySelector(".draft-line").setAttribute("d", pathD(pts));
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
          if (tk.t === "ball") delete tk.h;
        }
        changed();
      } else S.history.pop();
    } else if (g.type === "draw") {
      svg.querySelector(".draft-layer").innerHTML = "";
      const pts = D().simplify(g.pts, S.tool === "pen" ? 1.2 : 2.5);
      const len = g.pts.reduce((a, q, i) => (i ? a + D().dist(g.pts[i - 1], q) : 0), 0);
      const last = g.pts[g.pts.length - 1];
      let stroke;
      if (S.tool === "shot") {
        // A tap on the shooter is enough: the shot always goes to the nearest rim.
        if (len < 14 && !g.snapped) return;
        stroke = { id: BH.uid("s"), t: "shot", pts: [g.pts[0], D().nearestRim(len < 14 ? g.pts[0] : last, S.board.court)] };
      } else {
        if (len < 14) return;
        let end = pts[pts.length - 1];
        if (STRAIGHT.includes(S.tool)) {
          const snap = snapPoint(last, g.fromTok);
          if (snap && D().dist(snap.pt, g.pts[0]) > 10) end = snap.pt;
          stroke = { id: BH.uid("s"), t: S.tool, pts: [pts[0], end] };
        } else stroke = { id: BH.uid("s"), t: S.tool, pts };
      }
      snapshot();
      if (S.color) stroke.c = S.color;
      frame().strokes.push(stroke);
      changed();
    } else if (g.type === "erase") {
      if (!g.any) S.history.pop();
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
        if (over.closest("#call-bar") || over.closest(".board-stage")) addToCall(payload);
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
      addToCall(payload);
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
          S.history.pop();
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
    const next = D().advanceFrame(frame());
    S.board.frames.splice(S.step + 1, 0, next);
    S.step += 1;
    changed();
    BH.toast(`Step ${S.step + 1}: everyone moved to the end of their line. Draw what happens next.`);
  }
  function deleteStep() {
    if (S.board.frames.length < 2) return;
    stopPlay();
    snapshot();
    S.board.frames.splice(S.step, 1);
    S.step = Math.max(0, S.step - 1);
    changed();
  }
  function goStep(i) {
    stopPlay();
    S.step = Math.max(0, Math.min(S.board.frames.length - 1, i));
    changed();
  }
  async function play() {
    const b = S.board;
    if (b.frames.length < 2) return BH.toast("Add a second step to run this.");
    if (S.step >= b.frames.length - 1) S.step = 0;
    drawBoard();
    playToken = { cancelled: false };
    const tok = playToken;
    renderSteps();
    await new Promise((r) => setTimeout(r, 200));
    while (!tok.cancelled && S.board === b && (S.step < b.frames.length - 1 || keepGoing())) {
      if (BH.prefersReducedMotion()) await new Promise((r) => setTimeout(r, 700));
      else if (!(await D().animateStep(svg, b, S.step, tok))) break;
      if (tok.cancelled) break;
      S.step += 1;
      drawBoard();
      renderSteps();
      renderInfo();
      renderCallBar();
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
    const mode = S.board.court || "half";
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
        S.board.court = b.dataset.court;
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
    const n = S.board.frames.length;
    const playing = !playToken.cancelled;
    const here = itemAt(S.step);
    el.innerHTML = `
      <div class="steps">
        <button class="btn icon" data-act="prev" aria-label="Previous step" ${S.step === 0 ? "disabled" : ""}>${icons.prev}</button>
        <span class="step-label" aria-live="polite">Step <b>${S.step + 1}</b> of ${n}${here ? ` <em>· ${esc(here.name)}</em>` : ""}</span>
        <button class="btn icon" data-act="next" aria-label="Next step" ${S.step >= n - 1 ? "disabled" : ""}>${icons.next}</button>
      </div>
      <button class="btn play" data-act="play" ${n < 2 ? "disabled" : ""}>${playing ? icons.pause + "<span>Pause</span>" : icons.play + "<span>Run it</span>"}</button>
      <button class="btn" data-act="add" title="Copy this step, with everyone moved to the end of their line">${icons.plus}<span>Next step</span></button>
      ${n > 1 ? `<button class="btn ghost" data-act="del">${icons.trash}<span>Delete step</span></button>` : ""}`;
    BH.$('[data-act="prev"]', el).addEventListener("click", () => goStep(S.step - 1));
    BH.$('[data-act="next"]', el).addEventListener("click", () => goStep(S.step + 1));
    BH.$('[data-act="play"]', el).addEventListener("click", () => (playToken.cancelled ? play() : stopPlay()));
    BH.$('[data-act="add"]', el).addEventListener("click", addStep);
    const del = BH.$('[data-act="del"]', el);
    if (del) del.addEventListener("click", deleteStep);
  }

  function renderCallBar() {
    const bar = BH.$("#call-bar", root);
    if (!bar) return;
    const cur = segAt(S.step);
    bar.innerHTML = `
      <span class="bar-label">The call</span>
      <div class="call-chips">
        ${
          S.segs.length
            ? S.segs
                .map((g, i) => {
                  const it = segItem(g);
                  const name = it ? it.name : "Removed item";
                  return `${i ? '<span class="call-sep" aria-hidden="true">›</span>' : ""}<div class="call-chip${g === cur ? " on" : ""} k-${esc(it ? it.kind : "scratch")}">
                    <button class="chip-main" data-jump="${i}" aria-pressed="${g === cur}" title="Go to ${esc(name)}"><i class="dot"></i>${esc(name)}${g.cycles > 1 ? ` <small>×${g.cycles}</small>` : ""}</button>
                    <button class="chip-x" data-remove="${i}" aria-label="Take ${esc(name)} out of the call">${icons.x}</button>
                  </div>`;
                })
                .join("")
            : `<span class="call-empty">Tap a play to start the call, then tap actions to keep it going.</span>`
        }
      </div>
      ${S.segs.length ? `<button class="btn ghost new-call" data-act="new" title="Start a new call">${icons.plus}<span>New</span></button>` : ""}
      <button class="btn lib-toggle" data-act="lib">${icons.library}<span>Library</span></button>`;
    BH.$$("[data-jump]", bar).forEach((b) => b.addEventListener("click", () => goStep(S.segs[+b.dataset.jump].start)));
    BH.$$("[data-remove]", bar).forEach((b) => b.addEventListener("click", () => removeSeg(+b.dataset.remove)));
    const nw = BH.$('[data-act="new"]', bar);
    if (nw) nw.addEventListener("click", newCall);
    BH.$('[data-act="lib"]', bar).addEventListener("click", () => toggleSheet());
    const chips = BH.$(".call-chips", bar);
    const on = BH.$(".call-chip.on", bar);
    if (on && chips.scrollWidth > chips.clientWidth) chips.scrollLeft = on.offsetLeft - chips.offsetLeft - 40;
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
                  ${BH.isAuto(it) ? `<span class="lib-auto" title="Runs from wherever the ball is">Auto</span>` : BH.hasDiagram(it) ? `<span class="lib-has" title="Has a diagram">${icons.board}</span>` : ""}
                </button></li>`
                )
                .join("")
            : `<li class="lib-empty">${items.length ? "No matches." : "Nothing installed yet."}</li>`
        }
      </ul>
      <p class="lib-hint">Tap or drag onto the call. <b>Auto</b> actions pick up from wherever the ball is.</p>`;
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
    const coach = BH.store.isCoach;
    const seg = segAt(S.step);
    const it = S.note ? BH.store.get(S.note) : itemAt(S.step);
    const modified = isModified();
    const names = S.segs.map((g) => (segItem(g) || {}).name).filter(Boolean);
    const coachBox = coach
      ? `<div class="coach-box"><p class="eyebrow">Coach</p>
          ${
            S.segs.length === 1 && S.segs[0].base && it && !BH.isAuto(it)
              ? `<button class="btn primary" data-act="save-to" ${modified ? "" : "disabled"}>${icons.save} Save diagram to “${esc(it.name)}”</button>`
              : ""
          }
          <button class="btn ${S.segs.length > 1 ? "primary" : "ghost"}" data-act="save-new">${icons.plus} Save ${S.segs.length > 1 ? "this call" : ""} as a new item</button></div>`
      : "";
    if (!it) {
      box.innerHTML = `
        <div class="info-card">
          <p class="eyebrow">On the court</p>
          <h2>${seg ? "Removed from the playbook" : "Scratch board"}</h2>
          <p>Draw anything here, or build a call. Lines that start on a player move that player when you hit <b>Run it</b>.</p>
          <ol class="howto">
            <li><b>Build the call:</b> tap a play from the Library, like 5 Thru, then tap actions like Rub, Twirl and Swing. Each one picks up where the last one ended.</li>
            <li><b>Continuity</b> runs your actions again from the other side.</li>
            <li><b>Players:</b> tap one in the tray, then drag it where it goes.</li>
            <li><b>Lines:</b> Cut, Dribble, Pass, Handoff, Shot and Screen each draw our standard symbol. Start a pass at the end of a dribble and the ball follows both.</li>
            <li><b>Next step</b> moves everyone to the end of their line so you can draw the next part.</li>
          </ol>
          ${coachBox}
        </div>`;
    } else {
      const k = BH.kind(it.kind);
      const inContinuity = seg && seg.parts && !S.note;
      box.innerHTML = `
        <div class="info-card">
          <div class="card-meta"><span class="kind-chip k-${esc(it.kind)}">${esc(k.one)}</span>${inContinuity ? '<span class="kind-chip k-scratch">Continuity</span>' : ""}${it.example ? '<span class="ex-chip">Example</span>' : ""}</div>
          <h2>${esc(it.name)}</h2>
          ${it.call ? `<p class="call"><span>Call</span> ${esc(it.call)}</p>` : ""}
          ${it.summary ? `<p>${esc(it.summary)}</p>` : ""}
          ${it.keys.length ? `<h3>Keys</h3><ul class="keys">${it.keys.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${it.reads.length ? `<h3>Reads</h3><ul class="reads">${it.reads.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${S.note ? `<p class="muted">No diagram yet${coach ? ". Draw it on the court and save it as a new item, or add it in Install." : "."}</p>` : ""}
          ${names.length > 1 ? `<p class="muted small">The call: ${names.map(esc).join(" › ")}</p>` : ""}
          <div class="info-actions">
            <a class="btn ghost" href="#item-${esc(it.id)}">${icons.book} Open in playbook</a>
            ${modified ? `<button class="btn ghost" data-act="reset">${icons.undo} Reset to coach's version</button>` : ""}
          </div>
          ${modified && !coach ? `<p class="muted small">Your drawing stays on this device.</p>` : ""}
          ${coachBox}
        </div>`;
    }
    const reset = BH.$('[data-act="reset"]', box);
    if (reset)
      reset.addEventListener("click", () => {
        snapshot();
        S.board = BH.clone(segItem(S.segs[0]).diagram);
        S.step = 0;
        changedAll();
      });
    const saveTo = BH.$('[data-act="save-to"]', box);
    if (saveTo)
      saveTo.addEventListener("click", async () => {
        const target = segItem(S.segs[0]);
        if (!saveTo.dataset.armed) {
          saveTo.dataset.armed = "1";
          saveTo.innerHTML = `${icons.save} Tap again to replace the diagram`;
          setTimeout(() => {
            if (saveTo.isConnected) renderInfo();
          }, 3000);
          return;
        }
        saveTo.disabled = true;
        const ok = await BH.store.saveItem({ ...target, diagram: BH.clone(S.board) }, `Saved the diagram for ${target.name}.`);
        if (ok) changedAll();
        else renderInfo();
      });
    const saveNew = BH.$('[data-act="save-new"]', box);
    if (saveNew)
      saveNew.addEventListener("click", () => {
        const over = { diagram: BH.clone(S.board), kind: "set" };
        if (names.length > 1) {
          over.name = names.join(" + ");
          over.summary = names.join(", then ") + ".";
        } else if (it && !BH.isAuto(it)) over.kind = it.kind;
        if (BH.install) BH.install.queueNew(over);
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
    if (e.key === "ArrowRight") goStep(S.step + 1);
    if (e.key === "ArrowLeft") goStep(S.step - 1);
    if (e.key === "Escape" && S.sheetOpen) toggleSheet(false);
  }
  document.addEventListener("keydown", onKey);

  /* ---------- view ---------- */
  function render(host) {
    root = host;
    if (!S.board) load();
    if (S.pendingOpen) {
      const id = S.pendingOpen;
      S.pendingOpen = null;
      if (BH.store.get(id)) {
        snapshot();
        startCall(id);
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
