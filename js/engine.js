/* Action engine. Actions such as Rub, Twirl and Swing aren't fixed drawings: each
   one looks at the court (who has the ball, who is where) and draws the next steps
   from there. That is what lets the whiteboard chain them: 5 Thru, then Rub, then
   Twirl, then Swing, then Continuity, as one possession. */
(function () {
  const BH = window.BH;
  const D = () => BH.diagram;
  const RIM = [250, 52.5];
  const TOP = [250, 285];
  const NAIL_TOP = [250, 215];

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

  const offense = (f) => (f.tokens || []).filter((t) => t.t === "o");
  const tok = (f, id) => (f.tokens || []).find((t) => t.id === id);
  const nearest = (list, p) => list.reduce((b, t) => (!b || dist(P(t), p) < dist(P(b), p) ? t : b), null);
  const inCorner = (t) => t.y < 90 && Math.abs(t.x - 250) > 150;
  const isPerimeter = (t) => dist(P(t), RIM) > 155; // about 15 ft out: elbows and the paint are inside
  // Position along the arc: left corner is smallest, right corner largest.
  const arcKey = (p) => -Math.atan2(Math.max(p[1], 53) - RIM[1], p[0] - RIM[0]);
  const line = (t, pts) => ({ id: "e" + Math.random().toString(36).slice(2, 9), t, pts: pts.map(rnd) });
  const passTo = (from, to) => line("pass", [P(from), P(to)]);
  /* The Rabbit is our 5, the interior player. Without a 5 on the floor, whoever is closest to the rim. */
  const rabbit = (f, exceptId) => {
    const o = offense(f).filter((t) => t.id !== exceptId);
    return o.find((t) => t.n === "5") || nearest(o, RIM);
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
    return nearest(
      offense(f).filter((t) => t.id !== h.id && sideOf(P(t)) === sd && Math.abs(t.x - 250) > 40),
      corner(sd)
    );
  }

  /* Backside down screen, away from the ball, to keep the defense engaged. Rub and
     Twist each run one (Twirl and Get don't). busy: players in the on-ball action;
     s: the ball side; near: where the ball is going (keep clear of it).
     Returns { screen, cut } (screen this step, cut off it next step) or null. */
  function backside(f, busy, s, near) {
    const free = offense(f).filter((t) => !busy.includes(t.id));
    const weak = free.filter((t) => sideOf(P(t)) === -s && (!near || dist(P(t), near) > 70));
    let hi = null,
      lo = null,
      to = null;
    if (weak.length >= 2) {
      // The higher player down-screens for the lower one, who comes up to the screener's spot.
      hi = weak.reduce((a, b) => (b.y > a.y ? b : a));
      lo = weak.reduce((a, b) => (b.y < a.y ? b : a));
      if (hi.y - lo.y < 60) return null;
      to = P(hi);
    } else if (weak.length === 1 && weak[0].y < 170) {
      // One low player on the backside: the closest free teammate comes over to screen,
      // and the low player comes up to the wing.
      lo = weak[0];
      hi = nearest(free.filter((t) => t.id !== lo.id && !inCorner(t) && dist(P(t), P(lo)) < 260), P(lo));
      to = [-s > 0 ? 415 : 85, 215];
    }
    if (!hi || !lo) return null;
    const L = P(lo),
      Hp = P(hi);
    const DS = add(L, mul(unit(sub(Hp, L)), Math.min(0.4 * dist(L, Hp), 55)));
    return {
      screener: hi.id,
      screen: line("screen", [Hp, lerp(Hp, DS, 0.5), DS]),
      cut: line("cut", [L, add(DS, [-s * 18, 0]), to]),
    };
  }

  /* ---------- the rules ---------- */
  const RULES = {
    swing: {
      label: "Swing: pass to the next perimeter player, same direction as the last pass",
      run(api, ctx) {
        const h = holder(api.f);
        if (!h) return "nobody has the ball.";
        const dir = ctx.dir || -sideOf(P(h));
        const { ahead, behind } = along(api.f, h, dir);
        const t = ahead[0] || behind[0];
        if (!t) return "there's no one on the perimeter to swing it to.";
        api.step([passTo(h, t)]);
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
      label: "Get: pass to the Rabbit, who hands it back and rolls",
      run(api) {
        const h = holder(api.f);
        if (!h) return "nobody has the ball.";
        if (h.n === "5") return "the Rabbit has the ball. Get runs with the Rabbit.";
        const T = rabbit(api.f, h.id);
        if (!T) return "there's no Rabbit on the floor to get it from.";
        api.step([passTo(h, T)]);
        const T2 = P(tok(api.f, T.id)),
          H2 = P(tok(api.f, h.id));
        const M = clampPt(lerp(T2, H2, 0.45));
        const R = clampPt(add(M, mul(unit(sub(M, H2)), 34)));
        const bend = add(M, mul(unit(sub(RIM, M)), 16));
        api.step([line("dribble", [T2, lerp(T2, M, 0.5), M]), line("cut", [H2, lerp(H2, bend, 0.6), bend, R]), line("handoff", [M, R])]);
        const g = P(tok(api.f, T.id));
        const roll = [250 + sideOf(g) * 24, 80];
        api.step([line("cut", [g, lerp(g, roll, 0.5), roll])]);
      },
    },
    rub: {
      label: "Rub: handoff to the ball-side guard, who hands it off fills the corner, with a backside down screen",
      run(api) {
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
        const R = clampPt(add(M, mul(unit(sub(TOP, M)), 34)));
        const bs = backside(f, [h.id, L.id], s, M);
        api.step([line("dribble", [H, lerp(H, M, 0.5), M]), line("cut", [Lp, lerp(Lp, M, 0.6), add(M, [s * 14, 0]), R]), line("handoff", [M, R]), bs && bs.screen]);
        const g = P(tok(api.f, h.id));
        api.step([line("cut", [g, lerp(g, Lp, 0.5), Lp]), bs && bs.cut]);
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
        const bs = backside(f, [h.id, L.id], s, home);
        api.step([passTo(h, L), bs && bs.screen]);
        // The passer rides up the lane line and fills the corner; the Lock fills the slot with the ball.
        const lane = 250 + s * 52;
        const H2 = P(tok(api.f, h.id)),
          L2 = P(tok(api.f, L.id));
        api.step([line("dribble", [L2, lerp(L2, home, 0.5), home]), line("cut", [H2, [lane, Math.min(H2[1], 185)], [lane, 72], Lp]), bs && bs.cut]);
        // From here the Lock goes into a Twirl or a Get with the Rabbit (add either next in the call).
      },
    },
    twirl: {
      label: "Twirl: the Rabbit's ball screen; the Rabbit rolls",
      run(api) {
        const f = api.f;
        const h = holder(f);
        if (!h) return "nobody has the ball.";
        const H = P(h);
        const s = Math.abs(h.x - 250) > 15 ? sideOf(H) : 1;
        const others = offense(f).filter((t) => t.id !== h.id);
        if (h.n === "5") return "the Rabbit has the ball. Twirl is the Rabbit's ball screen.";
        const S = rabbit(f, h.id);
        if (!S) return "there's no Rabbit on the floor to set the ball screen.";
        // The handler comes off toward the middle, stopping short of a spot someone already has.
        const open = (p) => others.every((t) => t.id === S.id || dist(P(t), p) > 55);
        const G = clampPt([0.8, 0.65, 0.5, 0.35].map((k) => lerp(H, NAIL_TOP, k)).find(open) || lerp(H, NAIL_TOP, 0.35));
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
  function extend(frames, ruleId) {
    frames = frames.slice();
    let last = frames[frames.length - 1];
    if (last.strokes && last.strokes.length) {
      last = D().advanceFrame(last);
      frames.push(last);
    }
    const res = run(ruleId, last, ctxFrom(frames));
    if (res.error) return res;
    const start = frames.length - 1;
    frames.splice(start, 1, ...res.frames);
    return { frames, start };
  }

  /* Small examples for the playbook: just the 2 to 4 players each action needs. */
  const o = (n, x, y) => ({ id: "o" + n, t: "o", n: String(n), x, y });
  const withBall = (n, x, y) => [o(n, x, y), { id: "ball", t: "ball", n: "", x: x + 13, y: y - 12 }];
  const DEMOS = {
    // 3 swings it to 1, so the swing keeps going the same way: 1 to 4.
    swing: { tokens: [...withBall(3, 85, 215), o(1, 175, 272), o(4, 325, 272)], first: [{ id: "d0", t: "pass", pts: [[85, 215], [175, 272]] }] },
    skip: { tokens: [...withBall(1, 175, 272), o(4, 325, 272), o(2, 470, 42)] },
    back: { tokens: [...withBall(1, 175, 272), o(4, 325, 272)], seq: ["swing", "back"] },
    "post-entry": { tokens: [...withBall(1, 85, 215), o(5, 175, 76)] },
    get: { tokens: [...withBall(1, 85, 215), o(5, 190, 190)] },
    rub: { tokens: [...withBall(1, 175, 272), o(3, 30, 42), o(4, 325, 272), o(2, 470, 42)] },
    twist: { tokens: [...withBall(1, 175, 272), o(3, 30, 42), o(4, 325, 272), o(2, 470, 42)] },
    twirl: { tokens: [...withBall(1, 175, 272), o(5, 175, 76)] },
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
  /* The diagram to show for an item: the coach's drawing, or a demo of its rule. */
  BH.viewDiagram = (item) => (BH.hasDiagram(item) ? item.diagram : isAuto(item) ? demo(item) : null);

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
