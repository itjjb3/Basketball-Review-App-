/* Playbook: browse everything installed, open an item to study it. */
(function () {
  const BH = window.BH;
  const { esc, icons } = BH;

  const state = { kind: "all", q: "", open: null };
  let player = null;

  function matches(it, q) {
    if (!q) return true;
    const hay = [it.name, it.call, it.summary, ...(it.keys || []), ...(it.reads || [])].join(" ").toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .every((w) => hay.includes(w));
  }

  function card(it) {
    const k = BH.kind(it.kind);
    const thumb = BH.hasDiagram(it) ? `<div class="card-thumb">${BH.diagram.thumbSVG(it.diagram, { label: it.name + " diagram" })}</div>` : "";
    return `
      <a class="item-card${thumb ? " has-thumb" : ""}" href="#item-${esc(it.id)}" data-id="${esc(it.id)}">
        ${thumb}
        <div class="card-body">
          <div class="card-meta"><span class="kind-chip k-${esc(it.kind)}">${esc(k.one)}</span>${it.example ? '<span class="ex-chip">Example</span>' : ""}</div>
          <h3>${esc(it.name)}</h3>
          ${it.call ? `<p class="call"><span>Call</span> ${esc(it.call)}</p>` : ""}
          <p class="summary">${esc(it.summary)}</p>
        </div>
      </a>`;
  }

  function render(root) {
    const items = BH.store.items();
    const counts = { all: items.length };
    BH.KINDS.forEach((k) => (counts[k.id] = items.filter((i) => i.kind === k.id).length));
    const list = items.filter((i) => (state.kind === "all" || i.kind === state.kind) && matches(i, state.q));
    const groups = state.kind === "all" && !state.q ? BH.KINDS.map((k) => ({ k, items: list.filter((i) => i.kind === k.id) })).filter((g) => g.items.length) : [{ k: null, items: list }];
    const hasExamples = items.some((i) => i.example);

    root.innerHTML = `
      <section class="view-playbook">
        <header class="view-head">
          <div>
            <p class="eyebrow">${esc(BH.store.program.team.name)}${BH.store.program.team.season ? " · " + esc(BH.store.program.team.season) : ""}</p>
            <h1>Playbook</h1>
            <p class="lede">Everything we run, in our words. Open anything to see the diagram, the call and what to look for.</p>
          </div>
          <label class="search">
            ${icons.search}
            <input id="pb-search" type="search" placeholder="Search plays, calls, terms" value="${esc(state.q)}" autocomplete="off" />
          </label>
        </header>
        ${
          hasExamples
            ? `<div class="notice">${icons.info}<p><strong>Example content.</strong> The items marked “Example” are placeholders to show how the app works. ${
                BH.store.isCoach ? "Replace them with your program in <a href=\"#install\">Install</a>." : "Your coach will replace them with our program."
              }</p></div>`
            : ""
        }
        <nav class="kind-filter" aria-label="Filter by category">
          <button class="chip${state.kind === "all" ? " on" : ""}" data-kind="all">All <span>${counts.all}</span></button>
          ${BH.KINDS.map((k) => `<button class="chip${state.kind === k.id ? " on" : ""}" data-kind="${k.id}" ${counts[k.id] ? "" : "disabled"}>${esc(k.label)} <span>${counts[k.id]}</span></button>`).join("")}
        </nav>
        <div class="pb-groups">
          ${
            list.length
              ? groups
                  .map(
                    (g) => `
            <div class="pb-group">
              ${g.k ? `<h2 class="group-title">${esc(g.k.label)} <small>${esc(g.k.blurb)}</small></h2>` : ""}
              <div class="card-grid">${g.items.map(card).join("")}</div>
            </div>`
                  )
                  .join("")
              : items.length
                ? `<div class="empty"><h3>Nothing matches “${esc(state.q)}”</h3><p>Try a different word, or clear the search.</p></div>`
                : `<div class="empty"><h3>No program installed yet</h3><p>${BH.store.isCoach ? 'Head to <a href="#install">Install</a> to add your first set, term or defense.' : "Your coach hasn't added anything yet. Check back soon."}</p></div>`
          }
        </div>
      </section>`;

    const input = BH.$("#pb-search", root);
    input.addEventListener("input", () => {
      state.q = input.value.trim();
      const pos = input.selectionStart;
      render(root);
      const again = BH.$("#pb-search", root);
      again.focus();
      try {
        again.setSelectionRange(pos, pos);
      } catch (e) {}
    });
    BH.$$(".kind-filter .chip", root).forEach((b) =>
      b.addEventListener("click", () => {
        state.kind = b.dataset.kind;
        render(root);
      })
    );
  }

  /* ---- item detail ---- */
  function renderItem(root, id) {
    if (player) player.destroy();
    player = null;
    const it = BH.store.get(id);
    if (!it) {
      root.innerHTML = `<section class="view-item"><div class="empty"><h3>That item isn't in the playbook anymore</h3><p><a href="#playbook">Back to the playbook</a></p></div></section>`;
      return;
    }
    const k = BH.kind(it.kind);
    const related = BH.store.items().filter((o) => o.id !== it.id && o.kind === it.kind);
    root.innerHTML = `
      <section class="view-item">
        <a class="back" href="#playbook">${icons.prev} Playbook</a>
        <div class="item-layout${BH.hasDiagram(it) ? "" : " no-diagram"}">
          ${BH.hasDiagram(it) ? `<div class="item-diagram" id="item-player"></div>` : ""}
          <article class="item-text">
            <div class="card-meta"><span class="kind-chip k-${esc(it.kind)}">${esc(k.one)}</span>${it.example ? '<span class="ex-chip">Example</span>' : ""}</div>
            <h1>${esc(it.name)}</h1>
            ${it.call ? `<p class="call big"><span>Call</span> ${esc(it.call)}</p>` : ""}
            ${it.summary ? `<p class="item-summary">${esc(it.summary)}</p>` : ""}
            ${it.keys.length ? `<h2>Keys</h2><ul class="keys">${it.keys.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
            ${it.reads.length ? `<h2>Reads</h2><ul class="reads">${it.reads.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
            <div class="item-actions">
              <a class="btn primary" href="#board" data-open-board="${esc(it.id)}">${icons.board} Open on whiteboard</a>
              <a class="btn" href="#study" data-study-kind="${esc(it.kind)}">${icons.cards} Study ${esc(k.label.toLowerCase())}</a>
              ${BH.store.isCoach ? `<a class="btn ghost" href="#install" data-edit="${esc(it.id)}">${icons.edit} Edit</a>` : ""}
            </div>
            ${
              related.length
                ? `<h2>More ${esc(k.label.toLowerCase())}</h2><div class="related">${related
                    .slice(0, 8)
                    .map((r) => `<a class="chip" href="#item-${esc(r.id)}">${esc(r.name)}</a>`)
                    .join("")}</div>`
                : ""
            }
          </article>
        </div>
      </section>`;
    if (BH.hasDiagram(it)) player = new BH.diagram.Player(BH.$("#item-player", root), it.diagram, { label: it.name + " diagram" });
    const ob = BH.$("[data-open-board]", root);
    ob.addEventListener("click", () => BH.board && BH.board.queueOpen(it.id));
    const sk = BH.$("[data-study-kind]", root);
    sk.addEventListener("click", () => BH.study && BH.study.preset(it.kind));
    const ed = BH.$("[data-edit]", root);
    if (ed) ed.addEventListener("click", () => BH.install && BH.install.queueEdit(it.id));
  }

  BH.playbook = {
    render,
    renderItem,
    leave() {
      if (player) player.destroy();
      player = null;
    },
  };
})();
