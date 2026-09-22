const fs = require('fs');
const { chromium } = require('playwright');

let browser = null;
let context = null;

/**
 * Starts (or reuses) a single headless browser context for the whole
 * bot lifetime, so we don't pay browser-startup cost on every poll.
 */
async function getContext() {
  if (context) return context;

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  });

  // Optional: load cookies if the rain widget / live bets only render
  // for a logged-in session. Export your browser cookies for growroll.gg
  // as JSON (array of {name, value, domain, path, ...}) into cookies.json.
  const cookiesPath = process.env.COOKIES_PATH || './cookies.json';
  if (fs.existsSync(cookiesPath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      await context.addCookies(cookies);
      console.log(`[scraper] Loaded ${cookies.length} cookies from ${cookiesPath}`);
    } catch (err) {
      console.warn(`[scraper] Could not load cookies from ${cookiesPath}:`, err.message);
    }
  }

  return context;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
  }
}

/**
 * Loads the target page, waits for client-side JS to render, and
 * returns the full visible text of <body> plus the raw HTML (in case
 * you need to grep for a specific data attribute).
 */
async function loadRenderedPage(url) {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Give any WebSocket-driven widgets (rain timer, live bets) a moment
    // to receive their first message after the socket connects.
    await page.waitForTimeout(3000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const html = await page.content();
    return { page, bodyText, html };
  } catch (err) {
    await page.close();
    throw err;
  }
}

/**
 * Attempts to find a countdown to the next "rain" event.
 *
 * Two strategies:
 *  1. If RAIN_SELECTOR is set, read text directly from that element.
 *  2. Otherwise, scan the whole rendered text for a line containing one
 *     of RAIN_KEYWORDS plus a time pattern like MM:SS or HH:MM:SS.
 *
 * Returns { raw, secondsRemaining } or null if nothing found.
 */
async function findNextRain(url) {
  const selector = (process.env.RAIN_SELECTOR || '').trim();
  const keywords = (process.env.RAIN_KEYWORDS || 'rain,lietus')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const { page, bodyText } = await loadRenderedPage(url);

  try {
    let raw = null;

    if (selector) {
      const el = await page.$(selector);
      if (el) raw = (await el.innerText()).trim();
    }

    if (!raw) {
      // Fallback: scan line-by-line for a keyword + time pattern.
      const timePattern = /\b(\d{1,2}:)?\d{1,2}:\d{2}\b/; // HH:MM:SS or MM:SS
      const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean);

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (keywords.some((k) => lower.includes(k)) && timePattern.test(line)) {
          raw = line;
          break;
        }
      }
    }

    if (!raw) return null;

    const secondsRemaining = parseCountdownToSeconds(raw);
    return { raw, secondsRemaining };
  } finally {
    await page.close();
  }
}

/** Extracts a HH:MM:SS or MM:SS pattern from a string and returns total seconds. */
function parseCountdownToSeconds(text) {
  const match = text.match(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/);
  if (!match) return null;
  const [, hh, mm, ss] = match;
  const hours = hh ? parseInt(hh, 10) : 0;
  const minutes = parseInt(mm, 10);
  const seconds = parseInt(ss, 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Attempts to find the "top" game right now from a live-bets style
 * table (GrowRoll's homepage has "All Games / High Rollers / Lucky
 * Wins" tabs). Since that table is populated live over WebSocket,
 * this grabs whatever rows are visible at scrape time and returns the
 * one with the highest multiplier it can parse.
 *
 * NOTE: You will likely need to adjust ROW_SELECTOR after inspecting
 * the real DOM (see inspect.js / README).
 */
async function findTopGame(url) {
  const rowSelector = process.env.TOP_GAME_ROW_SELECTOR || '[class*="live-bet"], [class*="bet-row"], tr';
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000); // let a few live-bet events arrive

    const rows = await page.$$eval(rowSelector, (nodes) =>
      nodes.map((n) => n.innerText.trim()).filter(Boolean)
    );

    let best = null;
    let bestMulti = -Infinity;
    const multiPattern = /(\d+(?:\.\d+)?)\s*x/i;

    for (const row of rows) {
      const m = row.match(multiPattern);
      if (m) {
        const val = parseFloat(m[1]);
        if (val > bestMulti) {
          bestMulti = val;
          best = row;
        }
      }
    }

    return best ? { raw: best, multiplier: bestMulti } : null;
  } finally {
    await page.close();
  }
}

module.exports = { findNextRain, findTopGame, loadRenderedPage, closeBrowser };
