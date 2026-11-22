// Loads Motif's real streak engine, helpers, text and safety code out of app/unbroken.html
// into a sandbox, so the logic tests always test the code people run.
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '../../app/unbroken.html'), 'utf8');
const js = html.slice(html.indexOf('<script>\n(() => {') + '<script>\n(() => {'.length);
const cut = (from, to) => { const a = js.indexOf(from), b = js.indexOf(to, a + 1); if (a < 0 || b < 0) throw new Error('Section not found: ' + from); return js.slice(a, b); };
const src = cut('/* ---------- Constants ---------- */', '/* ---------- My streaks ---------- */');
function load({ now, weekStart = 1, rollover = 0 } = {}) {
  const RealDate = Date;
  const fixed = now ? new RealDate(now).getTime() : RealDate.now();
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
  const store = new Map();
  const ctx = vm.createContext({
    Date: FakeDate, Intl, JSON, Math, Number, String, Object, Array, Set, Map, RegExp, Promise, Error, TypeError, parseInt, isFinite,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    document: {}, window: {}, CSS: { escape: s => s },
  });
  vm.runInContext(src + `
    ;S.settings.weekStart=${weekStart};S.settings.rollover=${rollover};
    globalThis.M={S,DEF,evaluate,chainLinks,normHabit,normSettings,normSocial,normProfile,newHabit,keyOf,dnOf,dow,today,weekStartOf,
      monthStartOf,monthEndOf,schedText,statusText,hasBad,maskBad,okImg,stable,onColor,uw,MILE,COLORS,THEMES};`, ctx);
  return ctx.M;
}
module.exports = { load };
