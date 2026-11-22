# Unbroken: guide for agents

Unbroken is a streak tracker that is on its way to becoming a real phone app. See README.md for what it does and the plan.

- **The app is one file:** `app/unbroken.html`. It has no build step and no packages. Keep its `/* ---------- Section ---------- */` headers and dense style.
- **It is also a Claude page** (https://claude.ai/artifact/VD69xcp8H5pyn3V46WkQuC) used for testing. That page format has no `<!doctype>`, `<html>`, `<head>` or `<body>`; `tools/standalone.sh` adds them for normal browsers.
- **Saving:** inside Claude, data lives in the page's database: private data under `data/users/<id>/` and public profiles under `people/<id>`. Outside Claude it falls back to `localStorage` (`unbroken:v1`). Give new saved fields a default and never rename existing ones, so people's saves keep working.
- **Plain English** for the owner: say what changed in the app, and say plainly when something is untested.
- **Never claim something works unless you ran it.** Test in a browser (Playwright is available) before pushing.
- **Commit messages** describe what the user sees, such as `App: preset profile pictures`.
