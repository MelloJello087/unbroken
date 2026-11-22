# Motif feature roadmap

Status: **plan approved. Phase 0 complete; Phase 1 waits for the owner's go-ahead.**
Backup of the working version before any of this: branch `backup/v1.0-before-expansion`.

## What already exists

Several requested features are partly or fully built. The plan extends them rather than duplicating them.

| Request | Today | What's missing |
|---|---|---|
| 1. Streak freezes | "Free misses": 0–5 per month per streak, used up automatically, shown on the calendar and in stats | Earning freezes (1 per 7 successful days), a cap, an on/off switch, a clearer "freeze used" note |
| 2. Custom reminders | One reminder time for the whole app, shown as a bar inside the app | A time per streak, quiet hours, and real phone notifications (see risk R2) |
| 3. Custom daily goals | Daily target with a unit ("8 glasses"); progress ring; done at the target | Custom increment per double-tap (for example +5 pages), weekly targets |
| 4. Milestones | A message at 3, 7, 14, 30, 100, 365 days and more | A milestone list on the streak page, saved history, a quieter animation |
| 5. Dashboard | Reorder with arrows, groups (categories), sort options, synced | Drag and drop, pinning, filter by group |
| 6. Shared streaks | None | All of it |
| 7. Challenges | None | All of it |
| 8. Reactions | None | All of it |
| 9. Undo | Undo button for 5 seconds after a double-tap; minus button on the streak page | Undo for calendar taps; guard against accidental extra taps on a done streak |
| 10. Archive | Archive, an archived list in Settings, Bring back, separate Delete | An archived section reachable from the dashboard |
| 11. Progress notes | One "note to self" per streak | Notes and photos per day |
| 12. Templates | Removed on purpose earlier ("no automatically added streaks") | Templates as an opt-in choice only (see decision D2) |
| 13. Weekly recap | None | All of it |
| 14. Widgets | None | Needs the phone app first (see risk R2) |
| 15. Export | Full backup as a JSON file or text | A CSV of dates and counts |
| 16. Flexible scheduling | Every day, certain weekdays, every few days, times a week, times a month; unscheduled days never count against you | Clearer schedule labels; weekly totals for goal counters |
| 17. Streak types | Daily streaks (with daily goals) | Lifetime counters; weekly-reset goal counters |

## Decisions needed from the owner

**Owner's decisions:** D1 keep the monthly free misses for now. D2 templates approved, optional only. D3 social features approved with proper server-side security. D4 phone app after Phase 2, once stable and tested. D5 review security first; no public repo or deploy without the owner's approval.

- **D1. Freeze model.** Replace the monthly "free misses" with earned freezes: 1 per 7 successful days in a row, holding at most 3, on by default. Existing streaks that use free misses would switch to earned freezes, starting with as many as their monthly allowance (up to 3), so nobody loses protection overnight.
- **D2. Templates.** Earlier you asked for no automatically added streaks. Proposal: templates appear only behind a "Start from a template" link on the New streak screen and are never shown or added unless chosen.
- **D3. Where new social features run.** Shared streaks, challenges and reactions need database rules that only Supabase can express. They would work in the real app (GitHub Pages, later the phone app), not on the Claude test page. Everything in Phases 1 and 2 works in both.
- **D4. When to build the phone app.** Reliable notifications and home-screen widgets need Motif packaged as a real iPhone and Android app (Capacitor). Proposal: package after Phase 2, and build widgets with it.
- **D5. Finish going live first.** The three GitHub steps (make the repo public, turn on Pages, add the `SUPABASE_PUBLISHABLE_KEY` secret) so new features can be tried with real accounts.

## Risks and how to handle them

- **R1. Two ways of saving.** Every saved change has to work with Claude's database (test page) and Supabase (real app). New fields are added with defaults, so old saves keep working; no field is renamed. Each phase is tested in both.
- **R2. Notifications and widgets.** A web page can't wake a phone. Inside Claude, notifications aren't possible at all. A home-screen web app on iPhone can get them only with a push server, and widgets need native code. Phase 1 builds the reminder settings and the in-app reminder; real notifications arrive with the phone app (D4).
- **R3. Double-tap vs drag.** Dragging to reorder must not trigger double-tap or block scrolling. Plan: press and hold to pick up a card, then drag; the arrow buttons stay for accessibility.
- **R4. Two devices at once.** Each streak saves as one record; if two phones change the same streak at the same moment, the last save wins. That's fine for one person, but shared streaks and challenges need each person's check-ins stored separately (new Supabase tables with per-person rows), never one shared record.
- **R5. Freeze changes alter past streak numbers.** Changing how freezes work can change a streak count retroactively. Earned freezes apply only from the day the feature ships; earlier days keep today's rules.
- **R6. One growing file.** The app is about 1,550 lines in one file. That's fine through Phase 2. Before Phase 3, consider splitting it into a few files.
- **R7. Safety on the server.** The photo and word checks still run only on the phone. Shared streaks, challenges, notes with photos and reactions put more user content in front of others, so server-side checks should land with Phase 3.
- **R8. Regressions.** So far the browser tests have lived outside the repo. Phase 0 adds them to the repo so every phase is checked against everything before it.

## Phases

Sizes: S = a few hours, M = about a day, L = several days.

### Phase 0: Ready the ground (complete)
1. Backup branch `backup/v1.0-before-expansion`: verified identical to the pre-plan version. **Done.**
2. Test suite in `tests/` (see tests/README.md): 29 logic tests, 23 screen tests and 6 server tests, plus 2 tracked known issues. Full run: 58 passed, 0 failed. Also runs on GitHub for every push. **Done.**
3. Security review for going live (below). Going live waits for the owner's approval (D5).

#### Phase 0 findings

Bugs and limitations in the existing app:
- **B1. Friends' changes aren't live in the account version.** With Supabase, other people's changes (and your own from another phone) arrive every 45 seconds or when you return to the app. The Claude test page updates live. Fix: Supabase Realtime, which needs the three tables added to Supabase's realtime list (a small database setting change, needs approval).
- **B2. Word filter false alarms.** "Scunthorpe", "Matsushita" and "shitake" are blocked because they contain a rude word. Tracked as a known-issue test.
- **B3. Hit rate is inflated on "certain weekdays" streaks** when you also do it on unscheduled days. Tracked as a known-issue test.
- **B4. Two phones editing the same streak at the same moment:** the last save wins (roadmap R4).
- **B5. No password reset and no way to delete an account** in the account version. Reset needs an email service.
- **B6. Profile photos can't be uploaded in the account version** (the photo check isn't available there yet); preset pictures work.

Security review (for D5):
- **Good:** privacy rules on for every table; signed-out visitors have no access at all; the sign-up check and the network-fingerprint salt can't be reached by app users; every rule checked by tests; no secret in any of the 10 commits in the project's history; secrets check runs on every commit and push.
- **Fix before going public:**
  1. Bot protection on sign-up (CAPTCHA, for example Cloudflare Turnstile), since there is no email check.
  2. A tamper check (integrity hash) on the Supabase library loaded from the public code host.
  3. Turn on Supabase's leaked-password check if the plan allows it.
  4. Set the site address in Supabase from `localhost` to the real one.
- **Know before going public:** "public" profiles and streaks are visible to anyone with an account, and anyone can make one; the photo and word checks run only on the phone until Phase 3's server checks (R7); no account deletion or password reset (B5).

### Phase 1: Core improvements
1. **Undo everywhere (S).** Undo after calendar taps and the +/− buttons too, not just double-tap. On a streak that's already done today with a goal of 1, a double-tap asks "Already done today. Add another?" instead of silently counting twice. Statistics update instantly and sync as today.
2. **Archive on the dashboard (S).** An "Archived (n)" link at the end of the streak list opens the archived section, with Bring back and Delete clearly separated. History and stats are kept.
3. **Reminders per streak (M).** Each streak gets an optional reminder time, following its own schedule (no reminder on unscheduled days, none once done). Global quiet hours in Settings. The existing app-wide reminder becomes the default. Delivery for now is the in-app reminder bar; phone notifications come with D4. Settings are saved and synced so they work the moment notifications do.
4. **Drag to reorder (M).** Press and hold a card, then drag it; arrows remain in reorder mode. Order syncs across devices as today.
5. **Scheduling clarity (S).** Already flexible; this makes it clearer. The schedule shows on each streak page, there's a calm "Not scheduled today" state, and a check that unscheduled days are never penalized across all five schedule types.

New saved fields: `remindAt`, `remindOn` per streak; `quietFrom`, `quietTo` in settings. No database changes.

### Phase 2: Tracking improvements
1. **Streak types (L).** A type picker on the New streak screen: Daily streak (today's kind), Lifetime counter (no schedule, no misses, double-tap adds, minus corrects), Goal counter (target and unit, resets daily or weekly). Same cards and design language for all three. New field: `kind`, defaulting to daily.
2. **Custom increments (S).** Each double-tap adds a chosen amount (for example +5 pages). New field: `step`, defaulting to 1.
3. **Milestones (M).** 7, 30, 100 and 365 for daily streaks (and similar for weeks and months). A small milestone row on the streak page with dates earned, worked out from history so it can't drift out of sync. A quiet one-line celebration, no pop-ups.
4. **Earned freezes (M).** Per D1. Shows "Freezes: 2 of 3" on the streak page and marks freeze-used days on the calendar. Respects every schedule. New fields: `freezeOn`, with history kept in the log.
5. **Weekly recap (M).** A recap card on the dashboard on the first day of the week, opening a single summary screen: streaks completed, completion %, total check-ins, longest active streak, milestones, versus last week. Worked out from existing data; nothing new stored.

### Phase 3: Social (real app only, see D3)
1. **Reactions (M).** A small set (for example 👏 🔥 🌱) on friends' milestones; respects private profiles and private streaks. New Supabase table with rules: you can react only to what you can see, and only remove your own.
2. **Shared streaks (L).** Invite friends; each person records their own check-ins (separate rows, see R4); everyone sees each other's progress; leave any time. New tables: shared streaks, members, check-ins.
3. **Challenges (L).** A set number of days, invite friends, individual progress and a final result, no ranking board. Builds on the shared-streak tables.
4. **Server-side safety (M).** Photo and word checks on the server for anything others can see (R7).

### Phase 4: Additional features
1. **Progress notes (M).** A short note, and optionally a photo, per day; private unless shared. Photos need Supabase storage.
2. **Templates (S).** Opt-in only, per D2.
3. **CSV export (S).** Dates and counts per streak, next to the existing JSON backup.
4. **Category filters (S).** Groups already exist; add a filter row and pinning.
5. **Phone app and widgets (L).** Capacitor packaging, real notifications, then iPhone and Android widgets (D4).

## Conflicts checked

- **Freezes vs rest days vs flexible schedules:** rest days stay neutral and never use a freeze; freezes cover only scheduled, missed days.
- **Lifetime counters vs freezes, reminders and milestones:** counters have no schedule, so no freezes or misses; reminders are optional; milestones count totals (10, 50, 100…).
- **Goal counters vs double-tap:** double-tap always adds the streak's increment; the target decides when the day is done.
- **Drag vs double-tap vs scrolling:** see R3.
- **Undo vs sync:** undo writes a normal correction, so it syncs like any other change.
- **Shared streaks vs privacy:** shared streaks are visible only to their members; a private profile hides your personal streaks, not the shared ones you joined.
