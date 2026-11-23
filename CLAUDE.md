# Motif: guide for agents

## The secrets rule (never break this)
**Never put a password, key, token, verification code, one-time code, connection string or anything like them in this repository**, not even for a moment, in any file, commit, issue, pull request or comment. Anything pushed to GitHub can be seen and copied by others, and git history keeps it even after it's deleted.
- Secrets live only in private places: environment variables, GitHub's encrypted Actions secrets, or the service's own settings (for example Supabase's dashboard).
- In code, read them from configuration at run time. Never write the value itself.
- Never ask the owner to paste a secret into chat. Use the secure credential form.
- This is enforced: `tools/check-secrets.sh` runs before every commit (turn it on with `git config core.hooksPath .githooks`) and on GitHub for every push. Never bypass it (no `--no-verify`). If it blocks something, remove the secret; don't weaken the check.
- If a secret ever does reach GitHub, tell the owner right away: it must be revoked and replaced, because deleting the file doesn't make it safe again.

Motif (first called Unbroken) is a streak tracker that is on its way to becoming a real phone app. See README.md for what it does and the plan.

- **Names:** the app is Motif. The repository, the Supabase project, the file name and the saved-data keys (`unbroken:v1` and friends) keep the old name on purpose, so nobody's saved streaks are lost. Don't rename them.
- **The app is one file:** `app/unbroken.html`. It has no build step and no packages. The one exception is `app/sw.js`, the offline helper: browsers require it to be a separate file. `tools/standalone.sh` copies it next to the page and stamps it with the build's fingerprint; it must never store anything from Supabase. Keep its `/* ---------- Section ---------- */` headers and dense style.
- **It is also a Claude page** (https://claude.ai/artifact/VD69xcp8H5pyn3V46WkQuC) used for testing. That page format has no `<!doctype>`, `<html>`, `<head>` or `<body>`; `tools/standalone.sh` adds them for normal browsers.
- **Saving:** inside Claude, data lives in the page's database: private data under `data/users/<id>/` and public profiles under `people/<id>`. Outside Claude it falls back to `localStorage` (`unbroken:v1`). Give new saved fields a default and never rename existing ones, so people's saves keep working. Changes always go through `persist()`, which merges with what the account holds (see the Merging section), so a phone that was offline never overwrites another phone's check-ins. Every save carries a one-time stamp (`rev`) and the app version (`app`, the `APP` constant); the database records the stamp (save receipts) and can refuse versions below a minimum (the version gate). Raise `APP` when a release changes how saving works. See ROADMAP.md for the rollout steps.
- **Design:** follow DESIGN.md. Use its color roles, type, spacing, sizes and corners; add anything new to DESIGN.md before using it.
- **Plain English** for the owner: say what changed in the app, and say plainly when something is untested.
- **Never claim something works unless you ran it.** Run `tests/run.sh` before pushing (see tests/README.md) and add tests for anything new. Known bugs live as `todo` tests until fixed.
- **Commit messages** describe what the user sees, such as `App: preset profile pictures`.
