/* Shared helpers and the app namespace. Loaded first. */
(function () {
  const BH = (window.BH = window.BH || {});

  BH.KINDS = [
    { id: "position", label: "Positions", one: "Position", blurb: "Who does what on our floor" },
    { id: "set", label: "Sets", one: "Set", blurb: "Named plays we run" },
    { id: "action", label: "Actions", one: "Action", blurb: "Two- and three-man pieces our sets are built from" },
    { id: "trigger", label: "Triggers", one: "Trigger", blurb: "If the defense does this, we do that" },
    { id: "formation", label: "Formations", one: "Formation", blurb: "Where we line up" },
    { id: "defense", label: "Defenses", one: "Defense", blurb: "How we guard" },
    { id: "concept", label: "Concepts", one: "Concept", blurb: "How we think about the game" },
    { id: "principle", label: "Principles", one: "Principle", blurb: "Rules we live by" },
    { id: "term", label: "Terms", one: "Term", blurb: "Our verbiage" },
  ];
  BH.kind = (id) => BH.KINDS.find((k) => k.id === id) || { id, label: id, one: id };

  BH.esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  BH.slug = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item";

  BH.uid = (prefix = "") => prefix + Math.random().toString(36).slice(2, 9);

  BH.clone = (o) => JSON.parse(JSON.stringify(o));

  BH.$ = (sel, root = document) => root.querySelector(sel);
  BH.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  BH.h = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  BH.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* Browser storage can be blocked (private windows, previews). Never let it throw. */
  BH.local = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    },
  };
  BH.session = {
    get(key, fallback) {
      try {
        const v = sessionStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch (e) {}
    },
    remove(key) {
      try {
        sessionStorage.removeItem(key);
      } catch (e) {}
    },
  };

  /* Tiny event bus so views can react to program changes. */
  const listeners = {};
  BH.on = (evt, fn) => (listeners[evt] = listeners[evt] || []).push(fn);
  BH.emit = (evt, data) => (listeners[evt] || []).forEach((fn) => fn(data));

  let toastTimer;
  BH.toast = (msg, kind = "") => {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = "toast show " + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = "toast " + kind), 2600);
  };

  /* Lines of text -> trimmed, non-empty array. */
  BH.lines = (s) =>
    String(s || "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
      .filter(Boolean);

  BH.hasDiagram = (item) =>
    !!(item && item.diagram && item.diagram.frames && item.diagram.frames.some((f) => (f.tokens && f.tokens.length) || (f.strokes && f.strokes.length)));

  BH.prefersReducedMotion = () => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  };
})();
