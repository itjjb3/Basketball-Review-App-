/* Inline icons (stroke = currentColor). */
(function () {
  const s = (body, extra = "") =>
    `<svg class="ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;
  window.BH.icons = {
    book: s('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>'),
    board: s('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><circle cx="12" cy="12" r="3"/><path d="M8 3v3a4 4 0 0 0 8 0V3"/>'),
    cards: s('<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>'),
    install: s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    search: s('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    play: s('<path d="M7 4v16l13-8z" fill="currentColor"/>'),
    pause: s('<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>'),
    prev: s('<path d="m15 18-6-6 6-6"/>'),
    next: s('<path d="m9 18 6-6-6-6"/>'),
    plus: s('<path d="M12 5v14M5 12h14"/>'),
    x: s('<path d="M18 6 6 18M6 6l12 12"/>'),
    undo: s('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    trash: s('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>'),
    move: s('<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'),
    cut: s('<path d="M4 20C8 16 10 8 19 5"/><path d="m14 4 5 1-1 5"/>'),
    dribble: s('<path d="M3 19l3-4 3 3 3-4 3 3 3-4"/><path d="m17 6 3 1-1 3"/><path d="M18 9l2-2"/>'),
    pass: s('<path d="M4 20 19 5" stroke-dasharray="3 3"/><path d="m13 5 6 0 0 6"/>'),
    screen: s('<path d="M5 20 15 8"/><path d="M11 5l8 6"/>'),
    pen: s('<path d="M3 21c3-1 5-4 8-7l6-6a2.1 2.1 0 0 0-3-3l-6 6c-3 3-6 5-7 8z"/>'),
    eraser: s('<path d="M20 20H9L4 15a2 2 0 0 1 0-3L13 3a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 9"/><path d="m8 9 7 7"/>'),
    shuffle: s('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>'),
    check: s('<path d="M20 6 9 17l-5-5"/>'),
    flip: s('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
    library: s('<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m16 5 3.5-1 2.5 15.5-3.5 1z"/>'),
    save: s('<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v5h7"/><path d="M8 21v-7h8v7"/>'),
    edit: s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    download: s('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
    upload: s('<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>'),
    info: s('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    grip: s('<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>'),
    step: s('<path d="M4 6h16M4 12h10M4 18h6"/>'),
  };
})();
