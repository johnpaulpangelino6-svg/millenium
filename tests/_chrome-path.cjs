/**
 * Resolve a Chromium binary for the puppeteer-core based UI tests.
 *
 * These tests used to hardcode
 *   C:\Program Files\Google\Chrome\Application\chrome.exe
 * That binary is a GUI-session launcher: driven headless it attaches to an
 * already-running browser session and exits without ever serving CDP, so every
 * puppeteer test failed to launch (0 bytes of output, exit 0). The Playwright
 * Chromium build is a real headless-capable Chromium and serves CDP normally.
 *
 * Override with CHROME_PATH, or PLAYWRIGHT_BROWSERS_PATH, when needed.
 */
const fs = require('fs');
const path = require('path');

function findChromium() {
  const candidates = [];

  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'),
    process.env.HOME && path.join(process.env.HOME, '.cache', 'ms-playwright'),
  ].filter(Boolean);

  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    // Newest revision first.
    for (const entry of entries.filter((e) => /^chromium-/.test(e)).sort().reverse()) {
      candidates.push(path.join(root, entry, 'chrome-win64', 'chrome.exe'));
      candidates.push(path.join(root, entry, 'chrome-linux', 'chrome'));
      candidates.push(path.join(root, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
    }
  }

  candidates.push('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  candidates.push('/usr/bin/google-chrome');
  candidates.push('/usr/bin/chromium');

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* keep looking */
    }
  }

  throw new Error(
    'No Chromium found. Set CHROME_PATH to a headless-capable Chrome/Chromium binary.'
  );
}

module.exports = findChromium();
