// Builds the single-file versions of the app.
//
//   node scripts/build.mjs
//
// dist/baldwin-install.html   One self-contained file. Open it from disk, email it,
//                             or host it anywhere. The program is baked in.
// dist/artifact.html          The same app as a page body, for publishing on claude.ai.
//                             There a coach's Save republishes the page for everyone.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const html = read("index.html");
const title = html.match(/<title>([^<]*)<\/title>/)[1];
const fontHref = html.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]+)"/)[1];
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

const css = read("css/app.css");
const js = scripts.map((src) => `/* ${src} */\n` + read(src)).join("\n");
const program = JSON.parse(read("data/program.json"));
const json = JSON.stringify(program).replace(/</g, "\\u003c");

for (const [name, text] of [["css", css], ["js", js]]) {
  if (/<\/(style|script)/i.test(text)) throw new Error(`${name} contains a closing </style> or </script> tag; escape it before inlining`);
}

const fragment = [
  `<title data-src="title">${title}</title>`,
  `<meta name="claude:viewport-fit-sides" content="cover" data-src="meta">`,
  `<link rel="stylesheet" href="${fontHref.replace(/&/g, "&amp;")}" data-src="font">`,
  `<style data-src="css">\n${css}</style>`,
  `<script type="application/json" id="program-data" data-src="program">${json}</script>`,
  `<script data-src="app">\n${js}</script>`,
].join("\n");

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#4b2a86">
</head>
<body>
${fragment}
</body>
</html>
`;

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/artifact.html"), fragment + "\n");
writeFileSync(join(root, "dist/baldwin-install.html"), standalone);
console.log(`Built dist/baldwin-install.html and dist/artifact.html (${program.items.length} items, ${(standalone.length / 1024).toFixed(0)} KB)`);
