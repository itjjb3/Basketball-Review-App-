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
    return `<g class="stk stk-${esc(s.t)}" data-stroke="${esc(s.id)}"${style}>${line}${head}${hitPath}</g>`;
  }

  function tokenMarkup(tk) {
    const tr = `transform="translate(${(+tk.x).toFixed(1)},${(+tk.y).toFixed(1)})"`;
    const id = `data-tok="${esc(tk.id)}"`;
    const n = esc(tk.n || "");
    if (tk.t === "x") {
      return `<g class="tok tok-x" ${id} ${tr}><circle class="tok-hit" r="15" /><path class="x-mark" d="M-9,-9 L9,9 M9,-9 L-9,9" /><text class="x-num" x="10" y="16">${n}</text></g>`;
    }
    if (tk.t === "ball") {
      return `<g class="tok tok-ball" ${id} ${tr}><circle r="7.5" /><path class="seam" d="M-7.5,0 L7.5,0 M0,-7.5 L0,7.5 M-5,-5.3 Q-1.5,0 -5,5.3 M5,-5.3 Q1.5,0 5,5.3" /></g>`;
    }
    if (tk.t === "cone") {
      return `<g class="tok tok-cone" ${id} ${tr}><path d="M0,-11 L9,8 L-9,8 Z" /><path class="cone-band" d="M-4.6,-1.5 L4.6,-1.5" /></g>`;
    }
    return `<g class="tok tok-o" ${id} ${tr}><circle r="14" /><text y="5.6">${n}</text></g>`;
  }

  function frameMarkup(frame, opts = {}) {
    const strokes = (frame.strokes || []).map((s) => strokeMarkup(s, opts)).join("");
    // Draw players first, ball last, so the ball sits on top.
    const order = { cone: 0, x: 1, o: 2, ball: 3 };
    const toks = (frame.tokens || [])
      .slice()
      .sort((a, b) => (order[a.t] ?? 2) - (order[b.t] ?? 2))
      .map(tokenMarkup)
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
    return `<svg class="court floor mini" viewBox="${vb}" preserveAspectRatio="xMidYMin meet" role="img" aria-label="${esc(opts.label || "Diagram")}">${BH.court.markup(mode, { mini: true })}${frameMarkup(frame)}</svg>`;
  }

  /* ---------- motion ---------- */

  /* Which stroke moves which token during the step that follows this frame. */
  function assignPaths(frame) {
    const out = {};
    const tokens = frame.tokens || [];
    const strokes = (frame.strokes || []).filter((s) => s.pts && s.pts.length > 1 && s.t !== "pen");
    const players = tokens.filter((t) => t.t === "o" || t.t === "x");
    const claimed = {};
    strokes
      .filter((s) => s.t !== "pass")
      .forEach((s) => {
        let best = null,
          bd = 26;
        players.forEach((p) => {
          const dd = dist(s.pts[0], [p.x, p.y]);
          if (dd < bd && !(claimed[p.id] && claimed[p.id].d <= dd)) (bd = dd), (best = p);
        });
        if (best) claimed[best.id] = { d: bd, poly: sampleSmooth(s.pts) };
      });
    Object.keys(claimed).forEach((k) => (out[k] = claimed[k].poly));
    const ball = tokens.find((t) => t.t === "ball");
    if (ball) {
      const near = (types) => {
        let best = null,
          bd = 34;
        strokes
          .filter((s) => types.includes(s.t))
          .forEach((s) => {
            const dd = dist(s.pts[0], [ball.x, ball.y]);
            if (dd < bd) (bd = dd), (best = s);
          });
        return best;
      };
      const pass = near(["pass"]);
      const drib = near(["dribble"]);
      if (pass && drib) {
        // Dribble, then pass from where the dribble ends.
        const dp = sampleSmooth(drib.pts);
        out[ball.id] = dp.concat([pass.pts[0], pass.pts[pass.pts.length - 1]]);
      } else if (pass) {
        out[ball.id] = [pass.pts[0], pass.pts[pass.pts.length - 1]];
      } else if (drib) {
        out[ball.id] = sampleSmooth(drib.pts);
      } else {
        // Ball rides with a player who has a cut/dribble starting next to it.
        let carrier = null,
          bd = 30;
        players.forEach((p) => {
          const dd = dist([p.x, p.y], [ball.x, ball.y]);
          if (out[p.id] && dd < bd) (bd = dd), (carrier = p);
        });
        if (carrier) out[ball.id] = out[carrier.id].map((q) => [q[0] + (ball.x - carrier.x), q[1] + (ball.y - carrier.y)]);
      }
    }
    return out;
  }

  /* Build the next frame: everyone moves to the end of their path, strokes cleared. */
  function advanceFrame(frame) {
    const paths = assignPaths(frame);
    const tokens = (frame.tokens || []).map((t) => {
      const nt = { ...t };
      const p = paths[t.id];
      if (p) {
        const e = p[p.length - 1];
        if (t.t === "ball") {
          // Settle the ball next to whoever is closest to where it lands.
          const others = (frame.tokens || []).filter((o) => o.t === "o" || o.t === "x");
          let rec = null,
            bd = 40;
          others.forEach((o) => {
            const op = paths[o.id] ? paths[o.id][paths[o.id].length - 1] : [o.x, o.y];
            const dd = dist(op, e);
            if (dd < bd) (bd = dd), (rec = op);
          });
          const base = rec || e;
          nt.x = Math.round(base[0] + 13);
          nt.y = Math.round(base[1] - 12);
        } else {
          nt.x = Math.round(e[0]);
          nt.y = Math.round(e[1]);
        }
      }
      return nt;
    });
    return { tokens, strokes: [] };
  }

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function tween(fromFrame, toFrame, t) {
    const paths = assignPaths(fromFrame);
    const e = ease(t);
    const pos = {};
    (toFrame.tokens || []).forEach((tk) => {
      const from = (fromFrame.tokens || []).find((f) => f.id === tk.id);
      if (!from) return (pos[tk.id] = [tk.x, tk.y]);
      const p = paths[tk.id];
      if (p && p.length > 1) {
        const pt = pointAt(p, e);
        const s0 = p[0],
          s1 = p[p.length - 1];
        pos[tk.id] = [pt[0] + (from.x - s0[0]) * (1 - e) + (tk.x - s1[0]) * e, pt[1] + (from.y - s0[1]) * (1 - e) + (tk.y - s1[1]) * e];
      } else {
        pos[tk.id] = [from.x + (tk.x - from.x) * e, from.y + (tk.y - from.y) * e];
      }
    });
    return pos;
  }

  /* Animate the move from frame i to i+1 inside an <svg> that shows frame i.
     Returns a promise; resolves false if cancelled. */
  function animateStep(svg, diagram, i, token) {
    const from = diagram.frames[i];
    const to = diagram.frames[i + 1];
    if (!from || !to) return Promise.resolve(false);
    const layer = svg.querySelector(".diagram-layer");
    // Start from the next frame's tokens at the old positions, with the old strokes fading.
    const p0 = tween(from, to, 0);
    const startTokens = (to.tokens || []).map((tk) => (p0[tk.id] ? { ...tk, x: p0[tk.id][0], y: p0[tk.id][1] } : tk));
    layer.innerHTML = `<g class="strokes fading">${(from.strokes || []).map((s) => strokeMarkup(s)).join("")}</g>` + frameMarkup({ tokens: startTokens, strokes: [] }).replace('<g class="strokes"></g>', "");
    const els = {};
    layer.querySelectorAll(".tok").forEach((el) => (els[el.dataset.tok] = el));
    const dur = 1150;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frameFn = (now) => {
        if (token.cancelled) return resolve(false);
        const t = Math.min(1, (now - t0) / dur);
        const pos = tween(from, to, t);
        Object.keys(pos).forEach((id) => {
          const el = els[id];
          if (el) el.setAttribute("transform", `translate(${pos[id][0].toFixed(1)},${pos[id][1].toFixed(1)})`);
        });
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
          if (a === "play") this.playing ? this.stop() : this.play();
          if (a === "prev") (this.stop(), this.show(this.i - 1));
          if (a === "next") (this.stop(), this.show(this.i + 1));
        })
      );
      this.show(0);
    }
    show(i) {
      const n = this.diagram.frames.length;
      this.i = Math.max(0, Math.min(n - 1, i));
      this.svg.querySelector(".diagram-layer").innerHTML = frameMarkup(this.diagram.frames[this.i]);
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
      if (this.i >= n - 1) this.show(0);
      this.token = { cancelled: false };
      const token = this.token;
      this.setPlaying(true);
      await new Promise((r) => setTimeout(r, 250));
      while (!token.cancelled && this.i < n - 1) {
        if (BH.prefersReducedMotion()) await new Promise((r) => setTimeout(r, 700));
        else if (!(await animateStep(this.svg, this.diagram, this.i, token))) break;
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
    animateStep,
    tween,
    dist,
    Player,
    empty: (court = "half") => ({ court, frames: [{ tokens: [], strokes: [] }] }),
  };
})();
