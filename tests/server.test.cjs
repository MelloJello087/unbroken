// Server tests: accounts, password rules, privacy rules, the sign-up limit and syncing, against a real Supabase project.
// Needs SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. Clean-up and the sign-up-limit test also need the Supabase
// management API (SUPABASE_PROJECT_REF, plus SUPABASE_ACCESS_TOKEN unless a proxy adds it). Values come from the
// environment only; never write them into this repository. Every account made here is "motif-test-…@example.com" and deleted afterwards.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_PUBLISHABLE_KEY, REF = process.env.SUPABASE_PROJECT_REF;
// These tests create and delete accounts. They refuse the real (production) project unless MOTIF_ALLOW_PRODUCTION_TESTS=yes is set
// on purpose; use the separate test project (motif-test) instead.
const PRODUCTION_REF = 'balhwwuhluzebtiqpfah';
const onProduction = [URL_, REF].some(v => String(v || '').includes(PRODUCTION_REF)) && process.env.MOTIF_ALLOW_PRODUCTION_TESTS !== 'yes';
const skip = !URL_ || !KEY ? 'set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to run the server tests'
  : onProduction ? 'refusing to run against the production project; point SUPABASE_URL and SUPABASE_PROJECT_REF at the test project' : false;
if (URL_ && REF && !URL_.includes(REF)) throw new Error('SUPABASE_URL and SUPABASE_PROJECT_REF point at different projects');
const RUN = 'motif-test-' + Date.now().toString(36), STARTED = new Date().toISOString();
const email = n => `${RUN}-${n}@example.com`, PW = 'Green#Leaf42';

async function call(method, p, { body, token, prefer } = {}) {
  const r = await fetch(URL_ + p, { method, headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || KEY), ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
  return { status: r.status, json };
}
const signup = n => call('POST', '/auth/v1/signup', { body: { email: email(n), password: PW } });
async function sql(query) {
  if (!REF) return null;
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.SUPABASE_ACCESS_TOKEN ? { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN } : {}) }, body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error('management API ' + r.status);
  return r.json();
}
async function cleanup() {
  if (!REF) return;
  await sql(`delete from private.config where k in (select 'min_app:' || id from auth.users where email like '${RUN}-%@example.com'); delete from auth.users where email like '${RUN}-%@example.com'; delete from private.signup_networks where first_signup >= '${STARTED}';`);
}
const servers = [];
test.after(async () => { await cleanup(); servers.forEach(x => x.close()); try { await require('./lib/browser.cjs').close(); } catch (e) {} });

test('password rules: each missing requirement is refused by the server', { skip }, async () => {
  for (const [why, pw] of [['too short', 'Ab1!x'], ['no uppercase', 'green#leaf42'], ['no lowercase', 'GREEN#LEAF42'], ['no number', 'Green#Leafy'], ['no symbol', 'GreenLeaf42']]) {
    const r = await call('POST', '/auth/v1/signup', { body: { email: email('weak'), password: pw } });
    assert.equal(r.status, 422, why); assert.equal(r.json.error_code, 'weak_password', why);
  }
});

test('accounts: sign up, log in, wrong password, duplicate email, log out', { skip }, async () => {
  const a = await signup('a'); assert.equal(a.status, 200); assert.ok(a.json.access_token, 'signed in straight away, no email check');
  const again = await signup('a'); assert.notEqual(again.status, 200, 'the same email cannot sign up twice');
  const login = await call('POST', '/auth/v1/token?grant_type=password', { body: { email: email('a'), password: PW } }); assert.equal(login.status, 200);
  const wrong = await call('POST', '/auth/v1/token?grant_type=password', { body: { email: email('a'), password: PW + 'x' } }); assert.equal(wrong.json.error_code, 'invalid_credentials');
  assert.equal((await call('POST', '/auth/v1/logout', { body: {}, token: login.json.access_token })).status, 204);
});

test('privacy rules: private data, profiles and shared streaks', { skip }, async () => {
  const A = (await signup('pa')).json, B = (await signup('pb')).json, ta = A.access_token, tb = B.access_token, ia = A.user.id;
  assert.equal((await call('POST', '/rest/v1/user_docs', { body: { doc_id: 'h1', body: { name: 'Read' } }, token: ta })).status, 201);
  assert.deepEqual((await call('GET', '/rest/v1/user_docs?select=doc_id', { token: tb })).json, [], "B cannot read A's private data");
  assert.equal((await call('GET', '/rest/v1/user_docs?select=doc_id', { token: ta })).json.length, 1);
  assert.equal((await call('POST', '/rest/v1/user_docs', { body: { user_id: ia, doc_id: 'x', body: {} }, token: tb })).status, 403, 'B cannot write as A');
  assert.deepEqual((await call('PATCH', `/rest/v1/user_docs?user_id=eq.${ia}`, { body: { body: { name: 'hacked' } }, token: tb, prefer: 'return=representation' })).json, []);
  assert.deepEqual((await call('DELETE', `/rest/v1/user_docs?user_id=eq.${ia}`, { token: tb, prefer: 'return=representation' })).json, []);
  assert.equal((await call('POST', '/rest/v1/profiles', { body: { body: { name: 'A' } }, token: ta })).status, 201);
  assert.equal((await call('GET', '/rest/v1/profiles?select=user_id', { token: tb })).json.length >= 1, true, 'signed-in people can see profiles');
  assert.deepEqual((await call('PATCH', `/rest/v1/profiles?user_id=eq.${ia}`, { body: { body: { name: 'hacked' } }, token: tb, prefer: 'return=representation' })).json, []);
  assert.equal((await call('POST', '/rest/v1/public_streaks', { body: { habit_id: 'h1', body: {} }, token: ta })).status, 201);
  assert.deepEqual((await call('DELETE', `/rest/v1/public_streaks?user_id=eq.${ia}`, { token: tb, prefer: 'return=representation' })).json, [], "B cannot remove A's shared streak");
  const row = (await call('GET', '/rest/v1/user_docs?select=updated_at&doc_id=eq.h1', { token: ta })).json[0];
  assert.deepEqual((await call('PATCH', `/rest/v1/user_docs?user_id=eq.${ia}&doc_id=eq.h1&updated_at=eq.${encodeURIComponent(row.updated_at)}`, { body: { body: { name: 'hacked' } }, token: tb, prefer: 'return=representation' })).json, [], "B cannot use the save-if-unchanged request on A's data");
  assert.deepEqual((await call('GET', `/rest/v1/user_docs?select=doc_id,body,updated_at&doc_id=eq.h1&user_id=eq.${ia}`, { token: tb })).json, [], "B cannot read A's version stamp either");
  assert.equal((await call('GET', '/rest/v1/user_docs?select=body&doc_id=eq.h1', { token: ta })).json[0].body.name, 'Read', "A's data is unchanged");
  for (const t of ['user_docs', 'profiles', 'public_streaks']) assert.notEqual((await call('GET', `/rest/v1/${t}?select=*`)).status, 200, `signed-out visitors cannot read ${t}`);
});

test('sign-up limit: a sixth account from one network is refused', { skip: skip || (!REF && 'needs the management API') }, async () => {
  const ip = '203.0.113.' + (Date.now() % 200 + 20), r = [];
  for (let i = 0; i < 6; i++) r.push((await sql(`select public.before_user_created('{"metadata":{"ip_address":"${ip}"}}'::jsonb) as r`))[0].r);
  assert.deepEqual(r.slice(0, 5), [{}, {}, {}, {}, {}]);
  assert.match(r[5].error.message, /most Motif accounts allowed \(5\)/); assert.equal(r[5].error.http_code, 403);
});

test('syncing: two phones on one account see the same streaks, edits and deletes', { skip }, async () => {
  const { build, openApp } = await appHelpers();
  await build();
  const one = await openApp(), two = await openApp();
  await one.page.tap('[data-act="authMode"][data-v="signup"]');
  await one.page.fill('#a-email', email('sync')); await one.page.fill('#a-pw', PW); await one.page.fill('#a-pw2', PW); await one.page.tap('#authForm button[type=submit]');
  await one.page.waitForSelector('.empty-card', { timeout: 20000 });
  await one.page.tap('.empty-card [data-act="new"]'); await one.page.tap('.preset[data-i="0"]'); await one.page.fill('#f-name', 'Synced'); await one.page.tap('[data-act="save"]');
  await one.page.waitForSelector('.tile'); await one.page.dblclick('.tile'); await one.page.waitForTimeout(2500);
  await two.page.fill('#a-email', email('sync')); await two.page.fill('#a-pw', PW); await two.page.tap('#authForm button[type=submit]');
  await two.page.waitForSelector('.tile', { timeout: 20000 });
  assert.equal(await two.page.textContent('.tile .nm'), 'Synced'); assert.equal(await two.page.textContent('.tile .tile-streak b'), '1');
  await two.page.tap('.tile'); await two.page.waitForSelector('#sheet .detail'); await two.page.tap('[data-act="ddel"]'); await two.page.tap('[data-act="ddelyes"]'); await two.page.waitForTimeout(2500);
  await one.page.reload(); await one.page.waitForSelector('.empty-card', { timeout: 20000 });
  await one.page.tap('#btnSettings'); await one.page.tap('[data-act="logout"]'); await one.page.waitForSelector('#auth:not([hidden])', { timeout: 15000 });
  assert.equal(await one.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('unbroken:v1:')).length), 0, 'logging out clears the phone copy');
  assert.deepEqual([...one.errors, ...two.errors], []);
});

test('syncing: friends see public streaks, and a streak made private disappears for them', { skip }, async () => {
  const { build, openApp } = await appHelpers();
  await build();
  const a = await openApp(), b = await openApp();
  for (const [p, who] of [[a.page, 'fa'], [b.page, 'fb']]) {
    await p.tap('[data-act="authMode"][data-v="signup"]'); await p.fill('#a-email', email(who)); await p.fill('#a-pw', PW); await p.fill('#a-pw2', PW); await p.tap('#authForm button[type=submit]');
    await p.waitForSelector('.empty-card', { timeout: 20000 });
  }
  await a.page.tap('.empty-card [data-act="new"]'); await a.page.tap('.preset[data-i="2"]'); await a.page.fill('#f-name', 'Shared run'); await a.page.tap('[data-act="save"]'); await a.page.waitForTimeout(1500);
  await a.page.tap('#tabFriends'); await a.page.tap('.join [data-act="profileEdit"]'); await a.page.fill('#p-name', 'Tester ' + RUN.slice(-4)); await a.page.tap('[data-act="psave"]'); await a.page.waitForTimeout(3000);
  await b.page.reload(); await b.page.waitForSelector('#tabFriends', { timeout: 20000 }); await b.page.waitForTimeout(1500);
  await b.page.tap('#tabFriends'); await b.page.waitForSelector('.prow', { timeout: 20000 });
  const pubAt = async () => (await sql(`select s.updated_at from public.public_streaks s join auth.users u on u.id = s.user_id where u.email = '${email('fa')}'`) || []).map(r => r.updated_at);
  const before = await pubAt(), followed = new Date().toISOString();
  await b.page.tap(`.prow:has-text("Tester ${RUN.slice(-4)}") [data-act="follow"]`);
  try { await b.page.waitForSelector('.mini', { timeout: 20000 }); }
  catch (e) { throw new Error(`friend's streak not shown. Shared rows before following: ${JSON.stringify(before)}; followed at ${followed}; rows now: ${JSON.stringify(await pubAt())}; follower's saved list: ${JSON.stringify(await sql(`select d.body from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email('fb')}' and d.doc_id = 'social'`))}; follower's screen: ${JSON.stringify((await b.page.evaluate(() => document.querySelector('main').innerText)).slice(0, 400))}`); }
  assert.match(await b.page.getAttribute('.mini', 'aria-label'), /Shared run/);
  await a.page.tap('#tabMine'); await a.page.tap('.tile'); await a.page.waitForSelector('#sheet .detail'); await a.page.tap('[data-act="edit"]'); await a.page.tap('[data-act="more"]'); await a.page.tap('[data-act="hideToggle"]'); await a.page.tap('[data-act="save"]'); await a.page.waitForTimeout(3000);
  await b.page.reload(); await b.page.waitForTimeout(3000); await b.page.tap('#tabFriends'); await b.page.waitForTimeout(3000);
  assert.equal(await b.page.$$eval('.mini', x => x.length), 0, 'the private streak is gone for friends');
  assert.ok(await b.page.$('.fblock'), 'still following, so the streak is gone because it is private');
  const kept = await sql(`select d.body from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email('fb')}' and d.doc_id = 'social'`);
  assert.equal(kept[0].body.following.length, 1, 'the follow was saved and kept');
  assert.deepEqual([...a.errors, ...b.errors], []);
});

let helpers, oldHtml = null, rolledBack = false;
async function appHelpers() {
  if (helpers) return helpers;
  const { launch, devices, ROOT } = require('./lib/browser.cjs');
  const cache = path.join(__dirname, '.cache'), lib = path.join(cache, 'package/dist/umd');
  const build = async () => {
    if (!fs.existsSync(path.join(lib, 'supabase.js'))) {
      fs.mkdirSync(cache, { recursive: true });
      const tgz = execFileSync('npm', ['pack', '@supabase/supabase-js@2.45.4', '--silent'], { cwd: cache }).toString().trim();
      execFileSync('tar', ['xzf', tgz], { cwd: cache });
    }
    execFileSync('sh', ['tools/standalone.sh'], { cwd: ROOT, env: { ...process.env } });
  };
  const http = require('http'), dist = path.join(ROOT, 'dist/index.html');
  const server = http.createServer((q, s) => {
    const p = q.url.split('?')[0], f = p === '/sw.js' ? path.join(ROOT, 'dist/sw.js') : p === '/' ? dist : null;
    if (!f) { s.writeHead(404); return s.end(); }
    if (p === '/' && /[?&]v=old/.test(q.url) && oldHtml) { s.writeHead(200, { 'Content-Type': 'text/html' }); return s.end(oldHtml); }   // the previous version, kept through reloads
    if (rolledBack && oldHtml) { s.writeHead(200, { 'Content-Type': p === '/' ? 'text/html' : 'text/javascript' }); return s.end(p === '/' ? oldHtml : fs.readFileSync(path.join(ROOT, 'tools/rollback/sw.js'))); }   // the site after a rollback
    s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html', 'Cache-Control': 'max-age=600' }); s.end(fs.readFileSync(f));
  }).listen(0);
  const port = await new Promise(r => server.on('listening', () => r(server.address().port)));
  servers.push(server);
  const openApp = async ({ waitAuth = true, storageState, at = '/' } = {}) => {
    const b = await launch(), ctx = await b.newContext({ ...devices['iPhone 13'], ...(storageState ? { storageState } : {}) });
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(lib, r.request().url().split('/').pop())) }));
    const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${port}${at}`); if (waitAuth) await page.waitForSelector('#auth:not([hidden])', { timeout: 20000 });
    return { page, errors, ctx };
  };
  return (helpers = { build, openApp, port });
}

test('live updates: a friend sees a new profile within seconds, without reloading', { skip }, async () => {
  const { build, openApp } = await appHelpers();
  await build();
  const a = await openApp(), b = await openApp();
  for (const [p, who] of [[a.page, 'la'], [b.page, 'lb']]) {
    await p.tap('[data-act="authMode"][data-v="signup"]'); await p.fill('#a-email', email(who)); await p.fill('#a-pw', PW); await p.fill('#a-pw2', PW); await p.tap('#authForm button[type=submit]');
    await p.waitForSelector('.empty-card', { timeout: 20000 });
  }
  await b.page.tap('#tabFriends'); await b.page.waitForTimeout(3000);
  const name = 'Live ' + RUN.slice(-4);
  await a.page.tap('#tabFriends'); await a.page.tap('.join [data-act="profileEdit"]'); await a.page.fill('#p-name', name); await a.page.tap('[data-act="psave"]');
  await b.page.waitForSelector(`.prow:has-text("${name}")`, { timeout: 15000 });
  assert.deepEqual([...a.errors, ...b.errors], []);
});

/* ---------- Offline and two phones ---------- */
const HOST = () => new URL(URL_).host, TOKEN = () => 'sb-' + HOST().split('.')[0] + '-auth-token';
const cut = ctx => ctx.route(`https://${HOST()}/**`, r => r.abort('internetdisconnected'));   // the account can't be reached
const uncut = ctx => ctx.unroute(`https://${HOST()}/**`);
const logOf = async who => { const r = await sql(`select d.body->'log' as log from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email(who)}' and d.doc_id <> 'settings' and d.doc_id <> 'social'`); return r && r[0] ? r[0].log || {} : null; };
const todayKey = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
const signUp = async (p, who) => { await p.tap('[data-act="authMode"][data-v="signup"]'); await p.fill('#a-email', email(who)); await p.fill('#a-pw', PW); await p.fill('#a-pw2', PW); await p.tap('#authForm button[type=submit]'); await p.waitForSelector('.empty-card', { timeout: 20000 }); };
const logIn = async (p, who) => { await p.fill('#a-email', email(who)); await p.fill('#a-pw', PW); await p.tap('#authForm button[type=submit]'); };

test('two phones: a check-in made offline on one phone and one made on the other both count', { skip: skip || (!REF && 'needs the management API') }, async () => {
  const { build, openApp } = await appHelpers();
  await build();
  const one = await openApp(), two = await openApp();
  await signUp(one.page, 'off');
  await one.page.tap('.empty-card [data-act="new"]'); await one.page.tap('[data-act="ktype"][data-v="counter"]'); await one.page.fill('#f-name', 'Push-ups'); await one.page.tap('[data-act="save"]');
  await one.page.waitForSelector('.tile'); await one.page.waitForTimeout(2500);
  await logIn(two.page, 'off'); await two.page.waitForSelector('.tile', { timeout: 20000 });
  await cut(one.ctx);
  await one.page.dblclick('.tile .media'); await one.page.waitForTimeout(1500);   // offline here
  await two.page.dblclick('.tile .media'); await two.page.waitForTimeout(2500);   // online there
  assert.equal((await logOf('off'))[todayKey()], 1, 'only the online phone has saved so far');
  await uncut(one.ctx); await one.page.evaluate(() => dispatchEvent(new Event('online')));
  for (let i = 0; i < 30 && (await logOf('off'))[todayKey()] !== 2; i++) await one.page.waitForTimeout(1000);
  assert.equal((await logOf('off'))[todayKey()], 2, 'both check-ins are in the account');
  await two.page.reload(); await two.page.waitForSelector('.tile', { timeout: 20000 }); await two.page.waitForTimeout(1500);
  assert.match(await two.page.textContent('.tile'), /2/);
  assert.deepEqual([...one.errors, ...two.errors], []);
});

test('offline start: with no connection and an expired login the app shows your streaks, not the login screen, and syncs later', { skip: skip || (!REF && 'needs the management API') }, async () => {
  const { build, openApp } = await appHelpers();
  await build();
  const a = await openApp();
  await signUp(a.page, 'start');
  await a.page.tap('.empty-card [data-act="new"]'); await a.page.tap('[data-act="ktype"][data-v="counter"]'); await a.page.fill('#f-name', 'Water'); await a.page.tap('[data-act="save"]');
  await a.page.waitForSelector('.tile'); await a.page.waitForTimeout(2500);
  await cut(a.ctx);
  await a.page.evaluate(k => { const t = JSON.parse(localStorage.getItem(k)); t.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem(k, JSON.stringify(t)); }, TOKEN());
  await a.page.reload(); await a.page.waitForSelector('.tile', { timeout: 20000 });
  assert.equal(await a.page.$eval('#auth', x => x.hidden), true, 'no login screen');
  await a.page.waitForFunction(() => /Offline/.test(document.querySelector('#storeNote').textContent), null, { timeout: 15000 });
  await a.page.dblclick('.tile .media'); await a.page.waitForTimeout(800);
  await uncut(a.ctx); await a.page.evaluate(() => dispatchEvent(new Event('online')));
  for (let i = 0; i < 30 && (await logOf('start'))[todayKey()] !== 1; i++) await a.page.waitForTimeout(1000);
  assert.equal((await logOf('start'))[todayKey()], 1, 'the offline check-in reached the account');
  await a.page.waitForFunction(() => /Synced/.test(document.querySelector('#storeNote').textContent), null, { timeout: 15000 });
  assert.deepEqual(a.errors, []);
});

test('logged out: when the login is no longer valid the app asks to log in again, keeps unsent changes, and saves them after', { skip: skip || (!REF && 'needs the management API') }, async () => {
  const { build, openApp } = await appHelpers();
  await build();
  const a = await openApp();
  await signUp(a.page, 'expire');
  await a.page.tap('.empty-card [data-act="new"]'); await a.page.tap('[data-act="ktype"][data-v="counter"]'); await a.page.fill('#f-name', 'Steps'); await a.page.tap('[data-act="save"]');
  await a.page.waitForSelector('.tile'); await a.page.waitForTimeout(2500);
  await cut(a.ctx); await a.page.dblclick('.tile .media'); await a.page.waitForTimeout(800);   // unsent change
  await sql(`delete from auth.sessions where user_id = (select id from auth.users where email = '${email('expire')}')`);   // login revoked
  await a.page.evaluate(k => { const t = JSON.parse(localStorage.getItem(k)); t.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem(k, JSON.stringify(t)); }, TOKEN());
  await uncut(a.ctx); await a.page.reload();
  await a.page.waitForSelector('#auth:not([hidden])', { timeout: 20000 });
  assert.match(await a.page.textContent('#auth'), /logged out on this phone/);
  assert.equal(await a.page.inputValue('#a-email'), email('expire'), 'email filled in');
  await a.page.fill('#a-pw', PW); await a.page.tap('#authForm button[type=submit]');
  await a.page.waitForSelector('.tile', { timeout: 20000 });
  for (let i = 0; i < 20 && (await logOf('expire'))[todayKey()] !== 1; i++) await a.page.waitForTimeout(1000);
  assert.equal((await logOf('expire'))[todayKey()], 1, 'the change made before the logout was saved');
  assert.deepEqual(a.errors, []);
});

/* ---------- Two phones on one account: every way they can disagree ---------- */
// One account, two phones (A and B). Each scenario uses its own counter streak, so scenarios don't affect each other.
let duo;
async function pair() {
  if (duo) return duo;
  const { build, openApp } = await appHelpers(); await build();
  const A = await openApp(), B = await openApp();
  await signUp(A.page, 'duo'); await logIn(B.page, 'duo'); await B.page.waitForSelector('.empty-card,.tile', { timeout: 20000 });
  return (duo = { A, B });
}
const tile = n => `.tile:has(.nm:text-is("${n}"))`;
const dayOf = async n => { const r = await sql(`select d.body->'log'->>'${todayKey()}' as c from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email('duo')}' and d.body->>'name' = '${n}'`); return r.length ? Number(r[0].c || 0) : null; };
const until = async (f, want, page, secs = 40) => { let v; for (let i = 0; i < secs; i++) { v = await f(); if (v === want) return v; await page.waitForTimeout(1000); } return v; };
async function newCounter(n) {
  const { A, B } = await pair();
  await A.page.tap('#fab'); await A.page.tap('[data-act="ktype"][data-v="counter"]'); await A.page.fill('#f-name', n); await A.page.tap('[data-act="save"]');
  await A.page.waitForSelector(tile(n)); await until(() => dayOf(n), 0, A.page, 15);
  await B.page.reload(); await B.page.waitForSelector(tile(n), { timeout: 20000 });
  return { A, B };
}
const back = async ph => { await uncut(ph.ctx); await ph.page.evaluate(() => dispatchEvent(new Event('online'))); };
const taps = async (ph, n, k) => { for (let i = 0; i < k; i++) { await ph.page.dblclick(tile(n) + ' .media'); await ph.page.waitForTimeout(450); } };
const minus = async (ph, n) => { await ph.page.tap(tile(n)); await ph.page.waitForSelector('#sheet:not([hidden]) .detail'); await ph.page.tap('[data-act="dec"]'); await ph.page.waitForTimeout(300); await ph.page.tap('.sh-head [data-act="close"]'); await ph.page.waitForTimeout(300); };
// Log out like a person would: if it says changes are still saving, wait and try again.
const logOutNow = async p => { for (let i = 0; i < 10; i++) { if (!(await p.$('#sheet:not([hidden]) [data-act="logout"]'))) await p.tap('#btnSettings'); await p.tap('[data-act="logout"]'); try { await p.waitForSelector('#auth:not([hidden])', { timeout: 3000 }); return; } catch (e) {} } throw new Error('could not log out'); };
const dskip = skip || (!REF && 'needs the management API');

test('two phones: both check in on the same day, one of them offline', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Same day');
  await cut(A.ctx); await taps(A, 'Same day', 1); await taps(B, 'Same day', 1);
  await back(A);
  assert.equal(await until(() => dayOf('Same day'), 2, A.page), 2);
});
test('two phones: one undoes a check-in while the other adds one', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Undo vs add');
  await taps(B, 'Undo vs add', 1); assert.equal(await until(() => dayOf('Undo vs add'), 1, B.page), 1);
  await A.page.reload(); await A.page.waitForSelector(tile('Undo vs add'));
  await cut(A.ctx); await minus(A, 'Undo vs add');   // A takes the shared check-in back
  await taps(B, 'Undo vs add', 1); assert.equal(await until(() => dayOf('Undo vs add'), 2, B.page), 2);
  await back(A);
  assert.equal(await until(() => dayOf('Undo vs add'), 1, A.page), 1, "one undone, one added");
});
test('two phones: both add to the same counter, and every addition counts once', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Same counter');
  await cut(A.ctx); await taps(A, 'Same counter', 3); await taps(B, 'Same counter', 2);
  await back(A);
  assert.equal(await until(() => dayOf('Same counter'), 5, A.page), 5);
  await B.page.reload(); await B.page.waitForSelector(tile('Same counter')); await B.page.waitForTimeout(1500);
  assert.match(await B.page.textContent(tile('Same counter')), /\b5\b/);
});
test('two phones: repeated drops and reconnections, and a save whose answer is lost, count every check-in once', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Flaky');
  for (let round = 0; round < 3; round++) { await cut(A.ctx); await taps(A, 'Flaky', 1); await taps(B, 'Flaky', 1); await back(A); await A.page.waitForTimeout(1500); }
  assert.equal(await until(() => dayOf('Flaky'), 6, A.page), 6);
  let lost = 0;
  await A.ctx.route(`https://${HOST()}/rest/v1/user_docs*`, async r => { if (!lost && r.request().method() === 'PATCH') { lost = 1; await r.fetch(); return r.abort('connectionreset'); } return r.continue(); });
  await taps(A, 'Flaky', 1);
  assert.equal(await until(() => dayOf('Flaky'), 7, A.page), 7); assert.equal(lost, 1, 'the answer was dropped once');
  await A.page.waitForTimeout(8000);
  assert.equal(await dayOf('Flaky'), 7, 'still 7 after the retry');
  await A.ctx.unroute(`https://${HOST()}/rest/v1/user_docs*`);
});
test('two phones: a streak deleted on one phone while the other edits it offline stays deleted', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Delete me');
  await cut(A.ctx); await taps(A, 'Delete me', 2);
  await B.page.tap(tile('Delete me')); await B.page.waitForSelector('#sheet .detail'); await B.page.tap('[data-act="ddel"]'); await B.page.tap('[data-act="ddelyes"]');
  assert.equal(await until(() => dayOf('Delete me'), null, B.page), null);
  await back(A);
  await A.page.waitForFunction(n => ![...document.querySelectorAll('.tile .nm')].some(x => x.textContent === n), 'Delete me', { timeout: 40000 });
  await A.page.waitForTimeout(3000);
  assert.equal(await dayOf('Delete me'), null, 'not brought back');
});
test('two phones: a streak deleted offline stays deleted even though the other phone added to it', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Delete offline');
  await cut(A.ctx);
  await A.page.tap(tile('Delete offline')); await A.page.waitForSelector('#sheet .detail'); await A.page.tap('[data-act="ddel"]'); await A.page.tap('[data-act="ddelyes"]'); await A.page.waitForTimeout(6000);   // past the undo
  await taps(B, 'Delete offline', 1); assert.equal(await until(() => dayOf('Delete offline'), 1, B.page), 1);
  await back(A);
  assert.equal(await until(() => dayOf('Delete offline'), null, A.page), null);
});
test('two phones: a change made offline survives closing the browser and is saved when it opens again', { skip: dskip }, async () => {
  const { A } = await newCounter('Closed');
  const { openApp } = await appHelpers();
  await cut(A.ctx); await taps(A, 'Closed', 1);
  const state = await A.ctx.storageState(); await A.ctx.close();
  const A2 = await openApp({ waitAuth: false, storageState: state });
  await A2.page.waitForSelector(tile('Closed'), { timeout: 20000 });
  assert.equal(await until(() => dayOf('Closed'), 1, A2.page), 1);
  duo.A = A2;
});
test('older version: a phone still on the previous version and one on this version on one account', { skip: dskip }, async () => {
  const { A } = await newCounter('Mixed');
  const O = await openOld();
  await logIn(O.page, 'duo'); await O.page.waitForSelector(tile('Mixed'), { timeout: 20000 });
  await cut(A.ctx); await taps(A, 'Mixed', 1); await taps(O, 'Mixed', 1);
  assert.equal(await until(() => dayOf('Mixed'), 1, O.page), 1);
  await back(A);
  assert.equal(await until(() => dayOf('Mixed'), 2, A.page), 2, 'the new version merges with what the old one saved');
  await O.page.reload(); await O.page.waitForSelector(tile('Mixed')); await O.page.waitForTimeout(1500);
  assert.equal(await isOld(O.page), true, 'still the previous version');
  assert.match(await O.page.textContent(tile('Mixed')), /\b2\b/, 'and the old version shows the merged result');
  assert.deepEqual(O.errors, []); await O.ctx.close();
});

/* ---------- Opening with no connection ---------- */
test('offline: after one visit Motif opens with no connection at all, and syncs when it returns', { skip: dskip }, async () => {
  const { A } = await newCounter('No signal');
  await A.page.reload(); await A.page.waitForSelector(tile('No signal')); await A.page.waitForTimeout(1500);   // the offline helper is installed
  assert.ok(await A.page.evaluate(() => navigator.serviceWorker.controller !== null), 'the offline helper controls the page');
  await A.ctx.setOffline(true);
  await A.page.reload(); await A.page.waitForSelector(tile('No signal'), { timeout: 20000 });
  await A.page.waitForFunction(() => /Offline/.test(document.querySelector('#storeNote').textContent), null, { timeout: 15000 });
  assert.equal(await A.page.$eval('#auth', x => x.hidden), true);
  await taps(A, 'No signal', 1);
  await A.ctx.setOffline(false);
  assert.equal(await until(() => dayOf('No signal'), 1, A.page), 1);
  assert.deepEqual(A.errors.filter(e => !/Failed to fetch|NetworkError|Load failed/.test(e)), []);
});
test('offline: a new version reaches people on their next open, and is the one kept for offline use', { skip: dskip }, async () => {
  const { A } = await pair();
  const dist = path.join(__dirname, '../dist/index.html'), sw = path.join(__dirname, '../dist/sw.js'), before = fs.readFileSync(dist, 'utf8'), swBefore = fs.readFileSync(sw, 'utf8');
  try {
    fs.writeFileSync(dist, before.replace('<head>', '<head><script>window.__build="next"</script>'));
    fs.writeFileSync(sw, fs.readFileSync(path.join(__dirname, '../app/sw.js'), 'utf8').replace('__VERSION__', 'next' + Date.now()));
    await A.page.reload(); await A.page.waitForSelector('.tile,.empty-card', { timeout: 20000 });
    assert.equal(await A.page.evaluate(() => window.__build), 'next', 'the new version shows on the next open');
    await A.page.waitForTimeout(2000); await A.ctx.setOffline(true);
    await A.page.reload(); await A.page.waitForSelector('.tile,.empty-card', { timeout: 20000 });
    assert.equal(await A.page.evaluate(() => window.__build), 'next', 'and offline too');
    await A.ctx.setOffline(false);
  } finally { fs.writeFileSync(dist, before); fs.writeFileSync(sw, swBefore); }
});

/* ---------- Privacy on a shared phone ---------- */
test('privacy: the offline copy holds no account data; after logging out nothing of the account is left or shown, and a second account sees only its own', { skip: dskip }, async () => {
  const { A } = await newCounter('Private thing');
  const cached = await A.page.evaluate(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) { const b = await (await c.match(r)).clone().text().catch(() => ''); out.push({ url: r.url, hit: b.includes('Private thing') }); } } return out; });
  assert.ok(cached.length >= 1, 'something is kept for offline use');
  assert.equal(cached.filter(x => /supabase\.co/.test(x.url)).length, 0, 'no account requests are kept');
  assert.equal(cached.filter(x => x.hit).length, 0, 'no streak data in the offline copy');
  await logOutNow(A.page);
  assert.deepEqual(await A.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('unbroken:v1:') || k === 'unbroken:acct')), [], "the account's data is gone from the phone");
  await A.ctx.setOffline(true); await A.page.reload(); await A.page.waitForSelector('#auth:not([hidden])', { timeout: 20000 });
  assert.doesNotMatch(await A.page.evaluate(() => document.body.innerText), /Private thing/, 'offline after logging out: only the login screen');
  await A.ctx.setOffline(false); await A.page.reload(); await A.page.waitForSelector('#auth:not([hidden])', { timeout: 20000 });
  await signUp(A.page, 'other');
  assert.doesNotMatch(await A.page.evaluate(() => document.body.innerText), /Private thing/, 'the second account sees only its own streaks');
  await logOutNow(A.page);
  await logIn(A.page, 'duo'); await A.page.waitForSelector(tile('Private thing'), { timeout: 20000 });
});
test('privacy: when a login runs out, the streaks are hidden behind the login screen, not just covered', { skip: dskip }, async () => {
  const { A } = await newCounter('Hidden behind');
  await sql(`delete from auth.sessions where user_id = (select id from auth.users where email = '${email('duo')}')`);
  await A.page.evaluate(k => { const t = JSON.parse(localStorage.getItem(k)); t.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem(k, JSON.stringify(t)); }, TOKEN());
  await A.page.reload(); await A.page.waitForSelector('#auth:not([hidden])', { timeout: 20000 });
  assert.doesNotMatch(await A.page.evaluate(() => document.body.innerText), /Hidden behind/);
  await A.page.fill('#a-pw', PW); await A.page.tap('#authForm button[type=submit]'); await A.page.waitForSelector(tile('Hidden behind'), { timeout: 20000 });
  duo.B.page.reload().catch(() => {});
});

/* ---------- Save receipts: one save is applied once ---------- */
const uidOf = async who => (await sql(`select id from auth.users where email = '${email(who)}'`))[0].id;
const tokenOf = async page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).access_token, TOKEN());
test('receipts: a lost answer, then another phone saving, then the retry: the check-in still counts once', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Lost then saved over');
  let lost = 0;
  await A.ctx.route(`https://${HOST()}/rest/v1/user_docs*`, async r => { if (!lost && r.request().method() === 'PATCH') { lost = 1; await r.fetch(); await cut(A.ctx); return r.abort('connectionreset'); } return r.continue(); });
  await taps(A, 'Lost then saved over', 1);                  // reaches the account, but A never hears back and goes offline
  assert.equal(await until(() => dayOf('Lost then saved over'), 1, B.page), 1); assert.equal(lost, 1);
  await B.page.reload(); await B.page.waitForSelector(tile('Lost then saved over'));
  await taps(B, 'Lost then saved over', 1);                  // B saves over it, so A's stamp is no longer on the streak
  assert.equal(await until(() => dayOf('Lost then saved over'), 2, B.page), 2);
  await A.ctx.unroute(`https://${HOST()}/rest/v1/user_docs*`); await back(A);
  await A.page.waitForTimeout(8000);
  assert.equal(await dayOf('Lost then saved over'), 2, "A's retry recognised its earlier save from the receipt: 2, not 3");
  await A.page.reload(); await A.page.waitForSelector(tile('Lost then saved over')); await A.page.waitForTimeout(1500);
  assert.match(await A.page.textContent(tile('Lost then saved over')), /\b2\b/);
});
test('receipts: only the database writes them, each person sees only their own, and a failed save leaves none', { skip: dskip }, async () => {
  const x = (await signup('rx')).json, y = (await signup('ry')).json, tx = x.access_token, ty = y.access_token, ix = x.user.id;
  assert.equal((await call('POST', '/rest/v1/user_docs', { body: { doc_id: 'h1', body: { name: 'Read', rev: 'stampone1', app: 2 } }, token: tx })).status, 201);
  assert.equal((await call('GET', '/rest/v1/save_receipts?select=rev', { token: tx })).json.length, 1, 'the save left a receipt');
  assert.deepEqual((await call('GET', '/rest/v1/save_receipts?select=rev', { token: ty })).json, [], "others can't see it");
  assert.notEqual((await call('GET', '/rest/v1/save_receipts?select=rev')).status, 200, 'signed-out visitors get nothing');
  for (const t of [tx, ty]) assert.notEqual((await call('POST', '/rest/v1/save_receipts', { body: { user_id: ix, rev: 'forged001', doc_id: 'h1' }, token: t })).status, 201, 'nobody can write a receipt');
  const r1 = await call('PATCH', '/rest/v1/user_docs?doc_id=eq.h1', { body: { body: { name: 'Again', rev: 'stampone1', app: 2 } }, token: tx });
  assert.notEqual(r1.status, 200, 'the same save cannot be applied twice');
  const r2 = await call('PATCH', '/rest/v1/user_docs?doc_id=eq.h1&updated_at=eq.2000-01-01T00:00:00Z', { body: { body: { name: 'Stale', rev: 'stampnope1', app: 2 } }, token: tx, prefer: 'return=representation' });
  assert.deepEqual(r2.json, [], 'a save based on an old copy changes nothing');
  const r3 = await call('PATCH', '/rest/v1/user_docs?doc_id=eq.h1', { body: { body: { name: 'x'.repeat(310000), rev: 'stamptoobig', app: 2 } }, token: tx });
  assert.notEqual(r3.status, 200, 'an oversized save is refused');
  assert.deepEqual((await call('GET', '/rest/v1/save_receipts?select=rev&order=rev', { token: tx })).json.map(r => r.rev), ['stampone1'], 'refused saves left no receipt');
  assert.equal((await call('GET', '/rest/v1/user_docs?select=body', { token: tx })).json[0].body.name, 'Read', 'the streak is unchanged');
});

/* ---------- Version gate ---------- */
const OLD_APP = () => execFileSync('git', ['show', 'backup/before-reliability-fixes:app/unbroken.html'], { cwd: path.join(__dirname, '..') }).toString();
// Serves the previous version (the one live today) for the next page opened, then switches back.
async function openOld(o = {}) {
  const { openApp } = await appHelpers(), now = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8'), cur = fs.readFileSync(path.join(__dirname, '../app/unbroken.html'), 'utf8');
  oldHtml = now.split(cur).join(OLD_APP());
  const ph = await openApp({ ...o, at: '/?v=old' }); assert.equal(await isOld(ph.page), true, 'previous version'); return ph;
}
const isOld = page => page.evaluate(() => !document.documentElement.outerHTML.includes('mergeDoc'));
const gate = async (who, v) => sql(v === null ? `delete from private.config where k = 'min_app:${await uidOf(who)}'` : `insert into private.config (k, v) values ('min_app:${await uidOf(who)}', '${v}') on conflict (k) do update set v = excluded.v`);
test('version gate: switched off by default, so the version live today keeps saving', { skip: dskip }, async () => {
  assert.deepEqual(await sql(`select v from private.config where k = 'min_app'`), [{ v: '0' }]);
  const O = await openOld();
  await signUp(O.page, 'gateoff');
  await O.page.tap('.empty-card [data-act="new"]'); await O.page.tap('[data-act="ktype"][data-v="counter"]'); await O.page.fill('#f-name', 'Old saves'); await O.page.tap('[data-act="save"]');
  await O.page.waitForSelector('.tile'); await O.page.dblclick('.tile .media');
  const n = async () => { const r = await sql(`select d.body->'log'->>'${todayKey()}' as c from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email('gateoff')}' and d.body->>'name' = 'Old saves'`); return r.length ? Number(r[0].c || 0) : null; };
  assert.equal(await until(n, 1, O.page), 1);
  assert.deepEqual(O.errors, []); await O.ctx.close();
});
test('version gate: when on, the previous version cannot save by any route, keeps its changes through reloads, and they are saved once the phone updates', { skip: dskip }, async () => {
  const O = await openOld();
  await signUp(O.page, 'gate');
  await O.page.tap('.empty-card [data-act="new"]'); await O.page.tap('[data-act="ktype"][data-v="counter"]'); await O.page.fill('#f-name', 'Gated'); await O.page.tap('[data-act="save"]');
  await O.page.waitForSelector('.tile'); await O.page.waitForTimeout(2500);
  const n = async () => { const r = await sql(`select d.body->'log'->>'${todayKey()}' as c from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email('gate')}' and d.body->>'name' = 'Gated'`); return r.length ? Number(r[0].c || 0) : null; };
  assert.equal(await n(), 0);
  await gate('gate', 2);
  // the app's own save
  await O.page.dblclick('.tile .media'); await O.page.waitForTimeout(4000);
  assert.equal(await n(), 0, "the previous version's save is refused");
  // direct requests, every write route, without the version
  const tk = await tokenOf(O.page), id = (await sql(`select doc_id from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email('gate')}' and d.body->>'name' = 'Gated'`))[0].doc_id;
  const body = { name: 'Gated', log: { [todayKey()]: 9 } };
  assert.notEqual((await call('PATCH', `/rest/v1/user_docs?doc_id=eq.${id}`, { body: { body }, token: tk })).status, 200, 'update refused');
  assert.notEqual((await call('POST', '/rest/v1/user_docs', { body: { doc_id: id, body }, token: tk, prefer: 'resolution=merge-duplicates' })).status, 201, 'upsert refused');
  assert.notEqual((await call('POST', '/rest/v1/user_docs', { body: { doc_id: 'brandnew', body }, token: tk })).status, 201, 'new item refused');
  assert.equal(await n(), 0);
  // the change waits on the phone, through a reload and a dropped connection
  await O.page.reload(); await O.page.waitForSelector('.tile'); assert.equal(await isOld(O.page), true, 'still the previous version after the reload');
  await cut(O.ctx); await O.page.waitForTimeout(1000); await uncut(O.ctx); await O.page.waitForTimeout(3000);
  const mem = await O.page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('unbroken:v1:')); return JSON.parse(localStorage.getItem(k)); });
  assert.equal(Object.values(mem.habits)[0].log[todayKey()], 1, 'the check-in is still on the phone'); assert.equal(Object.values(mem.dirty)[0], 1, 'marked as waiting');
  assert.equal(await n(), 0);
  // the phone updates to this version: same browser, same memory
  const { port } = await appHelpers();
  await O.page.goto(`http://localhost:${port}/`); await O.page.waitForSelector('.tile', { timeout: 20000 });
  assert.equal(await O.page.evaluate(() => document.documentElement.outerHTML.includes('mergeDoc')), true, 'now on this version');
  assert.equal(await until(n, 1, O.page), 1, 'the waiting check-in is saved once, after the update');
  await O.page.dblclick('.tile .media'); assert.equal(await until(n, 2, O.page), 2, 'this version saves normally with the gate on');
  assert.equal((await call('PATCH', `/rest/v1/user_docs?doc_id=eq.${id}`, { body: { body: { ...body, rev: 'directok1', app: 2 } }, token: tk })).status < 300, true, 'a request carrying the version is accepted');
  await O.ctx.close();
});
test('version gate: if this version is ever outdated, it says to reload, keeps changes, and saves them after', { skip: dskip }, async () => {
  const { openApp } = await appHelpers();
  const P = await openApp();
  await signUp(P.page, 'gatenew');
  await P.page.tap('.empty-card [data-act="new"]'); await P.page.tap('[data-act="ktype"][data-v="counter"]'); await P.page.fill('#f-name', 'Future'); await P.page.tap('[data-act="save"]');
  await P.page.waitForSelector('.tile'); await P.page.waitForTimeout(2500);
  const n = async () => { const r = await sql(`select d.body->'log'->>'${todayKey()}' as c from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email('gatenew')}' and d.body->>'name' = 'Future'`); return r.length ? Number(r[0].c || 0) : null; };
  await gate('gatenew', 3);
  await P.page.dblclick('.tile .media');
  await P.page.waitForFunction(() => /updated/.test(document.querySelector('#notice').textContent), null, { timeout: 15000 });
  assert.match(await P.page.textContent('#storeNote'), /Reload to keep syncing/);
  assert.equal(await n(), 0);
  await P.page.reload(); await P.page.waitForSelector('.tile'); await P.page.waitForTimeout(3000);
  assert.equal(await n(), 0, 'still refused after a reload, still waiting');
  await gate('gatenew', null);                                 // stands in for the newer version arriving
  await P.page.reload(); await P.page.waitForSelector('.tile');
  assert.equal(await until(n, 1, P.page), 1, 'saved once allowed');
  assert.deepEqual(P.errors, []); await P.ctx.close();
});
test('moving from the version live today to this one: a change made offline in the old version is kept and saved', { skip: dskip }, async () => {
  const O = await openOld();
  await signUp(O.page, 'move');
  await O.page.tap('.empty-card [data-act="new"]'); await O.page.tap('[data-act="ktype"][data-v="counter"]'); await O.page.fill('#f-name', 'Moving'); await O.page.tap('[data-act="save"]');
  await O.page.waitForSelector('.tile'); await O.page.dblclick('.tile .media'); await O.page.waitForTimeout(2500);
  const n = async () => { const r = await sql(`select d.body->'log'->>'${todayKey()}' as c from public.user_docs d join auth.users u on u.id = d.user_id where u.email = '${email('move')}' and d.body->>'name' = 'Moving'`); return r.length ? Number(r[0].c || 0) : null; };
  assert.equal(await until(n, 1, O.page), 1);
  await cut(O.ctx); await O.page.dblclick('.tile .media'); await O.page.waitForTimeout(1500);   // offline in the old version
  await uncut(O.ctx);
  const { port } = await appHelpers();
  await O.page.route(`https://${HOST()}/rest/v1/user_docs*`, r => r.continue());
  await O.page.goto(`http://localhost:${port}/`); await O.page.waitForSelector('.tile', { timeout: 20000 });
  assert.equal(await until(n, 2, O.page), 2, 'the old version\'s offline check-in arrives, once');
  await O.page.waitForTimeout(3000); assert.equal(await n(), 2);
  await O.ctx.close();
});

/* ---------- Saves too old to confirm (receipt expired) ---------- */
// Makes A's unconfirmed save look 70 days old and removes its receipt, as the 60-day clean-up would.
// Lets the next save through to the account (landed) or not (lost), then drops the connection before the answer arrives.
async function dropDuringSave(ph, name, landed) {
  let done = false;
  await ph.ctx.route(`https://${HOST()}/rest/v1/user_docs*`, async r => { if (!done && r.request().method() === 'PATCH') { if (landed) await r.fetch(); await cut(ph.ctx); done = true; return r.abort('connectionreset'); } return r.continue(); });
  await taps(ph, name, 1);
  for (let i = 0; i < 30 && !done; i++) await ph.page.waitForTimeout(200);
  await ph.ctx.unroute(`https://${HOST()}/rest/v1/user_docs*`); assert.ok(done, 'the connection dropped during the save');
}
// Done with the app closed (a blank page on the same site), so the running app can't write over the edit; then opens Motif again.
async function ageUnsure(ph) {
  const home = new URL(ph.page.url()).origin + '/';
  await ph.page.goto(home + 'blank');
  const revs = await ph.page.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('unbroken:v1:')), o = JSON.parse(localStorage.getItem(k)), r = [];
    for (const ts of Object.values(o.tries || {})) for (const t of ts) { t.at = Date.now() - 70 * 864e5; r.push(t.rev); } localStorage.setItem(k, JSON.stringify(o)); return r; });
  assert.ok(revs.length >= 1, 'there is an unconfirmed save');
  await sql(`delete from public.save_receipts where rev in (${revs.map(r => `'${r}'`).join(',')})`);
  await ph.page.goto(home);
}
const noteOn = page => page.$$eval('.unsure', x => x.map(e => e.textContent).join(' '));
test('old unconfirmed save (real database): it landed, another phone added since, its receipt expired: counted once, and a note asks to check', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Expired landed');
  await dropDuringSave(A, 'Expired landed', true);
  assert.equal(await until(() => dayOf('Expired landed'), 1, B.page), 1, "A's save reached the account");
  await B.page.reload(); await B.page.waitForSelector(tile('Expired landed')); await taps(B, 'Expired landed', 1);
  assert.equal(await until(() => dayOf('Expired landed'), 2, B.page), 2);
  await ageUnsure(A); await A.page.waitForSelector(tile('Expired landed'));
  await back(A); await A.page.waitForTimeout(8000);
  assert.equal(await dayOf('Expired landed'), 2, '2, not 3');
  assert.match(await noteOn(A.page), /Check Expired landed/);
});
test('old unconfirmed save (real database): it never landed, another phone added: not added on a guess, and a note asks to check', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Expired lost');
  await dropDuringSave(A, 'Expired lost', false);
  await taps(B, 'Expired lost', 1); assert.equal(await until(() => dayOf('Expired lost'), 1, B.page), 1);
  await ageUnsure(A); await A.page.waitForSelector(tile('Expired lost'));
  await back(A); await A.page.waitForTimeout(8000);
  assert.equal(await dayOf('Expired lost'), 1, 'not re-added on a guess');
  assert.match(await noteOn(A.page), /Check Expired lost[\s\S]*couldn't be confirmed/, 'the person is told, not left with a silent gap');
});
test('old unconfirmed save (real database): a streak deleted on another phone stays deleted', { skip: dskip }, async () => {
  const { A, B } = await newCounter('Expired deleted');
  await dropDuringSave(A, 'Expired deleted', false);
  await B.page.tap(tile('Expired deleted')); await B.page.waitForSelector('#sheet .detail'); await B.page.tap('[data-act="ddel"]'); await B.page.tap('[data-act="ddelyes"]');
  assert.equal(await until(() => dayOf('Expired deleted'), null, B.page), null);
  await ageUnsure(A); await A.page.waitForSelector('.tile,.empty-card');
  await back(A); await A.page.waitForTimeout(8000);
  assert.equal(await dayOf('Expired deleted'), null, 'not brought back');
  assert.equal(await A.page.$$eval(tile('Expired deleted'), x => x.length), 0);
});

/* ---------- Rollback ---------- */
test('rollback: going back to the previous version removes the offline helper, and a change waiting offline is still saved', { skip: dskip }, async () => {
  const { A } = await newCounter('Rollback');
  await A.page.reload(); await A.page.waitForSelector(tile('Rollback')); await A.page.waitForTimeout(1500);
  assert.ok(await A.page.evaluate(() => navigator.serviceWorker.controller !== null), 'the offline helper is running');
  await cut(A.ctx); await taps(A, 'Rollback', 1);               // waiting offline
  const now = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8'), cur = fs.readFileSync(path.join(__dirname, '../app/unbroken.html'), 'utf8');
  oldHtml = now.split(cur).join(OLD_APP()); rolledBack = true;
  try {
    await uncut(A.ctx); await A.page.reload().catch(() => {});
    await A.page.waitForFunction(() => !document.documentElement.outerHTML.includes('mergeDoc') && document.querySelector('.tile'), null, { timeout: 30000 });
    assert.equal(await until(() => dayOf('Rollback'), 1, A.page), 1, 'the previous version saved the waiting change, once');
    await A.page.waitForTimeout(3000);
    assert.equal(await A.page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, 'offline helper removed');
    assert.deepEqual(await A.page.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('motif-'))), [], 'its saved copy removed');
    assert.equal(await dayOf('Rollback'), 1);
  } finally { rolledBack = false; }
  await A.page.reload(); await A.page.waitForFunction(() => document.documentElement.outerHTML.includes('mergeDoc'), null, { timeout: 20000 });   // back to this version for the tests after
});
