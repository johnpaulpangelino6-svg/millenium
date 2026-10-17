/**
 * One-shot codemod: replace emoji glyphs with the SVG icon sprite.
 *
 * Rules, applied in order per occurrence:
 *   1. `>EMOJI<`            -> `><svg class="ico"><use href="#i-name"/></svg><`
 *      (the emoji was the element's entire content, i.e. an icon slot)
 *   2. `>EMOJI text`        -> `>text`      (decorative lead-in, dropped)
 *   3. anything else        -> dropped, plus one adjacent space
 *
 * The three helper calls that take an icon as an *argument*
 * (kpiCard / recordEmpty) are rewritten to `ico('name')` before the general
 * pass, because a bare quoted emoji would otherwise vanish into `''`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const MAP = {
  '🏢': 'building', '🔧': 'wrench', '🏫': 'school', '🎫': 'ticket', '🎟': 'ticket',
  '📦': 'package', '📅': 'calendar', '🗓': 'calendar-days', '🖥': 'monitor',
  '📱': 'smartphone', '📊': 'chart', '📈': 'trending-up', '📉': 'trending-down',
  '📋': 'clipboard', '🔍': 'search', '⚙': 'settings', '🔔': 'bell',
  '🛡': 'shield', '💻': 'laptop', '📷': 'camera', '🖨': 'printer',
  '💾': 'save', '⬇': 'download', '📥': 'download', '📤': 'upload',
  '➕': 'plus', '🗑': 'trash', '✏': 'pencil', '🖊': 'pen', '🔒': 'lock',
  '🔓': 'unlock', '🔑': 'key', '✅': 'check-circle', '❌': 'x-circle',
  '⚠': 'alert', 'ℹ': 'info', '🔄': 'refresh', '🔗': 'link',
  '📍': 'map-pin', '📌': 'pin', '🕒': 'clock', '🗂': 'folders',
  '🗄': 'archive', '🏷': 'tag', '👁': 'eye', '👑': 'crown', '👤': 'user',
  '👥': 'users', '💰': 'coins', '💬': 'message', '💡': 'bulb',
  '💚': 'heart', '📄': 'file', '📇': 'contact', '📙': 'book', '📚': 'books',
  '📝': 'note', '📞': 'phone', '📢': 'megaphone', '📭': 'inbox',
  '📶': 'signal', '🔌': 'plug', '🔩': 'bolt', '🔥': 'flame', '🚀': 'rocket',
  '🚨': 'siren', '🛒': 'cart', '🤖': 'robot', '🏆': 'trophy', '🥇': 'medal',
  '🥈': 'medal', '🥉': 'medal', '🎮': 'gamepad', '🎥': 'film',
  '🎨': 'palette', '🎉': 'sparkles', '🌟': 'star', '☀': 'sun', '🌙': 'moon',
  '♿': 'accessibility', '⚖': 'scale', '⚡': 'zap', '⚪': 'circle',
  '🔴': 'dot', '🟢': 'dot', '✓': 'check', '✕': 'x', '✉': 'mail',
};

const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);
// An emoji may be followed by VS16 (U+FE0F) and/or ZWJ sequences; the sprite
// only needs the base glyph, so trailing variation selectors are consumed.
// The trailing optional space is part of the match so that dropping a
// decorative glyph does not leave a double space behind it.
const RE = new RegExp(`(${KEYS.join('|')})(\\uFE0F|\\u200D)*( ?)`, 'gu');
const ICON = (name) => `<svg class="ico" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

/** '🖥️' -> 'monitor' (variation selectors stripped before lookup). */
const lookup = (raw) => MAP[String(raw).replace(/[\uFE0F\u200D]/g, '')];

function convert(src) {
  // --- pass 1: icon arguments -------------------------------------------
  // kpiCard(accent, icon, ...)  /  recordEmpty(icon, title, hint)
  src = src.replace(
    /(kpiCard\(\s*'[^']*'\s*,\s*)'([^']*)'/g,
    (m, head, body) => head + (lookup(body) ? `ico('${lookup(body)}')` : `'${body}'`),
  );
  src = src.replace(
    /(recordEmpty\(\s*)'([^']*)'/g,
    (m, head, body) => head + (lookup(body) ? `ico('${lookup(body)}')` : `'${body}'`),
  );

  // --- pass 2: general --------------------------------------------------
  return src.replace(RE, (m, emoji, _vs, _sp, offset, whole) => {
    const name = lookup(emoji);
    if (!name) return '';
    const prev = whole[offset - 1];
    const next = whole.slice(offset + m.length)[0];

    // The emoji was the element's whole content -> a real icon.
    if (prev === '>' && next === '<') return ICON(name);

    // Otherwise it was decoration; the match already ate the trailing space.
    return '';
  });
}

for (const rel of ['public/js/app.js', 'public/index.html']) {
  const file = path.join(ROOT, rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = convert(before);
  fs.writeFileSync(file, after);
  const left = (after.match(RE) || []).length;
  console.log(`${rel}: ${before.length - after.length} chars removed, ${left} emoji left`);
}
