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
test('milestones: the approved thresholds', () => {
  same(M.MILESTONES.day, [7, 30, 100, 365]); same(M.MILESTONES.week, [4, 12, 26, 52]); same(M.MILESTONES.count, [10, 50, 100, 250, 500, 1000]);
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

test('reminder settings: old saves get safe defaults; bad times are ignored', () => {
  const h = M.normHabit({ id: 'h', name: 'x' });
  assert.equal(h.remindMode, 'default'); assert.equal(h.remindAt, '');
  const c = M.normHabit({ id: 'h', name: 'x', remindMode: 'custom', remindAt: '21:30' });
  assert.equal(c.remindMode, 'custom'); assert.equal(c.remindAt, '21:30');
  const bad = M.normHabit({ id: 'h', name: 'x', remindMode: 'loud', remindAt: '25:99' });
  assert.equal(bad.remindMode, 'default'); assert.equal(bad.remindAt, '');
  const s = M.normSettings({});
  assert.deepEqual([s.quiet, s.quietFrom, s.quietTo], [false, '22:00', '07:00']);
  assert.equal(M.normSettings({ quietFrom: '7pm' }).quietFrom, '22:00');
});

test('scheduling: unscheduled time never breaks a streak, for all five schedule types', () => {
  // Today is Wednesday 18 Nov. Each streak was kept on every day it was required, with long unscheduled gaps.
  const cases = [
    ['every day, with rest days in the gaps', { sched: { type: 'daily' }, start: k(4), log: days(4, 2, 0), skip: { [k(3)]: 1, [k(1)]: 1 } }, 3],
    ['certain weekdays (Mondays only)', { sched: { type: 'weekdays', days: [1] }, start: '2026-11-02', log: { '2026-11-02': 1, '2026-11-09': 1, '2026-11-16': 1 } }, 3],
    ['every few days (every 5)', { sched: { type: 'interval', every: 5 }, start: k(14), log: days(14, 10, 5, 1) }, 4],
    ['times a week (once)', { sched: { type: 'perWeek', times: 1 }, start: '2026-11-02', log: { '2026-11-06': 1, '2026-11-09': 1 } }, 2],
    ['times a month (once)', { sched: { type: 'perMonth', times: 1 }, start: '2026-09-01', log: { '2026-09-30': 1, '2026-10-01': 1 } }, 2],
  ];
  for (const [name, o, want] of cases) { const e = ev(habit(o)); assert.equal(e.cur, want, name); assert.equal([...e.st.values()].includes('missed'), false, name + ': nothing marked missed'); }
});
test('scheduling: a calm message on days a streak is not scheduled', () => {
  const thu = load({ now: '2026-11-19T12:00:00' });
  const h = thu.normHabit({ id: 'h', name: 'x', sched: { type: 'weekdays', days: [1, 3, 5] }, start: '2026-11-16', log: { '2026-11-16': 1, '2026-11-18': 1 } });
  assert.equal(thu.statusText(h, thu.evaluate(h, thu.today()), thu.today()), 'Not scheduled today');
  const i = thu.normHabit({ id: 'i', name: 'x', sched: { type: 'interval', every: 3 }, start: '2026-11-18', log: { '2026-11-18': 1 } });
  assert.equal(thu.statusText(i, thu.evaluate(i, thu.today()), thu.today()), 'Next: Saturday');
});

/* ---------- Phase 2 ---------- */
test('types: old saves become plain streaks with an increment of 1', () => {
  const h = M.normHabit({ id: 'h', name: 'x' });
  same([h.kind, h.step, h.period], ['streak', 1, 'day']);
  const bad = M.normHabit({ id: 'h', name: 'x', kind: 'race', step: -4, period: 'year', goal: 500000 });
  same([bad.kind, bad.step, bad.period, bad.goal], ['streak', 1, 'day', 99999]);
});
test('counter: adds up totals, this week, this month and the best day, and never misses', () => {
  const e = ev(habit({ kind: 'counter', unit: 'books', start: '2026-10-01', log: { '2026-10-05': 2, '2026-11-02': 1, '2026-11-16': 3, '2026-11-18': 1 } }));
  same([e.cur, e.sum, e.week, e.month, e.best, e.total, e.today], [7, 7, 4, 5, 3, 4, 1]);
  assert.equal(e.dueToday, false); assert.equal(e.rate, null);
  assert.equal([...e.st.values()].includes('missed'), false);
});
test('counter: milestones are dated by when the total crossed them', () => {
  const log = {}; for (let n = 12; n >= 1; n--) log[k(n)] = 5;
  const e = ev(habit({ kind: 'counter', start: k(12), log }));
  assert.equal(e.cur, 60); same(Object.keys(e.miles).map(Number), [10, 50]);
  assert.equal(M.keyOf(e.miles[10]), k(11)); assert.equal(M.keyOf(e.miles[50]), k(3));
});
test('goal (daily): the day counts once the target is reached, adding up in increments', () => {
  const e = ev(habit({ kind: 'goal', goal: 20, unit: 'pages', step: 5, start: k(3), log: { [k(3)]: 20, [k(2)]: 25, [k(1)]: 20, [k(0)]: 10 } }));
  assert.equal(e.cur, 3); assert.equal(e.today, 10); assert.equal(e.doneToday, false); assert.equal(e.dueToday, true); assert.equal(e.unit, 'day');
  assert.equal(e.sum, 75);
});
test('goal (weekly): counts add up across the week; full weeks make the streak', () => {
  const e = ev(habit({ kind: 'goal', period: 'week', goal: 100, unit: 'push-ups', start: '2026-11-02',
    log: { '2026-11-02': 60, '2026-11-05': 40, '2026-11-09': 30, '2026-11-12': 30, '2026-11-14': 50, '2026-11-17': 20 } }));
  assert.equal(e.unit, 'week'); assert.equal(e.cur, 2);
  same({ c: e.period.count, t: e.period.target }, { c: 20, t: 100 }); assert.equal(e.doneToday, false); assert.equal(e.dueToday, true);
  const met = ev(habit({ kind: 'goal', period: 'week', goal: 100, start: '2026-11-16', log: { '2026-11-16': 70, '2026-11-18': 30 } }));
  assert.equal(met.doneToday, true); assert.equal(met.cur, 1);
});
test('goal (weekly): a week short of the target breaks the streak', () => {
  const e = ev(habit({ kind: 'goal', period: 'week', goal: 100, start: '2026-11-02', log: { '2026-11-02': 100, '2026-11-09': 40 } }));
  assert.equal(e.cur, 0); assert.equal(e.best, 1);
});
test('milestones: a 7-day streak is dated by the 7th day, and stays earned after the streak breaks', () => {
  const e = ev(habit({ start: k(20), log: days(...range(20, 10), 1) }));
  assert.equal(M.keyOf(e.miles[7]), k(14)); assert.equal(e.cur, 1); assert.equal(e.best, 11);
  same(Object.keys(e.miles).map(Number), [7]);
});
test('milestones: weekly streaks use weeks (4, 12, 26, 52)', () => {
  const log = {}; for (let w = 0; w < 5; w++) for (const d of [0, 2, 4]) log[M.keyOf(M.dnOf('2026-10-12') + w * 7 + d)] = 1;
  const e = ev(habit({ sched: { type: 'perWeek', times: 3 }, start: '2026-10-12', log }));
  assert.equal(e.cur, 5); same(Object.keys(e.miles).map(Number), [4]);
});

/* ---------- Syncing between devices ---------- */
// base = what this phone last saw in the account, local = this phone now, remote = the account now.
const doc = o => M.normDoc('h1', { id: 'h1', name: 'Read', start: '2026-11-01', created: 1, log: {}, skip: {}, ...o });
const merged = (b, l, r) => JSON.parse(JSON.stringify(M.mergeDoc(b, l, r)));
test('syncing: check-ins made on two phones are both kept', () => {
  const b = doc({ log: { '2026-11-16': 1 } });
  const m = merged(b, doc({ log: { '2026-11-16': 1, '2026-11-17': 1 } }), doc({ log: { '2026-11-16': 1, '2026-11-18': 1 } }));
  same(Object.keys(m.log).sort(), ['2026-11-16', '2026-11-17', '2026-11-18']);
});
test('syncing: an edit on this phone does not wipe a check-in made on the other phone', () => {
  const b = doc({ log: { '2026-11-16': 1 } });
  const m = merged(b, doc({ log: { '2026-11-16': 1 }, note: 'edited offline' }), doc({ log: { '2026-11-16': 1, '2026-11-18': 1 } }));
  assert.equal(m.note, 'edited offline'); assert.equal(m.log['2026-11-18'], 1);
});
test('syncing: undoing a check-in on one phone removes it, even though the other phone still has it', () => {
  const b = doc({ log: { '2026-11-17': 1, '2026-11-18': 1 } });
  assert.equal(merged(b, doc({ log: { '2026-11-17': 1 } }), b).log['2026-11-18'], undefined);
  assert.equal(merged(b, b, doc({ log: { '2026-11-17': 1 } })).log['2026-11-18'], undefined);
});
test('syncing: counts added on two phones on the same day add up', () => {
  const b = doc({ log: { '2026-11-18': 2 } });
  assert.equal(merged(b, doc({ log: { '2026-11-18': 5 } }), doc({ log: { '2026-11-18': 3 } })).log['2026-11-18'], 6);
  assert.equal(merged(b, doc({ log: { '2026-11-18': 1 } }), doc({ log: { '2026-11-18': 3 } })).log['2026-11-18'], 2, 'one undo here, one more there');
});
test('syncing: different settings changed on each phone are both kept; the same one changed on both keeps this phone\'s', () => {
  const b = doc({ color: '#5f8f3e', note: '' });
  const m = merged(b, doc({ color: '#5f8f3e', note: 'mine' }), doc({ color: '#4f7aa3', note: '' }));
  assert.equal(m.note, 'mine'); assert.equal(m.color, '#4f7aa3');
  assert.equal(merged(b, doc({ name: 'Here' }), doc({ name: 'There' })).name, 'Here');
});
test('syncing: rest days and schedules merge like check-ins', () => {
  const b = doc({ skip: {} });
  const m = merged(b, doc({ skip: { '2026-11-17': 1 } }), doc({ skip: { '2026-11-16': 1 }, sched: { type: 'perWeek', times: 4 } }));
  same(Object.keys(m.skip).sort(), ['2026-11-16', '2026-11-17']); assert.equal(m.sched.type, 'perWeek');
});
test('syncing: deleting wins, and a streak deleted on another phone is not brought back', () => {
  const b = doc({ log: { '2026-11-16': 1 } });
  assert.equal(M.mergeDoc(b, null, doc({ log: { '2026-11-16': 1, '2026-11-18': 1 } })), null, 'deleted here');
  assert.equal(M.mergeDoc(b, doc({ note: 'edited offline' }), null), null, 'deleted on the other phone');
});
test('syncing: a new streak made on this phone is saved; with no record of the account\'s copy nothing is dropped', () => {
  const l = doc({ log: { '2026-11-18': 1 } });
  same(merged(null, l, null), JSON.parse(JSON.stringify(l)), 'new here');
  same(merged(undefined, l, null), JSON.parse(JSON.stringify(l)), 'saved by an older version: kept');
  const m = merged(undefined, doc({ log: { '2026-11-17': 1 } }), doc({ log: { '2026-11-18': 2 } }));
  same(m.log, { '2026-11-17': 1, '2026-11-18': 2 });
});
test('syncing: people you follow, added or removed on either phone', () => {
  const s = (f) => M.normDoc('social', { following: f });
  same(merged(s(['a', 'b']), s(['a', 'b', 'c']), s(['b', 'd'])).following.sort(), ['b', 'c', 'd']);
});
