/* The program: everything a coach installs. Loads, saves, imports, exports.

   Two ways the app can run:
   - "site":     a normal web page (GitHub Pages, a laptop). The program comes from
                 data/program.json. Coach edits are kept on that device until the
                 coach exports program.json and uploads it to the repo.
   - "artifact": the single-file build published on claude.ai. The program lives
                 inside the page, and a coach's Save republishes the page for everyone. */
(function () {
  const BH = window.BH;
  const DRAFT_KEY = "bh.programDraft";
  const COACH_KEY = "bh.coachMode";

  const store = {
    program: { version: 1, team: {}, items: [] },
    published: null,
    mode: "site",
    isCoach: false, // may see coach tools
    canSaveForEveryone: false,
    hasDraft: false,
    loaded: false,
  };

  const JOBS = ["ball", "gap", "deny", "wall", "bear"];
  const wrapDeg = (d) => ((((+d + 180) % 360) + 360) % 360) - 180;
  function normalizeToken(t) {
    const out = { id: String(t.id), t: t.t, n: t.n == null ? "" : String(t.n), x: +t.x, y: +t.y };
    if (t.t === "ball" && t.h) out.h = String(t.h);
    if (t.t === "x") {
      if (t.f != null && isFinite(t.f)) out.f = Math.round(wrapDeg(t.f)); // the way he faces
      if (t.hh) out.hh = true; // hands high
      if (JOBS.includes(t.j)) out.j = t.j; // his job, kept through a rotation
      if (t.m != null && /^[\w-]{1,3}$/.test(String(t.m))) out.m = String(t.m); // the man he guards after a switch
      if (t.sc) out.sc = true; // switched (Scram) on this step
    }
    return out;
  }
  /* A defense's stance for each job, in degrees. */
  function normalizeStance(st) {
    if (!st || typeof st !== "object") return null;
    const out = {};
    JOBS.forEach((j) => {
      if (st[j] != null && isFinite(st[j])) out[j] = Math.round(wrapDeg(st[j]));
    });
    return Object.keys(out).length ? out : null;
  }

  function normalizeItem(it) {
    const kind = BH.KINDS.some((k) => k.id === it.kind) ? it.kind : "term";
    const out = {
      id: String(it.id || BH.slug(it.name) + "-" + BH.uid()),
      kind,
      name: String(it.name || "Untitled").trim(),
      call: String(it.call || "").trim(),
      summary: String(it.summary || "").trim(),
      keys: Array.isArray(it.keys) ? it.keys.map(String).filter(Boolean) : BH.lines(it.keys),
      reads: Array.isArray(it.reads) ? it.reads.map(String).filter(Boolean) : BH.lines(it.reads),
      updated: it.updated || new Date().toISOString().slice(0, 10),
    };
    if (it.example) out.example = true;
    if (typeof it.rule === "string" && /^[a-z-]{2,20}$/.test(it.rule)) out.rule = it.rule;
    const st = normalizeStance(it.stance);
    if (st) out.stance = st;
    if (it.diagram && Array.isArray(it.diagram.frames) && it.diagram.frames.length) {
      out.diagram = {
        court: it.diagram.court === "full" ? "full" : "half",
        frames: it.diagram.frames.map((f) => ({
          tokens: (f.tokens || []).filter((t) => t && isFinite(t.x) && isFinite(t.y)).map(normalizeToken),
          strokes: (f.strokes || []).filter((s) => s && Array.isArray(s.pts) && s.pts.length > 1).map((s) => ({ id: String(s.id || BH.uid("s")), t: s.t, pts: s.pts.map((p) => [+p[0], +p[1]]), ...(s.c ? { c: String(s.c) } : {}) })),
        })),
      };
    }
    return out;
  }

  function normalize(p) {
    p = p && typeof p === "object" ? p : {};
    const seen = new Set();
    const items = (Array.isArray(p.items) ? p.items : []).map(normalizeItem).filter((it) => {
      if (seen.has(it.id)) it.id = it.id + "-" + BH.uid();
      seen.add(it.id);
      return true;
    });
    return {
      version: 1,
      team: { name: (p.team && p.team.name) || "Baldwin Basketball", season: (p.team && p.team.season) || "" },
      items,
    };
  }

  async function loadPublished() {
    const el = document.getElementById("program-data");
    if (el) {
      try {
        return normalize(JSON.parse(el.textContent));
      } catch (e) {
        console.warn("Program data could not be read", e);
      }
    }
    try {
      const res = await fetch("data/program.json", { cache: "no-cache" });
      if (res.ok) return normalize(await res.json());
    } catch (e) {
      /* opened from disk or offline */
    }
    return normalize({});
  }

  /* ---- page source capture, for republishing the single-file build ---- */
  let pageParts = null;
  let resetCss = null;
  function capturePage() {
    pageParts = BH.$$("[data-src]").map((el) => ({ kind: el.dataset.src, html: el.outerHTML }));
    const st = document.head && document.head.querySelector("style");
    resetCss = st ? st.textContent : null;
  }
  function buildPage(program) {
    const json = JSON.stringify(program).replace(/</g, "\\u003c");
    const reset =
      resetCss ||
      ":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}";
    const body = pageParts
      .map((p) => (p.kind === "program" ? `<script type="application/json" id="program-data" data-src="program">${json}<\/script>` : p.html))
      .join("\n");
    return `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${reset}<\/style></head><body>${body}</body></html>`;
  }

  store.init = async function () {
    store.published = await loadPublished();
    store.program = BH.clone(store.published);
    const inClaude = !!(window.claude && typeof window.claude.use === "function");
    const embedded = !!document.getElementById("program-data");

    if (inClaude && embedded) {
      store.mode = "artifact";
      capturePage();
    } else {
      store.mode = "site";
      const params = new URLSearchParams(location.search);
      if (params.has("coach")) BH.local.set(COACH_KEY, true);
      store.isCoach = !!BH.local.get(COACH_KEY, false);
      const draft = BH.local.get(DRAFT_KEY, null);
      if (draft && draft.program) {
        store.program = normalize(draft.program);
        store.hasDraft = true;
        store.isCoach = true;
      }
    }
    store.loaded = true;
    BH.emit("program");

    if (store.mode === "artifact") {
      // Light up coach tools once the viewer tells us who this is.
      try {
        const [art, user] = await Promise.all([window.claude.use("artifact"), window.claude.use("user")]);
        const canEdit = user ? await user.canEdit() : false;
        store.artifact = art;
        store.downloads = await window.claude.use("downloads");
        store.isCoach = !!canEdit;
        store.canSaveForEveryone = !!(art && canEdit && pageParts && pageParts.length);
        BH.emit("role");
      } catch (e) {
        console.warn(e);
      }
    }
  };

  store.setCoachMode = function (on) {
    if (store.mode !== "site") return;
    store.isCoach = !!on;
    BH.local.set(COACH_KEY, !!on);
    BH.emit("role");
  };

  store.items = () => store.program.items;
  store.get = (id) => store.program.items.find((i) => i.id === id);
  store.byKind = (kind) => store.program.items.filter((i) => !kind || kind === "all" || i.kind === kind);
  store.uniqueId = (name) => {
    const base = BH.slug(name);
    let id = base,
      n = 2;
    while (store.get(id)) id = base + "-" + n++;
    return id;
  };

  /* Commit the working program. Returns true when it was saved somewhere. */
  async function commit(next, message) {
    next = normalize(next);
    if (store.mode === "artifact") {
      if (!store.canSaveForEveryone) {
        BH.toast("This view is read-only. Only coaches can save changes.", "warn");
        return false;
      }
      BH.session.set("bh.resume", { hash: location.hash, toast: message || "Saved. Players see it now." });
      try {
        BH.toast("Saving for the whole team…");
        await store.artifact.publish(buildPage(next));
        store.program = next; // the view reloads to the new version
        return true;
      } catch (e) {
        BH.session.remove("bh.resume");
        const code = e && e.code;
        if (code === "conflict") BH.toast("Another coach saved first. Reloading with their version — make your change again.", "warn");
        else if (code === "not_writer" || code === "not_granted" || code === "consent_required" || code === "not_declared") {
          store.canSaveForEveryone = false;
          store.isCoach = false;
          BH.emit("role");
          BH.toast("This view is read-only. Only coaches can save changes.", "warn");
        } else if (code === "rate_limited") BH.toast("Saving too often. Wait a moment, then save again.", "warn");
        else if (code === "too_large") BH.toast("The program is too large to save. Remove some diagrams and try again.", "warn");
        else BH.toast("Couldn't save just now. Try again in a moment.", "warn");
        return false;
      }
    }
    store.program = next;
    store.hasDraft = true;
    BH.local.set(DRAFT_KEY, { savedAt: new Date().toISOString(), program: next });
    BH.emit("program");
    BH.toast(message || "Saved on this device. Export the program file to share it with players.");
    return true;
  }

  store.saveItem = async function (item, message) {
    const next = BH.clone(store.program);
    const it = normalizeItem({ ...item, updated: new Date().toISOString().slice(0, 10) });
    delete it.example;
    const idx = next.items.findIndex((i) => i.id === it.id);
    if (idx >= 0) next.items[idx] = it;
    else next.items.push(it);
    return commit(next, message);
  };

  store.saveMany = async function (items, message) {
    const next = BH.clone(store.program);
    items.forEach((item) => {
      const it = normalizeItem(item);
      const idx = next.items.findIndex((i) => i.id === it.id);
      if (idx >= 0) next.items[idx] = it;
      else next.items.push(it);
    });
    return commit(next, message);
  };

  store.deleteItem = async function (id) {
    const next = BH.clone(store.program);
    next.items = next.items.filter((i) => i.id !== id);
    return commit(next, "Removed.");
  };

  store.removeExamples = async function () {
    const next = BH.clone(store.program);
    next.items = next.items.filter((i) => !i.example);
    return commit(next, "Examples removed.");
  };

  store.replaceProgram = async function (p, message) {
    return commit(p, message);
  };

  store.discardDraft = function () {
    BH.local.remove(DRAFT_KEY);
    store.hasDraft = false;
    store.program = BH.clone(store.published);
    BH.emit("program");
  };

  store.exportText = () => JSON.stringify(store.program, null, 2) + "\n";

  store.exportFile = async function () {
    const text = store.exportText();
    if (store.mode === "artifact") {
      if (!store.downloads) return BH.toast("Downloads aren't available here. Use “Copy program” instead.", "warn");
      try {
        await store.downloads.save({ filename: "program.json", data: text });
      } catch (e) {
        if (e && e.code !== "declined") BH.toast("Couldn't download the file here. Use “Copy program” instead.", "warn");
      }
      return;
    }
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "program.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  };

  store.parseImport = function (text) {
    const data = JSON.parse(text);
    return normalize(data);
  };

  store.normalizeItem = normalizeItem;
  BH.store = store;
})();
