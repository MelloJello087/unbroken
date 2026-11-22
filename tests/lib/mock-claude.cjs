// A stand-in for Claude's page database, user and photo checker, so the screen tests run the app
// exactly as it runs on the Claude test page, without touching anyone's real data.
// Runs inside the browser page (passed to addInitScript); `seed` fills the store, `photoCheck` is 'ok' | 'bad' | 'none'.
module.exports = function mockClaude({ seed = {}, me = 'u_me', photoCheck = 'ok' } = {}) {
  const store = new Map(Object.entries(seed)), listeners = new Set(), writes = [];
  window.__store = store; window.__writes = writes;
  window.__setPhotoCheck = v => { photoCheck = v; };
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = (p, d) => ({ id: p.split('/').pop(), exists: true, data: () => JSON.parse(JSON.stringify(d)), metadata: meta });
  const colDocs = path => { const depth = path.split('/').length + 1; return [...store.entries()].filter(([q]) => q.startsWith(path + '/') && q.split('/').length === depth).map(([q, d]) => snapDoc(q, d)); };
  const notify = () => { for (const l of listeners) l(); };
  const own = path => path.startsWith(`data/users/${me}/`) || path === `people/${me}` || path.startsWith(`people/${me}/`);
  const colRef = path => ({ path, doc: id => docRef(path + '/' + id),
    onSnapshot(next) { const l = () => setTimeout(() => { const docs = colDocs(path); next({ docs, size: docs.length, empty: !docs.length, metadata: meta, docChanges: () => [] }); }); listeners.add(l); l(); return () => listeners.delete(l); },
    get: async () => { const docs = colDocs(path); return { docs, size: docs.length, empty: !docs.length, metadata: meta }; } });
  const docRef = path => ({ path,
    set: async d => { writes.push('set ' + path); if (!own(path)) throw { code: 'invalid_argument' }; store.set(path, JSON.parse(JSON.stringify(d))); notify(); },
    delete: async () => { writes.push('del ' + path); if (!own(path)) throw { code: 'invalid_argument' }; store.delete(path); notify(); },
    collection: q => colRef(path + '/' + q) });
  const user = { id: async () => me, can: async () => true, profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: '', avatarUrl: '' }])) };
  const sample = Object.assign(async () => ({ text: '' }), {
    json: async () => { if (photoCheck === 'none') throw { code: 'not_granted' }; return { ok: photoCheck === 'ok' }; },
    limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg'] } }) });
  window.claude = { use: async n => n === 'db' ? { doc: docRef, collection: colRef } : n === 'user' ? user : n === 'sample' ? sample : null };
};
