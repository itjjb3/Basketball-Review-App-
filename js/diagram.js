/* Diagram model + rendering.
   A diagram is { court: "half"|"full", frames: [ { tokens: [...], strokes: [...] } ] }.
   token:  { id, t: "o"|"x"|"ball"|"cone", n, x, y }
   stroke: { id, t: "cut"|"dribble"|"pass"|"screen"|"pen", pts: [[x,y],...], c? } */
(function () {
  const BH = window.BH;
  const { esc } = BH;

  const STROKE_TYPES = [
    { id: "cut", label: "Cut", hint: "Solid line with an arrow" },
    { id: "dribble", label: "Dribble", hint: "Zig-zag line" },
    { id: "pass", label: "Pass", hint: "Dashed straight line" },
    { id: "handoff", label: "Handoff", hint: "Straight line with a double bar" },
    { id: "shot", label: "Shot", hint: "Dotted arc to the rim" },
    { id: "screen", label: "Screen", hint: "Line ending in a bar" },
    { id: "pen", label: "Marker", hint: "Freehand marker" },
  ];

  /* ---------- geometry ---------- */
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function simplify(pts, eps = 2.5) {
    if (pts.length < 3) return pts.slice();
    const sq = (p, a, b) => {
      const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      if (!l2) return dist(p, a);
      let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
      t = Math.max(0, Math.min(1, t));
      return dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    };
    const rdp = (s, e, out) => {
      let max = 0,
        idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = sq(pts[i], pts[s], pts[e]);
        if (d > max) (max = d), (idx = i);
      }
      if (max > eps) {
        rdp(s, idx, out);
        out.push(pts[idx]);
        rdp(idx, e, out);
      }
    };
    const out = [pts[0]];
    rdp(0, pts.length - 1, out);
    out.push(pts[pts.length - 1]);
    return out.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }

  /* Catmull-Rom sampled into a dense polyline. */
  function sampleSmooth(pts) {
    if (!pts || pts.length < 2) return pts ? pts.slice() : [];
    if (pts.length === 2) return [pts[0], pts[1]];
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const n = Math.max(2, Math.ceil(dist(p1, p2) / 6));
      for (let k = 1; k <= n; k++) {
        const t = k / n,
          t2 = t * t,
          t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    return out;
  }

  function polyLength(poly) {
    let L = 0;
    for (let i = 1; i < poly.length; i++) L += dist(poly[i - 1], poly[i]);
    return L;
  }

  function pointAt(poly, t) {
    if (poly.length === 1) return poly[0].slice();
    const total = polyLength(poly);
    let target = total * Math.max(0, Math.min(1, t));
    for (let i = 1; i < poly.length; i++) {
      const seg = dist(poly[i - 1], poly[i]);
      if (target <= seg || i === poly.length - 1) {
        const r = seg ? Math.min(1, target / seg) : 0;
        return [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * r, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * r];
      }
      target -= seg;
    }
    return poly[poly.length - 1].slice();
  }

  function resample(poly, spacing) {
    const total = polyLength(poly);
    const n = Math.max(1, Math.round(total / spacing));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(pointAt(poly, i / n));
    return out;
  }

  const d = (poly) => poly.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

  function endDir(poly) {
    const end = poly[poly.length - 1];
    let j = poly.length - 2;
    while (j > 0 && dist(poly[j], end) < 10) j--;
    const from = poly[Math.max(0, j)];
    const L = dist(from, end) || 1;
    return [(end[0] - from[0]) / L, (end[1] - from[1]) / L];
  }

  function arrowHead(poly, size = 13) {
    const e = poly[poly.length - 1];
    const [dx, dy] = endDir(poly);
    const nx = -dy,
      ny = dx;
    const bx = e[0] - dx * size,
      by = e[1] - dy * size;
    const w = size * 0.48;
    return `<path class="s-head" d="M${e[0].toFixed(1)},${e[1].toFixed(1)} L${(bx + nx * w).toFixed(1)},${(by + ny * w).toFixed(1)} L${(bx - nx * w).toFixed(1)},${(by - ny * w).toFixed(1)} Z" />`;
  }

  /* Trim the end of a polyline so the line stops under the arrowhead. */
  function trimEnd(poly, amount) {
    const total = polyLength(poly);
    if (total <= amount + 2) return poly;
    const keep = (total - amount) / total;
    const out = [];
    for (let i = 0; i <= 40; i++) out.push(pointAt(poly, (i / 40) * keep));
    return out;
  }

  /* Rims: home basket at the top; the far basket only exists on a full court. */
  const RIMS = [
    [250, 52.5],
    [250, 787.5],
  ];
  function nearestRim(p, court) {
    if (court !== "full") return RIMS[0].slice();
    return dist(p, RIMS[0]) <= dist(p, RIMS[1]) ? RIMS[0].slice() : RIMS[1].slice();
  }

  /* A shot is drawn as a lofted arc from the shooter to the rim. */
  function shotCurve(a, b) {
    const L = dist(a, b) || 1;
    const nx = -(b[1] - a[1]) / L,
      ny = (b[0] - a[0]) / L;
    const bend = Math.min(60, L * 0.22);
    const c = [(a[0] + b[0]) / 2 + nx * bend, (a[1] + b[1]) / 2 + ny * bend];
    const out = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24,
        u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
    return out;
  }

  /* The path the ball travels along a stroke. */
  function ballPoly(s) {
    const a = s.pts[0],
      b = s.pts[s.pts.length - 1];
    if (s.t === "pass" || s.t === "handoff") return [a, b];
    if (s.t === "shot") return shotCurve(a, b);
    return sampleSmooth(s.pts);
  }

  function zigzag(poly) {
    const total = polyLength(poly);
    if (total < 30) return poly;
    const straight = 16;
    const body = [];
    const n = Math.max(2, Math.round((total - straight) / 7));
    for (let i = 0; i <= n; i++) {
      const t = ((total - straight) / total) * (i / n);
      const p = pointAt(poly, t);
      const q = pointAt(poly, Math.min(1, t + 0.01));
      const L = dist(p, q) || 1;
      const nx = -(q[1] - p[1]) / L,
        ny = (q[0] - p[0]) / L;
      const off = i === 0 || i === n ? 0 : i % 2 ? 5.5 : -5.5;
      body.push([p[0] + nx * off, p[1] + ny * off]);
    }
    body.push(poly[poly.length - 1]);
    return body;
  }

  /* ---------- markup ---------- */
  function strokeMarkup(s, opts = {}) {
    if (!s.pts || s.pts.length < 2) return "";
    const style = s.c ? ` style="--ink:${esc(s.c)}"` : "";
    const hit = opts.interactive ? 1 : 0;
    let line = "",
      head = "",
      hitPoly;
    if (s.t === "pass") {
      const poly = [s.pts[0], s.pts[s.pts.length - 1]];
      line = `<path class="s-line s-pass" d="${d(trimEnd(poly, 9))}" />`;
      head = arrowHead(poly);
      hitPoly = poly;
    } else if (s.t === "handoff") {
      const poly = [s.pts[0], s.pts[s.pts.length - 1]];
      const L = dist(poly[0], poly[1]);
      const [dx, dy] = endDir(poly);
      const nx = -dy * 8,
        ny = dx * 8;
      const bars = [Math.max(L * 0.45, L - 30), Math.max(L * 0.58, L - 23)]
        .map((back) => {
          const c = [poly[0][0] + dx * back, poly[0][1] + dy * back];
          return `M${(c[0] + nx).toFixed(1)},${(c[1] + ny).toFixed(1)} L${(c[0] - nx).toFixed(1)},${(c[1] - ny).toFixed(1)}`;
        })
        .join(" ");
      line = `<path class="s-line" d="${d(trimEnd(poly, 9))}" /><path class="s-line s-bar thin" d="${bars}" />`;
      head = arrowHead(poly);
      hitPoly = poly;
    } else if (s.t === "shot") {
      const poly = shotCurve(s.pts[0], s.pts[s.pts.length - 1]);
      line = `<path class="s-line s-shot" d="${d(trimEnd(poly, 10))}" />`;
      head = arrowHead(poly);
      hitPoly = poly;
    } else if (s.t === "dribble") {
      const poly = sampleSmooth(s.pts);
      line = `<path class="s-line" d="${d(zigzag(trimEnd(poly, 6)))}" />`;
      head = arrowHead(poly);
      hitPoly = poly;
    } else if (s.t === "screen") {
      const poly = sampleSmooth(s.pts);
      const e = poly[poly.length - 1];
      const [dx, dy] = endDir(poly);
      const nx = -dy * 13,
        ny = dx * 13;
      line = `<path class="s-line" d="${d(poly)}" />`;
      head = `<path class="s-line s-bar" d="M${(e[0] + nx).toFixed(1)},${(e[1] + ny).toFixed(1)} L${(e[0] - nx).toFixed(1)},${(e[1] - ny).toFixed(1)}" />`;
      hitPoly = poly;
    } else if (s.t === "pen") {
      const poly = sampleSmooth(s.pts);
      line = `<path class="s-line s-pen" d="${d(poly)}" />`;
      hitPoly = poly;
    } else {
      const poly = sampleSmooth(s.pts);
      line = `<path class="s-line" d="${d(trimEnd(poly, 9))}" />`;
      head = arrowHead(poly);
      hitPoly = poly;
    }
    const hitPath = hit ? `<path class="s-hit" d="${d(hitPoly)}" />` : "";
    if (opts.inert) return `<g class="stk stk-${esc(s.t)} inert"${style}>${line}${head}</g>`;
    return `<g class="stk stk-${esc(s.t)}" data-stroke="${esc(s.id)}"${style}>${line}${head}${hitPath}</g>`;
  }

  /* extra (defenders only): { face: degrees he faces, hl: lit up, dim: another X is lit up, tag: job label } */
  function tokenMarkup(tk, extra = {}) {
    const tr = `transform="translate(${(+tk.x).toFixed(1)},${(+tk.y).toFixed(1)})"`;
    const id = `data-tok="${esc(tk.id)}"`;
    const n = esc(tk.n || "");
    if (tk.t === "x") {
      // The "(" is his back: it sits behind the X, opposite the way he faces.
      const back = extra.face == null ? "" : `<path class="x-back" transform="rotate(${extra.face.toFixed(1)})" d="M-6.5,11.3 A13,13 0 0 1 -6.5,-11.3" />`;
      const glow = extra.hl ? `<circle class="x-glow" r="20" />` : "";
      // Hands high on a closeout: arms out in front with the hands up.
      const hands = tk.hh && extra.face != null ? `<g class="x-hands" transform="rotate(${extra.face.toFixed(1)})"><path d="M2,-5 L11,-12 M2,5 L11,12" /><circle cx="12.5" cy="-13" r="3" /><circle cx="12.5" cy="13" r="3" /></g>` : "";
      const ring = extra.sel ? `<circle class="x-sel" r="18" />` : "";
      const tag = extra.hl && extra.tag ? `<g class="x-tag" transform="translate(0,${+tk.y < 80 ? 31 : -31})"><rect x="${-(extra.tag.length * 4.6 + 7).toFixed(1)}" y="-9.5" width="${(extra.tag.length * 9.2 + 14).toFixed(1)}" height="19" rx="9.5" /><text y="4.6">${esc(extra.tag)}</text></g>` : "";
      return `<g class="tok tok-x${extra.hl ? " hl" : ""}${extra.dim ? " dim" : ""}${extra.sel ? " sel" : ""}" ${id} ${tr}><circle class="tok-hit" r="15" />${glow}${ring}${back}${hands}<path class="x-mark" d="M-8,-8 L8,8 M8,-8 L-8,8" /><text class="x-num" x="10" y="16">${n}</text>${tag}</g>`;
    }
    if (tk.t === "ball") {
      return `<g class="tok tok-ball" ${id} ${tr}><circle r="7.5" /><path class="seam" d="M-7.5,0 L7.5,0 M0,-7.5 L0,7.5 M-5,-5.3 Q-1.5,0 -5,5.3 M5,-5.3 Q1.5,0 5,5.3" /></g>`;
    }
    if (tk.t === "cone") {
      return `<g class="tok tok-cone" ${id} ${tr}><path d="M0,-11 L9,8 L-9,8 Z" /><path class="cone-band" d="M-4.6,-1.5 L4.6,-1.5" /></g>`;
    }
    return `<g class="tok tok-o" ${id} ${tr}><circle r="14" /><text y="5.6">${n}</text></g>`;
  }

  /* A defender: facing face (degrees), lit up if he has the job opts.hl (jobs: { xId: [jobs] }). */
  function xMarkup(tk, face, jobs, opts = {}) {
    const lit = !!opts.hl && (jobs[tk.id] || []).includes(opts.hl);
    const r = lit && opts.tags !== false && BH.defense ? BH.defense.role(opts.hl) : null;
    return tokenMarkup(tk, { face, hl: lit, dim: !!opts.hl && !lit, tag: r ? r.tag : "", sel: opts.selX === tk.id });
  }

  /* opts.hl: a defensive job ("gap", "deny"...) to light up on whichever X has it.
     opts.tags: false hides the job's name over the X (flashcards and the quiz). */
  function frameMarkup(frame, opts = {}) {
    const strokes = (frame.strokes || []).map((s) => strokeMarkup(s, /^dz/.test(s.id || "") ? { ...opts, interactive: false, inert: true } : opts)).join("");
    const def = BH.defense && (frame.tokens || []).some((t) => t.t === "x") ? BH.defense : null;
    const face = def ? def.facing(frame, opts.stance) : {};
    const jobs = def && opts.hl ? def.jobsOf(frame) : {};
    const lit = opts.hl ? Object.keys(jobs).filter((id) => jobs[id].includes(opts.hl)) : [];
    // Draw players first, ball last, so the ball sits on top; a lit-up X goes over the rest.
    const order = { cone: 0, x: 1, o: 2, ball: 3 };
    const rank = (t) => (lit.includes(t.id) ? 4 : order[t.t] ?? 2);
    const toks = (frame.tokens || [])
      .slice()
      .sort((a, b) => rank(a) - rank(b))
      .map((t) => (t.t === "x" ? xMarkup(t, face[t.id], jobs, opts) : tokenMarkup(t)))
      .join("");
    return `<g class="strokes">${strokes}</g><g class="tokens">${toks}</g>`;
  }

  /* A static picture of one frame, cropped to where the action is. */
  function thumbSVG(diagram, opts = {}) {
    const mode = (diagram && diagram.court) || "half";
    const frame = (diagram && diagram.frames && diagram.frames[opts.frame || 0]) || { tokens: [], strokes: [] };
    let maxY = 0;
    (frame.tokens || []).forEach((t) => (maxY = Math.max(maxY, t.y)));
    (frame.strokes || []).forEach((s) => s.pts.forEach((p) => (maxY = Math.max(maxY, p[1]))));
    let h = BH.court.height(mode);
    if (mode === "half" && opts.crop !== false) h = Math.min(h, Math.max(330, maxY + 50));
    const vb = `-12 -12 524 ${h + 24}`;
    return `<svg class="court floor mini" viewBox="${vb}" preserveAspectRatio="xMidYMin meet" role="img" aria-label="${esc(opts.label || "Diagram")}">${BH.court.markup(mode, { mini: true })}${frameMarkup(frame, { hl: opts.hl || (diagram && diagram.hl), tags: opts.tags })}</svg>`;
  }

  /* ---------- motion ---------- */

  const PLAYER_MOVES = ["cut", "dribble", "screen"];
  const BALL_MOVES = { dribble: 0, handoff: 1, pass: 2, shot: 3 }; // order the ball takes them in
  const HAND = [13, -12]; // where the ball sits on the player who has it

  /* Where the ball goes this step. It follows a dribble, handoff, pass or shot that
     starts at the ball, then any that start where the last one ended — so a pass
     drawn from the end of a dribble carries on from there. */
  function ballChain(frame, playerPaths) {
    const tokens = frame.tokens || [];
    const ball = tokens.find((t) => t.t === "ball");
    if (!ball) return null;
    const strokes = (frame.strokes || []).filter((s) => s.pts && s.pts.length > 1 && s.t in BALL_MOVES);
    const used = new Set();
    let poly = [[ball.x, ball.y]];
    let at = [ball.x, ball.y];
    let shot = false;
    const next = (radius) => {
      let best = null;
      strokes.forEach((s) => {
        if (used.has(s.id)) return;
        const dd = dist(s.pts[0], at);
        if (dd > radius) return;
        const rank = BALL_MOVES[s.t] * 1000 + dd;
        if (!best || rank < best.rank) best = { s, rank };
      });
      return best && best.s;
    };
    let s = next(34);
    let carrier = null;
    // Phases, in order: { kind: "carry", pid, sids } while a player has it in his hand
    // (sids: his dribble lines; none means his whole path), or { kind: "fly", poly }
    // for a pass, handoff or shot.
    const phases = [];
    const owner = (sid) => {
      if (!playerPaths) return null;
      for (const pid of Object.keys(playerPaths)) if ((playerPaths[pid].parts || []).some((pt) => pt.sid === sid)) return pid;
      return null;
    };
    if (!s && playerPaths) {
      // The ball rides with the player who has it, if they move without passing.
      const owner = ball.h && tokens.find((p) => p.id === ball.h && dist([p.x, p.y], at) < 45);
      if (owner) carrier = playerPaths[owner.id] ? owner : null;
      else {
        let bd = 30;
        tokens
          .filter((p) => (p.t === "o" || p.t === "x") && playerPaths[p.id])
          .forEach((p) => {
            const dd = dist([p.x, p.y], at);
            if (dd < bd) (bd = dd), (carrier = p);
          });
      }
      if (carrier) {
        poly = playerPaths[carrier.id].map((q) => [q[0] + (ball.x - carrier.x), q[1] + (ball.y - carrier.y)]);
        const e = playerPaths[carrier.id][playerPaths[carrier.id].length - 1];
        at = e;
        phases.push({ kind: "carry", pid: carrier.id, sids: null });
        s = next(34);
      }
    }
    for (let guard = 0; s && guard < 8; guard++) {
      used.add(s.id);
      const bp = ballPoly(s);
      poly = poly.concat(bp);
      const pid = s.t === "dribble" ? owner(s.id) : null;
      const last = phases[phases.length - 1];
      if (pid && last && last.kind === "carry" && last.pid === pid && last.sids) last.sids.push(s.id);
      else if (pid) phases.push({ kind: "carry", pid, sids: [s.id] });
      else phases.push({ kind: "fly", t: s.t, poly: bp });
      at = s.pts[s.pts.length - 1];
      if (s.t === "shot") {
        shot = true;
        break;
      }
      s = next(30);
    }
    if (poly.length < 2) return null;
    return { poly, end: at, shot, carrier: carrier && !used.size ? carrier.id : null, phases };
  }

  /* Which stroke moves which token during the step that follows this frame. */
  function assignPaths(frame) {
    const out = {};
    const tokens = frame.tokens || [];
    const strokes = (frame.strokes || []).filter((s) => s.pts && s.pts.length > 1 && PLAYER_MOVES.includes(s.t));
    const players = tokens.filter((t) => t.t === "o" || t.t === "x");
    const claimed = {};
    strokes.forEach((s) => {
      let best = null,
        bd = 26;
      players.forEach((p) => {
        const dd = dist(s.pts[0], [p.x, p.y]);
        if (dd < bd && !(claimed[p.id] && claimed[p.id].d <= dd)) (bd = dd), (best = p);
      });
      if (best) claimed[best.id] = { d: bd, s };
    });
    // A player keeps going along any line drawn from where their last one ended,
    // so a cut into a screen finishes the screen.
    const used = new Set(Object.values(claimed).map((c) => c.s.id));
    Object.keys(claimed).forEach((pid) => {
      let poly = sampleSmooth(claimed[pid].s.pts);
      const parts = [{ sid: claimed[pid].s.id, t: claimed[pid].s.t, from: 0, to: poly.length - 1 }];
      for (let guard = 0; guard < 6; guard++) {
        const end = poly[poly.length - 1];
        let next = null,
          bd = 24;
        strokes.forEach((s) => {
          if (used.has(s.id)) return;
          const dd = dist(s.pts[0], end);
          if (dd < bd) (bd = dd), (next = s);
        });
        if (!next) break;
        used.add(next.id);
        const from = poly.length;
        poly = poly.concat(sampleSmooth(next.pts));
        parts.push({ sid: next.id, t: next.t, from, to: poly.length - 1 });
      }
      poly.parts = parts;
      out[pid] = poly;
    });
    const ball = tokens.find((t) => t.t === "ball");
    if (ball) {
      const chain = ballChain(frame, out);
      if (chain) out[ball.id] = chain.poly;
    }
    return out;
  }

  /* Build the next frame: everyone moves to the end of their path, strokes cleared. */
  function advanceFrame(frame) {
    const paths = assignPaths(frame);
    const chain = ballChain(frame, paths);
    const tokens = (frame.tokens || []).map((t) => {
      const nt = { ...t };
      if (t.t === "ball") {
        if (!chain) return nt;
        if (chain.shot) {
          nt.x = Math.round(chain.end[0]);
          nt.y = Math.round(chain.end[1]);
          return nt;
        }
        // Settle the ball next to whoever ends up closest to where it lands, and remember them.
        let rec = null,
          recId = null,
          bd = 40;
        (frame.tokens || [])
          .filter((o) => o.t === "o" || o.t === "x")
          .forEach((o) => {
            const op = paths[o.id] ? paths[o.id][paths[o.id].length - 1] : [o.x, o.y];
            const dd = dist(op, chain.end);
            const pick = chain.carrier ? o.id === chain.carrier : dd < bd;
            if (pick) (bd = dd), (rec = op), (recId = o.id);
          });
        const base = rec || chain.end;
        nt.x = Math.round(base[0] + HAND[0]);
        nt.y = Math.round(base[1] + HAND[1]);
        if (recId) nt.h = recId;
        else delete nt.h;
        return nt;
      }
      const p = paths[t.id];
      if (p) {
        const e = p[p.length - 1];
        nt.x = Math.round(e[0]);
        nt.y = Math.round(e[1]);
      }
      return nt;
    });
    return { tokens, strokes: [] };
  }

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /* Where everyone is at time t (0..1) of the step from fromFrame to toFrame.
     The ball has phases: in a player's hand (it stays at his hand while he dribbles
     or moves) and in the air (pass, handoff, shot). A player who dribbles and then
     gives it up gets there first, so the pass or handoff comes after he arrives. */
  function tween(fromFrame, toFrame, t) {
    const paths = assignPaths(fromFrame);
    const e = ease(t);
    const fromTok = (id) => (fromFrame.tokens || []).find((f) => f.id === id);
    const toTok = (id) => (toFrame.tokens || []).find((f) => f.id === id);
    const ballT = (fromFrame.tokens || []).find((x) => x.t === "ball");
    const chain = ballT ? ballChain(fromFrame, paths) : null;
    const phases = (chain && chain.phases) || [];

    // How far along his path (0..1) a player is at time e. Carriers get their own clock.
    const clocks = {};
    const fracAt = (poly, idx) => {
      const L = polyLength(poly);
      return L ? polyLength(poly.slice(0, idx + 1)) / L : 1;
    };
    // Time windows for the ball's phases: carrying by distance, passes quicker.
    const weight = (ph) => {
      if (ph.kind === "fly") return Math.max(30, polyLength(ph.poly) * 0.45);
      const poly = paths[ph.pid] || [];
      if (!ph.sids) return Math.max(40, polyLength(poly));
      const pts = (poly.parts || []).filter((x) => ph.sids.includes(x.sid));
      return Math.max(40, pts.reduce((sum, x) => sum + polyLength(poly.slice(x.from, x.to + 1)), 0));
    };
    let acc = 0;
    const total = phases.reduce((sum, ph) => sum + weight(ph), 0) || 1;
    phases.forEach((ph) => {
      ph.a = acc / total;
      acc += weight(ph);
      ph.b = phases.length === 1 ? 1 : acc / total;
    });
    phases.forEach((ph, i) => {
      if (ph.kind !== "carry" || clocks[ph.pid]) return;
      const poly = paths[ph.pid] || [];
      let f0 = 0,
        f1 = 1;
      if (ph.sids && poly.parts) {
        const pts = poly.parts.filter((x) => ph.sids.includes(x.sid));
        if (pts.length) {
          f0 = fracAt(poly, pts[0].from);
          f1 = fracAt(poly, pts[pts.length - 1].to);
        }
      }
      // A carry that isn't followed by a pass keeps the ball for the rest of his path.
      if (i === phases.length - 1) f1 = 1;
      const pts = [[0, 0]];
      if (ph.a > 0) pts.push([ph.a, f0]);
      else if (f0 > 0) pts[0] = [0, 0];
      pts.push([ph.b, f1]);
      if (ph.b < 1) pts.push([1, 1]);
      clocks[ph.pid] = pts;
    });
    const clock = (id, time) => {
      const c = clocks[id];
      if (!c) return time;
      for (let i = 1; i < c.length; i++) {
        if (time <= c[i][0]) {
          const [t0, f0] = c[i - 1],
            [t1, f1] = c[i];
          return t1 > t0 ? f0 + ((time - t0) / (t1 - t0)) * (f1 - f0) : f1;
        }
      }
      return c[c.length - 1][1];
    };
    const posOf = (id, time) => {
      const tk = toTok(id),
        from = fromTok(id);
      if (!tk) return null;
      if (!from) return [tk.x, tk.y];
      const p = paths[id];
      const f = clock(id, time);
      if (p && p.length > 1) {
        const pt = pointAt(p, f);
        const s0 = p[0],
          s1 = p[p.length - 1];
        return [pt[0] + (from.x - s0[0]) * (1 - f) + (tk.x - s1[0]) * f, pt[1] + (from.y - s0[1]) * (1 - f) + (tk.y - s1[1]) * f];
      }
      return [from.x + (tk.x - from.x) * time, from.y + (tk.y - from.y) * time];
    };

    const pos = {};
    (toFrame.tokens || []).forEach((tk) => {
      if (tk.t === "ball" && phases.length) return;
      pos[tk.id] = posOf(tk.id, e);
    });
    if (ballT && phases.length && toTok(ballT.id)) {
      // Walk the phases to find where the ball starts and ends each one.
      const fin = toTok(ballT.id);
      let start = [ballT.x, ballT.y];
      let at = null;
      for (let i = 0; i < phases.length; i++) {
        const ph = phases[i];
        const u = ph.b > ph.a ? Math.max(0, Math.min(1, (e - ph.a) / (ph.b - ph.a))) : 1;
        let end;
        if (ph.kind === "carry") {
          const c0 = posOf(ph.pid, ph.a),
            c1 = posOf(ph.pid, ph.b);
          const off0 = [start[0] - c0[0], start[1] - c0[1]];
          const off1 = i === phases.length - 1 ? [fin.x - c1[0], fin.y - c1[1]] : HAND;
          end = [c1[0] + off1[0], c1[1] + off1[1]];
          if (e <= ph.b || i === phases.length - 1) {
            const c = posOf(ph.pid, e);
            at = [c[0] + off0[0] + (off1[0] - off0[0]) * u, c[1] + off0[1] + (off1[1] - off0[1]) * u];
          }
        } else {
          const nx = phases[i + 1];
          if (i === phases.length - 1) end = [fin.x, fin.y];
          else if (nx.kind === "carry") {
            const c = posOf(nx.pid, ph.b);
            end = [c[0] + HAND[0], c[1] + HAND[1]];
          } else end = ph.poly[ph.poly.length - 1];
          if (e <= ph.b || i === phases.length - 1) {
            const q = pointAt(ph.poly, u),
              q0 = ph.poly[0],
              q1 = ph.poly[ph.poly.length - 1];
            at = [q[0] + (start[0] - q0[0]) * (1 - u) + (end[0] - q1[0]) * u, q[1] + (start[1] - q0[1]) * (1 - u) + (end[1] - q1[1]) * u];
          }
        }
        if (at) break;
        start = end;
      }
      pos[ballT.id] = at || [fin.x, fin.y];
    }
    return pos;
  }

  /* Animate the move from frame i to i+1 inside an <svg> that shows frame i.
     Returns a promise; resolves false if cancelled. */
  function animateStep(svg, diagram, i, token, opts = {}) {
    const from = diagram.frames[i];
    const to = diagram.frames[i + 1];
    if (!from || !to) return Promise.resolve(false);
    const layer = svg.querySelector(".diagram-layer");
    // Start from the next frame's tokens at the old positions, with the old strokes fading.
    const p0 = tween(from, to, 0);
    const startTokens = (to.tokens || []).map((tk) => (p0[tk.id] ? { ...tk, x: p0[tk.id][0], y: p0[tk.id][1] } : tk));
    layer.innerHTML = `<g class="strokes fading">${(from.strokes || []).map((s) => strokeMarkup(s)).join("")}</g>` + frameMarkup({ tokens: startTokens, strokes: [] }, opts).replace('<g class="strokes"></g>', "");
    const els = {};
    layer.querySelectorAll(".tok").forEach((el) => (els[el.dataset.tok] = el));
    // The defense moves and turns with the ball as it moves (Lock Left's string).
    const live = BH.defense && BH.defense.liveStep ? BH.defense.liveStep(from, to, opts) : null;
    let lastKey = null;
    const show = (t) => {
      const pos = tween(from, to, t);
      const L = live ? live(pos, t) : null;
      if (L) {
        Object.assign(pos, L.pos);
        if (L.key !== lastKey) {
          // A job changed hands (or the hands went up): redraw those X's.
          L.tokens.forEach((tk) => {
            const el = els[tk.id];
            if (!el) return;
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.innerHTML = xMarkup(tk, L.face[tk.id], L.jobs, opts);
            const nu = g.firstElementChild;
            if (nu) {
              el.replaceWith(nu);
              els[tk.id] = nu;
            }
          });
          lastKey = L.key;
        }
      }
      Object.keys(pos).forEach((id) => {
        const el = els[id];
        if (el) el.setAttribute("transform", `translate(${pos[id][0].toFixed(1)},${pos[id][1].toFixed(1)})`);
      });
      if (L)
        Object.keys(L.face).forEach((id) => {
          const el = els[id];
          if (!el) return;
          const r = `rotate(${L.face[id].toFixed(1)})`;
          el.querySelectorAll(".x-back, .x-hands").forEach((n) => n.setAttribute("transform", r));
        });
    };
    show(0);
    const dur = 1150;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frameFn = (now) => {
        if (token.cancelled) return resolve(false);
        const t = Math.min(1, (now - t0) / dur);
        show(t);
        if (t < 1) requestAnimationFrame(frameFn);
        else resolve(true);
      };
      requestAnimationFrame(frameFn);
    });
  }

  /* Read-only diagram player used on item pages, flashcards and quiz. */
  class Player {
    constructor(host, diagram, opts = {}) {
      this.host = host;
      this.diagram = diagram;
      this.i = 0;
      this.token = { cancelled: false };
      this.opts = opts;
      this.hl = opts.hl || diagram.hl || null;
      const mode = diagram.court || "half";
      host.innerHTML = `
        <div class="player">
          <svg class="court floor" viewBox="${BH.court.viewBox(mode)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opts.label || "Play diagram")}">
            ${BH.court.markup(mode)}
            <g class="diagram-layer"></g>
          </svg>
          ${
            diagram.frames.length > 1
              ? `<div class="player-bar">
            <button class="btn icon" data-act="prev" aria-label="Previous step">${BH.icons.prev}</button>
            <button class="btn play" data-act="play">${BH.icons.play}<span>Run it</span></button>
            <button class="btn icon" data-act="next" aria-label="Next step">${BH.icons.next}</button>
            <span class="step-label" aria-live="polite"></span>
          </div>`
              : ""
          }
        </div>`;
      this.svg = host.querySelector("svg");
      host.querySelectorAll("[data-act]").forEach((b) =>
        b.addEventListener("click", () => {
          const a = b.dataset.act;
          if (a === "play") this.playing ? (this.stop(), (this.paused = true)) : this.play();
          if (a === "prev") (this.stop(), this.show(this.i - 1));
          if (a === "next") (this.stop(), this.show(this.i + 1));
        })
      );
      this.show(0);
    }
    show(i) {
      const n = this.diagram.frames.length;
      this.i = Math.max(0, Math.min(n - 1, i));
      this.svg.querySelector(".diagram-layer").innerHTML = frameMarkup(this.diagram.frames[this.i], { hl: this.hl, tags: this.opts.tags });
      const lbl = this.host.querySelector(".step-label");
      if (lbl) lbl.textContent = `Step ${this.i + 1} of ${n}`;
    }
    setPlaying(on) {
      this.playing = on;
      const b = this.host.querySelector('[data-act="play"]');
      if (b) b.innerHTML = on ? `${BH.icons.pause}<span>Pause</span>` : `${BH.icons.play}<span>Run it</span>`;
    }
    async play() {
      const n = this.diagram.frames.length;
      if (n < 2) return;
      // From the top, unless it was paused: then pick up where it stopped.
      if (!this.paused || this.i >= n - 1) this.show(0);
      this.paused = false;
      this.token = { cancelled: false };
      const token = this.token;
      this.setPlaying(true);
      await new Promise((r) => setTimeout(r, 250));
      while (!token.cancelled && this.i < n - 1) {
        if (BH.prefersReducedMotion()) await new Promise((r) => setTimeout(r, 700));
        else if (!(await animateStep(this.svg, this.diagram, this.i, token, { hl: this.hl, tags: this.opts.tags }))) break;
        if (token.cancelled) break;
        this.show(this.i + 1);
        await new Promise((r) => setTimeout(r, 650));
      }
      if (token === this.token) this.setPlaying(false);
    }
    stop() {
      this.token.cancelled = true;
      this.setPlaying(false);
    }
    /* Light up the X doing a job ("gap", "deny"...), or null for none. Follows him step to step. */
    highlight(job) {
      this.hl = job || null;
      if (!this.playing) this.show(this.i);
    }
    destroy() {
      this.stop();
    }
  }

  BH.diagram = {
    STROKE_TYPES,
    simplify,
    sampleSmooth,
    strokeMarkup,
    tokenMarkup,
    frameMarkup,
    thumbSVG,
    assignPaths,
    advanceFrame,
    ballChain,
    nearestRim,
    shotCurve,
    animateStep,
    tween,
    dist,
    Player,
    empty: (court = "half") => ({ court, frames: [{ tokens: [], strokes: [] }] }),
  };
})();
