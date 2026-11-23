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
  assert.equal(await page.$$eval('#sheetBody .form > .field', f => f.length), 4, 'only Picture, Title, Type and How often before More options');
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

/* ---------- Phase 1 ---------- */
test('undo: a calendar tap can be undone and the saved data goes back exactly', async () => {
  const { page, key } = await open();
  await openStreak(page, 'h1');
  const day = await page.evaluate(k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); }, key(12));
  const cell = `button.cd[data-d="${day}"]`;
  if (!(await page.$(cell))) { await page.tap('[data-act="mprev"]'); await page.waitForTimeout(200); }
  const before = await doc(page, 'h1');
  await page.tap(cell); await settle(page);
  assert.match(await page.textContent('#toast span'), /: done$/);
  assert.equal(await page.textContent('.bignum'), '12');
  await page.tap('#undoBtn'); await settle(page);
  assert.equal(await page.textContent('.bignum'), '11');
  const after = await doc(page, 'h1');
  assert.deepEqual([after.log, after.skip, after.start], [before.log, before.skip, before.start]);
});

test('undo: + and − and Rest day can each be undone', async () => {
  const { page, today } = await open();
  await openStreak(page, 'h1');
  await page.tap('[data-act="inc"]'); await settle(page);
  assert.equal((await doc(page, 'h1')).log[today], 1);
  await page.tap('#undoBtn'); await settle(page);
  assert.equal((await doc(page, 'h1')).log[today], undefined);
  await page.tap('[data-act="rest"]'); await settle(page);
  assert.equal((await doc(page, 'h1')).skip[today], 1);
  await page.tap('#undoBtn'); await settle(page);
  assert.equal((await doc(page, 'h1')).skip[today], undefined);
  assert.equal(await page.textContent('.bignum'), '11');
});

test('a double-tap on a streak already done today asks instead of counting twice', async () => {
  const { page, today } = await open();
  assert.equal((await doc(page, 'h3')).log[today], 1);
  await page.dblclick('.tile[data-id="h3"]'); await settle(page);
  assert.match(await page.textContent('#toast span'), /already done today/);
  assert.equal((await doc(page, 'h3')).log[today], 1, 'not counted twice');
  await page.tap('#undoBtn'); await settle(page);
  assert.equal((await doc(page, 'h3')).log[today], 2, '"Add again" counts it');
  await page.tap('#undoBtn'); await settle(page);
  assert.equal((await doc(page, 'h3')).log[today], 1, 'and that can be undone too');
});

test('archive: an "Archived" link on the dashboard opens the archived streaks, with their history', async () => {
  const { page, errors } = await open();
  assert.equal(await page.$$eval('[data-act="archived"]', x => x.length), 0, 'no link when nothing is archived');
  await openStreak(page, 'h1'); await page.tap('[data-act="archive"]'); await settle(page);
  assert.equal(await page.textContent('[data-act="archived"]'), 'Archived (1)');
  await page.tap('[data-act="archived"]'); await page.waitForTimeout(400);
  assert.match(await page.textContent('#sheetBody .srow'), /Read 20 pages.*11 check-ins · best 11 days/);
  assert.match(await page.textContent('#sheetBody .hint'), /history kept/);
  await page.tap('[data-act="unarchive"][data-id="h1"]'); await settle(page);
  assert.match(await page.textContent('#sheetBody'), /Nothing archived/);
  await closeSheet(page);
  assert.equal(await page.$$eval('[data-act="archived"]', x => x.length), 0);
  assert.equal(await page.textContent('.tile[data-id="h1"] .tile-streak b'), '11');
  noErrors(errors);
});

test('archive: deleting from the archived list asks first and can be undone', async () => {
  const { page } = await open();
  await openStreak(page, 'h1'); await page.tap('[data-act="archive"]'); await settle(page);
  await page.tap('[data-act="archived"]'); await page.waitForTimeout(400);
  await page.tap('[data-act="delArch"][data-id="h1"]');
  assert.equal(await page.isVisible('[data-act="delArchYes"]'), true);
  await page.tap('[data-act="delArchYes"]'); await settle(page);
  assert.equal(await doc(page, 'h1'), null);
  await page.tap('#undoBtn'); await settle(page);
  assert.equal((await doc(page, 'h1')).archived, true);
  assert.equal(Object.keys((await doc(page, 'h1')).log).length, 11);
});

test('archive: with every streak archived, the dashboard still offers the archived link', async () => {
  const { page } = await open();
  for (const id of ['h1', 'h2', 'h3']) { await openStreak(page, id); await page.tap('[data-act="archive"]'); await settle(page); }
  assert.match(await page.textContent('#empty'), /No streaks yet/);
  assert.equal(await page.textContent('[data-act="archived"]'), 'Archived (3)');
});

const setOwnReminder = async (page, id, mode, time) => {
  await openStreak(page, id); await page.tap('[data-act="edit"]'); await page.tap('[data-act="more"]');
  await page.tap(`[data-act="rmode"][data-v="${mode}"]`);
  if (time) { await page.fill('#f-remind', time); await page.dispatchEvent('#f-remind', 'change'); }
  await page.tap('[data-act="save"]'); await settle(page); await closeSheet(page);
};
const reminderText = page => page.$eval('.reminder span', x => x.textContent).catch(() => null);

test('reminders: a streak with its own time reminds even when the default reminder is off, and stops once done', async () => {
  const { page } = await open();
  assert.equal(await reminderText(page), null);
  await setOwnReminder(page, 'h1', 'custom', '00:00');
  assert.equal(await reminderText(page), 'Read 20 pages is still to do today.');
  assert.equal((await doc(page, 'h1')).remindMode, 'custom'); assert.equal((await doc(page, 'h1')).remindAt, '00:00');
  await page.dblclick('.tile[data-id="h1"]'); await settle(page);
  assert.equal(await reminderText(page), null, 'no reminder once it is done');
});

test('reminders: a streak set to Off is left out of the default reminder', async () => {
  const { page } = await open();
  await page.tap('#btnSettings'); await page.tap('[data-act="toggle"][data-k="remind"]');
  await page.fill('#s-remind', '00:00'); await page.dispatchEvent('#s-remind', 'change'); await closeSheet(page);
  assert.equal(await reminderText(page), '2 streaks are still to do today.');
  await setOwnReminder(page, 'h1', 'off');
  assert.equal(await reminderText(page), 'Drink water is still to do today.');
});

test('reminders: quiet hours silence them', async () => {
  const { page } = await open();
  await setOwnReminder(page, 'h1', 'custom', '00:00');
  assert.ok(await reminderText(page));
  const [from, to] = await page.evaluate(() => { const n = new Date(), p = x => String(x).padStart(2, '0'), a = new Date(n - 36e5), b = new Date(+n + 36e5); return [`${p(a.getHours())}:${p(a.getMinutes())}`, `${p(b.getHours())}:${p(b.getMinutes())}`]; });
  await page.tap('#btnSettings'); await page.tap('[data-act="toggle"][data-k="quiet"]');
  await page.fill('#s-qfrom', from); await page.dispatchEvent('#s-qfrom', 'change');
  await page.fill('#s-qto', to); await page.dispatchEvent('#s-qto', 'change'); await closeSheet(page);
  assert.equal(await reminderText(page), null);
  const s = await doc(page, 'settings');
  assert.deepEqual([s.quiet, s.quietFrom, s.quietTo], [true, from, to]);
});

test('reminders: never on a day the streak is not scheduled', async () => {
  const { page } = await open();
  await openStreak(page, 'h1'); await page.tap('[data-act="edit"]'); await page.tap('[data-act="stype"][data-v="weekdays"]');
  const dow = await page.evaluate(() => new Date().getDay());
  const on = await page.$eval(`[data-act="wday"][data-v="${dow}"]`, b => b.getAttribute('aria-pressed') === 'true');
  if (on) await page.tap(`[data-act="wday"][data-v="${dow}"]`);
  await page.tap('[data-act="more"]'); await page.tap('[data-act="rmode"][data-v="custom"]'); await page.fill('#f-remind', '00:00'); await page.dispatchEvent('#f-remind', 'change');
  await page.tap('[data-act="save"]'); await settle(page); await closeSheet(page);
  assert.equal(await reminderText(page), null);
});

test('reminders: "Got it" hides the current ones, but a reminder that comes due later still shows', async () => {
  const { page } = await open();
  await setOwnReminder(page, 'h2', 'custom', '00:00');
  assert.equal(await reminderText(page), 'Drink water is still to do today.');
  await page.tap('[data-act="remindOk"]'); assert.equal(await reminderText(page), null);
  await setOwnReminder(page, 'h1', 'custom', '00:00');
  assert.equal(await reminderText(page), 'Read 20 pages is still to do today.');
});

const centre = (page, sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
async function touchDrag(page, from, to, { hold = 600, steps = 8 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await t('touchStart', from[0], from[1]); await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) { await t('touchMove', from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); await page.waitForTimeout(30); }
  await t('touchEnd'); await page.waitForTimeout(400);
}
const order = page => page.$$eval('#list .tile .nm, #list .card .nm', x => x.map(t => t.textContent));

test('drag to reorder (touch): press and hold, then drag; the new order is saved and nothing opens', async () => {
  const { page, errors } = await open();
  assert.deepEqual(await order(page), ['Read 20 pages', 'Drink water', 'Run']);
  await touchDrag(page, await centre(page, '.tile[data-id="h1"]'), (await centre(page, '.tile[data-id="h2"]')).map((v, i) => v + (i === 0 ? 30 : 0)));
  await settle(page);
  assert.deepEqual(await order(page), ['Drink water', 'Read 20 pages', 'Run']);
  assert.ok((await doc(page, 'h1')).order > (await doc(page, 'h2')).order);
  assert.equal(await page.isVisible('#sheet'), false, 'letting go after a hold does not open the streak');
  assert.equal(await page.$$eval('.lifted', x => x.length), 0);
  assert.equal((await doc(page, 'h1')).log[(await page.evaluate(() => new Date().toISOString().slice(0, 10)))], undefined, 'and nothing was counted');
  noErrors(errors);
});

test('drag to reorder (mouse): works on a computer too', async () => {
  const { page } = await open({ device: 'Desktop Chrome' });
  const [x1, y1] = await centre(page, '.tile[data-id="h1"]'), [x2, y2] = await centre(page, '.tile[data-id="h2"]');
  await page.mouse.move(x1, y1); await page.mouse.down(); await page.waitForTimeout(600);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x1 + (x2 + 30 - x1) * i / 8, y1 + (y2 - y1) * i / 8); await page.waitForTimeout(30); }
  await page.mouse.up(); await settle(page);
  assert.deepEqual(await order(page), ['Drink water', 'Read 20 pages', 'Run']);
  assert.equal(await page.isVisible('#sheet'), false);
});

test('drag to reorder: a quick swipe scrolls instead of lifting a card', async () => {
  const { page } = await open();
  await touchDrag(page, await centre(page, '.tile[data-id="h1"]'), await centre(page, '.tile[data-id="h2"]'), { hold: 50 });
  await settle(page);
  assert.deepEqual(await order(page), ['Read 20 pages', 'Drink water', 'Run']);
  assert.equal(await page.$$eval('.lifted', x => x.length), 0);
});

test('drag to reorder: holding without moving and letting go does nothing', async () => {
  const { page } = await open();
  const p = await centre(page, '.tile[data-id="h1"]');
  await touchDrag(page, p, p, { steps: 1 });
  await settle(page);
  assert.equal(await page.isVisible('#sheet'), false);
  assert.deepEqual(await order(page), ['Read 20 pages', 'Drink water', 'Run']);
});

test('drag to reorder: dragging while sorted by name switches to "My order" so the result stays put', async () => {
  const { page } = await open();
  await page.tap('#btnSettings'); await page.selectOption('#s-sort', 'name'); await closeSheet(page);
  assert.deepEqual(await order(page), ['Drink water', 'Read 20 pages', 'Run']);
  await touchDrag(page, await centre(page, '.tile[data-id="h2"]'), (await centre(page, '.tile[data-id="h1"]')).map((v, i) => v + (i === 0 ? 30 : 0)));
  await settle(page);
  assert.equal((await doc(page, 'settings')).sort, 'manual');
  assert.deepEqual(await order(page), ['Read 20 pages', 'Drink water', 'Run']);
});

test('scheduling: a streak not scheduled today says so calmly, on the card and its page', async () => {
  const { page } = await open();
  await openStreak(page, 'h1'); await page.tap('[data-act="edit"]'); await page.tap('[data-act="stype"][data-v="weekdays"]');
  const dow = await page.evaluate(() => new Date().getDay());
  if (await page.$eval(`[data-act="wday"][data-v="${dow}"]`, b => b.getAttribute('aria-pressed') === 'true')) await page.tap(`[data-act="wday"][data-v="${dow}"]`);
  await page.tap('[data-act="save"]'); await settle(page);
  assert.match(await page.textContent('.line'), /^Not scheduled today\. Next: /);
  await closeSheet(page);
  assert.equal(await page.textContent('.tile[data-id="h1"] .meta'), 'Not scheduled today');
});

test('drag to reorder: after a drag, the very next tap works normally', async () => {
  const { page } = await open();
  await touchDrag(page, await centre(page, '.tile[data-id="h1"]'), (await centre(page, '.tile[data-id="h2"]')).map((v, i) => v + (i === 0 ? 30 : 0)));
  await settle(page);
  await page.tap('#btnSettings'); await page.waitForTimeout(400);
  assert.equal(await page.isVisible('#sheet .settings'), true, 'the first tap after a drag was not swallowed');
  await closeSheet(page);
  await page.tap('.tile[data-id="h3"]'); await page.waitForTimeout(500);
  assert.equal(await page.isVisible('#sheet .detail'), true);
});

/* ---------- Phase 2 ---------- */
const newOfType = async (page, { name, kind, unit, goal, step, period }) => {
  await page.tap(await page.$('.empty-card [data-act="new"]') ? '.empty-card [data-act="new"]' : '#fab');
  await page.tap('.preset[data-i="0"]'); await page.fill('#f-name', name);
  await page.tap(`[data-act="ktype"][data-v="${kind}"]`);
  if (unit !== undefined) await page.fill('#f-unit', unit);
  if (goal !== undefined) await page.fill('#f-goal', String(goal));
  if (period) await page.tap(`[data-act="gper"][data-v="${period}"]`);
  if (step !== undefined) await page.fill('#f-step', String(step));
  await page.tap('[data-act="save"]'); await settle(page);
  return page.evaluate(n => Object.values(Object.fromEntries(window.__store)).find(d => d.name === n), name);
};
const tileOf = (page, name) => page.$eval(`.tile:has(.nm:text-is("${name}"))`, t => ({ big: t.querySelector('.tile-streak b').textContent, small: t.querySelector('.tile-streak small').textContent, meta: t.querySelector('.meta').textContent, id: t.dataset.id }));

test('counter: no schedule, each double-tap adds to the total, and it is never "already done"', async () => {
  const { page, today, errors } = await open({ empty: true });
  await page.tap('.empty-card [data-act="new"]'); await page.tap('[data-act="ktype"][data-v="counter"]');
  assert.equal(await page.$$eval('[data-act="stype"]', x => x.length), 0, 'no schedule for counters');
  await page.tap('.sh-head [data-act="close"]'); await page.waitForTimeout(300);
  const saved = await newOfType(page, { name: 'Books read', kind: 'counter', unit: 'books' });
  assert.equal(saved.kind, 'counter'); assert.equal(saved.unit, 'books');
  const id = (await tileOf(page, 'Books read')).id;
  for (let i = 0; i < 3; i++) { await page.dblclick(`.tile[data-id="${id}"]`); await page.waitForTimeout(400); }
  await settle(page);
  assert.deepEqual(await tileOf(page, 'Books read').then(x => [x.big, x.small, x.meta]), ['3', 'books', '+3 today']);
  assert.equal((await doc(page, id)).log[today], 3);
  assert.match(await page.textContent('#summary'), /Nothing due today/, 'counters are never "due"');
  noErrors(errors);
});

test('goal (daily): a target with +5 increments; the day completes at the target', async () => {
  const { page, today } = await open({ empty: true });
  const saved = await newOfType(page, { name: 'Read', kind: 'goal', unit: 'pages', goal: 20, step: 5 });
  assert.deepEqual([saved.kind, saved.goal, saved.step, saved.period], ['goal', 20, 5, 'day']);
  const id = saved.id;
  await page.dblclick(`.tile[data-id="${id}"]`); await page.waitForTimeout(150);
  assert.deepEqual(await page.$$eval('.burst', x => x.map(b => b.textContent)), ['+5']);
  for (let i = 0; i < 3; i++) { await page.dblclick(`.tile[data-id="${id}"]`); await page.waitForTimeout(400); }
  await settle(page);
  assert.equal((await doc(page, id)).log[today], 20);
  assert.deepEqual(await tileOf(page, 'Read').then(x => [x.big, x.small]), ['20', '/ 20 pages']);
  assert.equal(await page.$$eval(`.tile[data-id="${id}"] .badge.on`, x => x.length), 1);
  assert.match(await page.textContent('#summary'), /All done today/);
});

test('goal (weekly): amounts add up across the week', async () => {
  const { page, today } = await open({ empty: true });
  const saved = await newOfType(page, { name: 'Push-ups', kind: 'goal', unit: 'push-ups', goal: 100, step: 25, period: 'week' });
  for (let i = 0; i < 2; i++) { await page.dblclick(`.tile[data-id="${saved.id}"]`); await page.waitForTimeout(400); }
  await settle(page);
  assert.deepEqual(await tileOf(page, 'Push-ups').then(x => [x.big, x.small]), ['50', '/ 100 push-ups']);
  const bar = await page.$eval(`.tile[data-id="${saved.id}"] .bar`, b => [b.getBoundingClientRect().width, b.querySelector('i').getBoundingClientRect().width]);
  assert.ok(bar[0] > 50 && Math.abs(bar[1] / bar[0] - 0.5) < 0.02, 'the tile\'s progress bar is visible and half full: ' + bar);
  await page.tap(`.tile[data-id="${saved.id}"]`); await page.waitForTimeout(500);
  assert.match(await page.textContent('.line'), /50 push-ups to go this week/);
});

test('counter: a past day can be corrected from its calendar', async () => {
  const { page, key } = await open({ empty: true });
  const saved = await newOfType(page, { name: 'Games won', kind: 'counter', unit: 'games' });
  await page.tap(`.tile[data-id="${saved.id}"]`); await page.waitForTimeout(500);
  const d = await page.evaluate(k => { const [y, m, dd] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 864e5); }, key(3));
  if (!(await page.$(`button.cd[data-d="${d}"]`))) { await page.tap('[data-act="mprev"]'); await page.waitForTimeout(200); }
  await page.tap(`button.cd[data-d="${d}"]`); await page.waitForTimeout(200);
  assert.equal(await page.isVisible('[data-act="dsel"].link'), true, '"Back to today" appears');
  await page.tap('[data-act="inc"]'); await settle(page); await page.tap('[data-act="inc"]'); await settle(page);
  assert.equal((await doc(page, saved.id)).log[key(3)], 2);
  assert.equal(await page.textContent('.bignum'), '2');
  await page.tap('[data-act="dec"]'); await settle(page);
  assert.equal((await doc(page, saved.id)).log[key(3)], 1);
  await page.tap('#undoBtn'); await settle(page);
  assert.equal((await doc(page, saved.id)).log[key(3)], 2, 'corrections can be undone too');
});

test('milestones: the streak page shows earned milestones with dates and how far the next one is', async () => {
  const { page, key } = await open();
  await openStreak(page, 'h1');
  const m = await page.$$eval('.mile', x => x.map(li => [li.className.replace('mile', '').trim(), li.querySelector('b').textContent, li.querySelector('small').textContent]));
  assert.deepEqual(m[0].slice(0, 2), ['on', '7']); assert.deepEqual(m[1], ['next', '30', '19 to go']); assert.deepEqual(m.slice(2).map(x => x[1]), ['100', '365']);
});

test('milestones: reaching one shows a quiet message, not a pop-up', async () => {
  const s = makeSeed(); const k = s.key;
  s.seed['data/users/u_me/h1'].log = Object.fromEntries([6, 5, 4, 3, 2, 1].map(n => [k(n), 1]));
  const { page } = await openClaude({ init: mockClaude, initArg: { seed: s.seed } });
  await page.dblclick('.tile[data-id="h1"]'); await settle(page);
  assert.equal(await page.textContent('#toast span'), 'Milestone: 7 days in a row · Read 20 pages');
  assert.equal(await page.$eval('#toast', t => t.classList.contains('big')), false);
});

test('changing an existing streak into a counter keeps its history', async () => {
  const { page } = await open();
  await openStreak(page, 'h1'); await page.tap('[data-act="edit"]'); await page.tap('[data-act="ktype"][data-v="counter"]'); await page.fill('#f-unit', 'sessions');
  await page.tap('[data-act="save"]'); await settle(page);
  const d = await doc(page, 'h1');
  assert.equal(d.kind, 'counter'); assert.equal(Object.keys(d.log).length, 11);
  assert.equal(await page.textContent('.bignum'), '11');
});

test("friends: a friend's counter shows its total", async () => {
  const s = makeSeed();
  s.seed['people/u_ana/streaks/ha2'] = { id: 'ha2', kind: 'counter', unit: 'books', name: 'Books', icon: '📚', color: '#5f8f3e', sched: { type: 'daily' }, goal: 1, start: '2026-01-01', log: { '2026-01-02': 3, '2026-02-01': 4 }, skip: {}, order: 2 };
  const { page } = await openClaude({ init: mockClaude, initArg: { seed: s.seed } });
  await page.tap('#tabFriends'); await page.waitForTimeout(400);
  await page.tap('[data-act="follow"][data-id="u_ana"]'); await page.waitForSelector('.mini');
  assert.deepEqual(await page.$$eval('.mini', m => m.map(x => x.getAttribute('aria-label'))), ['Morning swim: 16 days, done today', 'Books: 7 books']);
});

/* ---------- Weekly recap ---------- */
function recapSeed() {
  const D = (a, b) => { const o = {}; for (let d = Date.UTC(2026, 10, a); d <= Date.UTC(2026, 10, b); d += 864e5) o[new Date(d).toISOString().slice(0, 10)] = 1; return o; };
  const me = 'data/users/u_me/';
  return {
    [me + 'h1']: { id: 'h1', name: 'Read', icon: '📚', color: '#5f8f3e', sched: { type: 'daily' }, goal: 1, start: '2026-11-02', log: D(3, 15), skip: {}, order: 1 },
    [me + 'h2']: { id: 'h2', name: 'Gym', icon: '💪', color: '#b5523b', sched: { type: 'weekdays', days: [1, 3, 5] }, goal: 1, start: '2026-11-02', log: { '2026-11-02': 1, '2026-11-04': 1, '2026-11-06': 1, '2026-11-09': 1, '2026-11-11': 1 }, skip: {}, order: 2 },
    [me + 'h3']: { id: 'h3', kind: 'counter', unit: 'books', name: 'Books', icon: '📖', color: '#4f7aa3', sched: { type: 'daily' }, goal: 1, start: '2026-11-02', log: { '2026-11-03': 1, '2026-11-10': 3, '2026-11-14': 2 }, skip: {}, order: 3 },
    [me + 'settings']: { theme: 'forest', layout: 'grid', remind: false, weekStart: 1 },
  };
}
test('weekly recap: on the first day of the week a card sums up last week, and opens the recap', async () => {
  const { page, errors } = await openClaude({ init: mockClaude, initArg: { seed: recapSeed() }, clock: '2026-11-16T09:00:00' });
  assert.equal(await page.textContent('.recap-t span'), '90% done · 11 check-ins · 1 milestone');
  await page.tap('.recap-card [data-act="recap"]'); await page.waitForTimeout(500);
  const stats = await page.$$eval('.recap-stats > div', x => x.map(d => [...d.children].map(c => c.textContent)));
  assert.deepEqual(stats, [['Completion', '90%', 'same as the week before'], ['Check-ins', '11', '+1 on the week before'], ['Total counted', '14', '+4 on the week before'], ['Longest streak', '13 days', 'Read']]);
  assert.match(await page.textContent('#sheetBody'), /Read7 days · Nov 9/);
  assert.deepEqual(await page.$$eval('.recap-n', x => x.map(n => n.textContent)), ['7 of 7', '2 of 3', '+5']);
  assert.equal(await page.evaluate(() => window.__store.get('data/users/u_me/settings').recapSeen), '2026-11-09', 'opening it marks this week\'s card as seen');
  await page.tap('[data-act="recapNav"][data-d="-7"]');
  assert.match(await page.textContent('#sheetBody h3'), /Week of Nov 2/);
  await page.tap('.sh-head [data-act="close"]'); await page.waitForTimeout(300);
  assert.equal(await page.$$eval('.recap-card', x => x.length), 0);
  noErrors(errors);
});
test('weekly recap: the card can be dismissed, and the recap is always in Settings', async () => {
  const { page } = await openClaude({ init: mockClaude, initArg: { seed: recapSeed() }, clock: '2026-11-16T09:00:00' });
  await page.tap('.recap-card [data-act="recapSeen"]'); await page.waitForTimeout(400);
  assert.equal(await page.$$eval('.recap-card', x => x.length), 0);
  await page.tap('#btnSettings'); await page.tap('[data-act="recap"]'); await page.waitForTimeout(400);
  assert.match(await page.textContent('#sheetBody h3'), /Week of Nov 9/);
});
test('weekly recap: no card later in the week', async () => {
  const { page } = await openClaude({ init: mockClaude, initArg: { seed: recapSeed() }, clock: '2026-11-18T09:00:00' });
  assert.equal(await page.$$eval('.recap-card', x => x.length), 0);
});

/* ---------- Syncing and offline ---------- */
// Opens the app with something already remembered on this phone (as if it was used before, maybe offline).
const withMemory = async (store, mem, o = {}) => openClaude({ ...o, init: ([m, arg, ls]) => { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); eval('(' + m + ')')(arg); }, initArg: [mockClaude.toString(), { seed: store }, mem] });
const memory = (habits, o = {}) => ({ 'unbroken:v1': JSON.stringify({ v: 2, mode: 'cloud', habits, settings: { theme: 'forest', layout: 'grid' }, social: { following: [] }, dirty: {}, ...o }) });
test('syncing: a phone that was offline with an unsent change does not erase a check-in made on another phone', async () => {
  const s = makeSeed({ friends: false }), cloud = JSON.parse(JSON.stringify(s.seed)), h1 = cloud['data/users/u_me/h1'];
  const base = JSON.parse(JSON.stringify(h1)), mine = { ...JSON.parse(JSON.stringify(h1)), note: 'edited offline' };
  h1.log[s.today] = 1;   // the other phone checked in today, after this phone went offline
  const { page, errors } = await withMemory(cloud, memory({ h1: mine }, { dirty: { h1: 1 }, base: { h1: base } }));
  await settle(page);
  const d = await doc(page, 'h1');
  assert.equal(d.log[s.today], 1, "the other phone's check-in is kept"); assert.equal(d.note, 'edited offline', "this phone's change is kept");
  assert.match(await page.textContent('.tile[data-id="h1"]'), /12/, 'the tile shows the combined streak');
  noErrors(errors);
});
test('syncing: memory saved by the previous version (no record of the account\'s copy) never loses check-ins', async () => {
  const s = makeSeed({ friends: false }), cloud = JSON.parse(JSON.stringify(s.seed)), mine = { ...JSON.parse(JSON.stringify(cloud['data/users/u_me/h1'])), note: 'old version' };
  cloud['data/users/u_me/h1'].log[s.today] = 1;
  const { page } = await withMemory(cloud, memory({ h1: mine }, { dirty: { h1: 1 } }));
  await settle(page);
  const d = await doc(page, 'h1'); assert.equal(d.log[s.today], 1); assert.equal(d.note, 'old version');
});
test('syncing: a streak deleted on another phone stays deleted, even with an unsent change here', async () => {
  const s = makeSeed({ friends: false }), cloud = JSON.parse(JSON.stringify(s.seed)), base = JSON.parse(JSON.stringify(cloud['data/users/u_me/h3']));
  delete cloud['data/users/u_me/h3'];
  const { page, errors } = await withMemory(cloud, memory({ h3: { ...base, note: 'x' } }, { dirty: { h3: 1 }, base: { h3: base } }));
  await settle(page);
  assert.equal(await doc(page, 'h3'), null); assert.equal(await page.$$eval('.tile[data-id="h3"]', x => x.length), 0);
  noErrors(errors);
});
test('syncing: a check-in made while the account can\'t be reached is kept, survives a reload, and saves once it can', async () => {
  const { page, errors, today } = await open({ friends: false });
  await page.evaluate(() => { window.__failWrites = 99; });
  await page.dblclick('.tile[data-id="h1"] .media'); await page.waitForTimeout(400);
  assert.equal((await doc(page, 'h1')).log[today], undefined, 'not saved to the account yet');
  const mem = await page.evaluate(() => JSON.parse(localStorage.getItem('unbroken:v1')));
  assert.equal(mem.habits.h1.log[today], 1, 'kept on this phone'); assert.equal(mem.dirty.h1, 1, 'marked as waiting');
  await page.reload(); await page.evaluate(() => { window.__failWrites = 0; }); await page.waitForTimeout(2500);
  assert.equal((await doc(page, 'h1')).log[today], 1, 'saved after the reload');
  noErrors(errors);
});
test('syncing: after repeated failures the app says changes are waiting, keeps trying, and clears the message once saved', async () => {
  const { page, errors, today } = await open({ friends: false });
  await page.evaluate(() => { window.__failWrites = 99; });
  await page.dblclick('.tile[data-id="h1"] .media');
  await page.waitForFunction(() => /waiting to sync/.test(document.querySelector('#storeNote').textContent) && !document.querySelector('#notice').hidden, null, { timeout: 25000 });
  await page.evaluate(() => { window.__failWrites = 0; });
  await page.waitForFunction(t => (window.__store.get('data/users/u_me/h1').log || {})[t] === 1, today, { timeout: 20000 });
  await page.waitForTimeout(300);
  assert.equal(await page.$eval('#notice', n => n.hidden), true, 'the warning goes away');
  assert.match(await page.textContent('#storeNote'), /Synced/);
  noErrors(errors);
});
test('saving: when the phone\'s storage is full the app says so instead of failing silently', async () => {
  const { page, errors } = await open({ friends: false });
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.dblclick('.tile[data-id="h1"] .media'); await page.waitForTimeout(300);
  assert.match(await page.textContent('#notice'), /out of storage space/);
  noErrors(errors);
});
test('saving: when storage is nearly full, photos are left out of the phone\'s copy (they stay in the account) so changes still fit', async () => {
  const s = makeSeed({ friends: false }), pic = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
  s.seed['data/users/u_me/h1'].photo = pic; s.seed['data/users/u_me/h1'].photoOk = true;
  const { page } = await openClaude({ init: mockClaude, initArg: { seed: s.seed } });
  await page.evaluate(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(v).length > 3000 && /data:image/.test(v)) throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); }; });
  await page.dblclick('.tile[data-id="h2"] .media'); await page.waitForTimeout(400);
  const mem = await page.evaluate(() => JSON.parse(localStorage.getItem('unbroken:v1')));
  assert.equal(mem.lite, 1); assert.equal(mem.habits.h1.photo, ''); assert.equal(mem.habits.h2.log[s.today], 4);
  assert.equal(await page.$eval('#notice', n => n.hidden), true, 'no warning needed');
  assert.equal((await doc(page, 'h1')).photo, pic, 'the photo is untouched in the account');
});
test('syncing: a save that reached the account but whose answer was lost is not counted twice', async () => {
  const { page, errors, today } = await open({ friends: false });
  await page.evaluate(() => { window.__loseAnswers = 1; });
  await page.dblclick('.tile[data-id="h2"] .media');   // goal 8: 3 → 4
  await page.waitForTimeout(4500);
  assert.equal((await doc(page, 'h2')).log[today], 4, 'one check-in, saved once');
  assert.match(await page.textContent('.tile[data-id="h2"]'), /4/);
  noErrors(errors);
});
test('syncing: a lost answer is still recognised after the app is closed and opened again', async () => {
  const { page, today } = await open({ friends: false });
  await page.evaluate(() => { window.__loseAnswers = 1; });
  await page.dblclick('.tile[data-id="h2"] .media'); await page.waitForTimeout(700);
  assert.equal((await doc(page, 'h2')).log[today], 4, 'the save reached the account');
  await page.reload(); await page.waitForTimeout(2500);   // closed before it could try again
  assert.equal((await doc(page, 'h2')).log[today], 4);
});
test('syncing: an undo made while the check-in is still saving is not lost', async () => {
  const { page, errors, today } = await open({ friends: false });
  await page.evaluate(() => { window.__slowWrites = 1200; });
  await page.dblclick('.tile[data-id="h1"] .media'); await page.waitForTimeout(500);
  await page.tap('#undoBtn'); await page.waitForTimeout(3500);
  assert.equal((await doc(page, 'h1')).log[today], undefined, 'the undo wins');
  assert.doesNotMatch(await page.textContent('.tile[data-id="h1"]'), /\b12\b/);
  noErrors(errors);
});
test('older version: the previous app version opens memory saved by this version and keeps working', async () => {
  const old = require('child_process').execFileSync('git', ['show', 'backup/before-reliability-fixes:app/unbroken.html'], { cwd: require('path').join(__dirname, '..') }).toString();
  const s = makeSeed({ friends: false }), cloud = JSON.parse(JSON.stringify(s.seed)), base = JSON.parse(JSON.stringify(cloud['data/users/u_me/h1']));
  const mine = { ...base, note: 'from new version', log: { ...base.log, [s.today]: 1 } };
  const cur = require('fs').readFileSync(require('path').join(__dirname, '../app/unbroken.html'), 'utf8'), html = claudePage().split(cur).join(old);
  assert.ok(!html.includes('mergeDoc'), 'running the previous version');
  const { page, errors } = await openClaude({ html, init: ([m, arg, ls]) => { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); eval('(' + m + ')')(arg); }, initArg: [mockClaude.toString(), { seed: cloud }, memory({ h1: mine }, { dirty: { h1: 1 }, base: { h1: base }, tries: { h1: { rev: 'abc', sent: mine } }, lite: 1 })] });
  await settle(page);
  const d = await doc(page, 'h1'); assert.equal(d.note, 'from new version'); assert.equal(d.log[s.today], 1);
  noErrors(errors);
});
test('syncing: the first follow and the first settings change after a reload are saved, even if the account never had them', async () => {
  const s = makeSeed(), cloud = JSON.parse(JSON.stringify(s.seed)); delete cloud['data/users/u_me/settings'];
  const habits = {}; for (const id of ['h1', 'h2', 'h3']) habits[id] = cloud['data/users/u_me/' + id];
  const { page, errors } = await withMemory(cloud, memory(habits, { srv: ['h1', 'h2', 'h3'] }));
  await settle(page);
  await page.tap('#tabFriends'); await page.waitForSelector('.prow');
  await page.tap('.prow:has-text("Ana") [data-act="follow"]'); await page.waitForTimeout(2000);
  assert.deepEqual((await doc(page, 'social') || {}).following, ['u_ana'], 'the follow is saved');
  assert.equal(await page.$$eval('.mini', x => x.length), 1, "and Ana's streak stays on screen");
  await page.tap('#btnSettings'); await page.tap('[data-act="set"][data-k="layout"][data-v="list"]'); await page.waitForTimeout(2000);
  assert.equal((await doc(page, 'settings') || {}).layout, 'list', 'the setting is saved, not reset');
  noErrors(errors);
});
test('syncing: memory from before this fix (no record of what the account holds) does not reset the follow list or settings', async () => {
  const s = makeSeed(), cloud = JSON.parse(JSON.stringify(s.seed)); delete cloud['data/users/u_me/settings'];
  const habits = {}; for (const id of ['h1', 'h2', 'h3']) habits[id] = cloud['data/users/u_me/' + id];
  const { page } = await withMemory(cloud, memory(habits));
  await settle(page);
  await page.tap('#tabFriends'); await page.waitForSelector('.prow'); await page.tap('.prow:has-text("Ana") [data-act="follow"]'); await page.waitForTimeout(2000);
  assert.deepEqual((await doc(page, 'social') || {}).following, ['u_ana']);
});
