/* App shell: header, navigation, routing. Loaded last. */
(function () {
  const BH = window.BH;
  const { esc, icons } = BH;

  const VIEWS = [
    { id: "playbook", label: "Playbook", icon: "book" },
    { id: "board", label: "Whiteboard", icon: "board" },
    { id: "study", label: "Study", icon: "cards" },
    { id: "install", label: "Install", icon: "install", coach: true },
  ];
  let current = null;
  let app, main;

  function mark() {
    const b = (cls) => `<path class="${cls}" fill-rule="evenodd" d="${BH.court.B_PATH}" />`;
    return `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" class="mark-ring"/><g transform="translate(20,20) scale(0.24)">${b("mark-b-outer")}${b("mark-b-key")}${b("mark-b")}</g></svg>`;
  }

  function shell() {
    app = document.createElement("div");
    app.id = "app";
    app.innerHTML = `
      <a class="skip" href="#main">Skip to content</a>
      <header class="topbar">
        <a class="brand" href="#playbook" aria-label="Baldwin Basketball home">
          ${mark()}
          <span class="brand-text"><b id="brand-team">Baldwin Basketball</b><small>The Install</small></span>
        </a>
        <nav class="nav" aria-label="Sections"></nav>
        <div class="role-pill" id="role-pill" hidden></div>
      </header>
      <main id="main" tabindex="-1"></main>
      <footer class="foot" id="foot"></footer>`;
    document.body.appendChild(app);
    main = BH.$("#main", app);
  }

  function renderNav() {
    const nav = BH.$(".nav", app);
    const view = viewFromHash();
    nav.innerHTML = VIEWS.filter((v) => !v.coach || BH.store.isCoach)
      .map((v) => `<a class="nav-link${view === v.id ? " on" : ""}" href="#${v.id}" ${view === v.id ? 'aria-current="page"' : ""}>${icons[v.icon]}<span>${v.label}</span></a>`)
      .join("");
    const pill = BH.$("#role-pill", app);
    pill.hidden = !BH.store.isCoach;
    pill.textContent = BH.store.mode === "artifact" ? "Coach" : BH.store.hasDraft ? "Coach · unpublished edits" : "Coach";
    BH.$("#brand-team", app).textContent = (BH.store.program.team && BH.store.program.team.name) || "Baldwin Basketball";
    const foot = BH.$("#foot", app);
    foot.innerHTML =
      BH.store.mode === "site"
        ? `<span>Baldwin Basketball · The Install</span><button class="link" id="coach-toggle">${BH.store.isCoach ? "Turn off coach tools" : "Coach? Turn on coach tools"}</button>`
        : `<span>Baldwin Basketball · The Install</span>`;
    const ct = BH.$("#coach-toggle", foot);
    if (ct) ct.addEventListener("click", () => BH.store.setCoachMode(!BH.store.isCoach));
  }

  function viewFromHash() {
    const h = (location.hash || "").replace(/^#/, "");
    if (h.startsWith("item-")) return "playbook";
    return VIEWS.some((v) => v.id === h) ? h : "playbook";
  }

  function route(keepScroll) {
    const h = (location.hash || "").replace(/^#/, "");
    const view = viewFromHash();
    if (current && BH[current] && BH[current].leave) BH[current].leave();
    current = view;
    document.body.dataset.view = view;
    renderNav();
    if (h.startsWith("item-")) BH.playbook.renderItem(main, h.slice(5));
    else BH[view].render(main);
    if (keepScroll !== true) window.scrollTo(0, 0);
  }

  async function start() {
    shell();
    main.innerHTML = `<div class="loading"><span></span>Loading the playbook…</div>`;
    window.addEventListener("hashchange", () => route());
    BH.on("role", () => route(true));
    let first = true;
    BH.on("program", () => {
      if (first) {
        first = false;
        route();
      } else if (current !== "board") {
        // Re-render the current view so it shows the latest program.
        route(true);
      } else renderNav();
    });
    await BH.store.init();
    const resume = BH.session.get("bh.resume", null);
    if (resume) {
      BH.session.remove("bh.resume");
      if (resume.toast) setTimeout(() => BH.toast(resume.toast, "good"), 400);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
