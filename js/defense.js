/* Defense: who is guarding whom, each defender's job in Lock Left (On Ball, Gap,
   Deny, Wall, Bear) from where the ball is, where Lock Left puts them, how they rotate
   on a drive, and which way they face (their stance). Used to draw the X's (with a "("
   for their back), to put the defense on the whiteboard, and to light up the X that a
   term like Gap or Deny is about. */
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
    // Right after a drive, everyone keeps the job he had when it started.
    const kept = defenders(f).filter((x) => x.j && role(x.j));
    if (kept.length) {
      kept.forEach((x) => (out[x.id] = x.j));
      return out;
    }
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

  /* ---- stances: which way each defender faces ----
     Each job has a base direction and a direction it turns toward, and the stance is
     how many degrees he's turned (the coach can rotate an X and save it for everyone):
     - On Ball Shade: faces the handler, turned toward the handler's LEFT (chest to
       JAIL, his body walling the right hand).
     - Deny (closed): chest to his man, turned toward the ball.
     - Gap (open): faces the ball, turned toward his man.
     - Wall, Bear and anyone else: ball-you-man, so he sees both. */
  const DEFAULT_STANCE = { ball: 35, deny: 25, gap: 25, wall: 0, bear: 0 };
  const rot = (v, deg) => {
    const a = (deg * Math.PI) / 180,
      c = Math.cos(a),
      sn = Math.sin(a);
    return [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
  };
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const angOf = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
  /* Lock Left's saved stances, over the defaults. */
  function stance(draft) {
    const it = BH.store && BH.store.items().find((x) => x.rule === "lock-left");
    return { ...DEFAULT_STANCE, ...((it && it.stance) || {}), ...(draft || {}) };
  }
  /* A defender's job and the two directions his stance is measured from. */
  function jobFrame(f, x, jobs, m) {
    jobs = jobs || roles(f);
    m = m || matchups(f);
    const tok = (id) => (f.tokens || []).find((t) => t.id === id);
    const h = holder(f);
    const ball = (f.tokens || []).find((t) => t.t === "ball");
    const B = h ? P(h) : ball ? [ball.x, ball.y] : null;
    const X = P(x);
    const o = m[x.id] && tok(m[x.id]);
    const job = jobs[x.id] || null;
    const toward = (p) => (p && dist(p, X) > 0.5 ? unit(sub(p, X)) : null);
    let base = null,
      to = null;
    if (job === "ball" && o) {
      const fh = unit(sub(RIM, P(o)));
      base = toward(P(o));
      to = [fh[1], -fh[0]]; // the handler's left
    } else if (job === "deny" && o && B) {
      base = toward(P(o));
      to = toward(B);
    } else if (job === "gap" && o && B) {
      base = toward(B);
      to = toward(P(o));
    } else if (o && B && !(h && o.id === h.id)) {
      const a = toward(P(o)),
        b = toward(B);
      if (a && b) {
        base = add(a, b);
        if (Math.hypot(base[0], base[1]) < 0.35) {
          // In the passing lane with man and ball on opposite sides: open up away from the rim.
          const away = unit(sub(X, RIM));
          const p1 = [-a[1], a[0]];
          base = p1[0] * away[0] + p1[1] * away[1] >= 0 ? p1 : mul(p1, -1);
        }
        base = unit(base);
        to = b;
      }
    } else if (o) base = toward(P(o));
    else if (B) base = toward(B);
    if (!base) base = [0, 1];
    return { job, base, to };
  }
  const turned = (fr, deg) => (fr.to && deg ? rot(fr.base, cross(fr.base, fr.to) >= 0 ? deg : -deg) : fr.base);

  /* Which way each defender faces, in degrees. An X with his own angle (f) keeps it. */
  function facing(f, draft) {
    const out = {};
    const xs = defenders(f);
    if (!xs.length) return out;
    const st = stance(draft);
    const jobs = roles(f),
      m = matchups(f);
    xs.forEach((x) => {
      if (typeof x.f === "number" && isFinite(x.f)) return (out[x.id] = x.f);
      const fr = jobFrame(f, x, jobs, m);
      out[x.id] = angOf(turned(fr, fr.job ? st[fr.job] || 0 : 0));
    });
    return out;
  }

  /* Rotating an X to point at angle deg: the job it sets and the stance that gives it. */
  function stanceFor(f, xId, deg) {
    const x = defenders(f).find((t) => t.id === xId);
    if (!x) return null;
    const fr = jobFrame(f, x);
    if (!fr.job) return null;
    let off = wrap(deg - angOf(fr.base));
    if (fr.to && cross(fr.base, fr.to) < 0) off = -off;
    return { job: fr.job, deg: Math.round(off) };
  }

  /* ---- drives: Wall helps, Bear fills, Gap snipes and grabs ---- */
  const DEF_INK = "#b3261e";
  /* Is the ball handler driving this step? A dribble (or a move with the ball) that
     ends inside the arc and gets at least 4.5 ft closer to the rim. A dribble into a
     handoff isn't a drive. Returns { pid, from, to, mid, side } or null. */
  function driveIn(f) {
    const D = BH.diagram;
    if (!D || !(f.strokes || []).length) return null;
    const h = holder(f);
    if (!h) return null;
    const paths = D.assignPaths(f);
    const chain = D.ballChain(f, paths);
    const ph = chain && chain.phases && chain.phases[0];
    if (!ph || ph.kind !== "carry" || ph.pid !== h.id) return null;
    const nx = chain.phases[1];
    if (nx && nx.kind === "fly" && nx.t === "handoff") return null;
    const poly = paths[h.id];
    if (!poly || poly.length < 2) return null;
    const parts = (poly.parts || []).filter((x) => !ph.sids || ph.sids.includes(x.sid));
    const endIdx = parts.length ? parts[parts.length - 1].to : poly.length - 1;
    const from = P(h),
      to = poly[endIdx];
    if (dist(to, RIM) >= 190 || dist(from, RIM) - dist(to, RIM) < 45) return null;
    const side = Math.abs(to[0] - 250) > 15 ? Math.sign(to[0] - 250) : Math.sign(from[0] - 250) || 1;
    return { pid: h.id, from, to, mid: poly[Math.floor(endIdx / 2)], side };
  }

  /* How everyone rotates on a drive. f: the step the drive starts on (with our X's);
     next: the step after (where the offense ends up). Returns { strokes, ends }: our
     lines for this step, and our X's for the next step (each keeps his job as j). */
  function respond(f, drive, next) {
    const jobs = roles(f),
      m = matchups(f);
    const endOf = (oid) => {
      const t = (next.tokens || []).find((x) => x.id === oid) || (f.tokens || []).find((x) => x.id === oid);
      return t ? P(t) : null;
    };
    const Dv = drive.to;
    const toRimD = unit(sub(RIM, Dv));
    const rightD = [-toRimD[1], toRimD[0]];
    const wallX = Object.keys(jobs).find((x) => jobs[x] === "wall");
    const wallMan = wallX && m[wallX] ? endOf(m[wallX]) : null;
    const strokes = [],
      ends = [];
    const rnd = (q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10];
    defenders(f).forEach((x) => {
      const X = P(x),
        job = jobs[x.id],
        man = m[x.id] ? endOf(m[x.id]) : null;
      let end,
        path = null,
        hh = false;
      if (job === "ball") {
        end = add(add(Dv, mul(rightD, 24)), mul(toRimD, -4)); // Gnaw: stay on his right hip
      } else if (job === "wall") {
        end = add(Dv, mul(toRimD, 36)); // stop the ball at the edge of the paint
      } else if (job === "bear") {
        // Split the difference: the middle of the paint, the opposite block, the Wall's man.
        const spots = [[250, 100], [250 - drive.side * 45, 78]];
        if (wallMan) spots.push(wallMan);
        end = [spots.reduce((a, q) => a + q[0], 0) / spots.length, spots.reduce((a, q) => a + q[1], 0) / spots.length];
      } else if (job === "gap") {
        // Snipe and grab: one step at the ball (the stunt), then close out hands high in the lane.
        const stunt = add(X, mul(unit(sub(drive.mid, X)), 28));
        end = man ? lerp(Dv, man, 0.7) : X;
        path = [X, stunt, end];
        hh = true;
      } else if (job === "deny" && man) {
        end = add(add(man, mul(unit(sub(Dv, man)), 31)), mul(unit(sub(RIM, man)), 6)); // still in the lane
      } else {
        end = lerp(X, RIM, 0.15);
      }
      end = clampPt(end);
      if (path) path[path.length - 1] = end;
      if (dist(X, end) > 8) strokes.push({ id: "dz" + x.id, t: "cut", pts: (path || [X, lerp(X, end, 0.5), end]).map(rnd), c: DEF_INK });
      const nx = { ...x, x: end[0], y: end[1] };
      delete nx.hh;
      delete nx.j;
      if (job) nx.j = job;
      if (hh) nx.hh = true;
      ends.push(nx);
    });
    return { strokes, ends };
  }

  /* Lock Left over a whole possession: our X's where Lock Left puts them each step, and
     on a drive the rotation (Wall, Bear, Gap's snipe and grab) drawn as our lines, with
     the next step starting from where everyone rotated to. */
  function defendFrames(frames) {
    const out = [];
    let carry = null;
    frames.forEach((f, i) => {
      const keep = (f.tokens || []).filter((t) => t.t !== "x");
      const g = { ...f, tokens: [...keep, ...(carry || place(f))], strokes: (f.strokes || []).slice() };
      carry = null;
      const next = frames[i + 1];
      const dv = next && driveIn(g);
      if (dv) {
        const r = respond(g, dv, next);
        g.strokes.push(...r.strokes);
        carry = r.ends;
      }
      out.push(g);
    });
    return out;
  }

  /* The Lock Left example for the playbook and the terms: 4-Out, the ball goes around
     (slot to slot, to the right corner, back, slot to slot), then 1 drives left and
     kicks it to 3 in JAIL. You see every job change with the ball, the rotation on the
     drive (Wall up, Bear fills, Gap's snipe and grab) and the closeout on the kick. */
  let demoCache = null;
  function demo() {
    if (demoCache) return demoCache;
    const four = BH.store && BH.store.get("4-out");
    const o = (n, x, y) => ({ id: "o" + n, t: "o", n: String(n), x, y });
    const start = four && BH.hasDiagram(four) ? BH.clone(four.diagram.frames[0].tokens) : [o(1, 172, 268), { id: "ball", t: "ball", n: "", x: 185, y: 256, h: "o1" }, o(5, 328, 268), o(3, 30, 42), o(2, 470, 42), o(4, 175, 76)];
    let f = { tokens: start.filter((t) => t.t !== "x"), strokes: [] };
    let frames = [];
    const byN = (n) => f.tokens.find((t) => t.t === "o" && t.n === n);
    for (const n of ["5", "2", "5", "1"]) {
      const h = holder(f),
        to = byN(n);
      if (!h || !to || h.id === to.id) break;
      f.strokes = [{ id: "dp" + frames.length, t: "pass", pts: [P(h), P(to)] }];
      frames.push(f);
      f = BH.diagram.advanceFrame(f);
    }
    frames.push(f);
    if (BH.engine) {
      for (const r of ["drive", "kick"]) {
        const res = BH.engine.extend(frames, r);
        if (res.error) break;
        frames = res.frames;
      }
    }
    demoCache = { court: "half", frames: defendFrames(frames) };
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
    if (!job) return "Hit <b>Run it</b> to watch the defense move with the ball and rotate on a drive.";
    const t = jobTerm(job);
    const r = role(job);
    const name = t ? t.name : r.label;
    const what = t && t.summary ? esc(t.summary) : "";
    const none = present === false ? ` <b>No one has this job on this step.</b>` : ` <span class="muted">The job moves to whoever it fits as the ball moves.</span>`;
    return `<b>${esc(name)}.</b> ${what}${none}${t ? ` <a href="#item-${esc(t.id)}">Open ${esc(name)}</a>` : ""}`;
  }

  BH.defense = { ROLES, role, TERMS, termRole, terms, matchups, roles, place, withDefense, defendFrames, driveIn, respond, facing, stance, stanceFor, DEFAULT_STANCE, demo, jobTerm, jobsMarkup, jobText };
})();
