// Shared browser helpers for the screen and server tests.
const fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '../..');
const APP = () => fs.readFileSync(path.join(ROOT, 'app/unbroken.html'), 'utf8');
// The Claude test page wraps the app in a minimal document; this does the same.
const claudePage = () => '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + APP() + '</body></html>';
let browser;
async function launch() {
  if (!browser) browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,app.test' } } : {});
  return browser;
}
async function close() { if (browser) await browser.close(); browser = null; }
// Opens the app as on the Claude test page. `init` runs before the app (for the mock); returns { page, errors }.
async function openClaude({ device = 'iPhone 13', init, initArg, html = claudePage(), clock } = {}) {
  const b = await launch();
  const ctx = await b.newContext({ ...devices[device] });
  if (init) await ctx.addInitScript(init, initArg);
  await ctx.route('http://app.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (clock) await page.clock.setFixedTime(new Date(clock));   // pretend it is this date and time
  await page.goto('http://app.test/');
  await page.waitForTimeout(700);
  return { page, ctx, errors };
}
// A test photo, drawn fresh so no image files live in the repo.
async function photo(page) {
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#2f7d5b'; x.fillRect(0, 0, 900, 600); x.fillStyle = '#c9a227'; x.beginPath(); x.arc(450, 300, 200, 0, 7); x.fill(); return c.toDataURL('image/jpeg', .9).split(',')[1]; });
  return { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}
async function pick(page, selector, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.tap(selector)]);
  await fc.setFiles(file);
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
module.exports = { launch, close, openClaude, claudePage, photo, pick, noSideScroll, devices, ROOT };
