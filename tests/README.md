# Motif tests

Run everything with `tests/run.sh`. Needs Node 22+ and Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`).

| File | What it checks | Runs |
|---|---|---|
| `unit.test.cjs` | The real streak engine from `app/unbroken.html`: dates, every schedule, rest days, free misses, daily goals, stats, the chain, loading old and damaged saves, the word filter | Always |
| `ui.test.cjs` | The app on phone-sized screens as on the Claude test page, with a stand-in database: creating, photos, double-tap, undo, goals, the streak page, calendar, editing, archive, delete, reorder, settings, reminder, friends and privacy, backup, first-version saves, browser-only saving, no sideways scrolling | Always |
| `server.test.cjs` | A real Supabase project: password rules, accounts, privacy rules, the sign-up limit, syncing between two phones, a phone that was offline, starting offline, an expired login, friends and privacy | Only with Supabase settings |

**Server tests run against the separate test project (motif-test), never the real one.** They refuse the real project unless `MOTIF_ALLOW_PRODUCTION_TESTS=yes` is set on purpose, and they stop if the address and project ID point at different projects. Server tests need `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the environment. Clean-up and the sign-up-limit test also need `SUPABASE_PROJECT_REF` and a management token (`SUPABASE_ACCESS_TOKEN`, unless a proxy adds it). Never write these values into the repository. The stand-in Claude database used by the screen tests keeps its data across page reloads (like the real one) but not across new browsers. Behind a network proxy, also set `NODE_USE_ENV_PROXY=1`, or the tests can't reach Supabase and hang. Every account they make is `motif-test-…@example.com` and is deleted afterwards, even when a test fails.

**Known issues** are kept as `todo` tests: they run and report every time but don't fail the suite. When one is fixed, remove its `todo` so it guards against coming back.

Test photos are drawn during the run, and the Supabase library for the server tests is downloaded into `tests/.cache/` (not committed).
