/* Defense: who is guarding whom, each defender's job in Lock Left (On Ball, Gap,
   Deny, Wall, Bear) from where the ball is, where Lock Left puts them, and which way
   they face. Used to draw the X's (with a "(" for their back), to place the defense on
   the whiteboard, and to light up the X that a term like Gap or Deny is about. */
(function () {
  const BH = window.BH;
  const RIM = [250, 52.5];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const unit = (a) => {
    const L = Math.hypot(a[0], a[1]) || 1;
    return [a[0] / L, a[1] / L];
  };
  const P = (t) => [t.x, t.y];
  const offense = (f) => (f.tokens || []).filter((t) => t.t === "o");
  const defenders = (f) => (f.tokens || []).filter((t) => t.t === "x");
  const isPerimeter = (p) => dist(p, RIM) > 155;
  // Position along the arc: the left corner is smallest, the right corner largest.
  // Left here is the offense's left (they face our basket at the top), toward JAIL.
  const arcKey = (p) => -Math.atan2(Math.max(p[1], 53) - RIM[1], p[0] - RIM[0]);

  /* The jobs, in the order we teach them. */
  const ROLES = [
    { id: "ball", label: "On Ball", tag: "BALL" },
    { id: "gap", label: "Gap", tag: "GAP" },
    { id: "deny", label: "Deny", tag: "DENY" },
    { id: "wall", label: "Wall", tag: "WALL" },
    { id: "bear", label: "Bear", tag: "BEAR" },
  ];
  const role = (id) => ROLES.find((r) => r.id === id);

  /* Lock Left's words, and the defender each one is about (null: no one X). */
  const TERMS = {
    "on-ball-shade": "ball",
    gnaw: "ball",
    "attack-the-hip": "ball",
    gap: "gap",
    "snipe-and-grab": "gap",
    deny: "deny",
    wall: "wall",
    bear: "bear",
    ice: null,
    fire: null,
    contain: null,
    scram: null,
    wolf: null,
    tiger: null,
  };
  const termRole = (item) => (item && TERMS[item.id]) || null;

  function holder(f) {
    return BH.engine ? BH.engine.holder(f) : null;
  }

  /* Who each defender is guarding: { xId: oId }. X3 guards 3 when there's a 3 on the
     floor; anyone left over is paired with the closest open man. */
  function matchups(f) {
    const xs = defenders(f),
      os = offense(f);
    const out = {},
      takenO = new Set(),
      takenX = new Set();
    xs.forEach((x) => {
      const o = x.n && os.find((q) => q.n === x.n && !takenO.has(q.id));
      if (o) {
        out[x.id] = o.id;
        takenO.add(o.id);
        takenX.add(x.id);
      }
    });
    const pairs = [];
    xs.forEach((x) => !takenX.has(x.id) && os.forEach((o) => !takenO.has(o.id) && pairs.push([dist(P(x), P(o)), x, o])));
    pairs
      .sort((a, b) => a[0] - b[0])
      .forEach(([, x, o]) => {
        if (takenX.has(x.id) || takenO.has(o.id)) return;
        out[x.id] = o.id;
        takenX.add(x.id);
        takenO.add(o.id);
      });
    return out;
  }

  /* Each defender's job right now: { xId: "ball" | "gap" | "deny" | "wall" | "bear" }.
     On Ball guards the ball. Gap: the first off-ball defender to the left (toward JAIL).
     Deny: the first off-ball defender to the right. Of the rest, the one whose man is
     closest to the rim is the Wall (paint help) and the next is the Bear, who drops to
     fill for the Wall. */
  function roles(f) {
    const out = {};
    const h = holder(f);
    if (!h || !defenders(f).length) return out;
    const m = matchups(f);
    const guard = {};
    Object.keys(m).forEach((x) => (guard[m[x]] = x));
    const os = offense(f);
    if (guard[h.id]) out[guard[h.id]] = "ball";
    const hk = arcKey(P(h));
    const per = os.filter((o) => o.id !== h.id && isPerimeter(P(o)));
    const left = per.filter((o) => arcKey(P(o)) < hk).sort((a, b) => arcKey(P(b)) - arcKey(P(a)))[0];
    const right = per.filter((o) => arcKey(P(o)) > hk).sort((a, b) => arcKey(P(a)) - arcKey(P(b)))[0];
    if (left && guard[left.id]) out[guard[left.id]] = "gap";
    if (right && guard[right.id]) out[guard[right.id]] = "deny";
    const rest = os.filter((o) => o.id !== h.id && guard[o.id] && !out[guard[o.id]]).sort((a, b) => dist(P(a), RIM) - dist(P(b), RIM));
    if (rest[0]) out[guard[rest[0].id]] = "wall";
    if (rest[1]) out[guard[rest[1].id]] = "bear";
    return out;
  }

  const clampPt = (p) => [Math.round(Math.max(14, Math.min(486, p[0]))), Math.round(Math.max(14, Math.min(460, p[1])))];

  /* Lock Left: X tokens for the offense on this frame (X1 on 1, and so on). */
  function place(f) {
    const os = offense(f);
    if (!os.length) return [];
    const ball = (f.tokens || []).find((t) => t.t === "ball");
    const h = holder(f);
    const xs = os.map((o) => ({ id: "dx" + (o.n || o.id), t: "x", n: o.n, x: o.x, y: o.y }));
    const r = roles({ tokens: [...os, ...xs, ...(ball ? [ball] : [])] });
    const B = h ? P(h) : ball ? [ball.x, ball.y] : [250, 300];
    return xs.map((x, i) => {
      const M = P(os[i]);
      const toRim = unit(sub(RIM, M)),
        toBall = unit(sub(B, M));
      let q;
      switch (r[x.id]) {
        case "ball": {
          // Between him and the rim, shaded to his right hand (he faces the rim) so he goes left.
          const right = [-toRim[1], toRim[0]];
          q = add(add(M, mul(toRim, 28)), mul(right, 12));
          break;
        }
        case "deny": // a step off him in the passing lane, hand in the lane
          q = add(add(M, mul(toBall, 31)), mul(toRim, 6));
          break;
        case "gap": {
          // between the driving lane and the passing lane
          const g = lerp(M, B, 0.38);
          q = add(g, mul(unit(sub(RIM, g)), 30));
          break;
        }
        case "wall": // paint help: in the paint on the ball side of his man
          q = dist(M, RIM) < 140 ? add(M, mul(toBall, 27)) : lerp(M, [250 + Math.sign(B[0] - 250) * 30, 135], 0.65);
          break;
        case "bear": {
          // drops toward the rim on the help side, ready to fill for the Wall
          const d = lerp(M, RIM, 0.5);
          q = [d[0] + (250 - d[0]) * 0.35, d[1] + 18];
          break;
        }
        default:
          q = lerp(M, RIM, 0.3);
      }
      const c = clampPt(q);
      return { ...x, x: c[0], y: c[1] };
    });
  }

  /* A frame with Lock Left on it: the offense as is, our X's where Lock Left puts them. */
  function withDefense(f) {
    const keep = (f.tokens || []).filter((t) => t.t !== "x");
    return { ...f, tokens: [...keep, ...place(f)] };
  }

  /* Which way each defender faces, in degrees: ball-you-man, so he can see both his
     man and the ball. On the ball he faces his man. In a passing lane (man and ball on
     opposite sides) he opens up away from the rim. */
  function facing(f) {
    const out = {};
    const xs = defenders(f);
    if (!xs.length) return out;
    const m = matchups(f);
    const h = holder(f);
    const ball = (f.tokens || []).find((t) => t.t === "ball");
    const B = h ? P(h) : ball ? [ball.x, ball.y] : null;
    const tok = (id) => (f.tokens || []).find((t) => t.id === id);
    xs.forEach((x) => {
      const X = P(x);
      const o = m[x.id] && tok(m[x.id]);
      let v;
      if (o && B && !(h && o.id === h.id)) {
        const a = unit(sub(P(o), X)),
          b = unit(sub(B, X));
        v = add(a, b);
        if (Math.hypot(v[0], v[1]) < 0.35) {
          const away = unit(sub(X, RIM));
          const p1 = [-a[1], a[0]];
          v = p1[0] * away[0] + p1[1] * away[1] >= 0 ? p1 : mul(p1, -1);
        }
      } else if (o) v = sub(P(o), X);
      else if (B) v = sub(B, X);
      else v = [0, 1];
      if (Math.hypot(v[0], v[1]) < 0.01) v = [0, 1];
      out[x.id] = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    });
    return out;
  }

  /* The Lock Left example for the playbook and the terms: 4-Out, and the ball goes
     around (slot to slot, to the right corner, back, slot to slot, then into JAIL in
     the left corner) so you can watch everyone's job change. Each step has the
     defense where Lock Left puts it. */
  let demoCache = null;
  function demo() {
    if (demoCache) return demoCache;
    const four = BH.store && BH.store.get("4-out");
    const o = (n, x, y) => ({ id: "o" + n, t: "o", n: String(n), x, y });
    const start = four && BH.hasDiagram(four) ? BH.clone(four.diagram.frames[0].tokens) : [o(1, 172, 268), { id: "ball", t: "ball", n: "", x: 185, y: 256, h: "o1" }, o(5, 328, 268), o(3, 30, 42), o(2, 470, 42), o(4, 175, 76)];
    let f = { tokens: start.filter((t) => t.t !== "x"), strokes: [] };
    const frames = [];
    const byN = (n) => f.tokens.find((t) => t.t === "o" && t.n === n);
    for (const n of ["5", "2", "5", "1", "3"]) {
      const h = holder(f),
        to = byN(n);
      if (!h || !to || h.id === to.id) break;
      f.strokes = [{ id: "dp" + frames.length, t: "pass", pts: [P(h), P(to)] }];
      frames.push(f);
      f = BH.diagram.advanceFrame(f);
    }
    frames.push(f);
    demoCache = { court: "half", frames: frames.map(withDefense) };
    return demoCache;
  }
  BH.on("program", () => (demoCache = null));

  /* The terms in the program that belong to Lock Left, in teaching order. */
  function terms() {
    if (!BH.store) return [];
    return Object.keys(TERMS)
      .map((id) => BH.store.get(id))
      .filter(Boolean);
  }

  /* ---- the job chips (playbook pages and the whiteboard) ---- */
  const esc = (x) => BH.esc(x);
  /* The program's term for a job (Gap -> the Gap item), if there is one. */
  function jobTerm(job) {
    const id = Object.keys(TERMS).find((t) => TERMS[t] === job && BH.store && BH.store.get(t));
    return id ? BH.store.get(id) : null;
  }
  function jobsMarkup(sel, present) {
    const chips = ROLES.map((r) => {
      const t = jobTerm(r.id);
      return `<button class="job-chip${sel === r.id ? " on" : ""}" data-job="${r.id}" aria-pressed="${sel === r.id}">${esc(t ? t.name : r.label)}</button>`;
    }).join("");
    return `<div class="jobs">
        <p class="jobs-title">Tap a job to see who's doing it</p>
        <div class="jobs-row" role="group" aria-label="Lock Left jobs">${chips}</div>
        <p class="job-def" aria-live="polite">${jobText(sel, present)}</p>
      </div>`;
  }
  /* present: false when no one has the job on this step (no one to the ball's left, say). */
  function jobText(job, present) {
    if (!job) return "Hit <b>Run it</b> to watch the defense move with the ball.";
    const t = jobTerm(job);
    const r = role(job);
    const name = t ? t.name : r.label;
    const what = t && t.summary ? esc(t.summary) : "";
    const none = present === false ? ` <b>No one has this job on this step.</b>` : ` <span class="muted">The job moves to whoever it fits as the ball moves.</span>`;
    return `<b>${esc(name)}.</b> ${what}${none}${t ? ` <a href="#item-${esc(t.id)}">Open ${esc(name)}</a>` : ""}`;
  }

  BH.defense = { ROLES, role, TERMS, termRole, terms, matchups, roles, place, withDefense, facing, demo, jobTerm, jobsMarkup, jobText };
})();
