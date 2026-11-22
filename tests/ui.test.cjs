// Screen tests: the app as it runs on the Claude test page, on a phone-sized screen, with a stand-in database.
const test = require('node:test'), assert = require('node:assert/strict');
const { openClaude, close, photo, pick, noSideScroll, claudePage } = require('./lib/browser.cjs');
const mockClaude = require('./lib/mock-claude.cjs'), makeSeed = require('./lib/seed.cjs');
test.after(close);
const open = async (o = {}) => { const s = makeSeed(o); const r = await openClaude({ init: mockClaude, initArg: { seed: o.empty ? {} : s.seed, photoCheck: o.photoCheck || 'ok' }, device: o.device }); return { ...r, ...s }; };
const doc = (page, id) => page.evaluate(i => window.__store.get('data/users/u_me/' + i) || null, id);
const settle = page => page.waitForTimeout(700);
const openStreak = async (page, id) => { await page.tap(`.tile[data-id="${id}"]`); await page.waitForSelector('#sheet:not([hidden]) .detail'); };
const closeSheet = async page => { await page.tap('.sh-head [data-act="close"]'); await page.waitForTimeout(300); };
const noErrors = errors => assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));

test('first run: an empty account shows "No streaks yet" and no example or starter streaks', async () => {
  const { page, errors } = await open({ empty: true });
  assert.match(await page.textContent('#empty'), /No streaks yet/);
  assert.equal(await page.$$eval('.tile,.card,.tpl,.demo', x => x.length), 0);
  noErrors(errors);
});

test('new streak: preset picture, title and schedule save, and the tile appears', async () => {
  const { page, errors } = await open({ empty: true });
  await page.tap('.empty-card [data-act="new"]');
  assert.equal(await page.$$eval('#sheetBody .form > .field', f => f.length), 3, 'only Picture, Title and How often before More options');
  await page.tap('.preset[data-i="1"]');
  await page.fill('#f-name', 'Drink water');
  await page.tap('[data-act="stype"][data-v="weekdays"]');
  await page.tap('[data-act="save"]'); await settle(page);
  assert.deepEqual(await page.$$eval('.tile .nm', x => x.map(t => t.textContent)), ['Drink water']);
  const saved = await page.evaluate(() => [...window.__store.values()].find(d => d.name === 'Drink water'));
  assert.equal(saved.icon, '💧'); assert.equal(saved.sched.type, 'weekdays'); assert.deepEqual(saved.sched.days, [1, 2, 3, 4, 5]);
  noErrors(errors);
});

test('new streak: a title is required and rude titles are blocked', async () => {
  const { page } = await open({ empty: true });
  await page.tap('.empty-card [data-act="new"]');
  await page.tap('[data-act="save"]');
  assert.equal(await page.textContent('#nameErr'), 'Give it a title.');
  await page.fill('#f-name', 'sh1t list'); await page.tap('[data-act="save"]');
  assert.equal(await page.textContent('#nameErr'), 'Please pick a different title.');
});

test('photos: an approved photo is used and shared; a rejected one is refused; an unchecked one stays private', async () => {
  const { page } = await open({ empty: true });
  const file = await photo(page);
  await page.tap('.empty-card [data-act="new"]');
  await page.evaluate(() => window.__setPhotoCheck('bad'));
  await pick(page, '.pic-side .file', file); await page.waitForTimeout(800);
  assert.match(await page.textContent('#sheetBody .err'), /can't be used/); assert.equal(await page.$$eval('.pic-prev img', x => x.length), 0);
  await page.evaluate(() => window.__setPhotoCheck('none'));
  await pick(page, '.pic-prev', file); await page.waitForSelector('.pic-prev img');
  assert.match(await page.textContent('#sheetBody .hint'), /only you will see it/);
  await page.tap('[data-act="photoClear"]');
  await page.evaluate(() => window.__setPhotoCheck('ok'));
  await page.setInputFiles('#f-photo2', file); await page.waitForSelector('.pic-prev img');
  await page.fill('#f-name', 'Run'); await page.tap('[data-act="save"]'); await settle(page);
  const saved = await page.evaluate(() => [...window.__store.values()].find(d => d.name === 'Run'));
  assert.ok(saved.photo.startsWith('data:image/jpeg')); assert.equal(saved.photoOk, true);
  assert.equal(await page.$$eval('.tile .media img', x => x.length), 1);
});

test('photos: pasting a copied photo works', async () => {
  const { page } = await open({ empty: true });
  const file = await photo(page);
  await page.tap('.empty-card [data-act="new"]');
  await page.evaluate(async b64 => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([a], 'p.jpg', { type: 'image/jpeg' }));
    document.querySelector('#f-paste').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, file.buffer.toString('base64'));
  await page.waitForSelector('.pic-prev img');
});

test('double-tap adds one, shows +1 and the check, and saves', async () => {
  const { page, today, errors } = await open();
  await page.dblclick('.tile[data-id="h1"]'); await page.waitForTimeout(150);
  assert.deepEqual(await page.$$eval('.burst', x => x.map(b => b.textContent)), ['+1']);
  await settle(page);
  assert.equal(await page.textContent('.tile[data-id="h1"] .tile-streak b'), '12');
  assert.equal(await page.$$eval('.tile[data-id="h1"] .badge.on', x => x.length), 1);
  assert.equal((await doc(page, 'h1')).log[today], 1);
  assert.equal(await page.isVisible('#sheet'), false, 'a double-tap must not open the streak');
  noErrors(errors);
});

test('a single tap opens the streak page', async () => {
  const { page } = await open();
  await page.tap('.tile[data-id="h1"]'); await page.waitForTimeout(500);
  assert.equal(await page.isVisible('#sheet .detail'), true);
  assert.equal(await page.textContent('.bignum'), '11');
});

test('undo after a double-tap restores the count and the saved data', async () => {
  const { page, today } = await open();
  await page.dblclick('.tile[data-id="h1"]'); await settle(page);
  assert.equal((await doc(page, 'h1')).log[today], 1);
  await page.tap('#undoBtn'); await settle(page);
  assert.equal(await page.textContent('.tile[data-id="h1"] .tile-streak b'), '11');
  assert.equal((await doc(page, 'h1')).log[today], undefined);
});

test('daily goals: double-taps add up to the target, then the day counts', async () => {
  const { page, today } = await open();
  for (let i = 0; i < 5; i++) { await page.dblclick('.tile[data-id="h2"]'); await page.waitForTimeout(400); }
  await settle(page);
  assert.equal((await doc(page, 'h2')).log[today], 8);
  assert.equal(await page.textContent('.tile[data-id="h2"] .tile-streak b'), '2');
});

test('streak page: + and − adjust today, Rest day toggles, and the stats update', async () => {
  const { page, today } = await open();
  await openStreak(page, 'h1');
  await page.tap('[data-act="inc"]'); await settle(page);
  assert.equal(await page.textContent('.bignum'), '12');
  await page.tap('[data-act="dec"]'); await settle(page);
  assert.equal(await page.textContent('.bignum'), '11');
  await page.tap('[data-act="rest"]'); await settle(page);
  assert.equal((await doc(page, 'h1')).skip[today], 1);
  assert.match(await page.textContent('.line'), /Rest day/);
});

test('calendar: tapping a day cycles done, rest day and cleared, and the streak follows', async () => {
  const { page, key } = await open();
  await openStreak(page, 'h1');
  const day = await page.evaluate(k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); }, key(12));
  const cell = `button.cd[data-d="${day}"]`;
  if (!(await page.$(cell))) { await page.tap('[data-act="mprev"]'); await page.waitForTimeout(200); }
  const state = () => page.$eval(cell, c => c.className.match(/s-(\w+)/)[1]);
  assert.equal(await state(), 'missed');
  await page.tap(cell); await settle(page); assert.equal(await state(), 'done'); assert.equal(await page.textContent('.bignum'), '12');
  await page.tap(cell); await settle(page); assert.equal(await state(), 'skip'); assert.equal(await page.textContent('.bignum'), '11');
  await page.tap(cell); await settle(page); assert.equal(await state(), 'missed');
});

test('editing a streak keeps its history', async () => {
  const { page } = await open();
  await openStreak(page, 'h1');
  await page.tap('[data-act="edit"]');
  await page.fill('#f-name', 'Read 30 pages');
  await page.tap('[data-act="save"]'); await settle(page);
  const d = await doc(page, 'h1');
  assert.equal(d.name, 'Read 30 pages'); assert.equal(Object.keys(d.log).length, 11);
});

test('archive: hides the streak, keeps its history, and Bring back restores it', async () => {
  const { page } = await open();
  await openStreak(page, 'h1'); await page.tap('[data-act="archive"]'); await settle(page);
  assert.equal(await page.$$eval('.tile[data-id="h1"]', x => x.length), 0);
  assert.equal((await doc(page, 'h1')).archived, true); assert.equal(Object.keys((await doc(page, 'h1')).log).length, 11);
  await page.tap('#btnSettings');
  assert.match(await page.textContent('.settings'), /Read 20 pages/);
  await page.tap('[data-act="unarchive"][data-id="h1"]'); await settle(page); await closeSheet(page);
  assert.equal(await page.$$eval('.tile[data-id="h1"]', x => x.length), 1);
  assert.equal(await page.textContent('.tile[data-id="h1"] .tile-streak b'), '11');
});

test('delete: asks first, Keep it changes nothing, Delete removes it, Undo brings it back', async () => {
  const { page } = await open();
  await openStreak(page, 'h1'); await page.tap('[data-act="ddel"]');
  assert.match(await page.textContent('#sheetBody .danger'), /Delete Read 20 pages and its 11 check-ins\?/);
  await page.tap('[data-act="ddelno"]'); assert.equal(await page.isVisible('[data-act="ddel"]'), true);
  await page.tap('[data-act="ddel"]'); await page.tap('[data-act="ddelyes"]'); await settle(page);
  assert.equal(await doc(page, 'h1'), null);
  await page.tap('#undoBtn'); await settle(page);
  assert.equal(Object.keys((await doc(page, 'h1')).log).length, 11);
});

test('reorder: the arrows change the order and it is saved', async () => {
  const { page } = await open();
  await page.tap('#btnSettings'); await page.tap('[data-act="toggle"][data-k="groups"]'); await page.tap('[data-act="reorderStart"]'); await page.waitForTimeout(300);
  await page.tap('[data-act="down"][data-id="h1"]'); await settle(page);
  assert.deepEqual(await page.$$eval('.card .nm', x => x.map(t => t.textContent)).then(a => a.slice(0, 2)), ['Drink water', 'Read 20 pages']);
  assert.ok((await doc(page, 'h1')).order > (await doc(page, 'h2')).order);
});

test('settings: theme, layout and week start are saved', async () => {
  const { page } = await open();
  await page.tap('#btnSettings');
  await page.tap('[data-act="set"][data-k="theme"][data-v="moss"]');
  await page.tap('[data-act="set"][data-k="layout"][data-v="list"]');
  await page.tap('[data-act="set"][data-k="weekStart"][data-v="0"]'); await settle(page);
  const s = await doc(page, 'settings');
  assert.deepEqual([s.theme, s.layout, s.weekStart], ['moss', 'list', 0]);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), 'moss');
});

test('reminder: the bar shows after the reminder time while a streak is still due, and Got it hides it', async () => {
  const { page } = await open();
  await page.tap('#btnSettings');
  await page.tap('[data-act="toggle"][data-k="remind"]');
  await page.fill('#s-remind', '00:00'); await page.dispatchEvent('#s-remind', 'change'); await closeSheet(page);
  assert.match(await page.textContent('.reminder'), /still to do today/);
  await page.tap('[data-act="remindOk"]'); assert.equal(await page.$$eval('.reminder', x => x.length), 0);
});

test('friends: profile, adding a friend, privacy, and only ever writing your own data', async () => {
  const { page, errors } = await open();
  await page.tap('#tabFriends'); await page.waitForTimeout(400);
  await page.tap('.join [data-act="profileEdit"]');
  await page.fill('#p-name', 'Fuuuck face'); await page.tap('[data-act="psave"]');
  assert.match(await page.textContent('#pnameErr'), /rude words/);
  await page.fill('#p-name', 'Test Me'); await page.tap('[data-act="psave"]'); await page.waitForTimeout(1500);
  const shared = () => page.evaluate(() => [...window.__store.keys()].filter(k => k.startsWith('people/u_me/streaks/')).length);
  assert.equal(await shared(), 3);
  await page.tap('[data-act="follow"][data-id="u_ana"]'); await page.waitForSelector('.mini');
  assert.deepEqual(await page.$$eval('.mini', m => m.map(x => x.getAttribute('aria-label'))), ['Morning swim: 16 days, done today']);
  assert.equal(await page.$$eval('.prow b', x => x.map(t => t.textContent)).then(a => a.includes('Bo')), true);
  await page.tap('.mini'); await page.waitForTimeout(400);
  assert.equal(await page.$$eval('#sheetBody [data-act="inc"],#sheetBody button.cd', x => x.length), 0, "friends' streaks are read-only");
  await closeSheet(page);
  await page.tap('.me-card [data-act="profileEdit"]'); await page.tap('[data-act="pprivate"]'); await page.tap('[data-act="psave"]'); await page.waitForTimeout(1500);
  assert.equal(await shared(), 0, 'a private profile shares nothing');
  const foreign = await page.evaluate(() => window.__writes.filter(w => !/ (data\/users\/u_me\/|people\/u_me$|people\/u_me\/)/.test(w)));
  assert.deepEqual(foreign, []);
  noErrors(errors);
});

test('friends: a streak marked private is never shared', async () => {
  const { page } = await open();
  await page.tap('#tabFriends'); await page.waitForTimeout(400);
  await page.tap('.join [data-act="profileEdit"]'); await page.fill('#p-name', 'Test Me'); await page.tap('[data-act="psave"]'); await page.waitForTimeout(1500);
  await page.tap('#tabMine'); await openStreak(page, 'h1'); await page.tap('[data-act="edit"]'); await page.tap('[data-act="more"]'); await page.tap('[data-act="hideToggle"]'); await page.tap('[data-act="save"]'); await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.__store.has('people/u_me/streaks/h1')), false);
  assert.equal(await page.evaluate(() => window.__store.has('people/u_me/streaks/h2')), true);
});

test('backup: restoring a backup replaces streaks and keeps their history', async () => {
  const { page } = await open();
  await page.tap('#btnSettings');
  const backup = JSON.stringify({ app: 'Motif', version: 2, settings: { theme: 'ocean' }, habits: { hx: { id: 'hx', name: 'Restored', sched: { type: 'daily' }, start: '2026-01-01', log: { '2026-01-02': 1 } } } });
  await page.fill('#s-restore', backup); await page.tap('[data-act="restoreCheck"]'); await page.tap('[data-act="restoreYes"]'); await settle(page); await closeSheet(page);
  assert.deepEqual(await page.$$eval('.tile .nm', x => x.map(t => t.textContent)), ['Restored']);
  assert.equal((await doc(page, 'hx')).log['2026-01-02'], 1);
  assert.equal(await doc(page, 'h1'), null);
});

test('saved data from the very first version loads without losing anything', async () => {
  const today = (() => { const n = new Date(); return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 864e5); })();
  const k = d => new Date(d * 864e5).toISOString().slice(0, 10);
  const log = {}; for (let d = today - 6; d < today; d++) log[k(d)] = 1;
  const v1 = { v: 1, mode: 'local', settings: { theme: 'system', accent: 'ink', density: 'compact', weekStart: 1, rollover: 0, sort: 'manual', groups: true, hideDone: false, celebrate: true },
    habits: { hold: { id: 'hold', name: 'Old streak', icon: '📚', color: '#4f5bd5', sched: { type: 'daily', days: [1, 2, 3, 4, 5], every: 2, times: 3 }, goal: 1, unit: '', start: k(today - 6), freezes: 0, group: '', note: 'kept', archived: false, order: 1, created: 1, log, skip: {} } }, dirty: {} };
  const html = claudePage();
  const { page, errors } = await openClaude({ html, init: s => { localStorage.setItem('unbroken:v1', s); }, initArg: JSON.stringify(v1) });
  assert.deepEqual(await page.$$eval('.card .nm', x => x.map(t => t.textContent)), ['Old streak'], 'compact layout carried over');
  assert.equal(await page.textContent('.card .streak b'), '6');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), 'forest');
  noErrors(errors);
});

test('without Claude or an account, streaks save in the browser and survive a reload', async () => {
  const { page } = await openClaude({ html: claudePage() });
  await page.tap('.empty-card [data-act="new"]'); await page.tap('.preset[data-i="0"]'); await page.fill('#f-name', 'Local'); await page.tap('[data-act="save"]'); await settle(page);
  await page.dblclick('.tile'); await settle(page);
  await page.reload(); await page.waitForTimeout(700);
  assert.equal(await page.textContent('.tile .nm'), 'Local'); assert.equal(await page.textContent('.tile .tile-streak b'), '1');
  assert.match(await page.textContent('#storeNote'), /this browser only/);
});

test('phones: no sideways scrolling on any screen, small or large', async () => {
  for (const device of ['iPhone SE', 'iPhone 13', 'Pixel 7']) {
    const { page } = await open({ device });
    const screens = [['home'], ['streak', async () => openStreak(page, 'h1')], ['new streak', async () => { await closeSheet(page); await page.tap('#fab'); }],
      ['settings', async () => { await closeSheet(page); await page.tap('#btnSettings'); }], ['friends', async () => { await closeSheet(page); await page.tap('#tabFriends'); }]];
    for (const [name, go] of screens) { if (go) { await go(); await page.waitForTimeout(400); } assert.equal(await noSideScroll(page), true, `${name} on ${device}`); }
  }
});
