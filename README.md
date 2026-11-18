# Baldwin Hoops Install

A playbook, whiteboard and study tool for Baldwin Basketball. Coaches install the program (our verbiage, concepts, principles, formations, actions, triggers, sets and defenses) and players learn it the way that works for them: by reading it, by seeing it run on a court, or by drilling it on flashcards.

## What's in it

| Section | Who | What it does |
| --- | --- | --- |
| **Playbook** | Everyone | Browse everything by category or search. Each item shows the call or signal, what it is, the keys, the reads, and a diagram that runs step by step. |
| **Whiteboard** | Everyone | A high school court (84 × 50 ft, NFHS 19'9" arc) with the purple Block B at half court. Drag players 1–5, defenders X1–X5, the ball and cones onto the floor. Draw cuts, dribbles, passes, handoffs, shots, screens and freehand marker. Start a pass at the end of a dribble and the ball follows both. Add steps and hit **Run it** to animate. Build **the call**: tap a play from the **Library** (say 5 Thru), then tap actions (Rub, Twirl, Swing…). Each one picks up where the last ended. Actions marked **Auto** run from wherever the ball is, and **Continuity** runs them again from the other side. |
| **Study** | Everyone | Flashcards (name on the front, or the meaning and diagram on the front) with "Got it" / "Still learning" tracking, and a 10-question quiz that asks you to name a diagram, match a description, or define a term. |
| **Install** | Coaches | Add and edit items, paste a whole terminology list at once, attach diagrams drawn on the whiteboard, and import or export the program file. |

The app ships with example content (marked **Example**) so you can see how everything works. Remove it from **Install → Program file → Remove all examples** once your own program is in.

## Running it

It's a static site with no build step and no server code.

- **GitHub Pages:** in the repo, go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`. The app will be at `https://<your-user>.github.io/<repo>/`.
- **On a laptop:** run `python3 -m http.server` in this folder and open `http://localhost:8000`.
- **One file:** run `node scripts/build.mjs`. It writes `dist/baldwin-install.html`, the whole app in a single file you can email or open from disk.

## How coaches update the program

On the website, the program players see is `data/program.json`.

1. Open the site and click **Coach? Turn on coach tools** at the bottom of the page (or add `?coach` to the address).
2. Use **Install** to add and edit items, and the **Whiteboard** to draw diagrams. Your edits are saved on that device and you'll see a "Coach · unpublished edits" tag.
3. When you're ready, click **Export program file** in Install. Upload that `program.json` to the `data/` folder of this repo (on GitHub: open `data/`, then **Add file → Upload files**, and commit). Players get the new version on their next visit.

Coach tools on the website don't need a password because nothing a coach does there reaches players until `program.json` is uploaded to the repo.

When the app is published on claude.ai instead (from `dist/artifact.html`), anyone with edit access to that page is a coach, and **Save** updates the page for the whole team right away.

## Program file format

```json
{
  "version": 1,
  "team": { "name": "Baldwin Basketball", "season": "2026–27" },
  "items": [
    {
      "id": "power-zoom",
      "kind": "set",
      "name": "Power Zoom",
      "call": "“Power Zoom”",
      "summary": "From Power, 5 steps up and screens for 1…",
      "keys": ["1: come off tight", "5: roll on the second dribble"],
      "reads": ["Big's defender drops → 1 pulls up at the elbow"],
      "diagram": { "court": "half", "frames": [ { "tokens": [], "strokes": [] } ] }
    }
  ]
}
```

- `kind` is one of `position`, `set`, `action`, `trigger`, `formation`, `defense`, `concept`, `principle`, `term`.
- `rule` (optional) makes an item an **Auto** action that runs from wherever the ball is: `swing`, `skip`, `back`, `post-entry`, `get`, `rub`, `twirl` or `continuity`. The rules live in `js/engine.js`. Without a rule, an item plays its diagram as drawn.
- Court coordinates are in tenths of a foot. The home basket is at the top: the baseline is `y = 0`, the rim is at `(250, 52.5)` and half court is `y = 420`.
- Tokens: `{ "id": "o1", "t": "o", "n": "1", "x": 250, "y": 285 }`. `t` is `o` (offense), `x` (defense), `ball` or `cone`.
- Strokes: `{ "id": "s1", "t": "cut", "pts": [[x, y], …] }`. `t` is `cut`, `dribble`, `pass`, `handoff`, `shot`, `screen` or `pen`, with an optional color `c`. A shot's last point is the rim.
- When the app runs a diagram, a cut, dribble or screen that starts on a player moves that player. The ball follows a dribble, handoff, pass or shot that starts at the ball, then any that start where the last one ended.

## Code layout

```
index.html          the page
css/app.css         all styles (light and dark)
js/util.js          helpers, categories, storage
js/icons.js         inline icons
js/court.js         court geometry and the Block B
js/diagram.js       drawing players and lines, step animation
js/engine.js        Auto actions (Swing, Rub, Twirl…) and the playbook examples for them
js/store.js         loading and saving the program
js/playbook.js      Playbook section
js/board.js         Whiteboard section
js/study.js         Flashcards and quiz
js/install.js       Install section (coaches)
js/main.js          header, navigation, routing
data/program.json   the program players see
scripts/build.mjs   single-file builds in dist/
```

## Coming later

- **Your Film Room**
