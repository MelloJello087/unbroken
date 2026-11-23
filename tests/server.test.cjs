// Server tests: accounts, password rules, privacy rules, the sign-up limit and syncing, against a real Supabase project.
// Needs SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. Clean-up and the sign-up-limit test also need the Supabase
// management API (SUPABASE_PROJECT_REF, plus SUPABASE_ACCESS_TOKEN unless a proxy adds it). Values come from the
// environment only; never write them into this repository. Every account made here is "motif-test-…@example.com" and deleted afterwards.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_PUBLISHABLE_KEY, REF = process.env.SUPABASE_PROJECT_REF;
const skip = !URL_ || !KEY ? 'set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to run the server tests' : false;
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
  await sql(`delete from auth.users where email like '${RUN}-%@example.com'; delete from private.signup_networks where first_signup >= '${STARTED}';`);
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
  await b.page.tap(`.prow:has-text("Tester ${RUN.slice(-4)}") [data-act="follow"]`); await b.page.waitForSelector('.mini', { timeout: 20000 });
  assert.match(await b.page.getAttribute('.mini', 'aria-label'), /Shared run/);
  await a.page.tap('#tabMine'); await a.page.tap('.tile'); await a.page.waitForSelector('#sheet .detail'); await a.page.tap('[data-act="edit"]'); await a.page.tap('[data-act="more"]'); await a.page.tap('[data-act="hideToggle"]'); await a.page.tap('[data-act="save"]'); await a.page.waitForTimeout(3000);
  await b.page.reload(); await b.page.waitForTimeout(3000); await b.page.tap('#tabFriends'); await b.page.waitForTimeout(3000);
  assert.equal(await b.page.$$eval('.mini', x => x.length), 0, 'the private streak is gone for friends');
  assert.deepEqual([...a.errors, ...b.errors], []);
});

let helpers;
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
  const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html' }); s.end(fs.readFileSync(dist)); }).listen(0);
  const port = await new Promise(r => server.on('listening', () => r(server.address().port)));
  servers.push(server);
  const openApp = async ({ waitAuth = true } = {}) => {
    const b = await launch(), ctx = await b.newContext({ ...devices['iPhone 13'] });
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(lib, r.request().url().split('/').pop())) }));
    const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${port}/`); if (waitAuth) await page.waitForSelector('#auth:not([hidden])', { timeout: 20000 });
    return { page, errors, ctx };
  };
  return (helpers = { build, openApp });
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
