/* Install: where coaches put the program in. */
(function () {
  const BH = window.BH;
  const { esc, icons } = BH;

  const S = { editing: null, draft: null, filter: "all", q: "", pendingImport: null };
  let root = null;

  function blankItem(over = {}) {
    return { id: null, kind: "set", name: "", call: "", summary: "", keys: [], reads: [], ...over };
  }

  function statusBanner() {
    const st = BH.store;
    if (st.mode === "artifact") {
      return st.canSaveForEveryone
        ? `<div class="notice good">${icons.check}<p><strong>Saves go live for the whole team.</strong> When you save, everyone with the link sees the update the next time the page loads.</p></div>`
        : `<div class="notice warn">${icons.info}<p><strong>Checking your access…</strong> If this doesn't change, this view is read-only.</p></div>`;
    }
    return `<div class="notice">${icons.info}<div><p><strong>Edits save on this device.</strong> To publish to players, export the program file and upload it to <code>data/program.json</code> in the GitHub repo.</p>
      <div class="row">
        <button class="btn primary" data-act="export">${icons.download} Export program file</button>
        ${st.hasDraft ? `<button class="btn ghost" data-act="discard">Discard this device's edits</button>` : ""}
      </div></div></div>`;
  }

  function listPanel() {
    const items = BH.store.items();
    const q = S.q.toLowerCase();
    const list = items.filter((i) => (S.filter === "all" || i.kind === S.filter) && (!q || i.name.toLowerCase().includes(q)));
    return `
      <div class="panel list-panel">
        <div class="panel-head">
          <h2>Program <small>${items.length} item${items.length === 1 ? "" : "s"}</small></h2>
          <button class="btn primary" data-act="new">${icons.plus} New item</button>
        </div>
        <div class="list-tools">
          <select id="ins-filter" aria-label="Category">
            <option value="all">All categories</option>
            ${BH.KINDS.map((k) => `<option value="${k.id}" ${S.filter === k.id ? "selected" : ""}>${esc(k.label)}</option>`).join("")}
          </select>
          <input id="ins-q" type="search" placeholder="Find" value="${esc(S.q)}" autocomplete="off" />
        </div>
        <ul class="ins-list">
          ${
            list.length
              ? list
                  .map(
                    (it) => `<li><button class="ins-row${S.editing === it.id ? " on" : ""}" data-edit="${esc(it.id)}">
                <span class="kind-chip k-${esc(it.kind)}">${esc(BH.kind(it.kind).one)}</span>
                <span class="ins-name">${esc(it.name)}</span>
                ${it.example ? '<span class="ex-chip">Example</span>' : ""}
                ${BH.hasDiagram(it) ? `<span class="lib-has" title="Has a diagram">${icons.board}</span>` : ""}
              </button></li>`
                  )
                  .join("")
              : `<li class="lib-empty">${items.length ? "No matches." : "Nothing yet. Add your first item."}</li>`
          }
        </ul>
      </div>`;
  }

  function editorPanel() {
    const it = S.draft;
    if (!it) {
      return `<div class="panel editor-panel empty-editor">
          <h2>Pick something to edit</h2>
          <p>Choose an item on the left, or start a new one. A good install order: <b>positions</b> and <b>terms</b> first so players learn their roles and the language, then <b>formations</b>, <b>actions</b> and <b>triggers</b>, then the <b>sets</b> built from them.</p>
          <button class="btn primary" data-act="new">${icons.plus} New item</button>
        </div>`;
    }
    const isNew = !it.id;
    const hasD = BH.hasDiagram(it);
    return `
      <form class="panel editor-panel" id="ins-form" novalidate>
        <div class="panel-head"><h2>${isNew ? "New item" : "Edit item"}</h2>${it.example ? '<span class="ex-chip">Example</span>' : ""}</div>
        <div class="field-row">
          <label class="field"><span>Category</span>
            <select id="f-kind">${BH.KINDS.map((k) => `<option value="${k.id}" ${it.kind === k.id ? "selected" : ""}>${esc(k.one)}</option>`).join("")}</select>
          </label>
          <label class="field grow"><span>Name</span>
            <input id="f-name" type="text" value="${esc(it.name)}" placeholder="What we call it, e.g. Power Zoom" required maxlength="80" />
          </label>
        </div>
        <label class="field"><span>Call or signal</span>
          <input id="f-call" type="text" value="${esc(it.call)}" placeholder="What we yell or the hand signal, e.g. “Fist” / two fingers up" maxlength="120" />
        </label>
        <label class="field"><span>What it is</span>
          <textarea id="f-summary" rows="3" placeholder="One or two sentences, in the words you use at practice.">${esc(it.summary)}</textarea>
        </label>
        <div class="field-row">
          <label class="field grow"><span>Keys <small>one per line</small></span>
            <textarea id="f-keys" rows="5" placeholder="Screener: sprint in, wide base&#10;Handler: set your man up first">${esc((it.keys || []).join("\n"))}</textarea>
          </label>
          <label class="field grow"><span>Reads <small>one per line</small></span>
            <textarea id="f-reads" rows="5" placeholder="If they switch → screener seals and posts&#10;If help comes from the corner → kick to the corner">${esc((it.reads || []).join("\n"))}</textarea>
          </label>
        </div>
        <div class="field diagram-field">
          <span>Diagram</span>
          <div class="diagram-box">
            ${hasD ? `<div class="diagram-preview">${BH.diagram.thumbSVG(it.diagram, { label: "Diagram preview" })}<p>${it.diagram.frames.length} step${it.diagram.frames.length === 1 ? "" : "s"}</p></div>` : `<p class="muted">No diagram yet.</p>`}
            <div class="diagram-actions">
              ${
                isNew
                  ? `<p class="muted small">${hasD ? "This diagram came from the whiteboard and saves with the item." : "Save the item first, then draw its diagram on the whiteboard."}</p>`
                  : `<button type="button" class="btn" data-act="draw">${icons.board} ${hasD ? "Edit on whiteboard" : "Draw on whiteboard"}</button>`
              }
              ${hasD ? `<button type="button" class="btn ghost" data-act="rm-diagram">Remove diagram</button>` : ""}
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn primary">${icons.save} Save</button>
          <button type="button" class="btn ghost" data-act="cancel">Cancel</button>
          ${isNew ? "" : `<button type="button" class="btn danger" data-act="delete">${icons.trash} Delete</button>`}
        </div>
        <p class="form-error" id="f-error" role="alert"></p>
      </form>`;
  }

  function toolsPanel() {
    const st = BH.store;
    const hasEx = st.items().some((i) => i.example);
    const team = st.program.team || {};
    return `
      <div class="tools-grid">
        <div class="panel">
          <h2>Quick add a list</h2>
          <p class="muted">Paste your terminology sheet. One per line: <code>Name: what it means</code></p>
          <div class="field-row">
            <label class="field"><span>Add as</span><select id="qa-kind">${BH.KINDS.map((k) => `<option value="${k.id}" ${k.id === "term" ? "selected" : ""}>${esc(k.label)}</option>`).join("")}</select></label>
          </div>
          <label class="field"><span>List</span><textarea id="qa-text" rows="6" placeholder="Lift: corner player moves up to the wing on a baseline drive&#10;Drift: slide along the arc away from a middle drive&#10;Ice: force the ball handler away from the screen"></textarea></label>
          <div class="row"><button class="btn primary" data-act="qa-add" disabled>Add items</button><span class="muted small" id="qa-count"></span></div>
        </div>
        <div class="panel">
          <h2>Team</h2>
          <label class="field"><span>Program name</span><input id="t-name" type="text" value="${esc(team.name || "")}" maxlength="60" /></label>
          <label class="field"><span>Season</span><input id="t-season" type="text" value="${esc(team.season || "")}" placeholder="2026–27" maxlength="30" /></label>
          <button class="btn" data-act="team-save">${icons.save} Save team info</button>
        </div>
        <div class="panel">
          <h2>Program file</h2>
          <p class="muted">Back up the whole program, or move it between devices.</p>
          <div class="row wrap">
            <button class="btn" data-act="export">${icons.download} Export</button>
            <button class="btn" data-act="copy">Copy program</button>
            <label class="btn file-btn">${icons.upload} Import<input id="imp-file" type="file" accept=".json,application/json" /></label>
          </div>
          <div id="imp-confirm"></div>
          ${hasEx ? `<hr /><h3>Example content</h3><p class="muted">Remove the placeholder items once your own program is in.</p><button class="btn danger" data-act="rm-examples">${icons.trash} Remove all examples</button>` : ""}
        </div>
      </div>`;
  }

  function parseQuick(text) {
    return BH.lines(text)
      .map((l) => {
        const m = l.match(/^(.+?)\s*(?::|\s[-–—]\s|\t)\s*(.+)$/);
        return m ? { name: m[1].trim(), summary: m[2].trim() } : { name: l.trim(), summary: "" };
      })
      .filter((x) => x.name);
  }

  function render(host) {
    root = host;
    const st = BH.store;
    if (!st.isCoach) {
      host.innerHTML = `
        <section class="view-install">
          <header class="view-head"><div><p class="eyebrow">Coaches</p><h1>Install</h1></div></header>
          <div class="empty">
            <h3>Install is for coaches</h3>
            ${
              st.mode === "artifact"
                ? `<p>Only coaches with edit access to this page can change the program. Everything they add shows up in Playbook, Whiteboard and Study.</p>`
                : `<p>This is where coaches put the program in. Edits stay on this device until a coach publishes the program file.</p><button class="btn primary" data-act="coach-on">Turn on coach tools</button>`
            }
          </div>
        </section>`;
      const on = BH.$('[data-act="coach-on"]', host);
      if (on) on.addEventListener("click", () => BH.store.setCoachMode(true));
      return;
    }
    host.innerHTML = `
      <section class="view-install">
        <header class="view-head">
          <div>
            <p class="eyebrow">Coaches</p>
            <h1>Install</h1>
            <p class="lede">Put our program in: verbiage, concepts, principles, formations, actions, triggers, sets and defenses. Players see it in Playbook, Whiteboard and Study.</p>
          </div>
        </header>
        ${statusBanner()}
        <div class="install-grid">${listPanel()}${editorPanel()}</div>
        ${toolsPanel()}
      </section>`;
    wire(host);
  }

  function readForm(host) {
    return {
      ...S.draft,
      kind: BH.$("#f-kind", host).value,
      name: BH.$("#f-name", host).value.trim(),
      call: BH.$("#f-call", host).value.trim(),
      summary: BH.$("#f-summary", host).value.trim(),
      keys: BH.lines(BH.$("#f-keys", host).value),
      reads: BH.lines(BH.$("#f-reads", host).value),
    };
  }

  function wire(host) {
    BH.$$('[data-act="new"]', host).forEach((b) =>
      b.addEventListener("click", () => {
        S.editing = null;
        S.draft = blankItem({ kind: S.filter !== "all" ? S.filter : "set" });
        render(host);
        BH.$("#f-name", host).focus();
      })
    );
    BH.$$("[data-edit]", host).forEach((b) =>
      b.addEventListener("click", () => {
        S.editing = b.dataset.edit;
        S.draft = BH.clone(BH.store.get(S.editing));
        render(host);
        const form = BH.$("#ins-form", host);
        if (form && window.innerWidth < 900) form.scrollIntoView({ behavior: BH.prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      })
    );
    const filter = BH.$("#ins-filter", host);
    filter.addEventListener("change", () => {
      S.filter = filter.value;
      render(host);
    });
    const q = BH.$("#ins-q", host);
    q.addEventListener("input", () => {
      S.q = q.value;
      const pos = q.selectionStart;
      render(host);
      const again = BH.$("#ins-q", host);
      again.focus();
      try {
        again.setSelectionRange(pos, pos);
      } catch (e) {}
    });

    const form = BH.$("#ins-form", host);
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const it = readForm(host);
        const err = BH.$("#f-error", host);
        if (!it.name) {
          err.textContent = "Give it a name so players can find it.";
          BH.$("#f-name", host).focus();
          return;
        }
        const dup = BH.store.items().find((o) => o.id !== it.id && o.name.toLowerCase() === it.name.toLowerCase() && o.kind === it.kind);
        if (dup) {
          err.textContent = `There's already a ${BH.kind(it.kind).one.toLowerCase()} called “${dup.name}”. Use a different name or edit that one.`;
          return;
        }
        if (!it.id) it.id = BH.store.uniqueId(it.name);
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        const ok = await BH.store.saveItem(it, `Saved “${it.name}”.`);
        submit.disabled = false;
        if (ok) {
          S.editing = it.id;
          S.draft = BH.clone(BH.store.get(it.id) || it);
          render(host);
        }
      });
      BH.$('[data-act="cancel"]', host).addEventListener("click", () => {
        S.editing = null;
        S.draft = null;
        render(host);
      });
      const del = BH.$('[data-act="delete"]', host);
      if (del)
        del.addEventListener("click", async () => {
          if (!del.dataset.armed) {
            del.dataset.armed = "1";
            del.innerHTML = `${icons.trash} Tap again to delete`;
            setTimeout(() => {
              if (del.isConnected) {
                delete del.dataset.armed;
                del.innerHTML = `${icons.trash} Delete`;
              }
            }, 2500);
            return;
          }
          const ok = await BH.store.deleteItem(S.draft.id);
          if (ok) {
            S.editing = null;
            S.draft = null;
            render(host);
          }
        });
      const draw = BH.$('[data-act="draw"]', host);
      if (draw)
        draw.addEventListener("click", () => {
          BH.board.queueOpen(S.draft.id);
          location.hash = "#board";
        });
      const rmd = BH.$('[data-act="rm-diagram"]', host);
      if (rmd)
        rmd.addEventListener("click", () => {
          S.draft = { ...readForm(host) };
          delete S.draft.diagram;
          render(host);
          BH.toast("Diagram removed. Save to keep the change.");
        });
    }

    BH.$$('[data-act="export"]', host).forEach((b) => b.addEventListener("click", () => BH.store.exportFile()));
    const disc = BH.$('[data-act="discard"]', host);
    if (disc)
      disc.addEventListener("click", () => {
        if (!disc.dataset.armed) {
          disc.dataset.armed = "1";
          disc.textContent = "Tap again to discard";
          setTimeout(() => {
            if (disc.isConnected) {
              delete disc.dataset.armed;
              disc.textContent = "Discard this device's edits";
            }
          }, 2500);
          return;
        }
        BH.store.discardDraft();
        S.editing = null;
        S.draft = null;
        render(host);
        BH.toast("Back to the published program.");
      });

    // Quick add
    const qaText = BH.$("#qa-text", host);
    const qaBtn = BH.$('[data-act="qa-add"]', host);
    const qaCount = BH.$("#qa-count", host);
    const qaKind = BH.$("#qa-kind", host);
    const updateQa = () => {
      const n = parseQuick(qaText.value).length;
      const k = BH.kind(qaKind.value);
      qaBtn.disabled = !n;
      qaBtn.textContent = n ? `Add ${n} ${n === 1 ? k.one.toLowerCase() : k.label.toLowerCase()}` : "Add items";
      qaCount.textContent = n ? "Lines without a colon are added with just a name." : "";
    };
    qaText.addEventListener("input", updateQa);
    qaKind.addEventListener("change", updateQa);
    qaBtn.addEventListener("click", async () => {
      const rows = parseQuick(qaText.value);
      if (!rows.length) return;
      const taken = new Set(BH.store.items().map((i) => i.id));
      const items = rows.map((r) => {
        let id = BH.slug(r.name),
          n = 2;
        while (taken.has(id)) id = BH.slug(r.name) + "-" + n++;
        taken.add(id);
        return { id, kind: qaKind.value, name: r.name, summary: r.summary, keys: [], reads: [] };
      });
      qaBtn.disabled = true;
      const ok = await BH.store.saveMany(items, `Added ${items.length} ${BH.kind(qaKind.value).label.toLowerCase()}.`);
      if (ok) render(host);
      else qaBtn.disabled = false;
    });

    // Team
    BH.$('[data-act="team-save"]', host).addEventListener("click", async () => {
      const next = BH.clone(BH.store.program);
      next.team = { name: BH.$("#t-name", host).value.trim() || "Baldwin Basketball", season: BH.$("#t-season", host).value.trim() };
      if (await BH.store.replaceProgram(next, "Team info saved.")) render(host);
    });

    // Copy
    BH.$('[data-act="copy"]', host).addEventListener("click", () => {
      const text = BH.store.exportText();
      const fallback = () => {
        const box = BH.$("#imp-confirm", host);
        box.innerHTML = `<p class="muted small">Copying isn't allowed here. Select all of this text and copy it:</p><textarea id="copy-box" rows="6" readonly></textarea>`;
        const ta = BH.$("#copy-box", host);
        ta.value = text;
        ta.focus();
        ta.select();
      };
      try {
        navigator.clipboard.writeText(text).then(() => BH.toast("Program copied."), fallback);
      } catch (e) {
        fallback();
      }
    });

    // Import
    const file = BH.$("#imp-file", host);
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const box = BH.$("#imp-confirm", host);
        try {
          const p = BH.store.parseImport(String(reader.result));
          S.pendingImport = p;
          box.innerHTML = `<div class="confirm"><p><b>${p.items.length} items</b> in “${esc(f.name)}”.</p>
            <div class="row wrap"><button class="btn primary" data-act="imp-merge">Add to our program</button><button class="btn danger" data-act="imp-replace">Replace everything</button><button class="btn ghost" data-act="imp-cancel">Cancel</button></div></div>`;
          BH.$('[data-act="imp-merge"]', box).addEventListener("click", async () => {
            if (await BH.store.saveMany(S.pendingImport.items, `Added ${S.pendingImport.items.length} items from the file.`)) render(host);
          });
          BH.$('[data-act="imp-replace"]', box).addEventListener("click", async () => {
            if (await BH.store.replaceProgram(S.pendingImport, "Program replaced from the file.")) {
              S.editing = null;
              S.draft = null;
              render(host);
            }
          });
          BH.$('[data-act="imp-cancel"]', box).addEventListener("click", () => {
            S.pendingImport = null;
            box.innerHTML = "";
            file.value = "";
          });
        } catch (e) {
          box.innerHTML = `<p class="form-error">That file isn't a program file. Export one from this app and try again.</p>`;
        }
      };
      reader.readAsText(f);
    });

    const rmx = BH.$('[data-act="rm-examples"]', host);
    if (rmx)
      rmx.addEventListener("click", async () => {
        if (!rmx.dataset.armed) {
          rmx.dataset.armed = "1";
          rmx.innerHTML = `${icons.trash} Tap again to remove examples`;
          setTimeout(() => {
            if (rmx.isConnected) {
              delete rmx.dataset.armed;
              rmx.innerHTML = `${icons.trash} Remove all examples`;
            }
          }, 2500);
          return;
        }
        if (await BH.store.removeExamples()) {
          if (S.draft && S.draft.example) (S.editing = null), (S.draft = null);
          render(host);
        }
      });
  }

  BH.install = {
    render,
    leave() {},
    queueEdit(id) {
      const it = BH.store.get(id);
      if (!it) return;
      S.editing = id;
      S.draft = BH.clone(it);
    },
    queueNew(over) {
      S.editing = null;
      S.draft = blankItem(over);
    },
  };
})();
