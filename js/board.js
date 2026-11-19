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
    libQ: "",
    pendingOpen: null,
    sheetOpen: false,
    sel: null, // the line being edited (its handles show)
    paused: false, // Run it was paused: the next Run it picks up from here instead of step 1
    defense: null, // "lock-left": our X's guard the offense on every step
    hl: null, // the defensive job lit up ("gap", "deny"...)
    selX: null, // the defender picked to turn (his rotate dot shows)
    switching: null, // a defender's number waiting for the X he switches with
    stance: {}, // stances turned on this device, not saved for everyone yet: { ball: 40, ... }
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
      S.defense = saved.defense === "lock-left" ? "lock-left" : null;
      S.stance = saved.stance && typeof saved.stance === "object" ? saved.stance : {};
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
    saveTimer = setTimeout(() => BH.local.set(SAVE_KEY, { board: S.board, step: S.step, segs: S.segs, tool: S.tool, defense: S.defense, stance: S.stance }), 300);
  }
  const frame = () => S.board.frames[S.step];
  /* What's drawn: the board as is, or with Lock Left on the offense for the whole
     possession (X's move with the ball and rotate on drives). */
  const viewBoard = (b) => (S.defense && BH.defense ? { ...b, frames: BH.defense.defendFrames(b.frames) } : b);
  const shownFrame = () => (S.defense && BH.defense ? viewBoard(S.board).frames[S.step] : frame());
  function snapshot() {
    S.paused = false; // the board changed, so Run it starts over
    S.history.push(JSON.stringify({ board: S.board, step: S.step, segs: S.segs, defense: S.defense, stance: S.stance }));
    if (S.history.length > 60) S.history.shift();
  }
  function undo() {
    const last = S.history.pop();
    if (!last) return BH.toast("Nothing to undo.");
    const v = JSON.parse(last);
    S.board = v.board;
    S.step = v.step;
    S.segs = v.segs;
    S.defense = v.defense || null;
    S.stance = v.stance || {};
    if (!S.defense) S.hl = null;
    S.paused = false;
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
    if (it.rule === "lock-left") return defenseOn(opts);
    const rule = BH.isAuto(it) ? it.rule : null;
    if (!opts.silent) {
      stopPlay();
      snapshot();
    }
    if (rule && rule !== "continuity" && !S.segs.length && JSON.stringify(S.board) === JSON.stringify(scratchBoard()) && BH.store.get("4-out")) appendDrawn(BH.store.get("4-out"));
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
  /* Put Lock Left on the offense (every step, moving with the ball). */
  function defenseOn(opts = {}) {
    if (!opts.silent) {
      stopPlay();
      snapshot();
    }
    // Nothing to guard on an empty board: start from 4-Out.
    if (!S.segs.length && JSON.stringify(S.board) === JSON.stringify(scratchBoard()) && BH.store.get("4-out")) appendDrawn(BH.store.get("4-out"));
    S.defense = "lock-left";
    S.note = null;
    if (!opts.silent) {
      rebuildForDefense();
      changedAll();
      BH.toast("Lock Left is on. Tap a job (Gap, Deny...) to light up who's doing it.");
    }
    return true;
  }
  function defenseOff() {
    stopPlay();
    snapshot();
    S.defense = null;
    S.hl = null;
    rebuildForDefense();
    changedAll();
  }
  /* Twirl plays out differently against Lock Left (Ice, Fire), so rebuild a call that has one. */
  function rebuildForDefense() {
    const ids = S.segs.map((g) => g.itemId);
    if (!ids.some((id) => (BH.store.get(id) || {}).rule === "twirl")) return;
    S.board = scratchBoard();
    S.segs = [];
    ids.forEach((id) => addToCall(id, { silent: true }));
    S.step = Math.min(S.step, S.board.frames.length - 1);
  }
  function appendRule(it, opts) {
    // Straight out of a trigger, the trigger's down screen is the backside action.
    const prev = segItem(S.segs[S.segs.length - 1]);
    const res = E().extend(S.board.frames, it.rule, { noBackside: !!(prev && prev.kind === "trigger"), defense: S.defense });
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
      const x = segItem(g);
      if (!BH.isAuto(x) || x.kind === "trigger") from = i + 1;
    });
    return S.segs
      .slice(from, upto)
      .map(segItem)
      .filter((x) => x && BH.isAuto(x) && x.rule !== "continuity" && x.kind !== "trigger")
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
  const START_CYCLES = 4;
  const MAX_CYCLES = 12;
  function runContinuity(it, opts) {
    const actions = baseActions(S.segs.length);
    if (!actions.length) {
      if (!opts.silent) BH.toast("Add some actions first. Continuity keeps running them side to side.");
      return false;
    }
    const cont = { id: BH.uid("g"), itemId: it.id, start: 0, parts: [], cycles: 0 };
    // Side to side twice (four trips); Run it keeps going from there.
    for (let c = 0; c < START_CYCLES; c++) if (!runCycle(cont, actions)) break;
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
    S.hl = null;
    const job = BH.defense && BH.defense.termRole(it);
    if (job) {
      // A defensive job (Gap, Deny...): Lock Left on 4-Out with that X lit up.
      defenseOn({ silent: true });
      S.hl = job;
      S.note = id;
      S.step = 0;
      return;
    }
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
    svg.querySelector(".diagram-layer").innerHTML = D().frameMarkup(shownFrame(), { interactive: true, hl: S.hl, stance: S.stance, selX: S.selX });
    svg.querySelector(".handle-layer").innerHTML = handlesMarkup();
    if (S.sel) {
      const el = svg.querySelector(`.diagram-layer [data-stroke="${CSS.escape(S.sel)}"]`);
      if (el) el.classList.add("sel");
    }
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
  const STRAIGHT = ["pass", "handoff"]; // these stay straight; the other lines can be bent

  /* Handles on the selected line: drag an end to move it, drag the middle dot to bend it. */
  /* The dot that turns a picked defender: out in front of him, the way he faces. */
  function rotateMarkup() {
    const f = shownFrame();
    const x = S.selX && (f.tokens || []).find((t) => t.id === S.selX && t.t === "x");
    if (!x || !BH.defense) return "";
    const a = ((BH.defense.facing(f, S.stance)[x.id] || 0) * Math.PI) / 180;
    const k = [x.x + Math.cos(a) * 30, x.y + Math.sin(a) * 30];
    return `<g class="handles"><line class="rot-arm" x1="${x.x}" y1="${x.y}" x2="${k[0].toFixed(1)}" y2="${k[1].toFixed(1)}" /><circle class="hd hd-rot" data-h="rot" cx="${k[0].toFixed(1)}" cy="${k[1].toFixed(1)}" r="8"><title>Drag to turn him</title></circle></g>`;
  }
  function handlesMarkup() {
    if (S.selX) return rotateMarkup();
    const st = S.sel && (frame().strokes || []).find((x) => x.id === S.sel);
    if (!st || st.t === "pen" || st.t === "shot" || !st.pts || st.pts.length < 2) return "";
    const a = st.pts[0],
      b = st.pts[st.pts.length - 1];
    let m = null;
    if (!STRAIGHT.includes(st.t)) {
      if (st.pts.length === 2) m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      else if (st.pts.length === 3) m = st.pts[1];
      else {
        const poly = D().sampleSmooth(st.pts);
        m = poly[Math.floor(poly.length / 2)];
      }
    }
    const c = (q, h, cls, title) => `<circle class="hd ${cls}" data-h="${h}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="8"><title>${title}</title></circle>`;
    return `<g class="handles">${c(a, "start", "hd-end", "Drag to move the start")}${c(b, "end", "hd-end", "Drag to move the end")}${m ? c(m, "mid", "hd-mid", "Drag to bend the line") : ""}</g>`;
  }
  const pathD = (pts) => pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ");

  /* The ball this player has in his hand, if any. */
  function heldBall(tk) {
    const ball = frame().tokens.find((x) => x.t === "ball");
    if (!ball) return null;
    if (ball.h) return ball.h === tk.id ? ball : null;
    const d = D().dist([ball.x, ball.y], [tk.x, tk.y]);
    const closest = frame()
      .tokens.filter((o) => o.t === "o" || o.t === "x")
      .every((o) => o.id === tk.id || D().dist([ball.x, ball.y], [o.x, o.y]) >= d);
    return d < 30 && closest ? ball : null;
  }

  /* ---------- pointer handling on the court ---------- */
  let gesture = null;
  function onDown(evt) {
    if (evt.button && evt.button !== 0) return;
    stopPlay();
    const p = svgPoint(evt);
    const tokEl = evt.target.closest && evt.target.closest(".tok");
    const hd = evt.target.closest && evt.target.closest(".hd");
    if (hd && hd.dataset.h === "rot" && S.selX) {
      snapshot();
      gesture = { type: "rot", id: S.selX, moved: false };
    } else if (hd && S.sel) {
      snapshot();
      gesture = { type: "handle", which: hd.dataset.h, sid: S.sel, moved: false };
    } else if (S.tool === "move") {
      if (!tokEl) {
        const stEl = evt.target.closest && evt.target.closest("[data-stroke]");
        S.sel = stEl ? stEl.dataset.stroke : null;
        S.selX = null;
        drawBoard();
        return;
      }
      const id = tokEl.dataset.tok;
      const shown = (shownFrame().tokens || []).find((x) => x.id === id);
      // Waiting to switch: this X is the one he switches with.
      if (S.switching && shown && shown.t === "x" && shown.n && shown.n !== S.switching) {
        doSwitch(S.switching, shown.n);
        S.selX = id;
        return;
      }
      S.switching = null;
      // Tapping a defender picks him: drag the dot that shows to turn him.
      S.selX = shown && shown.t === "x" ? id : null;
      if (S.selX) S.sel = null;
      const tk = frame().tokens.find((x) => x.id === id);
      if (!tk) {
        // One of Lock Left's X's: turn him or switch him; he goes where the defense puts him.
        drawBoard();
        renderInfo();
        return;
      }
      snapshot();
      gesture = { type: "drag", id, el: tokEl, dx: tk.x - p[0], dy: tk.y - p[1], moved: false };
      // The ball goes where the player who has it goes.
      const ball = tk.t !== "ball" && heldBall(tk);
      if (ball) {
        gesture.ball = { id: ball.id, ox: ball.x - tk.x, oy: ball.y - tk.y, el: svg.querySelector(`.diagram-layer [data-tok="${CSS.escape(ball.id)}"]`) };
      }
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
      const gb = gesture.ball;
      if (gb && gb.el) gb.el.setAttribute("transform", `translate(${(x + gb.ox).toFixed(1)},${(y + gb.oy).toFixed(1)})`);
      gesture.x = x;
      gesture.y = y;
      gesture.moved = true;
    } else if (gesture.type === "draw") {
      const last = gesture.pts[gesture.pts.length - 1];
      if (D().dist(last, p) < 3) return;
      gesture.pts.push(p);
      let pts = gesture.pts;
      if (S.tool !== "pen") pts = [gesture.pts[0], p];
      if (S.tool === "shot") pts = D().shotCurve(gesture.pts[0], D().nearestRim(p, S.board.court));
      svg.querySelector(".draft-line").setAttribute("d", pathD(pts));
    } else if (gesture.type === "erase") {
      eraseAt(evt);
    } else if (gesture.type === "rot") {
      const f = shownFrame();
      const x = (f.tokens || []).find((t) => t.id === gesture.id);
      if (!x) return;
      const deg = (Math.atan2(p[1] - x.y, p[0] - x.x) * 180) / Math.PI;
      gesture.moved = true;
      const tk = frame().tokens.find((t) => t.id === gesture.id);
      if (tk) tk.f = Math.round(deg);
      else {
        // One of Lock Left's X's: this sets the stance for his job, on every step.
        const r = BH.defense.stanceFor(f, gesture.id, deg);
        if (!r) return;
        S.stance = { ...S.stance, [r.job]: r.deg };
      }
      drawBoard();
    } else if (gesture.type === "handle") {
      const st = frame().strokes.find((x) => x.id === gesture.sid);
      if (!st) return;
      gesture.moved = true;
      const last = st.pts.length - 1;
      if (gesture.which === "start") st.pts[0] = p;
      else if (gesture.which === "end") st.pts[last] = p;
      else st.pts = [st.pts[0], p, st.pts[last]];
      drawBoard();
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
          if (tk.t === "ball") {
            // Dropped on a player: it's in his hand.
            const near = frame()
              .tokens.filter((o) => o.t === "o" || o.t === "x")
              .reduce((b, o) => {
                const d = D().dist([o.x, o.y], [tk.x, tk.y]);
                return d < 30 && (!b || d < b.d) ? { o, d } : b;
              }, null);
            if (near) {
              tk.x = near.o.x + 13;
              tk.y = near.o.y - 12;
              tk.h = near.o.id;
            } else delete tk.h;
          } else if (g.ball) {
            const b = frame().tokens.find((x) => x.id === g.ball.id);
            if (b) {
              b.x = tk.x + g.ball.ox;
              b.y = tk.y + g.ball.oy;
              b.h = tk.id;
            }
          }
        }
        changed();
      } else {
        S.history.pop();
        drawBoard();
        renderInfo();
      }
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
        if (S.tool === "pen") {
          if (len < 14) return;
          stroke = { id: BH.uid("s"), t: "pen", pts };
        } else {
          // Every other line is drawn straight; bend it afterwards with the middle dot.
          if (D().dist(g.pts[0], last) < 14) return;
          let end = [Math.round(last[0] * 10) / 10, Math.round(last[1] * 10) / 10];
          if (STRAIGHT.includes(S.tool)) {
            const snap = snapPoint(last, g.fromTok);
            if (snap && D().dist(snap.pt, g.pts[0]) > 10) end = snap.pt;
          }
          stroke = { id: BH.uid("s"), t: S.tool, pts: [g.pts[0], end] };
        }
      }
      snapshot();
      if (S.color) stroke.c = S.color;
      frame().strokes.push(stroke);
      S.sel = stroke.t === "pen" || stroke.t === "shot" ? null : stroke.id;
      changed();
    } else if (g.type === "erase") {
      if (!g.any) S.history.pop();
      else changed();
    } else if (g.type === "rot") {
      if (!g.moved) return void S.history.pop();
      changed();
    } else if (g.type === "handle") {
      const st = frame().strokes.find((x) => x.id === g.sid);
      if (!g.moved || !st) return void S.history.pop();
      if (g.which !== "mid") {
        // Ends snap to a player or a line end, like when drawing.
        const i = g.which === "start" ? 0 : st.pts.length - 1;
        const snap = snapPoint(st.pts[i], null);
        if (snap && (g.which === "start" || STRAIGHT.includes(st.t))) st.pts[i] = snap.pt;
      }
      st.pts = st.pts.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
      changed();
    }
  }
  function eraseAt(evt) {
    const el = document.elementFromPoint(evt.clientX, evt.clientY);
    if (!el || !svg.contains(el)) return;
    const s = el.closest("[data-stroke]");
    const tk = el.closest(".tok");
    const f = frame();
    if (s) {
      if (S.sel === s.dataset.stroke) S.sel = null;
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
    S.sel = null;
    S.switching = null;
    S.step = Math.max(0, Math.min(S.board.frames.length - 1, i));
    changed();
  }
  async function play() {
    const b = S.board;
    if (b.frames.length < 2) return BH.toast("Add a second step to run this.");
    // From the top, unless it was paused: then pick up where it stopped.
    if (!S.paused || S.step >= b.frames.length - 1) S.step = 0;
    S.paused = false;
    drawBoard();
    playToken = { cancelled: false };
    const tok = playToken;
    renderSteps();
    await new Promise((r) => setTimeout(r, 200));
    while (!tok.cancelled && S.board === b && (S.step < b.frames.length - 1 || keepGoing())) {
      if (BH.prefersReducedMotion()) await new Promise((r) => setTimeout(r, 700));
      else if (!(await D().animateStep(svg, viewBoard(b), S.step, tok, { hl: S.hl, stance: S.stance }))) break;
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
    BH.$('[data-act="play"]', el).addEventListener("click", () => {
      if (playToken.cancelled) return play();
      stopPlay();
      S.paused = true;
    });
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
        ${
          S.defense
            ? `<span class="call-vs" aria-hidden="true">vs</span><div class="call-chip def k-defense">
            <button class="chip-main" data-def="info" title="Lock Left: our defense"><i class="dot"></i>${esc((defItem() || {}).name || "Lock Left")}</button>
            <button class="chip-x" data-def="off" aria-label="Take the defense off">${icons.x}</button>
          </div>`
            : ""
        }
      </div>
      ${S.segs.length ? `<button class="btn ghost new-call" data-act="new" title="Start a new call">${icons.plus}<span>New</span></button>` : ""}
      <button class="btn lib-toggle" data-act="lib">${icons.library}<span>Library</span></button>`;
    BH.$$("[data-jump]", bar).forEach((b) => b.addEventListener("click", () => goStep(S.segs[+b.dataset.jump].start)));
    BH.$$("[data-remove]", bar).forEach((b) => b.addEventListener("click", () => removeSeg(+b.dataset.remove)));
    const dOff = BH.$('[data-def="off"]', bar);
    if (dOff) dOff.addEventListener("click", defenseOff);
    const dInfo = BH.$('[data-def="info"]', bar);
    if (dInfo)
      dInfo.addEventListener("click", () => {
        const box = BH.$("#board-info .def-box", root);
        if (box) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const first = box && BH.$("[data-job]", box);
        if (first) first.focus();
      });
    const nw = BH.$('[data-act="new"]', bar);
    if (nw) nw.addEventListener("click", newCall);
    BH.$('[data-act="lib"]', bar).addEventListener("click", () => toggleSheet());
    const chips = BH.$(".call-chips", bar);
    const on = BH.$(".call-chip.on", bar);
    if (on && chips.scrollWidth > chips.clientWidth) chips.scrollLeft = on.offsetLeft - chips.offsetLeft - 40;
  }

  /* ---------- scenarios: full calls with Lock Left on, built live by the engine ---------- */
  const SCENARIOS = [
    { group: "Triggers", id: "sc-5thru", name: "5 Thru into Rub", call: ["denied-backdoor", "rub", "twirl", "swing", "continuity"], about: "The 5 Thru trigger, a Rub, a Twirl and Swing, then Continuity side to side" },
    { group: "Triggers", id: "sc-1thru", name: "1 Thru into Twist", call: ["baseline-drive-lift", "twist", "get", "swing", "continuity"], about: "The 1 Thru trigger, a Twist, a Get and Swing, then Continuity" },
    { group: "Triggers", id: "sc-pitch", name: "Pitch", call: ["4-out", "pitch", "twirl", "swing", "continuity"], about: "Pitch at the top into a Twirl and Swing, then Continuity" },
    { group: "Triggers", id: "sc-switch", name: "Switch", call: ["4-out", "switch", "rub", "get", "swing", "continuity"], about: "Swing Pitch into a Rub, a Get and Swing, then Continuity" },
    { group: "Drive & X-out", id: "sc-slot", name: "Slot drive", call: ["4-out", "drive", "kick-out"], about: "Watch the Wall help, the Bear help the helper (he takes the Wall's man), and the Wall and Bear X-out; the Gap snipes and grabs" },
    { group: "Drive & X-out", id: "sc-top", name: "Top drive", call: [["5-out", "power"], "drive", "kick-out"], about: "Watch the Gap and the corner (the Wall) snipe and grab, the weak wing drop to the corner's man, and the weak wing and corner X-out" },
    { group: "Drive & X-out", id: "sc-wing", name: "Wing drive", call: ["baseline-drive-lift", "drive", "kick-out"], about: "1 Thru leaves 5 on the wing; watch the rotation and the X-out on his drive" },
    { group: "Drive & X-out", id: "sc-corner", name: "Corner drive", call: ["4-out", "swing", "kick-out", "drive", "kick-out"], about: "Swing it across, Kick it to the corner, he drives baseline and kicks it back out; watch the rotation and the X-out" },
    { group: "Beat: Scram", id: "sc-beat", name: "Slot drive", call: ["4-out", { id: "drive", beat: true }, "kick-out"], about: "He gets beat on a slot drive: the Gap picks up the ball, the on-ball sprints to the Gap's man (Scram)" },
    { group: "Beat: Scram", id: "sc-beat-top", name: "Top drive", call: [["5-out", "power"], { id: "drive", beat: true }, "kick-out"], about: "He gets beat at the top: the drive-side wing picks up the ball, the on-ball sprints to his man, the corner stays home (Scram)" },
    { group: "Beat: Scram", id: "sc-beat-wing", name: "Wing drive", call: ["baseline-drive-lift", { id: "drive", beat: true }, "kick-out"], about: "He gets beat on a wing drive: the Gap picks up the ball, the on-ball sprints to the Gap's man (Scram)" },
    { group: "Ball screens", id: "sc-ice", name: "Ice", call: ["4-out", "twirl", "kick-out"], about: "Twirl going right: we ICE it, he rejects and drives left, the big plays Contain, then the Wall and Bear X-out" },
    { group: "Ball screens", id: "sc-fire", name: "Fire", call: ["4-out", "swing", "twirl", "swing"], about: "Twirl going left: FIRE, we trap; the Bear tags the roller, the big and Bear X-out out of the trap" },
  ];
  /* The program's item for a scenario step (the first that exists when there's a choice). */
  const scenarioItem = (step) => [].concat(step && step.id ? step.id : step).find((id) => BH.store.get(id));
  const scenarioReady = (sc) => sc.call.every((step) => scenarioItem(step));
  /* Load a scenario: a fresh call with Lock Left on, each piece added in order. */
  function startScenario(sc) {
    stopPlay();
    snapshot();
    S.board = scratchBoard();
    S.segs = [];
    S.step = 0;
    S.note = null;
    S.hl = null;
    S.sel = null;
    S.selX = null;
    S.switching = null;
    S.defense = "lock-left";
    const failed = [];
    sc.call.forEach((step) => {
      const id = scenarioItem(step);
      const n = S.segs.length;
      if (!addToCall(id, { silent: true })) return void failed.push(id);
      // A drive he gets beat on (the Scram scenario).
      const seg = S.segs[n] || S.segs[S.segs.length - 1];
      if (step && step.beat && seg && S.board.frames[seg.start]) S.board.frames[seg.start].beat = true;
    });
    S.step = 0;
    if (S.sheetOpen) toggleSheet(false);
    changedAll();
    BH.toast(failed.length ? `Loaded ${sc.name}, but ${failed.map((id) => (BH.store.get(id) || {}).name).join(", ")} couldn't run from there.` : `Loaded ${sc.name}. Hit Run it.`);
  }

  function renderLibrary() {
    const lib = BH.$("#lib-drawer", root);
    if (!lib) return;
    // Grouped the way you build a call: where you start, how you get into it, what you run.
    const groups = [
      { kind: "formation", title: "Formations" },
      { kind: "trigger", title: "Triggers" },
      { kind: "set", title: "Sets" },
      { kind: "action", title: "Actions" },
      { kind: "defense", title: "Defense" },
    ];
    const items = BH.store.items();
    const q = S.libQ.trim().toLowerCase();
    const match = (i) => !q || (i.name + " " + i.call).toLowerCase().includes(q);
    // Continuity goes last in Actions: it repeats what comes before it.
    const last = (i) => (i.rule === "continuity" ? 1 : 0);
    const shown = groups
      .map((g) => ({ ...g, list: items.filter((i) => i.kind === g.kind && match(i)).sort((a, b) => last(a) - last(b) || a.name.localeCompare(b.name)) }))
      .filter((g) => g.list.length);
    const runs = (it) => BH.isAuto(it) || BH.hasDiagram(it) || it.rule === "lock-left";
    lib.innerHTML = `
      <header class="lib-head">
        <h2>Library</h2>
        <button class="btn icon sheet-close" data-act="close" aria-label="Close library">${icons.x}</button>
      </header>
      <label class="search small">${icons.search}<input id="lib-search" type="search" placeholder="Find a play or action" value="${esc(S.libQ)}" autocomplete="off" /></label>
      <div class="lib-list">
        ${
          shown.length
            ? shown
                .map(
                  (g) => `<section class="lib-group k-${g.kind}">
                <h3><i class="dot"></i>${esc(g.title)}</h3>
                <div class="lib-chips">${g.list
                  .map(
                    (it) => `<button class="lib-item k-${esc(it.kind)}${runs(it) ? "" : " notes-only"}" data-lib="${esc(it.id)}" title="${esc(it.call || it.name)}${runs(it) ? "" : " · notes only, no diagram yet"}">${esc(it.name)}</button>`
                  )
                  .join("")}</div>
              </section>`
                )
                .join("")
            : `<p class="lib-empty">${items.length ? "No matches." : "Nothing installed yet."}</p>`
        }
        ${(() => {
          const scs = SCENARIOS.filter((sc) => scenarioReady(sc) && (!q || (sc.name + " " + sc.group + " " + sc.about).toLowerCase().includes(q)));
          if (!scs.length) return "";
          const groupsSc = [...new Set(scs.map((sc) => sc.group))];
          return `<section class="lib-group k-scenario">
                <h3><i class="dot"></i>Scenarios <small>vs Lock Left</small></h3>
                ${groupsSc
                  .map(
                    (gn) => `<p class="lib-sub">${esc(gn)}</p><div class="lib-chips">${scs
                      .filter((sc) => sc.group === gn)
                      .map((sc) => `<button class="lib-item k-scenario" data-scenario="${esc(sc.id)}" title="${esc(sc.about)}">${esc(sc.name)}</button>`)
                      .join("")}</div>`
                  )
                  .join("")}
              </section>`;
        })()}
      </div>
      <p class="lib-hint">Tap or drag onto the call. Actions pick up wherever the ball is. Scenarios load a whole call with Lock Left on.</p>`;
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
    BH.$('[data-act="close"]', lib).addEventListener("click", () => toggleSheet(false));
    BH.$$("[data-scenario]", lib).forEach((b) =>
      b.addEventListener("click", () => {
        const sc = SCENARIOS.find((x) => x.id === b.dataset.scenario);
        if (sc) startScenario(sc);
      })
    );
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

  const defItem = () => BH.store.items().find((x) => x.rule === "lock-left");
  /* Switch (Scram) defenders a and b (numbers) from this step on: each takes the other's man. */
  function doSwitch(a, b) {
    snapshot();
    S.switching = null;
    if (S.defense) {
      // Lock Left's X's: the switch is marked on this step and lasts the rest of the possession.
      const f = frame();
      f.sw = [...(f.sw || []), [String(a), String(b)]];
    } else {
      // X's you placed: each guards the other's man from here on.
      S.board.frames.forEach((f, k) => {
        if (k < S.step) return;
        const xa = (f.tokens || []).find((t) => t.t === "x" && t.n === String(a)),
          xb = (f.tokens || []).find((t) => t.t === "x" && t.n === String(b));
        if (!xa || !xb) return;
        const ma = xa.m || xa.n,
          mb = xb.m || xb.n;
        xa.m = mb;
        xb.m = ma;
        if (xa.m === xa.n) delete xa.m;
        if (xb.m === xb.n) delete xb.m;
        delete xa.sc;
        delete xb.sc;
        if (k === S.step) xa.sc = xb.sc = true;
      });
    }
    changed();
    BH.toast(`Switch: X${a} and X${b} swap men from here on.`);
  }
  /* The defense box on the right: tap a job to light up the X doing it. */
  function defBoxMarkup() {
    const f = shownFrame();
    if (!BH.defense || !(f.tokens || []).some((t) => t.t === "x")) return "";
    const jobs = BH.defense.jobsOf(f);
    const present = S.hl ? Object.values(jobs).some((js) => js.includes(S.hl)) : true;
    const d = S.defense && defItem();
    const saved = BH.defense.stance();
    const moved = Object.keys(S.stance || {}).filter((j) => BH.defense.role(j) && S.stance[j] !== saved[j]);
    const jobName = (j) => {
      const t = BH.defense.jobTerm(j);
      return t ? t.name : BH.defense.role(j).label;
    };
    const stanceRow = moved.length
      ? `<div class="stance-row">
          <p><b>Stance turned:</b> ${moved.map((j) => esc(jobName(j))).join(", ")}${BH.store.isCoach ? "" : ". It stays on this device."}</p>
          <div class="stance-actions">
            ${BH.store.isCoach && defItem() ? `<button class="btn primary small" data-act="stance-save">${icons.save} Save stance for everyone</button>` : ""}
            <button class="btn ghost small" data-act="stance-reset">${icons.undo} ${BH.store.isCoach ? "Reset" : "Back to the coach's stance"}</button>
          </div>
        </div>`
      : `<p class="muted small stance-tip">With Move, tap an X and drag his dot to turn him${S.defense ? " (On Ball Shade, Deny, Gap...)" : ""}.</p>`;
    // Switches (Scram): on this step, who's switched now, and the switch button.
    const xs = (f.tokens || []).filter((t) => t.t === "x");
    const sel = xs.find((x) => x.id === S.selX);
    const events = (f.scram || []).map(
      (e, i) =>
        `<li><b>${e.how === "natural" ? "X-out" : e.how === "scram" ? "SCRAM" : "Switch"}:</b> X${esc(e.a)} ↔ X${esc(e.b)} <span class="muted">${e.how === "natural" ? "(help the helper, off the ball)" : e.how === "scram" ? "(he got beat)" : "(marked)"}</span> <button class="linkish" data-unswitch="${i}">Undo</button></li>`
    );
    const mu = BH.defense.matchups(f);
    const numOf = (id) => ((f.tokens || []).find((t) => t.id === id) || {}).n;
    const switched = xs.filter((x) => mu[x.id] && numOf(mu[x.id]) && numOf(mu[x.id]) !== x.n).map((x) => `X${esc(x.n)} on ${esc(numOf(mu[x.id]))}`);
    // A drive on this step: if the on-ball got beat, the Gap and he Scram.
    const beatOn = !!(frame() && frame().beat);
    const beatRow = f.drive
      ? `<p class="small">${beatOn ? `<b>He got beat:</b> the Gap picks up the ball, the on-ball sprints to the Gap's man. <button class="linkish" data-act="beat">Undo</button>` : `<button class="btn ghost small" data-act="beat">He got beat → Scram</button>`}</p>`
      : "";
    const switchRow = `<div class="switch-row">
        ${beatRow}
        ${events.length ? `<ul class="switch-list">${events.join("")}</ul>` : ""}
        ${switched.length ? `<p class="small"><b>Switched:</b> ${switched.join(" · ")}</p>` : ""}
        ${
          S.switching
            ? `<p class="small"><b>Tap the X to switch with X${esc(S.switching)}.</b> <button class="linkish" data-act="switch-cancel">Cancel</button></p>`
            : sel && sel.n
              ? `<button class="btn ghost small" data-act="switch-start">${icons.swap || "⇄"} Switch X${esc(sel.n)} with…</button>`
              : ""
        }
      </div>`;
    return `<div class="def-box k-defense">
        <p class="eyebrow">Defense${d ? " · " + esc(d.name) : ""}</p>
        ${BH.defense.jobsMarkup(S.hl, present)}
        ${switchRow}
        ${stanceRow}
      </div>`;
  }
  function wireDefBox(box) {
    const beat = BH.$('[data-act="beat"]', box);
    if (beat)
      beat.addEventListener("click", () => {
        snapshot();
        const f = frame();
        if (f.beat) delete f.beat;
        else f.beat = true;
        changed();
      });
    const start = BH.$('[data-act="switch-start"]', box);
    if (start)
      start.addEventListener("click", () => {
        const x = (shownFrame().tokens || []).find((t) => t.id === S.selX);
        if (!x) return;
        S.switching = x.n;
        renderInfo();
      });
    const cancel = BH.$('[data-act="switch-cancel"]', box);
    if (cancel)
      cancel.addEventListener("click", () => {
        S.switching = null;
        renderInfo();
      });
    BH.$$("[data-unswitch]", box).forEach((b) =>
      b.addEventListener("click", () => {
        const e = (shownFrame().scram || [])[+b.dataset.unswitch];
        if (!e) return;
        snapshot();
        const f = frame();
        const same = (q) => (String(q[0]) === e.a && String(q[1]) === e.b) || (String(q[0]) === e.b && String(q[1]) === e.a);
        if (e.how === "coach") f.sw = (f.sw || []).filter((q) => !same(q));
        else if (e.how === "scram") {
          const d = S.board.frames[S.step - 1]; // the drive he got beat on
          if (d) delete d.beat;
        } else f.nosw = [...(f.nosw || []), [e.a, e.b]]; // the coach says this one doesn't switch
        changed();
      })
    );
    const save = BH.$('[data-act="stance-save"]', box);
    if (save)
      save.addEventListener("click", async () => {
        const it = defItem();
        if (!it) return;
        const stance = { ...(it.stance || {}), ...S.stance };
        save.disabled = true;
        // Clear this device's draft first: once saved, the coach's stance is the stance.
        const draft = S.stance;
        S.stance = {};
        BH.local.set(SAVE_KEY, { board: S.board, step: S.step, segs: S.segs, tool: S.tool, defense: S.defense, stance: {} });
        const ok = await BH.store.saveItem({ ...it, stance }, `Saved the ${it.name} stance. Everyone sees it now.`);
        if (!ok) S.stance = draft;
        changedAll();
      });
    const reset = BH.$('[data-act="stance-reset"]', box);
    if (reset)
      reset.addEventListener("click", () => {
        snapshot();
        S.stance = {};
        changedAll();
      });
    BH.$$("[data-job]", box).forEach((b) =>
      b.addEventListener("click", () => {
        S.hl = S.hl === b.dataset.job ? null : b.dataset.job;
        drawBoard();
        renderInfo();
        const again = BH.$(`#board-info [data-job="${b.dataset.job}"]`, root);
        if (again) again.focus();
      })
    );
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
    const defBox = defBoxMarkup();
    if (!it) {
      box.innerHTML = `${defBox}
        <div class="info-card">
          <p class="eyebrow">On the court</p>
          <h2>${seg ? "Removed from the playbook" : "Scratch board"}</h2>
          <p>Draw anything here, or build a call. Lines that start on a player move that player when you hit <b>Run it</b>.</p>
          <ol class="howto">
            <li><b>Build the call:</b> tap a play from the Library, like 5 Thru, then tap actions like Rub, Twirl and Swing. Each one picks up where the last one ended.</li>
            <li><b>Continuity</b> runs your actions again from the other side.</li>
            <li><b>Defense:</b> tap Lock Left in the Library to put our X's on the offense. They move with the ball and rotate on a drive (Wall, Bear, Gap's snipe and grab); tap a job like Gap or Deny to light up who's doing it.</li>
            <li><b>Stance:</b> with Move, tap an X and drag his dot to turn him.</li>
            <li><b>Players:</b> tap one in the tray, then drag it where it goes.</li>
            <li><b>Lines:</b> drag from where it starts to where it ends for a straight line. Drag the dot in the middle to bend it, or the end dots to move it. Tap a line with Move to edit it later; Delete or Erase removes it.</li>
            <li>Start a pass at the end of a dribble and the ball follows both.</li>
            <li><b>Next step</b> moves everyone to the end of their line so you can draw the next part.</li>
          </ol>
          ${coachBox}
        </div>`;
    } else {
      const k = BH.kind(it.kind);
      const inContinuity = seg && seg.parts && !S.note;
      const isDefTerm = S.note && BH.defense && BH.defense.termRole(it);
      box.innerHTML = `${defBox}
        <div class="info-card">
          <div class="card-meta"><span class="kind-chip k-${esc(it.kind)}">${esc(k.one)}</span>${inContinuity ? '<span class="kind-chip k-scratch">Continuity</span>' : ""}${it.example ? '<span class="ex-chip">Example</span>' : ""}</div>
          <h2>${esc(it.name)}</h2>
          ${it.call ? `<p class="call"><span>Call</span> ${esc(it.call)}</p>` : ""}
          ${it.summary ? `<p>${esc(it.summary)}</p>` : ""}
          ${it.keys.length ? `<h3>Keys</h3><ul class="keys">${it.keys.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${it.reads.length ? `<h3>Reads</h3><ul class="reads">${it.reads.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${S.note && !isDefTerm ? `<p class="muted">No diagram yet${coach ? ". Draw it on the court and save it as a new item, or add it in Install." : "."}</p>` : ""}
          ${names.length > 1 ? `<p class="muted small">The call: ${names.map(esc).join(" › ")}</p>` : ""}
          <div class="info-actions">
            <a class="btn ghost" href="#item-${esc(it.id)}">${icons.book} Open in playbook</a>
            ${modified ? `<button class="btn ghost" data-act="reset">${icons.undo} Reset to coach's version</button>` : ""}
          </div>
          ${modified && !coach ? `<p class="muted small">Your drawing stays on this device.</p>` : ""}
          ${coachBox}
        </div>`;
    }
    wireDefBox(box);
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
        const ok = await BH.store.saveItem({ ...target, diagram: BH.clone(viewBoard(S.board)) }, `Saved the diagram for ${target.name}.`);
        if (ok) changedAll();
        else renderInfo();
      });
    const saveNew = BH.$('[data-act="save-new"]', box);
    if (saveNew)
      saveNew.addEventListener("click", () => {
        const over = { diagram: BH.clone(viewBoard(S.board)), kind: "set" };
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
    if ((e.key === "Delete" || e.key === "Backspace") && S.sel) {
      e.preventDefault();
      snapshot();
      frame().strokes = frame().strokes.filter((x) => x.id !== S.sel);
      S.sel = null;
      return changed();
    }
    if (e.key === "Escape" && (S.sel || S.selX || S.switching)) {
      S.sel = null;
      S.selX = null;
      S.switching = null;
      drawBoard();
      return renderInfo();
    }
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
              <g class="handle-layer"></g>
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
    /* What's drawn, step by step (the defense included): for tests. */
    viewFrames: () => viewBoard(S.board).frames,
    SCENARIOS,
  };
})();
