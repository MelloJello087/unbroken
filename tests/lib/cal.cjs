// Small helpers to describe a streak's history relative to "today".
module.exports = M => {
  const t = M.today(), k = n => M.keyOf(t - n);
  const days = (...ns) => Object.fromEntries(ns.map(n => [k(n), 1]));
  const range = (a, b) => { const r = []; for (let n = a; n >= b; n--) r.push(n); return r; };
  const habit = o => M.normHabit({ id: 'h1', name: 'Test', start: k(60), ...o });
  return { t, k, days, range, habit };
};
