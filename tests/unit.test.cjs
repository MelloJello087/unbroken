// Logic tests: streak math, schedules, free misses, rest days, goals, saved-data safety and the word filter.
const test = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./lib/engine.cjs');
const NOW = '2026-11-18T12:00:00';   // a Wednesday; week starts Monday the 16th
const M = load({ now: NOW }), { t, k, days, range, habit } = require('./lib/cal.cjs')(M);
const ev = h => M.evaluate(h, t);
const same = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);   // values from the sandbox

test('dates: today, weekdays and week start', () => {
  assert.equal(M.keyOf(t), '2026-11-18');
  assert.equal(M.dow(t), 3);
  assert.equal(M.keyOf(M.weekStartOf(t)), '2026-11-16');
  const sun = load({ now: NOW, weekStart: 0 });
  assert.equal(sun.keyOf(sun.weekStartOf(sun.today())), '2026-11-15');
});
test('dates: a check-in just after midnight counts for the day before when "new day starts at" is later', () => {
  const late = load({ now: '2026-11-18T01:30:00', rollover: 2 });
  assert.equal(late.keyOf(late.today()), '2026-11-17');
  const early = load({ now: '2026-11-18T01:30:00', rollover: 0 });
  assert.equal(early.keyOf(early.today()), '2026-11-18');
});

test('daily: consecutive days count, and today still to do does not break the streak', () => {
  const e = ev(habit({ log: days(...range(10, 1)) }));
  assert.equal(e.cur, 10); assert.equal(e.dueToday, true); assert.equal(e.doneToday, false);
  assert.equal(ev(habit({ log: days(...range(10, 0)) })).cur, 11);
});
test('daily: a missed day breaks the streak; best streak is kept', () => {
  const e = ev(habit({ log: { ...days(...range(20, 10)), ...days(...range(8, 1)) } }));
  assert.equal(e.cur, 8); assert.equal(e.best, 11);
  assert.equal(e.st.get(t - 9), 'missed');
});
test('daily: a rest day neither breaks nor adds', () => {
  const e = ev(habit({ log: { ...days(5, 4), ...days(2, 1) }, skip: { [k(3)]: 1 } }));
  assert.equal(e.cur, 4); assert.equal(e.st.get(t - 3), 'skip');
});
test('daily: nothing before the start date counts against you', () => {
  const e = ev(habit({ start: k(3), log: days(3, 2, 1) }));
  assert.equal(e.cur, 3); assert.equal(e.rate, 1);
});
test('daily: a start date in the future gives zero, not an error', () => {
  assert.equal(ev(habit({ start: M.keyOf(t + 5) })).cur, 0);
});
test('free misses: one per month covers one miss; a second miss that month breaks', () => {
  const one = ev(habit({ freezes: 1, start: k(10), log: days(10, 9, 8, 6, 5, 4, 3, 2, 1) }));
  assert.equal(one.cur, 9); assert.equal(one.st.get(t - 7), 'frozen'); assert.equal(one.freezesLeft, 0);
  const two = ev(habit({ freezes: 1, start: k(10), log: days(10, 9, 8, 6, 5, 3, 2, 1) }));
  assert.equal(two.cur, 3);
});
test('free misses: the allowance resets each calendar month', () => {
  const e = ev(habit({ freezes: 1, start: '2026-10-25', log: Object.fromEntries(range(24, 0).filter(n => ![23, 10].includes(n)).map(n => [k(n), 1])) }));
  assert.equal(M.keyOf(t - 23), '2026-10-26'); assert.equal(e.st.get(t - 23), 'frozen'); assert.equal(e.st.get(t - 10), 'frozen');
  assert.equal(e.cur, 23);
});
test('free misses: never spent when there is no streak to protect', () => {
  const e = ev(habit({ freezes: 1, start: k(3), log: days(1) }));
  assert.equal(e.freezesLeft, 1);
});
test('certain weekdays: unscheduled days are never penalized; a missed scheduled day breaks', () => {
  const mwf = { type: 'weekdays', days: [1, 3, 5] };
  const ok = ev(habit({ sched: mwf, start: '2026-11-02', log: { '2026-11-02': 1, '2026-11-04': 1, '2026-11-06': 1, '2026-11-09': 1, '2026-11-11': 1, '2026-11-13': 1, '2026-11-16': 1 } }));
  assert.equal(ok.cur, 7); assert.equal(ok.dueToday, true); assert.equal(ok.st.get(M.dnOf('2026-11-15')), 'off');
  const missed = ev(habit({ sched: mwf, start: '2026-11-02', log: { '2026-11-02': 1, '2026-11-04': 1, '2026-11-09': 1, '2026-11-11': 1, '2026-11-13': 1, '2026-11-16': 1 } }));
  assert.equal(missed.cur, 4);
  const thu = load({ now: '2026-11-19T12:00:00' });
  const e = thu.evaluate(thu.normHabit({ id: 'h', name: 'x', sched: mwf, start: '2026-11-16', log: { '2026-11-16': 1, '2026-11-18': 1 } }), thu.today());
  assert.equal(e.dueToday, undefined); assert.equal(thu.keyOf(e.next), '2026-11-20');
});
test('certain weekdays: doing it on an unscheduled day still counts', () => {
  const e = ev(habit({ sched: { type: 'weekdays', days: [1] }, start: '2026-11-16', log: { '2026-11-16': 1, '2026-11-17': 1 } }));
  assert.equal(e.cur, 2);
});
test('every few days: holds while each gap is within the window, breaks when it is not', () => {
  const every3 = { type: 'interval', every: 3 };
  const ok = ev(habit({ sched: every3, start: k(9), log: days(9, 6, 3) }));
  assert.equal(ok.cur, 3); assert.equal(ok.dueToday, true);
  const broken = ev(habit({ sched: every3, start: k(12), log: days(12, 8, 5, 2) }));
  assert.equal(broken.st.get(t - 9), 'missed'); assert.equal(broken.cur, 3);
  const notDue = ev(habit({ sched: every3, start: k(5), log: days(5, 1) }));
  assert.equal(notDue.dueToday, undefined); assert.equal(M.keyOf(notDue.next), M.keyOf(t + 2));
});
test('times a week: full weeks count, the current week is never held against you', () => {
  const e = ev(habit({ sched: { type: 'perWeek', times: 3 }, start: '2026-11-02', log: { '2026-11-02': 1, '2026-11-04': 1, '2026-11-06': 1, '2026-11-09': 1, '2026-11-10': 1, '2026-11-12': 1, '2026-11-16': 1 } }));
  assert.equal(e.cur, 2); assert.equal(e.unit, 'week');
  assert.deepEqual({ count: e.period.count, target: e.period.target }, { count: 1, target: 3 });
  assert.equal(M.statusText(M.normHabit({ id: 'x', name: 'x', sched: { type: 'perWeek', times: 3 } }), e, t), '1 of 3 this week');
});
test('times a week: a short week breaks; rest days lower that week\'s target', () => {
  const short = ev(habit({ sched: { type: 'perWeek', times: 3 }, start: '2026-11-02', log: { '2026-11-02': 1, '2026-11-04': 1, '2026-11-06': 1, '2026-11-09': 1 } }));
  assert.equal(short.cur, 0);
  const rested = ev(habit({ sched: { type: 'perWeek', times: 3 }, start: '2026-11-09', log: { '2026-11-09': 1, '2026-11-10': 1 },
    skip: { '2026-11-11': 1, '2026-11-12': 1, '2026-11-13': 1, '2026-11-14': 1, '2026-11-15': 1 } }));
  assert.equal(rested.cur, 1);
});
test('times a week: starting mid-week only asks for what fits in the days left', () => {
  const e = ev(habit({ sched: { type: 'perWeek', times: 3 }, start: '2026-11-14', log: { '2026-11-14': 1, '2026-11-15': 1 } }));
  assert.equal(e.cur, 1);
});
test('times a month: complete months count', () => {
  const log = {}; for (const d of ['2026-09-02', '2026-09-09', '2026-10-01', '2026-10-15', '2026-11-03']) log[d] = 1;
  const e = ev(habit({ sched: { type: 'perMonth', times: 2 }, start: '2026-09-01', log }));
  assert.equal(e.cur, 2); assert.equal(e.unit, 'month');
});
test('daily goals: a day counts only once its target is reached', () => {
  const water = { goal: 8, unit: 'glasses' };
  const e = ev(habit({ ...water, start: k(2), log: { [k(2)]: 8, [k(1)]: 8, [k(0)]: 3 } }));
  assert.equal(e.cur, 2); assert.equal(e.doneToday, false); assert.equal(e.st.get(t), 'partial');
  assert.equal(ev(habit({ ...water, start: k(1), log: { [k(1)]: 5 } })).st.get(t - 1), 'missed');
  assert.equal(ev(habit({ ...water, start: k(0), log: { [k(0)]: 9 } })).doneToday, true);
});
test('statistics: hit rate and days done', () => {
  const e = ev(habit({ start: k(9), log: days(9, 8, 7, 5, 4, 3, 2, 1) }));
  assert.equal(e.total, 8); assert.equal(e.best, 5); assert.equal(Math.round(e.rate * 100), 89);
});
test('the chain: linked squares join across done, free-miss and rest days, not missed ones', () => {
  same(M.chainLinks(['done', 'done', 'missed', 'done', 'skip', 'frozen', 'done']), [false, true, false, false, true, true, true]);
  same(M.chainLinks(['done', 'off', 'off', 'done', 'due']), [false, true, true, true, false]);
});
test('milestone lists are unchanged', () => {
  assert.deepEqual([7, 30, 100, 365].filter(n => M.MILE.day.includes(n)), [7, 30, 100, 365]);
});

test('saved data: an old streak with missing fields loads with safe defaults and keeps its history', () => {
  const old = { id: 'hold', name: 'Read', icon: '📚', color: '#4f5bd5', sched: { type: 'daily' }, goal: 1, start: '2026-11-01', log: { '2026-11-02': 1, '2026-11-03': 2 } };
  const h = M.normHabit(old);
  assert.equal(h.photo, ''); assert.equal(h.photoOk, false); assert.equal(h.hidden, false); assert.equal(h.archived, false); assert.equal(h.freezes, 0);
  same(h.log, { '2026-11-02': 1, '2026-11-03': 2 }); assert.equal(h.start, '2026-11-01'); assert.equal(h.color, '#4f5bd5');
});
test('saved data: bad values are cleaned instead of crashing the app', () => {
  const h = M.normHabit({ id: 'x', name: 5, color: 'red', sched: { type: 'yearly', days: [9, 'a', 2] }, goal: -3, start: 'soon', log: { 'not-a-date': 4, '2026-11-02': -1, '2026-11-03': 2.7 }, photo: 'javascript:alert(1)' });
  assert.equal(h.name, '5'); assert.equal(h.color, M.COLORS[0]); assert.equal(h.sched.type, 'daily'); same(h.sched.days, [2]);
  assert.equal(h.goal, 1); assert.equal(h.start, M.keyOf(M.today())); same(h.log, { '2026-11-03': 2 }); assert.equal(h.photo, '');
});
test('saved data: settings from every earlier version load correctly', () => {
  const v1 = M.normSettings({ theme: 'system', accent: 'ink', density: 'compact', weekStart: 0, rollover: 2, sort: 'streak' });
  assert.equal(v1.theme, 'forest'); assert.equal(v1.layout, 'compact'); assert.equal(v1.weekStart, 0); assert.equal(v1.rollover, 2); assert.equal(v1.sort, 'streak');
  assert.equal(M.normSettings({ theme: 'light' }).theme, 'moss');
  assert.equal(M.normSettings({}).theme, 'forest'); assert.equal(M.normSettings({}).remindAt, '07:00');
  assert.equal(M.normSettings({ theme: 'constructor' }).theme, 'forest');
});
test('saved data: friend lists and profiles are cleaned', () => {
  same(M.normSocial({ following: ['u_a', 'u_a', 'bad id!', 7] }).following, ['u_a']);
  const p = M.normProfile({ name: 'Ana', photo: 'data:text/html;base64,AAAA', private: 1 });
  assert.equal(p.photo, ''); assert.equal(p.private, true);
});
test('saved data: comparing shared copies ignores key order', () => {
  assert.equal(M.stable({ b: 1, a: { d: 2, c: 3 } }), M.stable({ a: { c: 3, d: 2 }, b: 1 }));
});

test('word filter: blocks rude words and common disguises', () => {
  for (const w of ['shit list', 'sh1t', 'fuuuck', 'F.U.C.K', 'big ass', 'you bitch']) assert.equal(M.hasBad(w), true, w);
});
test('word filter: allows ordinary words that contain rude letters', () => {
  for (const w of ['Classic Grass Hello', 'Assignment', 'passage', 'Dickens', 'cocktail', 'Read 20 pages', 'Hancock']) assert.equal(M.hasBad(w), false, w);
});
test('word filter: masks only the rude word', () => {
  assert.equal(M.maskBad('nice shit day'), 'nice •••• day');
});

// Fixed in Phase 1 (found in Phase 0).
test('word filter: innocent names that contain a rude word are allowed (was a known issue)', () => {
  for (const w of ['Scunthorpe', 'Matsushita', 'shitake mushrooms']) assert.equal(M.hasBad(w), false, w);
});
test('hit rate on "certain weekdays" counts scheduled days only (was a known issue)', () => {
  const e = ev(habit({ sched: { type: 'weekdays', days: [1] }, start: '2026-11-02', log: { '2026-11-02': 1, '2026-11-03': 1 } }));
  assert.equal(Math.round(e.rate * 100), 33);
});

test('word filter: still catches rude words at the start or end of a longer word', () => {
  for (const w of ['bullshit', 'dipshit', 'horseshit', 'fuckface', 'shithead', 'ohfuck', 'motherfucker', 'shiiiit']) assert.equal(M.hasBad(w), true, w);
});
