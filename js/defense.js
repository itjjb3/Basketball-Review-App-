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

  /* Who each defender is guarding: { xId: oId }. X3 guards 3 (X1 on 1, X2 on 2...);
     after a switch (Scram) an X guards m. Anyone left over takes the closest open man. */
  function matchups(f) {
    const xs = defenders(f),
      os = offense(f);
    const out = {},
      takenO = new Set(),
      takenX = new Set();
    const pair = (x, num) => {
      const o = num && os.find((q) => q.n === String(num) && !takenO.has(q.id));
      if (!o) return;
      out[x.id] = o.id;
      takenO.add(o.id);
      takenX.add(x.id);
    };
    xs.filter((x) => x.m).forEach((x) => pair(x, x.m));
    xs.filter((x) => !takenX.has(x.id)).forEach((x) => pair(x, x.n));
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

  /* The ball is at the top of the key: out on the perimeter, in the middle of the floor. */
  const isTop = (p) => dist(p, RIM) > 155 && Math.abs(p[0] - 250) < 45;
  /* A corner: out on the perimeter, low, wide. */
  const isCorner = (p) => isPerimeter(p) && p[1] < 130 && Math.abs(p[0] - 250) > 150;

  /* Each defender's jobs right now: { xId: ["gap", "bear"] }, the main one first.
     - On Ball guards the ball. Gap: the first off-ball defender to the left (toward
       JAIL). Deny: the first off-ball defender to the right.
     - Ball at the top of the key: each corner's defender is a Wall (which one depends
       on the drive), and the Gap and Deny are also the Bear.
     - Otherwise: of the rest, the one whose man is closest to the rim is the Wall
       (paint help) and the next is the Bear, who drops to fill for the Wall.
     Right after a drive, everyone keeps the jobs he had when it started (j). */
  function jobsOf(f) {
    const out = {};
    const xs = defenders(f);
    const kept = xs.filter((x) => x.j);
    if (kept.length) {
      kept.forEach((x) => {
        const js = (Array.isArray(x.j) ? x.j : [x.j]).filter((j) => role(j));
        if (js.length) out[x.id] = js;
      });
      return out;
    }
    const h = holder(f);
    if (!h || !xs.length) return out;
    const m = matchups(f);
    const guard = {};
    Object.keys(m).forEach((x) => (guard[m[x]] = x));
    const give = (xId, j) => {
      if (!xId) return;
      out[xId] = out[xId] || [];
      if (!out[xId].includes(j)) out[xId].push(j);
    };
    const os = offense(f);
    give(guard[h.id], "ball");
    const hk = arcKey(P(h));
    const per = os.filter((o) => o.id !== h.id && isPerimeter(P(o)));
    const left = per.filter((o) => arcKey(P(o)) < hk).sort((a, b) => arcKey(P(b)) - arcKey(P(a)))[0];
    const right = per.filter((o) => arcKey(P(o)) > hk).sort((a, b) => arcKey(P(a)) - arcKey(P(b)))[0];
    if (left) give(guard[left.id], "gap");
    if (right) give(guard[right.id], "deny");
    if (isTop(P(h))) {
      os.filter((o) => o.id !== h.id && isCorner(P(o))).forEach((o) => give(guard[o.id], "wall"));
      if (left) give(guard[left.id], "bear");
      if (right) give(guard[right.id], "bear");
    } else {
      const rest = os.filter((o) => o.id !== h.id && guard[o.id] && !out[guard[o.id]]).sort((a, b) => dist(P(a), RIM) - dist(P(b), RIM));
      if (rest[0]) give(guard[rest[0].id], "wall");
      // The Bear helps the helper: the weak-side slot or wing (he can be the Deny too).
      // With nobody up top on the weak side, the next man closest to the rim.
      const bs = P(h)[0] >= 250 ? 1 : -1;
      const wallX = rest[0] && guard[rest[0].id];
      const helper = os
        .filter((o) => o.id !== h.id && isPerimeter(P(o)) && !isCorner(P(o)) && (P(o)[0] >= 250 ? 1 : -1) === -bs && Math.abs(P(o)[0] - 250) > 15)
        .filter((o) => {
          const x = guard[o.id];
          return x && x !== wallX && !(out[x] || []).some((j) => j === "ball" || j === "gap");
        })
        .sort((a, b) => dist(P(a), P(h)) - dist(P(b), P(h)))[0];
      if (helper) give(guard[helper.id], "bear");
      else if (rest[1]) give(guard[rest[1].id], "bear");
    }
    return out;
  }
  /* Each defender's main job: { xId: "ball" | "gap" | "deny" | "wall" | "bear" }. */
  function roles(f) {
    const js = jobsOf(f),
      out = {};
    Object.keys(js).forEach((x) => (out[x] = js[x][0]));
    return out;
  }

  const clampPt = (p) => [Math.round(Math.max(14, Math.min(486, p[0]))), Math.round(Math.max(14, Math.min(460, p[1])))];

  /* Where Lock Left puts a defender with this job, guarding a man at M, ball at B. */
  function spotFor(job, M, B) {
    const toRim = unit(sub(RIM, M)),
      toBall = unit(sub(B, M));
    let q;
    switch (job) {
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
      case "wall": {
        // Paint help. On a post man: side-fronting him on the ball side. Off a perimeter man:
        // in the paint, leaning to the ball's side. Both change gradually as the ball and his
        // man move, so he never jumps across the lane.
        const near = add(M, mul(toBall, 27));
        const lean = Math.max(-1, Math.min(1, (B[0] - 250) / 60));
        const far = lerp(M, [250 + lean * 30, 135], 0.65);
        q = lerp(near, far, Math.max(0, Math.min(1, (dist(M, RIM) - 120) / 40)));
        break;
      }
      case "bear": {
        // drops toward the rim on the help side, ready to fill for the Wall
        const d = lerp(M, RIM, 0.5);
        q = [d[0] + (250 - d[0]) * 0.35, d[1] + 18];
        break;
      }
      default:
        q = lerp(M, RIM, 0.3);
    }
    return clampPt(q);
  }
  /* The ball point: the handler if someone has it, else where the ball is. */
  function ballPoint(f) {
    const h = holder(f);
    const ball = (f.tokens || []).find((t) => t.t === "ball");
    return h ? P(h) : ball ? [ball.x, ball.y] : [250, 300];
  }

  /* Lock Left: X tokens for the offense on this frame (X1 on 1, and so on).
     guard: { defender number: man number } for anyone switched (Scram). */
  function place(f, guard) {
    const os = offense(f);
    if (!os.length) return [];
    const ball = (f.tokens || []).find((t) => t.t === "ball");
    const defOf = {};
    Object.keys(guard || {}).forEach((d) => (defOf[guard[d]] = d));
    const xs = os.map((o) => {
      const d = defOf[o.n] || o.n;
      const x = { id: "dx" + (d || o.id), t: "x", n: d, x: o.x, y: o.y };
      if (d !== o.n) x.m = o.n;
      return x;
    });
    const r = roles({ tokens: [...os, ...xs, ...(ball ? [ball] : [])] });
    const B = ballPoint(f);
    return xs.map((x, i) => {
      const c = spotFor(r[x.id], P(os[i]), B);
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
  /* Turn from his base direction toward fr.to by deg, never past it. When the two are almost
     opposite (his man one way, the ball the other), the turn fades out so he never flips
     from turning one way to the other. */
  const turned = (fr, deg) => {
    if (!fr.to || !deg) return fr.base;
    const between = Math.acos(Math.max(-1, Math.min(1, fr.base[0] * fr.to[0] + fr.base[1] * fr.to[1]))) * (180 / Math.PI);
    const fade = Math.max(0, Math.min(1, (180 - between) / 25));
    const amt = Math.sign(deg) * Math.min(Math.abs(deg), between) * fade;
    return rot(fr.base, cross(fr.base, fr.to) >= 0 ? amt : -amt);
  };

  /* Which way each defender faces, in degrees. An X with his own angle (f) keeps it.
     jobs: the main job per X to use (the replay passes them), else worked out here. */
  function facing(f, draft, jobs) {
    const out = {};
    const xs = defenders(f);
    if (!xs.length) return out;
    const st = stance(draft);
    jobs = jobs || roles(f);
    const m = matchups(f);
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

  /* How everyone rotates on a drive: five people connected by a string. When the ball
     moves you move, and when a teammate rotates you rotate.
     - On Ball stays on the driver's right hip (Gnaw).
     - Ball at the top: the drive-side wing and the drive-side corner (the Wall) snipe
       and grab: one step at the ball, then close out hands high. The weak-side corner
       shifts to the block or middle, and the weak-side wing (the Bear) drops to that
       corner's man.
     - Ball on a slot or wing: the Gap snipes and grabs, the Wall steps up in front of
       the driver outside the paint, the Bear splits the middle of the paint, the weak
       block and the Wall's man, and the Deny drops to the corner man the Bear left.
     - Everyone else goes to his Lock Left spot for where the ball is now.
     f: the step the drive starts on (with our X's); next: the step after (where the
     offense ends up). Returns { strokes, ends }: our lines for this step, and our X's
     for the next step (each keeps his jobs as j). */
  function respond(f, drive, next) {
    const js = jobsOf(f),
      jobs = roles(f),
      m = matchups(f);
    const guard = {};
    Object.keys(m).forEach((x) => (guard[m[x]] = x));
    const endOf = (oid) => {
      const t = (next.tokens || []).find((x) => x.id === oid) || (f.tokens || []).find((x) => x.id === oid);
      return t ? P(t) : null;
    };
    const Dv = drive.to;
    const toRimD = unit(sub(RIM, Dv));
    const rightD = [-toRimD[1], toRimD[0]];
    const side = drive.side,
      weak = -side;
    const h = holder(f);
    const top = h && isTop(P(h));
    const sideOfP = (p) => (p[0] >= 250 ? 1 : -1);
    const others = offense(f).filter((o) => o.id !== drive.pid);
    const cornerOn = (sd) => others.filter((o) => isCorner(P(o)) && sideOfP(P(o)) === sd).sort((a, b) => dist(P(a), B0) - dist(P(b), B0))[0];
    const wingOn = (sd) => others.filter((o) => isPerimeter(P(o)) && !isCorner(P(o)) && sideOfP(P(o)) === sd).sort((a, b) => dist(P(a), B0) - dist(P(b), B0))[0];
    const B0 = P(h || { x: drive.from[0], y: drive.from[1] });

    // Who does what: { xId: "hip" | "snipe" | "step" | "fill" | "drop" }, and what he leaves.
    const move = {},
      label = {};
    const xOfJob = (j) => Object.keys(jobs).find((x) => jobs[x] === j);
    const ballX = xOfJob("ball");
    if (ballX) (move[ballX] = "hip"), (label[ballX] = ["ball"]);
    let fillMan = null,
      wallMan = null,
      dropTo = null,
      tagTo = null;
    // Switches that come out of the rotation: off-ball X-outs, and an on-ball Scram when he got beat.
    const xout = [],
      scram = [];
    const num = (xId) => (defenders(f).find((x) => x.id === xId) || {}).n;
    if (top) {
      const dsWing = wingOn(side),
        dsCorner = cornerOn(side),
        wkCorner = cornerOn(weak),
        wkWing = wingOn(weak);
      if (dsWing && guard[dsWing.id]) (move[guard[dsWing.id]] = "snipe"), (label[guard[dsWing.id]] = [jobs[guard[dsWing.id]] || "gap"].filter((j) => j !== "bear"));
      if (dsCorner && guard[dsCorner.id]) (move[guard[dsCorner.id]] = "snipe"), (label[guard[dsCorner.id]] = ["wall"]);
      if (wkCorner && guard[wkCorner.id]) (move[guard[wkCorner.id]] = "fill"), (label[guard[wkCorner.id]] = []);
      if (wkWing && guard[wkWing.id]) {
        const wx = guard[wkWing.id];
        move[wx] = wkCorner ? "drop" : "spot";
        label[wx] = [...(js[wx] || []).filter((j) => j !== "bear"), "bear"];
        dropTo = wkCorner ? endOf(wkCorner.id) : null;
        // X-out: the weak wing keeps the corner man he dropped to, the corner recovers to the open wing.
        if (wkCorner && guard[wkCorner.id]) xout.push([num(wx), num(guard[wkCorner.id])]);
      }
      // He got beat: Scram. The drive-side wing picks up the ball, the on-ball sprints to that
      // wing's man, and the drive-side corner (the Wall) stays home. The weak side still rotates.
      const pickX = dsWing && guard[dsWing.id];
      if (drive.beat && pickX && ballX && pickX !== ballX) {
        move[pickX] = "pickup";
        move[ballX] = "sprint";
        if (dsCorner && guard[dsCorner.id]) move[guard[dsCorner.id]] = "home";
        scram.push([num(ballX), num(pickX)]);
      }
    } else {
      const gapX = xOfJob("gap"),
        wallX = xOfJob("wall"),
        bearX = Object.keys(js).find((x) => js[x].includes("bear") && x !== ballX && x !== gapX && x !== wallX),
        denyX = xOfJob("deny");
      if (gapX) move[gapX] = "snipe";
      if (wallX) (move[wallX] = "step"), (wallMan = m[wallX] ? endOf(m[wallX]) : null);
      if (bearX) {
        // The Bear helps the helper: he takes the Wall's man, the first pass out on that side.
        // The Wall recovers to the open guy (the Bear's man): an off-ball X-out.
        if (wallX && wallMan) {
          move[bearX] = "tag";
          tagTo = wallMan;
          xout.push([num(wallX), num(bearX)]);
        } else move[bearX] = "fill";
      }
      // He got beat: Scram. The Gap picks up the ball, the on-ball sprints to the Gap's man,
      // and the Wall stays home (the Gap stepped up).
      if (drive.beat && gapX && ballX) {
        move[gapX] = "pickup";
        move[ballX] = "sprint";
        if (wallX) move[wallX] = "home";
        if (bearX) move[bearX] = "fill";
        xout.length = 0;
        scram.push([num(ballX), num(gapX)]);
      }
      void denyX; // the Deny stays in the lane (unless he's also the Bear)
    }
    fillMan = wallMan && dist(wallMan, RIM) < 150 ? wallMan : null;

    const strokes = [],
      ends = [];
    const rnd = (q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10];
    defenders(f).forEach((x) => {
      const X = P(x),
        man = m[x.id] ? endOf(m[x.id]) : null;
      let end,
        path = null,
        hh = false;
      switch (move[x.id]) {
        case "hip":
          end = add(add(Dv, mul(rightD, 24)), mul(toRimD, -4)); // Gnaw: stay on his right hip
          break;
        case "snipe": {
          // Snipe and grab: one step at the ball (the stunt), then close out hands high in the lane.
          const stunt = add(X, mul(unit(sub(drive.mid, X)), 28));
          end = man ? lerp(Dv, man, 0.7) : X;
          path = [X, stunt, end];
          hh = true;
          break;
        }
        case "step":
          end = add(Dv, mul(toRimD, 36)); // the Wall stops the ball at the edge of the paint
          break;
        case "fill": {
          // The block or the middle: split the middle of the paint and the weak block (and the Wall's man in the post).
          const spots = [[250, 100], [250 + weak * 45, 78]];
          if (fillMan) spots.push(fillMan);
          end = [spots.reduce((a, q) => a + q[0], 0) / spots.length, spots.reduce((a, q) => a + q[1], 0) / spots.length];
          break;
        }
        case "drop":
          end = dropTo ? add(dropTo, mul(unit(sub(Dv, dropTo)), 28)) : X; // one step off the corner man, toward the ball
          break;
        case "tag":
          end = tagTo ? add(tagTo, mul(unit(sub(Dv, tagTo)), 20)) : X; // on the Wall's man, ball side
          break;
        case "pickup":
          end = add(add(Dv, mul(toRimD, 26)), mul(rightD, 10)); // the Gap steps up on the driver, shading his right hand
          break;
        case "sprint": {
          // The beaten on-ball sprints to the Gap's man, hands high.
          const gm = guard && Object.keys(m).find((xId) => move[xId] === "pickup");
          const gMan = gm && m[gm] ? endOf(m[gm]) : null;
          end = gMan ? add(gMan, mul(unit(sub(Dv, gMan)), 24)) : X;
          hh = true;
          break;
        }
        case "home":
          end = man ? spotFor(null, man, Dv) : X;
          break;
        default:
          end = man ? spotFor(jobs[x.id] === "deny" ? "deny" : jobs[x.id] === "ball" ? "ball" : null, man, Dv) : lerp(X, RIM, 0.15);
      }
      end = clampPt(end);
      if (path) path[path.length - 1] = end;
      if (dist(X, end) > 8) strokes.push({ id: "dz" + x.id, t: "cut", pts: (path || [X, lerp(X, end, 0.5), end]).map(rnd), c: DEF_INK });
      const nx = { ...x, x: end[0], y: end[1] };
      delete nx.hh;
      delete nx.j;
      const keepJobs = label[x.id] !== undefined ? label[x.id] : js[x.id] || [];
      if (keepJobs.length) nx.j = keepJobs.length === 1 ? keepJobs[0] : keepJobs;
      if (hh) nx.hh = true;
      ends.push(nx);
    });
    return { strokes, ends, xout, scram };
  }

  /* ---- ball screens: Ice, Fire, Contain ----
     A ball screen: a teammate's screen that ends at the ball handler. Going RIGHT we ICE
     it (force him left, away from the screen; the big plays Contain). Going LEFT it's
     FIRE (trap). Straight at him: the big plays Contain.
     Returns { handler, screener, SP, dir: "right" | "left" | "straight" } or null. */
  function screenIn(f) {
    const h = holder(f);
    if (!h) return null;
    for (const s of f.strokes || []) {
      if (s.t !== "screen" || !s.pts || s.pts.length < 2) continue;
      const SP = s.pts[s.pts.length - 1];
      if (dist(SP, P(h)) > 40) continue;
      const scr = offense(f)
        .filter((o) => o.id !== h.id)
        .reduce((b, o) => (dist(P(o), s.pts[0]) < 26 && (!b || dist(P(o), s.pts[0]) < dist(P(b), s.pts[0])) ? o : b), null);
      if (!scr) continue;
      const dx = SP[0] - h.x;
      return { handler: h.id, screener: scr.id, SP, dir: dx > 8 ? "right" : dx < -8 ? "left" : "straight" };
    }
    return null;
  }
  const rnd1 = (q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10];
  /* Shared: build our lines and next-step X's from each X's end spot. */
  function moveAll(f, plan) {
    const strokes = [],
      ends = [];
    defenders(f).forEach((x) => {
      const X = P(x),
        pl = plan[x.id] || {};
      const end = clampPt(pl.end || X);
      const path = pl.path ? [...pl.path.slice(0, -1), end] : null;
      if (dist(X, end) > 8) strokes.push({ id: "dz" + x.id, t: "cut", pts: (path || [X, lerp(X, end, 0.5), end]).map(rnd1), c: DEF_INK });
      const nx = { ...x, x: end[0], y: end[1] };
      delete nx.hh;
      delete nx.cv;
      delete nx.j;
      if (pl.jobs && pl.jobs.length) nx.j = pl.jobs.length === 1 ? pl.jobs[0] : pl.jobs;
      if (pl.hh) nx.hh = true;
      if (pl.cv) nx.cv = pl.cv;
      ends.push(nx);
    });
    return { strokes, ends };
  }
  /* The screen is set: Ice (on-ball jumps to the screen side, the big drops to Contain),
     Fire (the big shows on the handler's path, ready to trap), or straight (Contain). */
  function coverSet(f, sc, next) {
    const js = jobsOf(f),
      m = matchups(f);
    const guard = {};
    Object.keys(m).forEach((x) => (guard[m[x]] = x));
    const endOf = (oid) => {
      const t = (next.tokens || []).find((x) => x.id === oid) || (f.tokens || []).find((x) => x.id === oid);
      return t ? P(t) : null;
    };
    const H = endOf(sc.handler),
      SPe = endOf(sc.screener) || sc.SP;
    const plan = {};
    defenders(f).forEach((x) => {
      const man = m[x.id] ? endOf(m[x.id]) : null;
      plan[x.id] = { end: man ? spotFor((js[x.id] || [])[0], man, H) : P(x), jobs: js[x.id] || [] };
    });
    const onX = guard[sc.handler],
      bigX = guard[sc.screener];
    if (onX) {
      if (sc.dir === "right") plan[onX] = { ...plan[onX], end: add(H, mul(unit(sub(SPe, H)), 22)), cv: "ice" };
      else if (sc.dir === "left") plan[onX] = { ...plan[onX], end: spotFor("ball", H, H), cv: "fire" };
    }
    if (bigX) {
      if (sc.dir === "left") plan[bigX] = { ...plan[bigX], end: add(SPe, mul(unit(sub(SPe, H)), 18)) }; // shows, ready to trap
      else plan[bigX] = { ...plan[bigX], end: lerp(SPe, RIM, 0.4), cv: "contain" };
    }
    return moveAll(f, plan);
  }
  /* FIRE: the on-ball and the big trap him where he's stopped, hands high. The Bear tags
     the roller, the Deny sinks to split his man and the Bear's man, the Gap stays in the
     gap ready to snipe and grab the pass out of the trap. */
  function trapRespond(f, sc, next) {
    const js = jobsOf(f),
      jobs = roles(f),
      m = matchups(f);
    const guard = {};
    Object.keys(m).forEach((x) => (guard[m[x]] = x));
    const endOf = (oid) => {
      const t = (next.tokens || []).find((x) => x.id === oid) || (f.tokens || []).find((x) => x.id === oid);
      return t ? P(t) : null;
    };
    const start = endOf(sc.handler) && P((f.tokens || []).find((t) => t.id === sc.handler));
    const stop = endOf(sc.handler);
    const along = unit(sub(stop, start || stop)),
      perp = [-along[1], along[0]];
    const xOf = (j) => Object.keys(jobs).find((x) => jobs[x] === j);
    const onX = guard[sc.handler],
      bigX = guard[sc.screener],
      bearX = Object.keys(js).find((x) => js[x].includes("bear") && x !== onX),
      denyX = xOf("deny");
    const plan = {};
    defenders(f).forEach((x) => {
      const man = m[x.id] ? endOf(m[x.id]) : null;
      plan[x.id] = { end: man ? spotFor(jobs[x.id], man, stop) : P(x), jobs: js[x.id] || [] };
    });
    if (onX) plan[onX] = { ...plan[onX], end: add(stop, mul(perp, 20)), hh: true, cv: "fire" };
    if (bigX && bigX !== onX) plan[bigX] = { ...plan[bigX], end: add(stop, mul(perp, -20)), hh: true };
    const roller = endOf(sc.screener);
    if (bearX && bearX !== bigX && roller) plan[bearX] = { ...plan[bearX], end: add(roller, mul(unit(sub(stop, roller)), 20)) };
    const bearMan = bearX && m[bearX] ? endOf(m[bearX]) : null;
    const denyMan = denyX && m[denyX] ? endOf(m[denyX]) : null;
    // The Deny sinks to split his man and the Bear's man, staying on his side of it.
    if (denyX && denyMan && bearMan && denyX !== bigX && denyX !== bearX) plan[denyX] = { ...plan[denyX], end: lerp(lerp(denyMan, bearMan, 0.35), stop, 0.2) };
    const r = moveAll(f, plan);
    // X-out: the Bear keeps the roller, the big recovers out of the trap to the Bear's man.
    const n = (xId) => (defenders(f).find((x) => x.id === xId) || {}).n;
    r.xout = bigX && bearX && bigX !== bearX && roller ? [[n(bigX), n(bearX)]] : [];
    return r;
  }

  /* Lock Left over a whole possession: our X's where Lock Left puts them each step, and
     on a drive the rotation (Wall, Bear, Gap's snipe and grab) drawn as our lines, with
     the next step starting from where everyone rotated to. */
  /* Natural switches after a rotation: two defenders who are each closer to the other's
     man than to their own (by 6 ft or more) Scram. nosw: pairs the coach said not to.
     Returns [[a, b], ...] (defender numbers), biggest saving first. */
  function naturalSwitches(f, nosw) {
    const m = matchups(f);
    const xs = defenders(f).filter((x) => m[x.id]);
    const man = (id) => P((f.tokens || []).find((t) => t.id === id));
    const no = (a, b) => (nosw || []).some((q) => (String(q[0]) === a && String(q[1]) === b) || (String(q[0]) === b && String(q[1]) === a));
    const cands = [];
    for (let i = 0; i < xs.length; i++)
      for (let k = i + 1; k < xs.length; k++) {
        const A = xs[i],
          B = xs[k];
        const stay = dist(P(A), man(m[A.id])) + dist(P(B), man(m[B.id]));
        const swap = dist(P(A), man(m[B.id])) + dist(P(B), man(m[A.id]));
        if (swap + 60 < stay && !no(A.n, B.n)) cands.push([stay - swap, A.n, B.n]);
      }
    const used = new Set(),
      out = [];
    cands
      .sort((a, b) => b[0] - a[0])
      .forEach(([, a, b]) => {
        if (used.has(a) || used.has(b)) return;
        used.add(a);
        used.add(b);
        out.push([a, b]);
      });
    return out;
  }

  function defendFrames(frames) {
    const out = [];
    let carry = null,
      carrySw = [], // switches the rotation calls for, applied on the next step
      pending = null; // a ball screen set last step (the next step is how it's used)
    // Who's guarding whom, carried through the possession: { defender number: man number }.
    let guard = {};
    const swap = (a, b) => {
      const ma = guard[a] || a,
        mb = guard[b] || b;
      guard[a] = mb;
      guard[b] = ma;
      if (guard[a] === a) delete guard[a];
      if (guard[b] === b) delete guard[b];
    };
    frames.forEach((f, i) => {
      const keep = (f.tokens || []).filter((t) => t.t !== "x");
      if (f.mreset) guard = {};
      const events = [];
      // The coach's switches start on this step.
      (f.sw || []).forEach((q) => {
        const a = String(q[0]),
          b = String(q[1]);
        if (a === b) return;
        swap(a, b);
        events.push({ a, b, how: "coach" });
      });
      let xs = carry || place(f, guard);
      if (carry) {
        // Out of a rotation: the off-ball X-out (help the helper), or Scram if he got beat.
        const vetoed = (a, b) => (f.nosw || []).some((q) => (String(q[0]) === a && String(q[1]) === b) || (String(q[0]) === b && String(q[1]) === a));
        carrySw.forEach(([a, b, how]) => {
          a = String(a);
          b = String(b);
          if (!a || !b || a === b || (how === "natural" && vetoed(a, b))) return;
          swap(a, b);
          events.push({ a, b, how });
        });
      }
      xs = xs.map((x) => {
        const nx = { ...x };
        const mm = guard[x.n];
        if (mm && mm !== x.n) nx.m = mm;
        else delete nx.m;
        delete nx.sc;
        const ev = events.find((e) => e.a === x.n || e.b === x.n);
        if (ev) nx.sc = ev.how === "natural" ? "xout" : true; // X-OUT off the ball; SCRAM when beat or marked
        return nx;
      });
      const g = { ...f, tokens: [...keep, ...xs], strokes: (f.strokes || []).slice(), def: "lock-left" };
      if (events.length) g.scram = events;
      if (carry) g.carried = true;
      carry = null;
      carrySw = [];
      const next = frames[i + 1];
      const fire = pending && pending.dir === "left" ? pending : null;
      pending = null;
      const sc = next && screenIn(g);
      const dv = next && !sc && !fire && driveIn(g);
      let r = null;
      if (sc) {
        // A ball screen: Ice, Fire or Contain, then the next step is how they use it.
        r = coverSet(g, sc, next);
        pending = sc;
        g.cover = sc.dir === "right" ? "ice" : sc.dir === "left" ? "fire" : "contain";
      } else if (fire) r = trapRespond(g, fire, next);
      else if (dv) {
        dv.beat = !!f.beat;
        g.drive = true;
        r = respond(g, dv, next);
      }
      if (r) {
        g.strokes.push(...r.strokes);
        carry = r.ends;
        carrySw = [...(r.xout || []).map((q) => [q[0], q[1], "natural"]), ...(r.scram || []).map((q) => [q[0], q[1], "scram"])];
      }
      out.push(g);
    });
    return out;
  }

  /* The replay: everyone moves with the ball while it moves (the string). Returns null
     with no defenders, else update(pos, t) for each tick of the step from -> to, given
     where the offense and the ball are now (pos, from the tween):
     { pos: our X's spots, face: the way each faces, jobs: { xId: [jobs] }, key, tokens }.
     - A Lock Left step: each X heads for his spot for where his man and the ball are
       right now; his job hands over halfway (the passer's man jumps to the ball, the
       catcher's man closes out). After a drive he starts from where he rotated to.
     - A drive (our lines): X's follow their rotation; only the way they face is live.
     - X's someone drew: where they were drawn; only the way they face is live. */
  function liveStep(from, to, opts = {}) {
    if (!defenders(from).length && !defenders(to).length) return null;
    const auto = from.def === "lock-left" && to.def === "lock-left";
    const drive = (from.strokes || []).some((x) => /^dz/.test(x.id || ""));
    const jFrom = jobsOf(from),
      jTo = jobsOf(to);
    const main = (js) => {
      const o = {};
      Object.keys(js).forEach((k) => (o[k] = js[k][0]));
      return o;
    };
    const rFrom = main(jFrom),
      rTo = main(jTo);
    const mFrom = matchups(from),
      mTo = matchups(to);
    const start = {};
    defenders(from).forEach((x) => (start[x.id] = P(x)));
    const ballTo = (to.tokens || []).find((t) => t.t === "ball");
    const smooth = (u) => {
      u = Math.max(0, Math.min(1, u));
      return u * u * (3 - 2 * u);
    };
    // He turns at a realistic speed (no snapping around), and always finishes by the end of the step.
    let lastFace = null,
      lastPos = null,
      lastT = 0;
    return function update(pos, t) {
      const w = smooth((t - 0.25) / 0.5);
      const at = (tk) => (pos[tk.id] ? { ...tk, x: pos[tk.id][0], y: pos[tk.id][1] } : tk);
      const offNow = offense(to).map(at);
      let ballNow = ballTo ? at(ballTo) : null;
      if (ballNow) {
        // Who has it right now (nobody while it's in the air).
        const near = offNow.reduce((b, o) => (dist(P(o), P(ballNow)) < 25 && (!b || dist(P(o), P(ballNow)) < dist(P(b), P(ballNow))) ? o : b), null);
        ballNow = { ...ballNow };
        if (near) ballNow.h = near.id;
        else delete ballNow.h;
      }
      // The ball point: the ball in the air, easing onto the player as he catches it (no jump).
      let B = [250, 300];
      if (ballNow) {
        const near = offNow.reduce((b, o) => (!b || dist(P(o), P(ballNow)) < dist(P(b), P(ballNow)) ? o : b), null);
        const k = near ? Math.max(0, Math.min(1, (48 - dist(P(near), P(ballNow))) / 30)) : 0;
        B = near ? lerp(P(ballNow), P(near), k) : P(ballNow);
      }
      const out = {};
      const xsNow = defenders(to).map((x) => {
        let q;
        if (auto && !drive) {
          // From his man at the start of the step to his man at the end (they differ on a switch).
          const manA = offNow.find((o) => o.id === (mFrom[x.id] || mTo[x.id])),
            manB = offNow.find((o) => o.id === mTo[x.id]);
          const b = spotFor(rTo[x.id], manB ? P(manB) : P(x), B);
          const a = from.carried ? start[x.id] || b : spotFor(rFrom[x.id], manA ? P(manA) : P(x), B);
          q = lerp(a, b, w);
          // A defender has a top speed (no teleporting when the ball moves fast), but always gets there by the end.
          const was = lastPos && lastPos[x.id];
          if (was && t > lastT) {
            const dt = t - lastT,
              gap = dist(q, was);
            const most = dt * Math.max(900, gap / Math.max(1e-3, 1 - lastT));
            if (gap > most) q = lerp(was, q, most / gap);
          }
        } else q = pos[x.id] || P(x);
        out[x.id] = q;
        const nx = { ...x, x: q[0], y: q[1] };
        // On a drive the hands go up after the stunt.
        if (drive && x.hh && t < 0.6) delete nx.hh;
        delete nx.j;
        return nx;
      });
      const late = w >= 0.5;
      const live = { tokens: [...offNow, ...(ballNow ? [ballNow] : []), ...xsNow] };
      // He turns from his old job's stance to his new one as the job hands over.
      const fA = facing(live, opts.stance, rFrom),
        fB = facing(live, opts.stance, rTo);
      const face = {};
      Object.keys(fB).forEach((id) => {
        const a = fA[id] == null ? fB[id] : fA[id];
        const want = a + wrap(fB[id] - a) * w;
        const was = lastFace && lastFace[id];
        if (was == null || t <= lastT) return (face[id] = want);
        const diff = wrap(want - was);
        const dt = t - lastT;
        const most = dt * Math.max(720, Math.abs(diff) / Math.max(1e-3, 1 - lastT));
        face[id] = was + Math.max(-most, Math.min(most, diff));
      });
      lastFace = face;
      lastPos = out;
      lastT = t;
      const jobs = late ? jTo : jFrom;
      const key = JSON.stringify(jobs) + "|" + xsNow.filter((x) => x.hh).map((x) => x.id).join(",");
      return { pos: out, face, jobs, key, tokens: xsNow };
    };
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
      // Then the ball at the top of the key: reverse it to the top, he drives left, kicks.
      const topSet = ["5-out", "power"].map((id) => BH.store && BH.store.get(id)).find((it) => it && BH.hasDiagram(it) && it.diagram.frames[0].tokens.some((t) => t.t === "ball"));
      const last = frames[frames.length - 1];
      const h = holder(last);
      if (topSet && h) {
        const spots = BH.clone(topSet.diagram.frames[0].tokens).filter((t) => t.t !== "x");
        const topBall = spots.find((t) => t.t === "ball");
        const top = holder({ tokens: spots });
        if (top && isTop(P(top))) {
          last.strokes = [...(last.strokes || []), { id: "dtop", t: "pass", pts: [P(h), P(top)] }];
          const same = spots.every((t) => t.t === "ball" || last.tokens.some((u) => u.id === t.id));
          if (same) {
            topBall.h = top.id;
            frames.push({ tokens: spots, strokes: [], mreset: true });
            for (const r of ["drive", "kick"]) {
              const res = BH.engine.extend(frames, r);
              if (res.error) break;
              frames = res.frames;
            }
          } else last.strokes.pop();
        }
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

  BH.defense = { ROLES, role, TERMS, termRole, terms, matchups, naturalSwitches, screenIn, jobsOf, roles, isTop, spotFor, place, withDefense, defendFrames, driveIn, respond, liveStep, facing, stance, stanceFor, DEFAULT_STANCE, demo, jobTerm, jobsMarkup, jobText };
})();
