---
name: millennium-frontend
description: Work on the Millennium SmartBoard front-end (public/) and verify it in headless Chrome. Use when editing public/js/app.js, public/index.html, public/css/style.css or public/landing.html, when adding a page/route, or when running or writing the puppeteer test suites in tests/.
agent_created: true
---

# Millennium SmartBoard — front-end change & verification workflow

Express 5 + TypeScript app. `src/**` compiles to `dist/**`; `public/**` is served
as-is by `express.static`. Node 22 managed runtime, Windows/Git Bash.

## 1. Know which half you are editing — this is the #1 time-waster

| You changed | Build needed? | `?v=` bump needed? |
|---|---|---|
| `public/**` (html, js, css) | **No** | **Yes** |
| `src/**` (server, routes, db) | **Yes — `npm run build`** | No |

Forgetting the bump means the browser serves the cached asset and your change
"doesn't work". `index.html` links assets as `/css/style.css?v=YYYYMMDDx` and
`/js/app.js?v=YYYYMMDDx`; bump both to the next letter. `landing.html` has
`no-cache` meta tags and needs no bump.

Editing `src/**` without rebuilding leaves `dist/` stale and `npm start` serves
the old code. `npm run build` is `tsc`; then restart.

## 2. Starting the server

```bash
npm start          # = node dist/server.js, port 3000
```

Start it with the **background task runner**, not `nohup npm start &` — a
detached process gets reaped when the shell wrapper exits and the port silently
stays closed. To restart: kill the PID from `netstat -ano | grep "0.0.0.0:3000"`
via `taskkill //PID <pid> //F`, then start again.

Health check: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health`
→ 200 means the DB connection is live too (it pings the DB).

Note: `netstat | grep "LISTENING.*:3000"` misses rows because of column spacing.
Match on `"0.0.0.0:3000"` instead.

## 3. Routing gotcha — new pages need an explicit route

`src/server.ts` ends with an SPA catch-all:

```ts
app.use((req, res) => res.sendFile(path.resolve(publicPath, 'index.html')));
```

So a new `public/foo.html` is reachable at `/foo.html` (via `express.static`)
but **`/foo` silently serves the app shell**, not your page. Add
`app.get('/foo', ...)` **before** the catch-all. (There is also an `/api`
404 handler before it, which must stay before the catch-all so bad endpoints
return JSON rather than HTML.)

## 4. Test harness (puppeteer-core + system Chrome)

Scripts live in `tests/*.test.cjs`. They must be **`.cjs`** — `package.json` has
`"type": "module"`, so a `.js` file cannot use `require`.

```bash
export NODE_PATH="C:/Users/LENOVO/.workbuddy-ai/binaries/node/workspace/node_modules"
C:/Users/LENOVO/.workbuddy-ai/binaries/node/versions/22.22.2-3/node.exe tests/<name>.test.cjs
```

- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`, launch with
  `headless: 'new'`, `args: ['--no-sandbox','--disable-dev-shm-usage']`.
- **One browser context per role** (`browser.createBrowserContext()`). Pages from
  one `newPage()` share localStorage, which leaks sessions between roles.
- Write assertions as a local `check(name, ok, detail)` helper that counts
  pass/fail and exits non-zero — that is the established shape.
- Suites take 1–4 minutes each. Running several in one Bash call can exceed the
  timeout; run them in small batches.

Existing suites and their counts (keep them passing):
`rental-privacy` 51, `ui-auth` 16, `session-expiry` 9, `showcase-removal` 40,
`profile-and-rental-form` 39, `landing-page` 50, `mobile-responsive` 67,
`no-refresh` 32. (304 checks total. `mobile-audit.cjs`,
`capture-screenshots.cjs`, `capture-drawer.cjs`, `capture-no-refresh.cjs` and
`diagnose-refresh.cjs` are diagnostics, not pass/fail suites.)

Test accounts (password `123123`): `admin`, `hello` (technician),
`orgen` (customer, org `qcu`).

## 4b. Testing mobile — the assertion that actually works

With puppeteer mobile emulation (`{ isMobile: true, hasTouch: true }`), when the
content is wider than the device **Chrome widens the layout viewport to fit
it**. So `document.scrollWidth - window.innerWidth` stays ~0 and the usual
overflow check passes, while the page really renders zoomed-out with its
right-hand side cut off. This is how a broken login screen hid from an
"overflow" audit.

**Assert `window.innerWidth === deviceWidth` instead.** If it is larger, the
layout viewport expanded and something is overflowing. That one check found
both of this app's mobile bugs (`innerWidth` was 579 on a 390px device).

Also assert the primary call-to-action is on screen
(`rect.left >= 0 && rect.right <= deviceWidth`) — a button pushed off-screen
fails silently in a screenshot but throws "Node is either not clickable" on
`page.click()`.

Test at 360 / 390 / 414 / 768. Re-check desktop (1440) afterwards whenever you
change a shared layout rule.

## 4c. "The page is refreshing" — check these four things first

This app had four independent causes. A user complaining about a visible refresh
is usually describing more than one of them.

**1. The sign-in portal is visible by default.** `.auth-portal-overlay` is a
full-screen `position: fixed; z-index: 9999` login screen with no inline
`display:none`, and it is only hidden *after* `await refreshAuthSession()`
returns. So every load paints the login screen first. The fix is a small inline
script in `<head>` **before any stylesheet** that tags `<html>` with
`.boot-has-session` when a token is in `localStorage`, plus
`html.boot-has-session .auth-portal-overlay { display: none }`. `app.js` removes
the class in the same task as its `hideAuthOverlay()`/`showAuthOverlay()` call so
no frame is painted in between, and a rejected token still falls back.

**2. The theme is applied too late.** `<html data-theme="dark">` is hardcoded but
`initTheme()` runs on `DOMContentLoaded` — a light-theme user sees dark then
light. The same inline boot script must set `data-theme` synchronously.

**3. `setInterval(fetchAllData, 30000)` rebuilds `#mainContent`.** `renderApp()`
does `mainContent.innerHTML = renderXView()`, a wholesale DOM replacement:
scroll resets, animations restart, images are re-requested. The poll now passes
`{ silent: true }` and skips the DOM write entirely when nothing changed.

**Do not implement that check by comparing HTML.** `element.innerHTML` returns
the *serialised* DOM, which does not round-trip with the template string
(attribute quoting, self-closing tags, entities), so it always reports a
difference. Compare a **signature of the source data** instead —
`dataSignature()` in `app.js`. Exclude `state.notifications`: the server
reshuffles it every poll, it only feeds the header bell, and including it made
the short-circuit never fire.

Anything rendered from the clock (`new Date()`) must be updated in place, not by
re-rendering — see `updateDashboardClock()` / `#heroClockDate`.

**4. Logout navigated.** `handleLogout()` used to do `window.location.href = '/'`
— a genuine full reload. It now resets state in place (clear token/session and
every cached collection, empty `#mainContent`, reset the chip and form, show the
portal). Reset `lastDataSignature` too, or the next sign-in can be suppressed.

**How to measure it:** install a `requestAnimationFrame` recorder with
`page.evaluateOnNewDocument` that samples the overlay's computed `display` and
`<html>`'s `data-theme`, and only count frames where
`document.styleSheets.length > 0` (before CSS loads the overlay reports the
browser default `block`, which is not a real flash). To detect a DOM teardown,
tag an **existing** node with a plain JS property — appending a marker element
changes `innerHTML` and defeats the very check you are testing.
See `tests/diagnose-refresh.cjs` and `tests/no-refresh.test.cjs`.

## 5. Front-end conventions

- Theme lives on `<html data-theme="dark">`; **absent = light**. Persisted in
  `localStorage['millennium-theme']`. Do **not** put `data-theme` on `<body>` —
  `[data-theme="dark"]` matches any element, so it re-declares the dark vars and
  pins the content dark even in light mode (this was a real bug).
- Auth token: `localStorage['millennium_auth_token']`; session:
  `millennium_auth_user`. A `window.fetch` wrapper injects the bearer header for
  same-origin `/api/*`, so client-side `fetch` cannot be used to test "no token"
  — assert that from Node instead.
- Design tokens that exist: `--bg-surface`, `--bg-surface-elevated`, `--bg-muted`,
  `--bg-hover`, `--border-color`, `--text-primary/secondary/muted`, `--primary`,
  `--primary-gradient`, `--radius-*`. **`--surface` and `--surface-elevated` do
  not exist** — using them yields transparent backgrounds.
- `public/css/style.css` contains a legacy block with an **unconditional**
  `body { background-color:#060b19 !important; color:#e2e8f0 }`. Anything that
  must be theme-aware has to declare its own `color`/`background` explicitly.
  This is why `landing.html` is fully self-contained and does **not** import
  `style.css`.
- Chart/stock colour convention: up = red, down = green.

### Brand: the "MILLENNIUM" wordmark is `.millennium-word`
Defined in `public/css/style.css` (~line 365): **Cinzel 900** with fallbacks
`'Playfair Display', Didot, 'Bodoni MT', Georgia, serif`, `letter-spacing: .05em`,
and a **metallic platinum/chrome gradient clipped to the text**
(`background-clip: text` + `-webkit-text-fill-color: transparent`) plus a
`drop-shadow`. The landing page's `.brand-name` mirrors it exactly, so the brand
reads identically on both pages — keep the two in sync if either changes.

**The two files use opposite theme selectors — do not copy rules between them
verbatim.** `style.css` is dark-first: `:root` is the dark palette and
`[data-theme="light"]` overrides. `landing.html` is light-first: its base `:root`
is the light palette and `[data-theme="dark"]` overrides. So the chrome gradient
is *bright* on the app's base rule but must be the `[data-theme="dark"]` rule on
the landing page; the darker chrome is the `[data-theme="light"]` override in
one file and the base rule in the other. Getting this backwards gives a washed
out gradient on white and an invisible one on black.

`landing.html` is self-contained and does **not** load `style.css`, so a font
used only there has to be added to its own Google Fonts link. Forgetting that
makes the brand silently fall back to Georgia — check with
`document.fonts.check('900 16px Cinzel')` rather than trusting the screenshot.

## 6. Layout gotchas worth remembering

### CSS ordering: the base rules in `style.css` come LAST
`public/css/style.css` is ~9,400 lines and the **base rules for several
components live in a block around line 6400+, i.e. AFTER the `@media` rules that
try to override them** (the header's media queries at 5752 / 5800 / 6008 are all
dead for this reason). At equal specificity the later rule wins, so those
responsive overrides silently do nothing.

**Consequence: append new responsive overrides at the END of the file.** Do not
trust an existing `@media` rule for a component whose base rule lives in the
6400+ block — check the line numbers first. The base `.app-header` also
hardcodes `height: 74px` instead of `var(--header-height)`, so a `:root`
variable change alone will not resize it.

### Inline styles cannot be made responsive
`app.js` renders a lot of markup with inline `style="display:grid;
grid-template-columns:1fr 1fr"`. Inline beats every stylesheet rule, so those
can never collapse on a phone. Convert to a class first (done for
`.analytics-grid` and `.alloc-form-row`). `repeat(auto-fit, minmax(Npx, 1fr))`
is fine to leave inline — it self-collapses.

### Flex children need `min-width: 0` to shrink
A flex row will not shrink a child below its min-content width unless that child
declares `min-width: 0`. This is the single most common cause of "the page is
wider than the phone": the login screen laid out at 551px on a 390px device for
exactly this reason. Put `min-width: 0` on every link in the chain
(overlay → frame → split → panel/card), not just the innermost one.

### `overflow-x: hidden` on `<body>` breaks `position: sticky`
It makes body a scroll container. Use `overflow-x: clip` instead — clips without
creating one. This cost real debugging time on the landing page header.

### Other
- CSS `scroll-behavior: smooth` makes `window.scrollTo(0, y)` animate, so a test
  reading `pageYOffset` immediately gets an intermediate value. Use
  `window.scrollTo({ top: y, behavior: 'instant' })` in probes.
- Before "fixing" a headline that wraps badly, **measure it**: build a hidden
  `<span>` with `font` copied from the computed style, set `white-space: nowrap`,
  and compare its width to the container. That tells you whether to resize the
  type or widen the column instead of guessing.
- `--header-height` drives the header height *and* the off-canvas sidebar's
  `top`, so change it in one place and both stay aligned.
- The mobile drawer has a **single** mechanism now: `toggleMobileMenu()` is a
  thin wrapper that delegates to `toggleMobileSidebar()`, which toggles
  `.app-sidebar.mobile-open` and `.sidebar-overlay.active`. The old
  `.mobile-backdrop` element is gone — assert on `.sidebar-overlay` only.
- Nav items bind via `.app-sidebar .nav-item` (there is **no** `.tab-btn` class
  in the sidebar). If the drawer stops closing on tap, check that selector first.

### A `z-index` inside a stacking context can never beat a body-level sibling
The mobile drawer's nav items were untappable. `document.elementFromPoint()` at
each item's centre returned the overlay, not the item — so a real tap hit the
overlay. The sidebar had `z-index: 999` and the overlay only `98`, so on paper
the sidebar won.

The catch: **`.app-container { position: relative; z-index: 1 }` creates a
stacking context.** `.app-sidebar` lived inside it, so its `999` was only
meaningful *within* `.app-container` — which as a whole sat at `z-index: 1`.
The overlay was a direct child of `<body>` at `z-index: 98`, i.e. in the root
context, so it painted above the entire `.app-container` subtree. Raising the
sidebar's z-index could never fix it.

**Rule: when a `z-index` "doesn't work", walk the ancestor chain looking for a
`z-index`/`transform`/`filter`/`opacity` that opens a stacking context.** Fix by
moving the element into the same context (the overlay now lives inside
`.app-container`, just before the sidebar), not by inflating the number.
Verify with `elementFromPoint()` rather than by eye — a screenshot looks fine
while the top layer eats the clicks.

## 7. Database safety

`.kiro/steering/database-protection.md` forbids DB writes unless the user
explicitly asks. Prove scoping/isolation logic with **synthetic fixtures
extracted from `dist/`** rather than by inserting test rows. When a test must
write (e.g. a profile save), restore the original value in the same run.
