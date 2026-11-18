/* Study: flashcards and a quick quiz, built from whatever the coach installed. */
(function () {
  const BH = window.BH;
  const { esc, icons } = BH;
  const PROG_KEY = "bh.progress";
  const PREF_KEY = "bh.studyPrefs";

  const prefs = BH.local.get(PREF_KEY, { kinds: [], mode: "cards", front: "name", onlyLearning: false });
  const S = { order: [], i: 0, flipped: false, deckSig: "", quiz: null };
  let root = null;
  let player = null;

  const progress = () => BH.local.get(PROG_KEY, {});
  function mark(id, known) {
    const p = progress();
    p[id] = { known, at: Date.now() };
    BH.local.set(PROG_KEY, p);
  }
  const savePrefs = () => BH.local.set(PREF_KEY, prefs);

  function deck() {
    const items = BH.store.items();
    return prefs.kinds.length ? items.filter((i) => prefs.kinds.includes(i.kind)) : items.slice();
  }
  function cardDeck() {
    let d = deck();
    if (prefs.onlyLearning) {
      const p = progress();
      d = d.filter((i) => !(p[i.id] && p[i.id].known));
    }
    return d;
  }
  function ensureOrder(force) {
    const d = cardDeck();
    const sig = d.map((i) => i.id).join("|") + "|" + prefs.onlyLearning;
    if (force || sig !== S.deckSig) {
      S.order = BH.shuffle(d.map((i) => i.id));
      S.i = 0;
      S.flipped = false;
      S.deckSig = sig;
    }
  }

  function render(host) {
    root = host;
    if (player) player.destroy();
    player = null;
    const items = BH.store.items();
    const counts = {};
    BH.KINDS.forEach((k) => (counts[k.id] = items.filter((i) => i.kind === k.id).length));
    host.innerHTML = `
      <section class="view-study">
        <header class="view-head">
          <div>
            <p class="eyebrow">Study</p>
            <h1>Know it cold</h1>
            <p class="lede">Flip through our calls and terms, then test yourself. Your progress stays on this device.</p>
          </div>
          <div class="seg big" role="tablist" aria-label="Study mode">
            <button role="tab" aria-selected="${prefs.mode === "cards"}" class="${prefs.mode === "cards" ? "on" : ""}" data-mode="cards">${icons.cards} Flashcards</button>
            <button role="tab" aria-selected="${prefs.mode === "quiz"}" class="${prefs.mode === "quiz" ? "on" : ""}" data-mode="quiz">${icons.check} Quiz</button>
          </div>
        </header>
        <nav class="kind-filter" aria-label="Choose what to study">
          <button class="chip${prefs.kinds.length ? "" : " on"}" data-k="all">Everything <span>${items.length}</span></button>
          ${BH.KINDS.map((k) => `<button class="chip${prefs.kinds.includes(k.id) ? " on" : ""}" data-k="${k.id}" ${counts[k.id] ? "" : "disabled"}>${esc(k.label)} <span>${counts[k.id]}</span></button>`).join("")}
        </nav>
        <div class="study-body"></div>
      </section>`;
    BH.$$("[data-mode]", host).forEach((b) =>
      b.addEventListener("click", () => {
        prefs.mode = b.dataset.mode;
        savePrefs();
        S.quiz = null;
        render(host);
      })
    );
    BH.$$("[data-k]", host).forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        if (k === "all") prefs.kinds = [];
        else prefs.kinds = prefs.kinds.includes(k) ? prefs.kinds.filter((x) => x !== k) : prefs.kinds.concat(k);
        savePrefs();
        S.quiz = null;
        render(host);
      })
    );
    if (prefs.mode === "quiz") renderQuiz();
    else renderCards();
  }

  /* ---------- flashcards ---------- */
  function face(it, side) {
    const k = BH.kind(it.kind);
    const showName = (prefs.front === "name") === (side === "front");
    if (showName) {
      return `<div class="face-inner name-face">
          <span class="kind-chip k-${esc(it.kind)}">${esc(k.one)}</span>
          <h2>${esc(it.name)}</h2>
          ${it.call ? `<p class="call"><span>Call</span> ${esc(it.call)}</p>` : ""}
          ${side === "front" ? `<p class="flip-hint">${icons.flip} Tap or press Space to flip</p>` : ""}
        </div>`;
    }
    const keys = it.keys.slice(0, 4);
    return `<div class="face-inner meaning-face${BH.hasDiagram(it) ? " with-diagram" : ""}">
        ${BH.hasDiagram(it) ? `<div class="fc-diagram">${BH.diagram.thumbSVG(it.diagram, { label: "Diagram" })}</div>` : ""}
        <div class="fc-text">
          ${it.summary ? `<p class="fc-summary">${esc(it.summary)}</p>` : ""}
          ${keys.length ? `<ul class="keys">${keys.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${!it.summary && !keys.length && !BH.hasDiagram(it) ? `<p class="muted">No description yet.</p>` : ""}
          ${side === "front" ? `<p class="flip-hint">${icons.flip} What's this called? Tap to flip</p>` : ""}
        </div>
      </div>`;
  }

  function renderCards() {
    const body = BH.$(".study-body", root);
    const full = deck();
    if (!full.length) {
      body.innerHTML = `<div class="empty"><h3>Nothing to study yet</h3><p>Once your coach installs the program, every set, action, term and defense shows up here as a card.</p></div>`;
      return;
    }
    ensureOrder(false);
    const p = progress();
    const known = full.filter((i) => p[i.id] && p[i.id].known).length;
    const options = `
      <div class="fc-options">
        <div class="seg" aria-label="Front of card">
          <span class="seg-label">Front</span>
          <button class="${prefs.front === "name" ? "on" : ""}" data-front="name">Name</button>
          <button class="${prefs.front === "meaning" ? "on" : ""}" data-front="meaning">Meaning</button>
        </div>
        <label class="check"><input type="checkbox" id="only-learning" ${prefs.onlyLearning ? "checked" : ""}/> Only cards I'm still learning</label>
        <button class="btn ghost" data-act="shuffle">${icons.shuffle} Shuffle</button>
        <button class="btn ghost" data-act="reset-progress">Reset progress</button>
      </div>`;
    const meter = `<div class="meter" aria-label="${known} of ${full.length} known"><span style="width:${(known / full.length) * 100}%"></span></div><p class="meter-label"><b>${known}</b> of ${full.length} known</p>`;

    if (!S.order.length || S.i >= S.order.length) {
      body.innerHTML = `${options}
        <div class="deck-done">
          ${meter}
          <h2>${S.order.length ? "Deck done" : "You know every card in this deck"}</h2>
          <p>${known === full.length ? "Every card marked known. Try the quiz, or study with the meaning on the front." : "Run it again with only the cards you're still learning."}</p>
          <div class="row">
            ${known < full.length ? `<button class="btn primary" data-act="again-learning">Study the ones I'm learning</button>` : `<button class="btn primary" data-act="to-quiz">${icons.check} Take the quiz</button>`}
            <button class="btn" data-act="restart">Start over</button>
          </div>
        </div>`;
      wireOptions(body);
      const al = BH.$('[data-act="again-learning"]', body);
      if (al)
        al.addEventListener("click", () => {
          prefs.onlyLearning = true;
          savePrefs();
          ensureOrder(true);
          renderCards();
        });
      const rs = BH.$('[data-act="restart"]', body);
      rs.addEventListener("click", () => {
        prefs.onlyLearning = false;
        savePrefs();
        ensureOrder(true);
        renderCards();
      });
      const tq = BH.$('[data-act="to-quiz"]', body);
      if (tq)
        tq.addEventListener("click", () => {
          prefs.mode = "quiz";
          savePrefs();
          render(root);
        });
      return;
    }

    const it = BH.store.get(S.order[S.i]);
    const status = p[it.id] ? (p[it.id].known ? "known" : "learning") : "";
    body.innerHTML = `${options}
      <div class="fc-wrap">
        <div class="fc-top"><span>Card <b>${S.i + 1}</b> of ${S.order.length}</span>${status ? `<span class="status ${status}">${status === "known" ? "Known" : "Still learning"}</span>` : ""}</div>
        <div class="flashcard${S.flipped ? " flipped" : ""}" id="flashcard" role="button" tabindex="0" aria-label="Flashcard. ${S.flipped ? "Showing back" : "Showing front"}. Press to flip.">
          <div class="face front" aria-hidden="${S.flipped}">${face(it, "front")}</div>
          <div class="face back" aria-hidden="${!S.flipped}">${face(it, "back")}<a class="fc-open" href="#item-${esc(it.id)}">Open in playbook ${icons.next}</a></div>
        </div>
        <div class="fc-actions">
          <button class="btn icon" data-act="prev" aria-label="Previous card" ${S.i === 0 ? "disabled" : ""}>${icons.prev}</button>
          <button class="btn learning" data-act="learning">Still learning</button>
          <button class="btn known" data-act="known">${icons.check} Got it</button>
          <button class="btn icon" data-act="next" aria-label="Skip card">${icons.next}</button>
        </div>
        ${meter}
        <p class="kbd-hint">Space flips · ← still learning · → got it</p>
      </div>`;
    wireOptions(body);
    const fc = BH.$("#flashcard", body);
    fc.addEventListener("click", (e) => {
      if (e.target.closest(".fc-open")) return;
      flip();
    });
    BH.$('[data-act="prev"]', body).addEventListener("click", () => step(-1));
    BH.$('[data-act="next"]', body).addEventListener("click", () => step(1));
    BH.$('[data-act="known"]', body).addEventListener("click", () => answer(true));
    BH.$('[data-act="learning"]', body).addEventListener("click", () => answer(false));
  }
  function wireOptions(body) {
    BH.$$("[data-front]", body).forEach((b) =>
      b.addEventListener("click", () => {
        prefs.front = b.dataset.front;
        savePrefs();
        S.flipped = false;
        renderCards();
      })
    );
    const ol = BH.$("#only-learning", body);
    if (ol)
      ol.addEventListener("change", () => {
        prefs.onlyLearning = ol.checked;
        savePrefs();
        ensureOrder(true);
        renderCards();
      });
    const sh = BH.$('[data-act="shuffle"]', body);
    if (sh)
      sh.addEventListener("click", () => {
        ensureOrder(true);
        renderCards();
      });
    const rp = BH.$('[data-act="reset-progress"]', body);
    if (rp)
      rp.addEventListener("click", () => {
        if (!rp.dataset.armed) {
          rp.dataset.armed = "1";
          rp.textContent = "Tap again to reset";
          setTimeout(() => {
            if (rp.isConnected) {
              delete rp.dataset.armed;
              rp.textContent = "Reset progress";
            }
          }, 2500);
          return;
        }
        BH.local.remove(PROG_KEY);
        ensureOrder(true);
        renderCards();
      });
  }
  function flip() {
    S.flipped = !S.flipped;
    const fc = BH.$("#flashcard", root);
    if (fc) {
      fc.classList.toggle("flipped", S.flipped);
      fc.setAttribute("aria-label", `Flashcard. ${S.flipped ? "Showing back" : "Showing front"}. Press to flip.`);
      fc.querySelector(".front").setAttribute("aria-hidden", String(S.flipped));
      fc.querySelector(".back").setAttribute("aria-hidden", String(!S.flipped));
    }
  }
  function step(d) {
    S.i = Math.max(0, S.i + d);
    S.flipped = false;
    renderCards();
  }
  function answer(known) {
    const id = S.order[S.i];
    if (!id) return;
    mark(id, known);
    S.i += 1;
    S.flipped = false;
    renderCards();
  }

  /* ---------- quiz ---------- */
  function buildQuiz() {
    const d = deck();
    const all = BH.store.items();
    const pool = BH.shuffle(d).slice(0, Math.min(10, d.length));
    return pool.map((it) => {
      const types = [];
      if (BH.hasDiagram(it)) types.push("diagram");
      if (it.summary) types.push("summary");
      if (it.summary && ["term", "principle", "concept"].includes(it.kind)) types.push("meaning");
      if (!types.length) types.push("call");
      let type = types[Math.floor(Math.random() * types.length)];
      if (type === "call" && !it.call) type = "summary";
      const sameKind = all.filter((o) => o.id !== it.id && o.kind === it.kind);
      const others = all.filter((o) => o.id !== it.id && o.kind !== it.kind);
      const want = type === "meaning" ? (o) => !!o.summary : () => true;
      const distract = BH.shuffle(sameKind.filter(want)).concat(BH.shuffle(others.filter(want))).slice(0, 3);
      const options = BH.shuffle([it, ...distract]).map((o) => ({ id: o.id, text: type === "meaning" ? o.summary : o.name }));
      return { id: it.id, type, options, picked: null };
    });
  }
  function renderQuiz() {
    if (player) player.destroy();
    player = null;
    const body = BH.$(".study-body", root);
    const d = deck();
    if (BH.store.items().length < 2 || d.length < 1) {
      body.innerHTML = `<div class="empty"><h3>Not enough to quiz on yet</h3><p>The quiz needs at least two items in the playbook.</p></div>`;
      return;
    }
    if (!S.quiz) S.quiz = { qs: buildQuiz(), i: 0 };
    const Q = S.quiz;
    if (Q.i >= Q.qs.length) {
      const right = Q.qs.filter((q) => q.picked === q.id);
      const missed = Q.qs.filter((q) => q.picked !== q.id);
      const pct = Math.round((right.length / Q.qs.length) * 100);
      body.innerHTML = `
        <div class="quiz-done">
          <p class="score"><b>${right.length}</b>/${Q.qs.length}</p>
          <h2>${pct === 100 ? "Perfect. You know it cold." : pct >= 70 ? "Solid. Clean up the misses." : "Keep at it. Review the misses, then go again."}</h2>
          ${
            missed.length
              ? `<h3>Review these</h3><ul class="missed">${missed
                  .map((q) => {
                    const it = BH.store.get(q.id);
                    return it ? `<li><a href="#item-${esc(it.id)}"><b>${esc(it.name)}</b> <span>${esc(BH.kind(it.kind).one)}</span></a></li>` : "";
                  })
                  .join("")}</ul>`
              : ""
          }
          <div class="row"><button class="btn primary" data-act="retake">Take a new quiz</button>${missed.length ? `<button class="btn" data-act="cards-missed">Flashcards for the misses</button>` : ""}</div>
        </div>`;
      BH.$('[data-act="retake"]', body).addEventListener("click", () => {
        S.quiz = null;
        renderQuiz();
      });
      const cm = BH.$('[data-act="cards-missed"]', body);
      if (cm)
        cm.addEventListener("click", () => {
          missed.forEach((q) => mark(q.id, false));
          prefs.mode = "cards";
          prefs.onlyLearning = true;
          savePrefs();
          S.quiz = null;
          S.deckSig = "";
          render(root);
        });
      return;
    }
    const q = Q.qs[Q.i];
    const it = BH.store.get(q.id);
    if (!it) {
      Q.i++;
      return renderQuiz();
    }
    const k = BH.kind(it.kind);
    let prompt = "";
    if (q.type === "diagram") prompt = `<p class="q-ask">What's this ${esc(k.one.toLowerCase())} called?</p><div class="q-diagram" id="q-player"></div>`;
    else if (q.type === "meaning") prompt = `<p class="q-ask">What does <b>${esc(it.name)}</b> mean?</p>`;
    else if (q.type === "call") prompt = `<p class="q-ask">Which ${esc(k.one.toLowerCase())} has the call <b>“${esc(it.call)}”</b>?</p>`;
    else prompt = `<p class="q-ask">Which ${esc(k.one.toLowerCase())} is this?</p><blockquote class="q-quote">${esc(it.summary)}</blockquote>`;
    const answered = q.picked != null;
    body.innerHTML = `
      <div class="quiz">
        <div class="fc-top"><span>Question <b>${Q.i + 1}</b> of ${Q.qs.length}</span><span class="kind-chip k-${esc(it.kind)}">${esc(k.one)}</span></div>
        <div class="meter"><span style="width:${(Q.i / Q.qs.length) * 100}%"></span></div>
        ${prompt}
        <div class="options${q.type === "meaning" ? " long" : ""}">
          ${q.options
            .map((o, n) => {
              let cls = "";
              if (answered) cls = o.id === q.id ? " right" : o.id === q.picked ? " wrong" : " dim";
              return `<button class="option${cls}" data-opt="${esc(o.id)}" ${answered ? "disabled" : ""}><span class="opt-key">${"ABCD"[n]}</span><span>${esc(o.text)}</span></button>`;
            })
            .join("")}
        </div>
        ${
          answered
            ? `<div class="feedback ${q.picked === q.id ? "good" : "bad"}">
              <p><b>${q.picked === q.id ? "Right." : "Not quite."}</b> ${esc(it.name)}${it.call ? ` · call: ${esc(it.call)}` : ""}</p>
              ${q.type !== "summary" && it.summary ? `<p>${esc(it.summary)}</p>` : ""}
              <button class="btn primary" data-act="next-q">${Q.i + 1 < Q.qs.length ? "Next question" : "See results"} ${icons.next}</button>
            </div>`
            : ""
        }
      </div>`;
    if (q.type === "diagram") player = new BH.diagram.Player(BH.$("#q-player", body), it.diagram, { label: "Mystery diagram" });
    BH.$$("[data-opt]", body).forEach((b) =>
      b.addEventListener("click", () => {
        q.picked = b.dataset.opt;
        renderQuiz();
        const nx = BH.$('[data-act="next-q"]', body);
        if (nx) nx.focus();
      })
    );
    const nx = BH.$('[data-act="next-q"]', body);
    if (nx)
      nx.addEventListener("click", () => {
        Q.i++;
        renderQuiz();
      });
  }

  document.addEventListener("keydown", (e) => {
    if (!root || !root.isConnected || !BH.$(".view-study", root) || prefs.mode !== "cards") return;
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
    if (e.key === " " || e.key === "Enter") {
      if (e.target && e.target.closest && e.target.closest("button:not(#flashcard), a")) return;
      e.preventDefault();
      flip();
    } else if (e.key === "ArrowRight") answer(true);
    else if (e.key === "ArrowLeft") answer(false);
  });

  BH.on("program", () => {
    S.deckSig = "";
    S.quiz = null;
  });

  BH.study = {
    render,
    leave() {
      if (player) player.destroy();
      player = null;
    },
    preset(kind) {
      prefs.kinds = [kind];
      prefs.mode = "cards";
      prefs.onlyLearning = false;
      savePrefs();
      S.deckSig = "";
    },
  };
})();
