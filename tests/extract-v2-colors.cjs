// Parse style.css and list every rule in the V2 block (line >= 6434) that sets
// a background, colour or border — the rules that hardcode the dark palette.
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'public', 'css', 'style.css');
const lines = fs.readFileSync(file, 'utf8').split('\n');
const START = 6434;

let selector = '';
let depth = 0;
let inRule = false;
const out = [];

for (let i = START - 1; i < lines.length; i++) {
  const raw = lines[i];
  const line = raw.trim();
  if (!line || line.startsWith('/*') || line.startsWith('*') || line.startsWith('//')) continue;

  if (!inRule && line.includes('{')) {
    const sel = line.slice(0, line.indexOf('{')).trim();
    if (sel) selector = sel;
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    inRule = depth > 0;
    if (!inRule) selector = '';
    continue;
  }
  if (inRule) {
    const bg = /^background(-color)?\s*:\s*(.+?);/.exec(line);
    const col = /^color\s*:\s*(.+?);/.exec(line);
    const bd = /^border(-(top|right|bottom|left))?\s*:\s*(.+?);/.exec(line);
    const bdc = /^border(-(top|right|bottom|left))?-color\s*:\s*(.+?);/.exec(line);
    if (bg || col || bd || bdc) {
      out.push({ line: i + 1, sel: selector, decl: line });
    }
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (depth <= 0) { inRule = false; selector = ''; depth = 0; }
  }
}

console.log('rules in V2 block that set background/color/border:', out.length);

// Group by selector so we can see which components need a light override.
const bySel = new Map();
out.forEach((r) => {
  if (!bySel.has(r.sel)) bySel.set(r.sel, []);
  bySel.get(r.sel).push(r.decl);
});
console.log('distinct selectors:', bySel.size);

// Print only those that look structural (set a background).
const withBg = [...bySel.entries()].filter(([, d]) => d.some((x) => /^background/.test(x)));
console.log('\n=== selectors that set a background (' + withBg.length + ') ===');
withBg.forEach(([sel, decls]) => {
  console.log(sel);
  decls.filter((d) => /^background/.test(d)).forEach((d) => console.log('    ' + d));
});

// Selectors that set a text colour, excluding the sign-in portal (.auth-*),
// which is deliberately dark in both themes.
const withColor = [...bySel.entries()]
  .filter(([, d]) => d.some((x) => /^color\s*:/.test(x)))
  .filter(([sel]) => !/auth-/.test(sel));
console.log('\n=== selectors that set a text colour, excluding .auth-* (' + withColor.length + ') ===');
withColor.forEach(([sel, decls]) => {
  console.log(sel);
  decls.filter((d) => /^color\s*:/.test(d)).forEach((d) => console.log('    ' + d));
});

// Border colours, excluding .auth-*.
const withBorder = [...bySel.entries()]
  .filter(([, d]) => d.some((x) => /^border/.test(x)))
  .filter(([sel]) => !/auth-/.test(sel));
console.log('\n=== selectors that set a border, excluding .auth-* (' + withBorder.length + ') ===');
withBorder.forEach(([sel, decls]) => {
  console.log(sel);
  decls.filter((d) => /^border/.test(d)).forEach((d) => console.log('    ' + d));
});
