// ==========================================================================
// ICON HELPER
// --------------------------------------------------------------------------
// The sprite itself lives at the top of public/index.html (<symbol id="i-…">),
// so every glyph is declared exactly once and is available to both static
// markup and generated HTML. This file only builds the reference.
//
// Why not emoji: an emoji is rendered by the *operating system's* font. The
// same ticket glyph came out blue-and-white on Windows, flat on Linux, and
// full-colour on macOS, so the toolbar never matched itself across machines.
// These symbols inherit `currentColor` and the surrounding font-size, which is
// what makes them look like part of the interface rather than stickers on it.
// ==========================================================================

/** Names declared in the index.html sprite. Kept in sync manually — the guard
 *  in ico() makes a typo obvious in the console instead of silently blank. */
const ICON_NAMES = [
  'accessibility', 'alert', 'archive', 'arrow-left', 'arrow-right', 'bell',
  'bolt', 'book', 'books', 'building', 'bulb', 'calendar', 'calendar-days',
  'camera', 'cart', 'chart', 'check', 'check-circle', 'chevron-down',
  'chevron-left', 'chevron-right', 'circle', 'clipboard', 'clock', 'coins', 'contact', 'crown',
  'database', 'dot', 'download', 'external', 'eye', 'file', 'film', 'filter',
  'flame', 'folders', 'gamepad', 'headset', 'heart', 'history', 'home', 'image',
  'inbox', 'info', 'key', 'laptop', 'link', 'lock', 'mail', 'map-pin', 'medal',
  'megaphone', 'message', 'minus', 'monitor', 'moon', 'note', 'package',
  'palette', 'pause', 'pen', 'pencil', 'phone', 'pin', 'play', 'plug', 'plus',
  'power', 'printer', 'qr', 'refresh', 'robot', 'rocket', 'save', 'scale',
  'scan', 'school',
  'search', 'settings', 'shield', 'signal', 'siren', 'smartphone', 'sparkles',
  'star', 'stop', 'sun', 'tag', 'ticket', 'toolbox', 'trash', 'trending-down',
  'trending-up', 'trophy', 'truck', 'undo', 'unlock', 'upload', 'user', 'users',
  'wrench', 'x', 'x-circle', 'zap',
];

const ICON_SET = new Set(ICON_NAMES);

/**
 * Build an icon element.
 *
 * @param {string} name  symbol name without the `i-` prefix, e.g. 'bell'
 * @param {string} [cls] extra classes, e.g. 'ico-lg'
 * @returns {string} inline SVG markup
 */
function ico(name, cls) {
  const key = String(name || '').trim();
  if (!ICON_SET.has(key)) {
    console.warn(`[icons] unknown icon "${key}" — add it to the sprite in index.html`);
    return '';
  }
  return `<svg class="ico${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${key}"></use></svg>`;
}

// Templates are assembled as strings, so the helper has to be reachable from
// any inline handler too.
window.ico = ico;
