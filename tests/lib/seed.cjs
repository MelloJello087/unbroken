// Realistic saved data for the screen tests, relative to the real "today".
module.exports = function seed({ me = 'u_me', friends = true } = {}) {
  const DAY = 864e5, n = new Date(), t = Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY);
  const pad = x => String(x).padStart(2, '0'), k = d => { const x = new Date(d * DAY); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()); };
  const days = (a, b, skip = []) => { const o = {}; for (let d = t - a; d <= t - b; d++) if (!skip.includes(t - d)) o[k(d)] = 1; return o; };
  const s = {};
  const H = (id, o) => { s[`data/users/${me}/${id}`] = { id, icon: '•', color: '#5f8f3e', sched: { type: 'daily' }, goal: 1, start: k(t - 30), freezes: 0, log: {}, skip: {}, ...o }; };
  H('h1', { name: 'Read 20 pages', icon: '📚', log: days(11, 1), order: 1 });
  H('h2', { name: 'Drink water', icon: '💧', color: '#3c8d8a', goal: 8, unit: 'glasses', log: { [k(t - 1)]: 8, [k(t)]: 3 }, start: k(t - 1), order: 2 });
  H('h3', { name: 'Run', icon: '🏃', color: '#cf7a3a', log: days(4, 0), order: 3, group: 'Health' });
  s[`data/users/${me}/settings`] = { theme: 'forest', layout: 'grid', remind: false };
  if (friends) {
    s['people/u_ana'] = { name: 'Ana', photo: '', bio: 'Running every day', private: false, streaks: 1, joined: 1 };
    s['people/u_ana/streaks/ha1'] = { id: 'ha1', name: 'Morning swim', icon: '🌊', color: '#4f7aa3', sched: { type: 'daily' }, goal: 1, start: k(t - 15), log: days(15, 0), skip: {}, order: 1 };
    s['people/u_bo'] = { name: 'Bo', photo: '', bio: '', private: true, streaks: 0, joined: 2 };
  }
  return { seed: s, today: k(t), key: d => k(t - d) };
};
