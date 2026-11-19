/* Action engine. Actions such as Rub, Twirl and Swing aren't fixed drawings: each
   one looks at the court (who has the ball, who is where) and draws the next steps
   from there. That is what lets the whiteboard chain them: 5 Thru, then Rub, then
   Twirl, then Swing, then Continuity, as one possession. */
(function () {
  const BH = window.BH;
  const D = () => BH.diagram;
  const RIM = [250, 52.5];
  const TOP = [250, 285];

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const unit = (a) => {
    const L = Math.hypot(a[0], a[1]) || 1;
    return [a[0] / L, a[1] / L];
  };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const rnd = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
  const clampPt = (p) => [Math.max(16, Math.min(484, p[0])), Math.max(20, Math.min(400, p[1]))];
  const P = (t) => [t.x, t.y];
  const sideOf = (p) => (p[0] >= 250 ? 1 : -1);
  const corner = (s) => (s > 0 ? [470, 42] : [30, 42]);
  const wing = (s) => (s > 0 ? [415, 215] : [85, 215]);
  const slot = (s) => [250 + s * 78, 268];
  const NAIL = [250, 190];
  const isSlot = (t) => t.y > 200 && Math.abs(t.x - 250) > 40 && Math.abs(t.x - 250) < 135;

  const offense = (f) => (f.tokens || []).filter((t) => t.t === "o");
  const tok = (f, id) => (f.tokens || []).find((t) => t.id === id);
  const nearest = (list, p) => list.reduce((b, t) => (!b || dist(P(t), p) < dist(P(b), p) ? t : b), null);
  const inCorner = (t) => t.y < 90 && Math.abs(t.x - 250) > 150;
  const isPerimeter = (t) => dist(P(t), RIM) > 155; // about 15 ft out: elbows and the paint are inside
  // Position along the arc: left corner is smallest, right corner largest.
  const arcKey = (p) => -Math.atan2(Math.max(p[1], 53) - RIM[1], p[0] - RIM[0]);
  const line = (t, pts) => ({ id: "e" + Math.random().toString(36).slice(2, 9), t, pts: pts.map(rnd) });
  const passTo = (from, to) => line("pass", [P(from), P(to)]);
  /* In our diagrams 4 is the Rabbit (the interior player) and 5 is the Dragon.
     Without a 4 on the floor, the Rabbit is whoever is closest to the rim. */
  const RABBIT = "4";
  const RACKER = "1";
  const DRAGON = "5";
  const byNum = (f, n, exceptId) => offense(f).find((t) => t.n === n && t.id !== exceptId);
  /* A handoff at the top of the key. The giver dribbles to his side of the top; the
     receiver comes over the top of him (behind him, away from the basket), takes it on
     his outside shoulder and turns the corner downhill on the giver's side. Then the
     backside action every trigger has, away from the ball: the giver down-screens for
     the Lock on the side the receiver came from, who comes up to the open slot. */
  function pitchAtTop(api, giver, receiver, s) {
    const M = [250 + s * 30, 276];
    const T = clampPt(add(M, mul(unit(sub([250 + s * 110, 200], M)), HANDOFF_OUT)));
    const G = P(tok(api.f, giver.id)),
      R = P(tok(api.f, receiver.id));
    api.step([line("dribble", [G, lerp(G, M, 0.5), M]), line("cut", [R, ...curl(M, R, T), T]), line("handoff", [M, T])]);
    const g = tok(api.f, giver.id);
    const L = lockOn(api.f, g, -s);
    const ds = L && L.y < 170 ? downScreen(P(g), P(L), -s) : backside(api.f, [giver.id, receiver.id], s, T);
    if (ds) {
      api.step([ds.screen]);
      api.step([ds.cut, ds.fill]);
    }
  }
  const rabbit = (f, exceptId) => {
    const o = offense(f).filter((t) => t.id !== exceptId);
    return o.find((t) => t.n === RABBIT) || nearest(o, RIM);
  };

  function holder(f) {
    const b = (f.tokens || []).find((t) => t.t === "ball");
    if (!b) return null;
    const owner = b.h && offense(f).find((t) => t.id === b.h);
    if (owner && dist(P(owner), [b.x, b.y]) < 45) return owner;
    let best = null,
      bd = 45;
    offense(f).forEach((t) => {
      const d = dist(P(t), [b.x, b.y]);
      if (d < bd) (bd = d), (best = t);
    });
    return best;
  }

  /* Perimeter teammates in the direction of travel (dir +1 = toward the right). */
  function along(f, h, dir) {
    const hk = arcKey(P(h));
    const per = offense(f).filter((t) => t.id !== h.id && isPerimeter(t) && dist(P(t), P(h)) > 60);
    const toward = (d) => per.filter((t) => d * (arcKey(P(t)) - hk) > 0.03).sort((a, b) => d * (arcKey(P(a)) - arcKey(P(b))));
    return { ahead: toward(dir), behind: toward(-dir) };
  }

  /* Who threw the last pass, and which way the ball last moved (a pass, a handoff,
     or the handler's dribble coming off a ball screen). */
  function ctxFrom(frames) {
    let lastPasser = null,
      dir = 0;
    for (let i = frames.length - 1; i >= 0 && (!lastPasser || !dir); i--) {
      const f = frames[i];
      if (!dir) {
        const chain = D().ballChain(f, D().assignPaths(f));
        if (chain) {
          const dx = chain.end[0] - chain.poly[0][0];
          if (Math.abs(dx) >= 12) dir = Math.sign(dx);
        }
      }
      if (!lastPasser) {
        const ps = (f.strokes || []).filter((s) => s.t === "pass" || s.t === "handoff");
        if (ps.length) {
          const a = ps[ps.length - 1].pts[0];
          const passer = nearest(offense(frames[i + 1] || f), a);
          lastPasser = passer ? passer.id : null;
        }
      }
    }
    return { lastPasser, dir };
  }

  /* The Lock on a side: the teammate on that side closest to its corner. */
  function lockOn(f, h, sd) {
    const rab = rabbit(f, h.id);
    return nearest(
      offense(f).filter((t) => t.id !== h.id && (!rab || t.id !== rab.id) && sideOf(P(t)) === sd && Math.abs(t.x - 250) > 40),
      corner(sd)
    );
  }

  /* A down screen: the screener sets it just above the cutter, who comes off it
     toward the sideline (side sd) and catches at the slot on the perimeter. The
     screener then replaces: he drops to the corner the cutter left, so we stay 4-out. */
  function downScreen(Hp, L, sd) {
    const DS = add(L, mul(unit(sub(Hp, L)), Math.min(0.4 * dist(L, Hp), 55)));
    const out = [sd > 0 ? 440 : 60, Math.max(DS[1] + 40, 170)];
    const C = corner(sd);
    return {
      screen: line("screen", [Hp, lerp(Hp, DS, 0.5), DS]),
      cut: line("cut", [L, add(DS, [sd * 18, 0]), out, slot(sd)]),
      fill: line("cut", [DS, lerp(DS, C, 0.5), C]),
    };
  }

  /* A handoff receiver's path: he comes at the giver, goes around his outside shoulder
     (the side away from the basket, never between the giver and the rim), like coming
     off a screen, and comes off toward R. Returns the points around the giver; the
     path is [start, ...these, R]. */
  const HANDOFF_OUT = 46; // how far past the giver the receiver catches it and comes off
  function curl(M, from, R, r = 36) {
    const TAU = Math.PI * 2;
    const norm = (a) => ((a % TAU) + TAU) % TAU;
    const ang = (q) => Math.atan2(q[1] - M[1], q[0] - M[0]);
    const a0 = ang(from),
      ccw = norm(ang(R) - a0),
      out = ang(add(M, sub(M, RIM)));
    const sweep = norm(out - a0) <= ccw ? ccw : ccw - TAU; // the way round that passes the outside
    return [0.15, 0.45, 0.75].map((t) => clampPt([M[0] + r * Math.cos(a0 + sweep * t), M[1] + r * Math.sin(a0 + sweep * t)]));
  }

  /* Backside down screen, away from the ball, to keep the defense engaged. Rub and
     Twist each run one (Twirl and Get don't), unless they come straight out of a
     trigger: every trigger has its own down screen, which is the backside action. busy: players in the on-ball action;
     s: the ball side; near: where the ball is going (keep clear of it).
     Returns { screen, cut } (screen this step, cut off it next step) or null. */
  function backside(f, busy, s, near) {
    // Perimeter players only: the Rabbit stays inside (he is on the block after a roll).
    const rab = rabbit(f);
    const free = offense(f).filter((t) => !busy.includes(t.id) && (!rab || t.id !== rab.id) && isPerimeter(t));
    const weak = free.filter((t) => sideOf(P(t)) === -s && (!near || dist(P(t), near) > 70));
    let hi = null,
      lo = null;
    if (weak.length >= 2) {
      // The higher player down-screens for the lower one, who comes up to the screener's spot.
      hi = weak.reduce((a, b) => (b.y > a.y ? b : a));
      lo = weak.reduce((a, b) => (b.y < a.y ? b : a));
      if (hi.y - lo.y < 60) return null;
    } else if (weak.length === 1 && weak[0].y < 170) {
      // One low player on the backside: the closest free teammate comes over to screen,
      // and the low player comes up to the wing.
      lo = weak[0];
      hi = nearest(free.filter((t) => t.id !== lo.id && !inCorner(t) && dist(P(t), P(lo)) < 260), P(lo));
    }
    if (!hi || !lo) return null;
    return downScreen(P(hi), P(lo), -s);
  }

  /* ---------- the rules ---------- */
  const RULES = {
    swing: {
      label: "Swing: slot to slot (or the next perimeter player), same direction as the ball last moved",
      run(api, ctx) {
        const h = holder(api.f);
        if (!h) return "nobody has the ball.";
        const dir = ctx.dir || -sideOf(P(h));
        const { ahead, behind } = along(api.f, h, dir);
        // From a slot, the top or the nail, swing it slot to slot; from a wing or corner, to the next player.
        const hs = Math.abs(h.x - 250) > 20 ? sideOf(P(h)) : 0;
        const central = Math.abs(h.x - 250) < 135 && h.y > 150;
        const slotOk = (t) => isSlot(t) && (!hs || sideOf(P(t)) !== hs);
        const otherSlot = central ? ahead.find(slotOk) || behind.find(slotOk) : null;
        const t = otherSlot || ahead[0] || behind[0];
        if (!t) return "there's no one on the perimeter to swing it to.";
        const moves = [passTo(h, t)];
        if (!isPerimeter(h)) {
          // Passing out of the drive: the passer spaces back out to the open slot (or wing) behind the pass.
          const back = -Math.sign(t.x - h.x) || -dir;
          const spot = [slot(back), wing(back)].find((p) => offense(api.f).every((o) => o.id === h.id || o.id === t.id || dist(P(o), p) > 50));
          if (spot) moves.push(line("cut", [P(h), lerp(P(h), spot, 0.5), spot]));
        }
        api.step(moves);
      },
    },
    skip: {
      label: "Skip: across the floor over the next player; a Lock who catches it rises, the skipped player fills the corner",
      run(api, ctx) {
        const f = api.f;
        const h = holder(f);
        if (!h) return "nobody has the ball.";
        const hs = Math.abs(h.x - 250) > 20 ? sideOf(P(h)) : 0;
        const dir = hs ? -hs : ctx.dir || 1; // skips go from one side to the other
        const { ahead } = along(f, h, dir);
        const t = ahead.slice(1).find((x) => !hs || sideOf(P(x)) !== hs);
        if (!t) return "there's no one across the floor past the next player to skip it to.";
        const skipped = ahead[0];
        api.step([passTo(h, t)]);
        if (t.y < 110) {
          // Caught by a Lock in the corner: the Lock rises with the ball and the
          // player who was skipped runs the lane line and fills back to the corner.
          const s = sideOf(P(t));
          const T2 = P(tok(api.f, t.id)),
            K = P(tok(api.f, skipped.id));
          const lane = 250 + s * 62;
          api.step([line("dribble", [T2, lerp(T2, wing(s), 0.5), wing(s)]), line("cut", [K, [lane, Math.min(K[1], 185)], [lane, 72], corner(s)])]);
        }
      },
    },
    back: {
      label: "Back to you: pass it back to the player who passed it",
      run(api, ctx) {
        const h = holder(api.f);
        if (!h) return "nobody has the ball.";
        const t = ctx.lastPasser && ctx.lastPasser !== h.id ? tok(api.f, ctx.lastPasser) : null;
        if (!t) return "there's no earlier pass to throw it back on.";
        api.step([passTo(h, t)]);
      },
    },
    "post-entry": {
      label: "Post entry: pass to the nearest teammate in the paint",
      run(api) {
        const h = holder(api.f);
        if (!h) return "nobody has the ball.";
        const paint = offense(api.f).filter((t) => t.id !== h.id && t.x > 165 && t.x < 335 && t.y < 215);
        const t = nearest(paint, P(h));
        if (!t) return "no one is in the paint for a post entry.";
        api.step([passTo(h, t)]);
      },
    },
    get: {
      label: "Get: the Rabbit flashes to the ball-side elbow, takes the pass and hands it back; the handler gets to the nail, the Rabbit rolls",
      run(api) {
        const h = holder(api.f);
        if (!h) return "nobody has the ball.";
        if (h.n === RABBIT) return "the Rabbit has the ball. Get runs with the Rabbit.";
        const T = rabbit(api.f, h.id);
        if (!T) return "there's no Rabbit on the floor to get it from.";
        // Run it on the ball side: the Rabbit flashes to the ball-side elbow first if he isn't there.
        const s = Math.abs(h.x - 250) > 20 ? sideOf(P(h)) : sideOf(P(T));
        const E = [250 + s * 60, 190];
        if (dist(P(T), E) > 60) {
          const Tp = P(T);
          api.step([line("cut", [Tp, lerp(Tp, E, 0.5), E])]);
        }
        api.step([passTo(tok(api.f, h.id), tok(api.f, T.id))]);
        const T2 = P(tok(api.f, T.id)),
          H2 = P(tok(api.f, h.id));
        const M = clampPt(lerp(T2, H2, 0.45));
        // The handler goes around the Rabbit's outside shoulder and comes off headed for the nail.
        const R = clampPt(add(M, mul(unit(sub(NAIL, M)), HANDOFF_OUT)));
        api.step([line("dribble", [T2, lerp(T2, M, 0.5), M]), line("cut", [H2, ...curl(M, H2, R), R]), line("handoff", [M, R])]);
        const g = P(tok(api.f, T.id));
        const roll = [250 + sideOf(g) * 24, 80];
        const r = P(tok(api.f, h.id));
        // The handler gets to the nail (the drive) while the Rabbit rolls.
        api.step([line("cut", [g, lerp(g, roll, 0.5), roll]), line("dribble", [r, lerp(r, NAIL, 0.5), NAIL])]);
      },
    },
    rub: {
      label: "Rub: handoff to the ball-side guard, who hands it off fills the corner, with a backside down screen",
      run(api, ctx) {
        const f = api.f;
        const h = holder(f);
        if (!h) return "nobody has the ball.";
        const pick = (sd) => lockOn(f, h, sd);
        let s = Math.abs(h.x - 250) > 20 ? sideOf(P(h)) : 0;
        let L = s ? pick(s) : null;
        if (!s) {
          const r = pick(1),
            l = pick(-1);
          L = !r ? l : !l ? r : dist(P(r), corner(1)) <= dist(P(l), corner(-1)) ? r : l;
          s = L ? sideOf(P(L)) : 1;
        }
        if (!L) return "there's no ball-side guard to hand it to.";
        const H = P(h),
          Lp = P(L);
        const M = clampPt(lerp(H, Lp, 0.45));
        const R = clampPt(add(M, mul(unit(sub(TOP, M)), HANDOFF_OUT)));
        const bs = ctx.noBackside ? null : backside(f, [h.id, L.id], s, M);
        api.step([line("dribble", [H, lerp(H, M, 0.5), M]), line("cut", [Lp, ...curl(M, Lp, R), R]), line("handoff", [M, R]), bs && bs.screen]);
        const g = P(tok(api.f, h.id));
        const C = corner(s);
        api.step([line("cut", [g, lerp(g, C, 0.5), C]), bs && bs.cut, bs && bs.fill]);
      },
    },
    pitch: {
      label: "Pitch (trigger): the Racker hands it off to the Dragon at the top of the key",
      run(api) {
        const h = holder(api.f);
        if (!h) return "nobody has the ball.";
        if (h.n !== RACKER) return "Pitch starts with the ball in the Racker's hands.";
        const d = byNum(api.f, DRAGON, h.id);
        if (!d) return "there's no Dragon on the floor.";
        const s = Math.abs(h.x - 250) > 20 ? sideOf(P(h)) : -sideOf(P(d));
        pitchAtTop(api, h, d, s);
      },
    },
    switch: {
      label: "Switch / Swing Pitch (trigger): the Racker swings it to the Dragon, who pitches it back at the top",
      run(api) {
        const h = holder(api.f);
        if (!h) return "nobody has the ball.";
        if (h.n !== RACKER) return "Switch starts with the ball in the Racker's hands.";
        const d = byNum(api.f, DRAGON, h.id);
        if (!d) return "there's no Dragon on the floor.";
        api.step([passTo(h, d)]);
        const D2 = P(tok(api.f, d.id)),
          R2 = P(tok(api.f, h.id));
        const s = Math.abs(D2[0] - 250) > 20 ? sideOf(D2) : -sideOf(R2);
        pitchAtTop(api, d, h, s);
      },
    },
    twist: {
      label: "Twist: slot passes to the Lock and rides up the lane line to the corner; the Lock fills the slot with the ball, with a backside down screen",
      run(api, ctx) {
        const f = api.f;
        const h = holder(f);
        if (!h) return "nobody has the ball.";
        if (Math.abs(h.x - 250) < 20) return "Twist starts from a slot, not the top.";
        const s = sideOf(P(h));
        const L = lockOn(f, h, s);
        if (!L || L.y > 160) return "there's no Lock on that side to pass to.";
        const home = P(h),
          Lp = P(L);
        const bs = ctx.noBackside ? null : backside(f, [h.id, L.id], s, home);
        api.step([passTo(h, L), bs && bs.screen]);
        // The passer rides up the lane line and fills the corner; the Lock fills the slot with the ball.
        const lane = 250 + s * 52;
        const H2 = P(tok(api.f, h.id)),
          L2 = P(tok(api.f, L.id));
        api.step([line("dribble", [L2, lerp(L2, home, 0.5), home]), line("cut", [H2, [lane, Math.min(H2[1], 185)], [lane, 72], corner(s)]), bs && bs.cut, bs && bs.fill]);
        // From here the Lock goes into a Twirl or a Get with the Rabbit (add either next in the call).
      },
    },
    twirl: {
      label: "Twirl: the Rabbit's ball screen; the handler gets to the nail, the Rabbit rolls",
      run(api) {
        const f = api.f;
        const h = holder(f);
        if (!h) return "nobody has the ball.";
        const H = P(h);
        const s = Math.abs(h.x - 250) > 15 ? sideOf(H) : 1;
        const others = offense(f).filter((t) => t.id !== h.id);
        if (h.n === RABBIT) return "the Rabbit has the ball. Twirl is the Rabbit's ball screen.";
        const S = rabbit(f, h.id);
        if (!S) return "there's no Rabbit on the floor to set the ball screen.";
        // The handler comes off and gets to the nail (the drive), stopping short if someone is there.
        const open = (p) => others.every((t) => t.id === S.id || dist(P(t), p) > 45);
        const G = clampPt([1, 0.85, 0.7, 0.55].map((k) => lerp(H, NAIL, k)).find(open) || lerp(H, NAIL, 0.55));
        const dirG = unit(sub(G, H));
        const SP = clampPt(add(H, mul(dirG, 26))); // screen on the handler's shoulder
        api.step([line("screen", [P(S), lerp(P(S), SP, 0.55), SP])]);
        const f2 = api.f;
        const H2 = P(tok(f2, h.id)),
          S2 = P(tok(f2, S.id));
        let perp = [-dirG[1], dirG[0]];
        if (dot(perp, sub(RIM, S2)) > 0) perp = mul(perp, -1); // go over the top of the screen
        const roll = [250 + s * 24, 80];
        api.step([line("dribble", [H2, add(S2, mul(perp, 22)), G]), line("cut", [S2, lerp(S2, roll, 0.5), roll])]);
      },
    },
    continuity: {
      label: "Continuity: keep running the actions side to side from wherever the ball is",
    },
  };

  /* Run one rule from a frame. Returns { frames } (first = start with its moves,
     last = where everyone ends up) or { error }. */
  function run(ruleId, start, ctx) {
    const rule = RULES[ruleId];
    if (!rule || !rule.run) return { error: "that action doesn't run on its own." };
    let cur = BH.clone(start);
    cur.strokes = [];
    const out = [];
    const api = {
      get f() {
        return cur;
      },
      step(strokes) {
        strokes = strokes.filter(Boolean);
        if (!strokes.length) return;
        cur.strokes = strokes;
        out.push(cur);
        cur = D().advanceFrame(cur);
      },
    };
    const res = rule.run(api, ctx || {});
    if (typeof res === "string") return { error: res };
    if (!out.length) return { error: "nothing to do from here." };
    out.push(cur);
    return { frames: out };
  }

  /* Continue a list of frames with a rule. Finishes any lines drawn on the last
     frame first. Returns { frames, start } or { error }. */
  function extend(frames, ruleId, extra) {
    frames = frames.slice();
    let last = frames[frames.length - 1];
    if (last.strokes && last.strokes.length) {
      last = D().advanceFrame(last);
      frames.push(last);
    }
    const res = run(ruleId, last, Object.assign(ctxFrom(frames), extra || {}));
    if (res.error) return res;
    const start = frames.length - 1;
    frames.splice(start, 1, ...res.frames);
    return { frames, start };
  }

  /* Small examples for the playbook: just the 2 to 4 players each action needs. */
  const o = (n, x, y) => ({ id: "o" + n, t: "o", n: String(n), x, y });
  const withBall = (n, x, y) => [o(n, x, y), { id: "ball", t: "ball", n: "", x: x + 13, y: y - 12 }];
  const DEMOS = {
    // 3 swings it to 1, so the swing keeps going the same way: 1 to 5.
    swing: { tokens: [...withBall(3, 85, 215), o(1, 175, 272), o(5, 325, 272)], first: [{ id: "d0", t: "pass", pts: [[85, 215], [175, 272]] }] },
    skip: { tokens: [...withBall(1, 175, 272), o(5, 325, 272), o(2, 470, 42)] },
    back: { tokens: [...withBall(1, 175, 272), o(5, 325, 272)], seq: ["swing", "back"] },
    "post-entry": { tokens: [...withBall(1, 85, 215), o(4, 175, 76)] },
    get: { tokens: [...withBall(1, 85, 215), o(4, 190, 190)] },
    rub: { tokens: [...withBall(1, 175, 272), o(3, 30, 42), o(5, 325, 272), o(2, 470, 42)] },
    pitch: { tokens: [...withBall(1, 175, 272), o(5, 325, 272), o(3, 30, 42), o(2, 470, 42)] },
    switch: { tokens: [...withBall(1, 175, 272), o(5, 325, 272), o(3, 30, 42), o(2, 470, 42)] },
    twist: { tokens: [...withBall(1, 175, 272), o(3, 30, 42), o(5, 325, 272), o(2, 470, 42)] },
    twirl: { tokens: [...withBall(1, 175, 272), o(4, 175, 76)] },
  };
  let demoCache = {};
  function demo(item) {
    if (!item || !item.rule || !DEMOS[item.rule]) return null;
    if (item.rule in demoCache) return demoCache[item.rule];
    const d = DEMOS[item.rule];
    let frames = [{ tokens: BH.clone(d.tokens), strokes: BH.clone(d.first || []) }];
    for (const r of d.seq || [item.rule]) {
      const res = extend(frames, r);
      if (res.error) return (demoCache[item.rule] = null);
      frames = res.frames;
    }
    return (demoCache[item.rule] = { court: "half", frames });
  }
  BH.on("program", () => (demoCache = {}));

  const isAuto = (item) => !!(item && item.rule && RULES[item.rule]);
  BH.isAuto = isAuto;
  /* The diagram to show for an item: the coach's drawing, or a demo of its rule. A
     defense shows its example; a defensive term shows that example with its X lit up. */
  BH.viewDiagram = (item) => {
    if (BH.hasDiagram(item)) return item.diagram;
    if (isAuto(item)) return demo(item);
    const DF = BH.defense;
    if (!DF || !item) return null;
    if (item.rule === "lock-left") return DF.demo();
    const job = DF.termRole(item);
    return job ? { ...DF.demo(), hl: job } : null;
  };

  BH.engine = {
    RULES,
    LIST: Object.keys(RULES).map((id) => ({ id, label: RULES[id].label })),
    run,
    extend,
    ctxFrom,
    demo,
    holder,
  };
})();
