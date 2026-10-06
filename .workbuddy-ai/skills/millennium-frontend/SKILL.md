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

## 3. Entry points and routing — read this before touching `src/server.ts`

Two entry points, both explicit routes in `src/server.ts`:

| URL | Serves | Why |
|---|---|---|
| `/` | `public/landing.html` | The **public landing page**. This is what a visitor sees first. |
| `/app` | `public/index.html` | The signed-in dashboard shell. |
| `/landing` | `public/landing.html` | Alias — the sign-in screen links here ("See what every feature and role does"). |
| `/index.html`, `/landing.html` | the same two files | Served directly by `express.static`. |

**The `/` and `/app` routes MUST be declared BEFORE `app.use(express.static(...))`.**
`express.static` answers `/` with its default directory index (`index.html`) and
would win, so the landing page would never appear. This is the single easiest way
to silently break the entry point.

`/app` deliberately has **no trailing slash** — `/app/` would make the shell's
root-relative asset URLs resolve under `/app/` and break every stylesheet.

`src/server.ts` ends with an SPA catch-all:

```ts
app.use((req, res) => res.sendFile(path.resolve(publicPath, 'index.html')));
```

So a new `public/foo.html` is reachable at `/foo.html` (via `express.static`)
but **`/foo` silently serves the app shell**, not your page. Add
`app.get('/foo', ...)` **before** the catch-all. (There is also an `/api`
404 handler before it, which must stay before the catch-all so bad endpoints
return JSON rather than HTML.)

Anything that links to the dashboard must use **`/app`**, never `/` — `/` is the
landing page now and a `/` link is a loop. The places that matter:
`public/landing.html` (4 CTAs), `public/manifest.json` (`start_url` + the three
`shortcuts`), and every `tests/*.cjs` navigation (each file has
`const APP = BASE + '/app';` — navigate with `APP`, not `BASE` or `BASE + '/'`).

`src/server.ts` is TypeScript: **`npm run build` is required** after editing it,
then restart. `public/**` needs no build (and `landing.html` needs no `?v=` bump
because it carries `no-cache` meta tags).

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
- Suites take 1–5 minutes each. **A `for` loop over several suites in ONE Bash
  call is fine** — and much faster — as long as each suite redirects to its own
  file (`node tests/$t.test.cjs > /tmp/$t.log 2>&1`) and the call runs in the
  background. Verified: two parallel streams of five suites each (all 387 checks)
  completed cleanly. What actually causes `Signal: SIGTERM` is **piping**, not
  batching — see the `| tail` bullet below. (Correction to earlier guidance: the
  old "run ONE suite per Bash call" rule was over-cautious.) A killed run leaks
  Chrome processes that cannot be reaped from here (`wmic.exe` is blocked by
  policy, and invoking PowerShell from Bash is blocked).
- **The Google Fonts CDN is a flake source.** Both `index.html:56` and
  `landing.html:36` load `fonts.googleapis.com`. When Chrome's DNS hiccups you
  get (a) `ERR_NAME_NOT_RESOLVED` console errors, which fail `landing-page`'s
  "no page errors" check, and (b) a **`waitUntil: 'networkidle0'` navigation
  timeout** in `no-refresh` (line ~231) and anywhere else using `networkidle0`,
  because a hanging font request means the network never goes idle. Both clear on
  a rerun. The shell's `curl` can still resolve the host — the failure is inside
  Chrome, so **do not "fix" the app for this**; rerun the suite.
- `NODE_PATH` must be **exported**, not just set inline before one command — omit
  it and every suite dies with `Cannot find module 'puppeteer-core'`.
- **Never pipe a suite through `| tail`.** A puppeteer suite piped to `tail` can
  report `Signal: SIGTERM` with **no output at all** while it actually passed —
  the pipe buffer is lost when the wrapper is torn down. `theme-switch` "failed"
  twice this way, then passed 24/24 with `> /tmp/x.log 2>&1` + reading the file.
  Redirect to a file instead of piping, and you always have the partial log.
- The shell exports `http_proxy`/`https_proxy` (a local proxy), so
  `curl http://127.0.0.1:3000/...` can transiently answer
  `502 upstream connect failed` while the server is perfectly healthy. Node's
  `fetch` (undici) ignores the proxy and connects directly, so the suites are
  unaffected — don't chase a curl 502 as a server problem.
- Leaked Chrome processes **cannot be safely reaped from here**: `wmic` is
  policy-blocked, PowerShell-from-Bash is blocked, and `tasklist /V` does not
  reliably separate puppeteer's headless Chrome from the user's real browser
  (only the top-level window carries a title; every child renderer shows `N/A`).
  Leave them.

Existing suites and their counts (keep them passing):
`rental-privacy` 74, `mobile-responsive` 67, `modal-theme` 63, `landing-page` 54,
`landing-motion` 40, `showcase-removal` 40, `profile-and-rental-form` 39,
`no-refresh` 32, `tickets-layout` 32, `theme-switch` 24, `ui-auth` 16,
`session-expiry` 9. (**490 checks total.**
`mobile-audit.cjs`, `capture-screenshots.cjs`, `capture-drawer.cjs`,
`capture-no-refresh.cjs`, `capture-light-mode.cjs`, `extract-v2-colors.cjs` and
`diagnose-refresh.cjs` are diagnostics, not pass/fail suites.)

Test accounts (password `123123`): `admin`, `hello` (technician),
`orgen` (customer, org `qcu`, email `customer@gmail.com`), and
`johnpaulpangelino6@gmail.com` (customer, org `QCU`) — a **second account in the
same organization**, which is what `rental-privacy` uses to prove per-account
isolation. Keep it: without two same-org logins that suite cannot catch a
regression to organization-based scoping.

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

## 4d. Never assert a computed colour after a fixed sleep

`style.css:154` gives `body` a
`transition: background-color 0.25s ease, color 0.25s ease`, and every theme
switch animates. **Headless Chrome throttles CSS transitions when no frame is
being produced**, so `await sleep(400)` followed by
`getComputedStyle(el).backgroundColor` can land mid-fade — or *before* the
transition has started, in which case you read the **old** colour. The assertion
then fails with a value that looks impossible: light mode reporting the dark
canvas (`rgb(6,11,25)`) while `data-theme` is correctly absent and
`localStorage` says `light`.

This cost a long detour on `theme-switch.test.cjs`, which flaked ~50% of runs on
its "light mode re-skins the app shell" checks. It is a **harness** bug, not a
product bug — the fade is deliberate.

**Fix: disable transitions before measuring.**

```js
await page.addStyleTag({
  content: '*, *::before, *::after { transition: none !important; }',
});
```

Same family as the nav label that read `rgb(255,255,255)` mid-transition. If a
colour assertion is ever intermittent, suspect a transition before suspecting the
CSS.

**This also ruins screenshots, not just colour reads.** `.modal-backdrop` is
`opacity: 0` until `.active` is added, then fades in over 0.25s. A screenshot
taken right after `openXModal()` therefore captures a **translucent dialog with
the page showing straight through it** — it looks exactly like a missing
`background` on `.modal-content`, and `getComputedStyle` still reports the
correct opaque colour, so the colour assertions all pass while the picture is
wrong. I chased that phantom "transparent modal" for a round trip. Inject the
`transition: none` style **before** opening the dialog, and sleep ~300ms before
`page.screenshot()`.

Two diagnostic techniques that settled it:
- **Timing vs specificity.** Sample the value over time (0/50/150/300/500/1000ms).
  A transition shows a stale value that then settles; a losing rule shows the
  same wrong value forever. This is what ruled out the `!important` race with
  `body { background-color:#060b19 !important }`.
- **Who is mutating the DOM.** Wrap `Element.prototype.setAttribute` /
  `removeAttribute` in an `evaluateOnNewDocument` spy and log
  `new Error().stack`. This proved the theme attribute was never re-set, which
  redirected the hunt from "who resets the theme" to "why is the computed value
  stale".

## 5. Front-end conventions

- Theme lives on `<html data-theme="dark">`; **absent = light**. Persisted in
  `localStorage['millennium-theme']`. Do **not** put `data-theme` on `<body>` —
  `[data-theme="dark"]` matches any element, so it re-declares the dark vars and
  pins the content dark even in light mode (this was a real bug).
- **`[data-theme="light"]` never matches — it is dead CSS.** The app signals
  light by *removing* the attribute (`app.js:7158-7160`), so write light-mode
  rules as **`html:not([data-theme="dark"])`**. `style.css` already contains 16
  dead `[data-theme="light"]` selectors (`.millennium-word` at :392,
  `.feature-pill-card`, `.millennium-footer`, …) left over from this mistake.
  I burned a full edit cycle writing overrides that silently did nothing.
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
- **Dashboard KPI cards carry no fabricated data.** Each `.kpi-card-v2` declares
  one `--kpi-accent` custom property, which drives both its left edge bar
  (`::before`) and its `.kpi-v2-detail-dot` — so a card's colour identity is
  declared in exactly one place. The detail line is fed from real computed values
  (`schoolDevices`, `healthPct`, `resolvedTix`, `warning/offline/maint`). An
  earlier version shipped a hardcoded `↗ +0 vs. last month` string and a fixed
  SVG sparkline path — decoration that *looked* like data. **Never add a number,
  trend or chart to this dashboard that is not computed from `state`.**
- When a detail line sits next to a small dot/bullet, do **not** let the flex row
  wrap (`flex-wrap: wrap` orphans the dot on its own line). Put `min-width: 0` on
  the text span so it wraps internally, and use `align-items: flex-start` plus a
  small `margin-top` on the dot to align it with the first line.
- **Tabs and sidebar entries are two different lists — don't conflate them.**
  `ROLE_ACCESS` (`app.js:11`) plus the `renderApp` switch define **11** tabs, but
  `index.html`'s sidebar is **static HTML with only 7 `.nav-item`s**; role
  handling merely shows/hides those. Four tabs — `customer-portal`, `cms`,
  `predictive`, `analytics` — have **no nav entry and no `navigateTo()` call
  anywhere**, so they are unreachable in the UI. `predictive` is set at
  `app.js:4468`, but only from the Fault Injection Simulator modal whose button
  lives *inside* `renderPredictiveView` — self-referential, still unreachable.
- **A nav label is not the tab it opens.** The sidebar item labelled
  **"Reports" / "Analytics & Logs"** (`index.html:571`) carries
  `data-tab="warranty"` and renders `renderWarrantyView`. The real
  `renderAnalyticsView` has no nav entry. Check `data-tab` before assuming.

### Brand: the "MILLENNIUM" wordmark is `.millennium-word`
Defined in `public/css/style.css` (~line 365): **Cinzel 900** with fallbacks
`'Playfair Display', Didot, 'Bodoni MT', Georgia, serif`, `letter-spacing: .05em`,
and a **metallic platinum/chrome gradient clipped to the text**
(`background-clip: text` + `-webkit-text-fill-color: transparent`) plus a
`drop-shadow`. The landing page's `.brand-name` mirrors it exactly, so the brand
reads identically on both pages — keep the two in sync if either changes.

**Both files are light-first, and both express light the same way — by
*removing* the attribute.** `style.css:7` `:root` is commented
`/* Color Palette - Light Mode (Showroom White & Platinum) */` and
`[data-theme="dark"]` (`:94`) overrides it. `landing.html:2` ships
`<html data-theme="dark">` and its boot script does
`if (saved === 'light') root.removeAttribute('data-theme')`. **Neither file ever
sets `data-theme="light"`.** So in both, the darker chrome is the base rule and
the bright chrome is behind `[data-theme="dark"]`.

The practical trap: **`[data-theme="light"]` is dead CSS in both files.** Write
light rules as `html:not([data-theme="dark"])` — see §5.

`landing.html` is self-contained and does **not** load `style.css`, so a font
used only there has to be added to its own Google Fonts link. Forgetting that
makes the brand silently fall back to Georgia — check with
`document.fonts.check('900 16px Cinzel')` rather than trusting the screenshot.

### The landing page (`public/landing.html`) is its own world
**It is the site's front door: `/` serves this file, and the dashboard lives at
`/app`.** Self-contained: it ships its **own** `:root`/`[data-theme="dark"]`
token set in an inline `<style>` and deliberately does **not** load `style.css`.
Edit its inline styles, not the app stylesheet.

- Its 4 CTAs ("Get started" ×3, "Sign in") point at **`/app`**. Only the brand
  logo still points at `/` (it is the home link). A CTA pointing at `/` is a
  loop back to this same page — that is the classic regression after any
  reshuffle of the entry points.
- It carries `no-cache` meta tags, so it needs **no `?v=` bump** (unlike
  `style.css` / `app.js`).
- Same theme mechanism as the app: dark = `data-theme="dark"` present, light =
  attribute **removed**. Never write `[data-theme="light"]`.
- Section tags (`.sec-tag`) are **pills**, matching the hero eyebrow
  (`.eyebrow`) — keep those two shapes consistent when touching either.
- The features grid is `repeat(3, …)` and currently holds **9 cards**, which is a
  deliberate 3×3. **If you add or remove a card, check the count.** An odd count
  leaves an orphan on the last row at the 2-column tablet breakpoint; the last
  card is handled by a `@media (max-width:1000px) and (min-width:641px)` block
  that spans it across the row and re-lays it out horizontally
  (`display:grid; grid-template-columns:auto minmax(0,1fr)`).
- `.feat-tag` uses `margin-top: auto` inside a flex-column card so the tag row
  lines up across cards with different description lengths. Keep `.feat` a flex
  column or that alignment breaks.
- A feature **card** is not a **module**: the "11 Modules" stat reflects the 11
  `render*View` functions in `app.js`. Don't silently change that number when
  you add or remove a marketing card.

**Screenshotting the landing page:** every block uses `.reveal`, which starts at
`opacity:0` and is revealed by IntersectionObserver on scroll. A `fullPage`
screenshot therefore captures **blank sections** below the fold. Inject
`.reveal{opacity:1 !important;transform:none !important;}` before capturing.

### Landing page: the scroll-motion system
Guarded by `tests/landing-motion.test.cjs` (40 checks).

- **Every animated block carries `.reveal` PLUS one direction modifier** —
  `reveal-up`, `-down`, `-l`, `-r`, `-zoom`, `-soft`. The base class owns the
  opacity and the transition; the modifier only sets the start `transform`. That
  split matters: a single `.reveal { opacity:1 }` override neutralises all of
  them, which is what the screenshot harness above relies on. **Never add a
  modifier without `.reveal`.**
- `.reveal.in` resets with `transform:none` and wins on specificity (0,2,0 vs
  0,1,0), so no `!important` is needed.
- **Stagger is derived, not authored.** The script sets `--d` from each
  element's index among its `.reveal` *siblings* (capped at 480ms), so a grid
  cascades with no per-card markup and a lone heading still fires at once.
- **Sideways entrances only have room above ~1240px.** `.wrap` is 1180px wide
  with 24px inner padding, so below that width the 24px padding is the only
  slack and a 38px `-l`/`-r` offset pokes past the viewport edge. A
  `@media (max-width:1240px)` block turns them vertical; `≤720px` turns
  everything vertical and switches the parallax off.
- **One rAF-throttled scroll handler** writes `--sp` (progress) and `--sy`
  (parallax) as custom properties — on the **smallest element that needs them**
  (`.site-head`, `.aurora`, `.hero-visual`), never on `:root`, because a custom
  property on the root invalidates the computed style of the whole tree every
  frame. All transforms stay in the stylesheet.
- **The progress bar is `.site-head::after`, `position:absolute`.** It must not
  be `position:fixed` — the page is designed with exactly one pinned element and
  `landing-page.test.cjs` asserts nothing else is fixed or sticky.
- The hero has a **load** animation (`.hero-copy > *`, `@keyframes heroIn`), not
  a reveal, because it is above the fold and must not depend on the scroll
  observer. Only `opacity` is animated on `.hero-visual` — its `transform`
  belongs to the parallax and the two would fight.
- The feature-card spotlight writes `--mx`/`--my` on `mousemove` and needs
  `.feat { isolation: isolate }` so its `z-index:-1` pseudo paints above the card
  background but below the copy. It is gated on `(hover: hover)`.
- Stats carry `data-count` / `data-suffix` and count up on first view; the real
  value stays in the HTML as a no-JS fallback and is zeroed before first paint.

**Bug worth remembering — a percentage `rootMargin` can strand the last block.**
The reveal observer used `rootMargin: '0px 0px -8% 0px'`. That inset is a
percentage of the *viewport*, so on a 900px-tall window it excludes the bottom
72px — and the footer block is only ~50px tall, so it sat permanently inside the
excluded band and stayed at `opacity:0` **forever**. Nothing errored; the footer
just never appeared. `revealRemaining()` now force-reveals anything left as soon
as `innerHeight + pageYOffset >= scrollHeight - 2`. The general lesson: a
percentage bottom inset is only safe if every observed block is taller than that
percentage of the viewport.

### Light mode: fix it with an additive override layer, not by rewriting
The V2 redesign block (`style.css` ~6434-9457) **hardcodes the dark canvas** —
`#060b19`, `#070d20`, `#0a132a`, `#0d1733`, `#090e1f` — plus light greys for
text: 242 hardcoded hex and 172 `rgba()` values. Because its `body` rule carries
`!important`, the app rendered dark regardless of `data-theme`. Light mode could
never work until this was overridden.

Do **not** try to rewrite those values. Instead append a light-mode block at the
**very end of `style.css`** (same reason as §6 — later wins at equal
specificity), with every rule prefixed `html:not([data-theme="dark"])`. The
current layer is ~400 lines / 110 rules covering the app shell, cards, tables,
forms, dialogs, chips, badges and the donut/gauge centres. Two things that
needed `!important` to win: `.notif-dropdown` (the original sets
`background-color: #090e1f !important`).

`tests/extract-v2-colors.cjs` dumps the 109 background-setting selectors in that
block — run it before touching the V2 CSS.

**Accent colours need separate text tokens.** `--neon-cyan: #00f2fe` is a *glow*
colour: as text on white it measures ≈1.4:1, i.e. unreadable. It is darkened to
`#0e7490` under `html:not([data-theme="dark"])` and re-brightened inside
`.auth-portal-overlay` (the sign-in portal stays dark in both themes). Five
accent-text tokens — `--accent-blue-text`, `--accent-green-text`,
`--accent-amber-text`, `--accent-purple-text`, `--accent-rose-text` — are defined
in **both** `[data-theme="dark"]` (the original hexes, so dark is unchanged) and
the light block.

**Inline styles beat stylesheet rules, so tokens are the only way in.** ~40
inline hexes in `app.js` had to be converted to `var()` for the theme to reach
them — all `color:#00f2fe` → `var(--neon-cyan)`, all `color:#ffffff` →
`var(--text-primary)`. If you add a coloured inline style, expect it to ignore
the theme.

### Undefined tokens silently delete the whole declaration
`var(--token, fallback)` is not a warning. An undefined custom property **with no
fallback makes the entire declaration invalid and it is dropped**; with a
fallback, the fallback always wins — so the theme can never reach that element.
Both cases are live in `app.js` dialogs:

- `background: var(--bg-card, #1a1a2e)` — `--bg-card` is defined **nowhere**, so
  four dialogs (Restock Shipment, Create User, Edit User, Create Customer) were a
  hard-coded dark navy in **both** themes, while everything inside them
  (`.form-input`, `.btn-secondary`, `--text-primary`) correctly followed the
  theme. In the light theme that produced a near-black card with
  `--text-primary` (`#0f172a`) on it — **the dialog title was invisible**, and
  the white inputs looked like a light-mode leak.
- `background: var(--bg-card)` with no fallback — silently transparent.

Real tokens: `--bg-canvas`, `--bg-surface`, `--bg-surface-elevated`,
`--bg-hover`, `--bg-muted`. There is **no** `--bg-card`, `--surface`,
`--surface-elevated` or `--border-bright`. Grep `style.css` for a token before
using it.

### Dialogs: use the shared shell, never a bespoke inline card
The app has one dialog shape — the profile and rental modals in `app.js` are the
reference:

```html
<div class="modal-content modal-form" role="dialog" aria-modal="true">
  <div class="modal-header"><h3 class="modal-title">…</h3>
    <button class="modal-close" aria-label="Close">×</button></div>
  <form onsubmit="event.preventDefault(); save(event)">
    <div class="form-body">
      <div class="form-section"><div class="form-section-title">…</div>
        <div class="form-group"><label class="form-label">…</label>
          <input class="form-input" /></div></div>
    </div>
    <div class="modal-footer">…</div>
  </form>
</div>
```

- Overlay: `overlay.className = 'modal-backdrop'`, append, then
  `requestAnimationFrame(() => overlay.classList.add('active'))`. The base rule is
  `opacity: 0; pointer-events: none`, so **without `.active` the dialog is
  invisible and unclickable**.
- `.modal-backdrop` is `z-index: 1000`; toasts are `2000`. Do not invent 9000.
- `.modal-content.modal-form` is `padding: 0; max-height: 90vh; overflow: hidden`
  and `.form-body` scrolls, so header and footer stay pinned.
- `.modal-content h2/h3` is forced to `var(--text-primary)` (the V2 block sets a
  hard-coded light `color` on `<body>`, so inheritance is unusable) — a heading
  is only safe *inside* a `.modal-content`.
- `.seg-tabs` / `.seg-tab` (`.is-active`) is the segmented control. Its active
  state is deliberately a **tinted** pill (`--primary-light` background,
  `--primary-hover` text, `--primary` inset ring), not a `--primary-gradient`
  fill: the dark-theme gradient is bright cyan, so white text on it measures
  1.4:1, and a tab that looks identical to the submit button flattens the
  hierarchy. Note `.btn-primary` itself still does white-on-bright-cyan in dark
  mode — that is pre-existing and app-wide.
- `.form-error` for validation text (`--accent-rose-text`, not `--danger` which
  is a fill colour), `.form-stack` for a vertical group.
- Guarded by `tests/modal-theme.test.cjs` (63 checks) — it measures *rendered*
  luminance and contrast in **both** themes, so a one-theme fix cannot pass, and
  it asserts the source no longer contains `--bg-card` or `#1a1a2e`.

### Contrast scanning — two bugs that produce false positives
A per-view scanner that resolves each element's effective background through its
ancestors is the right tool (it took light mode 258 → 0 failures and dark
137 → 0). But two traps made it lie:
1. Elements over a `background-image` **gradient** have no solid ancestor
   background — it invents one. **Skip any element with a gradient ancestor.**
2. The naive *fg-over-opaque-bg* formula makes two stacked semi-transparent cyan
   tints resolve to pure cyan and look fine. Implement true **source-over
   compositing** down the ancestor stack.

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

## 8. Tenant scoping — scope by ACCOUNT, never by organization

**This was a real, reported leak:** a customer could see other customers'
bookings. The cause was not a missing check but a *wrong* one — `rentalInScope`
matched on `rental.customerId`, then **fell back to comparing
`rental.customerName` against `user.organization`**. Every account in one
organization resolved to the same `customerId`, so the fallback handed each of
them the whole organization's bookings. (Live data: one org `QCU` /
`CUST-1789631617438` with **two** logins — `orgen` and
`johnpaulpangelino6@gmail.com` — both seeing all 4 rentals.)

**Rule: an organization is a billing entity, not an identity.** Multi-seat
customers are normal, so "scope by organization" leaks by default. Scope a
per-user resource by the **creating account**:

- `rentals.created_by_user_id` (added with a `DO $$ … END $$;` migration + a
  one-time backfill matching `rentals.contact_email` → `users.email`
  case-insensitively, `role='customer'`). Rows the backfill cannot attribute stay
  **NULL = admin-only** — fail closed, never guess.
- `rentalOwnedByUser(rental, userId)` in `src/routes/api.ts` is the single
  predicate; `scopeRentalsForAuth(all, auth)` keys off `auth.userId`; a foreign
  `GET /rentals/:id` still returns **404, not 403**, so it doesn't confirm the id
  exists.
- Ownership is stamped in `POST /rentals` from the **token** (`auth.userId`),
  never the request body, and `updateRental`'s explicit `fieldMap` omits the
  column so it is immutable — even for an admin edit.
- `public/js/app.js` `rentalMatchesUser` is a **second, defensive copy** of the
  rule; it must use the identical predicate (`createdByUserId === user.id`), or
  the two disagree and the client re-introduces the leak.

### Check every feed that carries the same data, not just the main list
While fixing this, `/api/audit-logs` turned out to have **no auth at all** and to
contain `Rental RNT-2026-0004 created for QCU (…)` — other customers' rental
numbers and organizations — and `fetchAllData()` pulled it for *every* role even
though only the admin dashboard renders it. A customer's browser therefore still
downloaded the company's whole rental activity.

Two-part fix: `requireAuth, requireRole('admin')` on the route, **and** move the
fetch inside the existing `if (state.currentRole === 'admin')` block. Do both —
the UI gate alone leaves the endpoint open to `curl`.

**Habit worth keeping:** after locking down a list endpoint, grep for *other*
endpoints returning the same rows (`getAllRentals`, `getRentalStats`,
`/audit-logs`, `/notifications`) and check each one's auth and its role gate in
`fetchAllData`. And when you add an admin-only feed, put it in that `admin`
block — a feed that no view renders is still data the browser downloads.

