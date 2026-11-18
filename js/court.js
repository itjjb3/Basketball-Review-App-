/* Court geometry. 10 units = 1 foot. High school court: 84 ft x 50 ft.
   The home basket sits at the top (y = 0 is the baseline). */
(function () {
  const BH = window.BH;
  const W = 500;
  const FULL = 840;
  const HALF_VIEW = 530; // baseline to 6 ft past half court, so the whole center circle shows
  const PAD = 12;
  const RIM = { x: 250, y: 52.5 };

  function endLines() {
    // One end of the floor: lane, free-throw circle, 3-point line (NFHS 19'9"), basket.
    return `
      <rect x="190" y="0" width="120" height="190" />
      <path d="M190,190 A60,60 0 0 0 310,190" />
      <path class="c-dash" d="M190,190 A60,60 0 0 1 310,190" />
      <path d="M52.5,0 L52.5,52.5 A197.5,197.5 0 0 0 447.5,52.5 L447.5,0" />
      <path class="c-board-line" d="M220,40 L280,40" />
      <path d="M250,40 L250,45" />
      <circle class="c-rim" cx="250" cy="52.5" r="7.5" />
      <rect class="c-block" x="180" y="70" width="10" height="10" />
      <rect class="c-block" x="310" y="70" width="10" height="10" />
      <path d="M182,110 L190,110 M310,110 L318,110 M182,140 L190,140 M310,140 L318,140 M182,170 L190,170 M310,170 L318,170" />
      <path d="M0,280 L20,280 M480,280 L500,280" />`;
  }

  function lanePaint() {
    return `<rect class="c-lane" x="190" y="0" width="120" height="190" />`;
  }

  function planks() {
    let s = "";
    for (let x = 20; x < W; x += 20) s += `M${x},0 L${x},${FULL} `;
    return `<path class="c-plank" d="${s}" />`;
  }

  function blockB(mini) {
    // Collegiate block B: purple fill, white keyline, purple outer line.
    // Turned on its side so it reads from the sideline, like the logo on the floor.
    const t = (cls) => `<text class="${cls}" x="0" y="32" text-anchor="middle">B</text>`;
    return `<g class="c-logo${mini ? " mini" : ""}" transform="translate(250,420) rotate(-90)" aria-hidden="true">
        ${t("b-outer")}${t("b-key")}${t("b-fill")}
      </g>`;
  }

  /** Court markup for an <svg>. mode: "half" | "full". */
  function markup(mode = "half", opts = {}) {
    const mini = !!opts.mini;
    return `
      <g class="court-g">
        <rect class="c-apron" x="${-PAD}" y="${-PAD}" width="${W + PAD * 2}" height="${FULL + PAD * 2}" />
        <rect class="c-floor" x="0" y="0" width="${W}" height="${FULL}" />
        ${mini ? "" : planks()}
        ${lanePaint()}
        <g transform="translate(0,${FULL}) scale(1,-1)">${lanePaint()}</g>
        <circle class="c-center-fill" cx="250" cy="420" r="60" />
        ${blockB(mini)}
        <g class="c-lines">
          <rect x="0" y="0" width="${W}" height="${FULL}" />
          <path d="M0,420 L${W},420" />
          <circle cx="250" cy="420" r="60" />
          ${endLines()}
          <g transform="translate(0,${FULL}) scale(1,-1)">${endLines()}</g>
        </g>
      </g>`;
  }

  function viewBox(mode) {
    const h = mode === "full" ? FULL : HALF_VIEW;
    return `${-PAD} ${-PAD} ${W + PAD * 2} ${h + PAD * 2}`;
  }

  function height(mode) {
    return mode === "full" ? FULL : HALF_VIEW;
  }

  /* Common spots, for placing new players. */
  const SPOTS = {
    o1: [250, 285],
    o2: [415, 215],
    o3: [85, 215],
    o4: [470, 32],
    o5: [30, 32],
    x1: [250, 250],
    x2: [380, 195],
    x3: [120, 195],
    x4: [420, 70],
    x5: [80, 70],
    ball: [263, 273],
    cone: [250, 330],
  };

  BH.court = { markup, viewBox, height, W, FULL, HALF_VIEW, PAD, RIM, SPOTS };
})();
