/* Motif rollback kit: removes the offline helper. Not used by the app or the build.
   Only when going back to a version without the offline helper, publish this file as dist/sw.js next to that version.
   It deletes the helper's saved copy of the app and unregisters itself, then reloads open pages.
   It never touches the phone's saved streaks or unsent changes (those live in localStorage, not here). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('motif-')).map(k => caches.delete(k))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(cs => cs.forEach(c => c.navigate(c.url)))));
