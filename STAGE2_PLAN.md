# Motif Stage 2 plan: accounts, privacy and security

Status: **plan for the owner's review. Nothing in it is built or applied.** Stage 1 is merged into `main` and tested against the release build; publishing and production checks are still pending (the site has never been published).

Everything here is for the account version (the real site, later the phone app). The Claude test page uses Claude's own accounts and has no database rules of its own, so items B, C and F can't be enforced there (see "The Claude test page").

## 0. Groundwork: a separate test database

**Proposal.** Create a second, free Supabase project ("motif-test") and run every Stage 2 test there. So far tests have run on the real project. That was acceptable with Stage 1's additions, but Stage 2 changes sign-in settings (bot checks, email, password rules) that can't be switched back and forth on the real project for each test run.
- **Cost:** none. The free plan allows two projects. A free project pauses after a week without use and has no backups; both are fine for testing.
- **Who:** you create it in the Supabase dashboard, or approve me creating it. Its keys never go in the repository: the test key goes in through the secure form, and its settings are mirrored from the real project.

## A. Password reset and account recovery

**Solution**
- "Forgot password?" on the log-in screen. You enter your email, and Motif always answers "If an account uses that email, we've sent a reset link", so nobody can find out which emails have accounts.
- The emailed link opens Motif at "Choose a new password", with the same rules list as sign-up. Saving it signs you in.
- The link works once and expires after 1 hour.
- Emails are sent through **Resend**, connected to Supabase as its mail sender. Motif's code never holds a mail key; it lives only in Supabase's settings.

**Email confirmation, without slowing sign-up**
- Supabase has a setting that lets people sign in before confirming their email. With it, sign-up stays instant: you're in straight away.
- A "Confirm your email" message is sent in the background. Until it's confirmed, Settings shows "Email not confirmed · Resend".
- Recovery is only promised for confirmed emails. This closes two holes from the audit:
  - A mistyped email can be noticed and corrected.
  - Someone signing up with another person's email can't block that person, because the real owner can still reset it.
- Whether Supabase sends resets to unconfirmed emails will be tested; the screens will say exactly what happens.

**Security**
- No account enumeration. Reset links are single-use and expire.
- Reset requests get the bot check (D) and Supabase's email rate limits.
- A "Your password was changed" email is sent after any change.
- Changing the password while signed in asks for the current password (a built-in Supabase setting, currently off).

**Database changes**
- None in our tables. Supabase settings only: mail sender, allow unverified sign-ins, confirmation on, require the current password to change it, password-changed notice, and the email templates' wording in Motif's voice.

**What you need to set up**
- **A domain name** (about $10–15 a year). Resend only sends to other people's addresses from a domain you've verified; without one it can only email you. **This costs money, so it's your decision.**
- A free Resend account. Verify the domain there, then put Resend's mail settings into the Supabase dashboard (I'll give exact steps; the key never passes through chat).

**Experience**
- Log-in screen: a quiet "Forgot password?" link.
- Settings, Account:
  - your email, and whether it's confirmed
  - Change password
  - Log out
  - Delete account (B)

**Tests (test project)**
- Full reset flow: the test reads the one-time link from the test database, so no inbox is needed.
- The link expires and works only once.
- Unknown and known emails get the same answer.
- Rate limit.
- Weak new passwords are refused by the server.
- A password change needs the current password.
- Unsynced changes on the phone survive a reset and are saved afterwards (Stage 1's rule).

## B. Account deletion

**Solution**
- Settings, Account, "Delete account".
- The screen says plainly what goes: every streak, check-in, photo, your profile, friends and the receipts. It offers "Save a copy" first, then asks for your password.
- The deletion happens in the database: a protected function deletes the person signed in. Every table already removes a person's rows automatically when their account is deleted (checked). The function refuses unless the password was entered in the last few minutes, checked by the server, not just the app.
- Afterwards:
  - **This phone:** the account's copy, unsent changes and login are wiped. You see "Your account was deleted".
  - **Other devices:** on their next connection they see the same message and wipe their copy. Their unsent changes for that account are discarded, which is intended.

**App stores**
- Apple requires deletion to be startable inside the app: this covers it.
- Google also requires a web page where people can ask for deletion without the app. That's a simple page on the site, plus a contact email. **Decision: which address?**
- Both stores will also want a privacy policy before the phone app. That's not Stage 2, but noted.

**Security**
- Only you can delete yourself: the function only ever acts on the signed-in person.
- A stolen phone with an open session can't delete the account without the password.
- The deletion is all-or-nothing: if any part fails, nothing is deleted.

**Database changes**
- One new protected function, `delete_my_account()`. No table changes.

**Tests (test project)**
- Deleting removes rows from every table, and nothing of the account is left.
- It refuses without a recent password.
- Another user can't delete you.
- The other device's copy is wiped on its next connection.
- The same email can sign up again afterwards.
- Friends (C) no longer see you.

## C. Privacy: profiles, "People here" and friends

**Today**
- Anyone with an account can read every profile and every shared streak.
- "People here" lists everyone, and following is one-way with no approval.
- "Private" is enforced by the app removing copies, not by the database.

**Solution**
- **Remove "People here"** (as you decided earlier).
- **Friend codes.** Each profile gets a random code like `MTF-7KQ2-X9PD`, shown under Friends with Copy and Share buttons. Codes can be changed, which cancels the old one.
- **Requests and approval.** Entering a code shows only that person's name and picture and sends a request. They Accept or Decline. Either person can remove the friendship at any time.
- **The database decides who sees what:**
  - your profile (name, picture, bio): you and your friends only
  - your shared streaks: friends only, and only streaks you haven't made private
  - nobody else can list or read them, even by contacting the database directly
- **Discovery is opt-in by design.** The only way to find someone is a code they chose to share, and codes can't be guessed: lookups are rate-limited, and codes are long and random.
- **"Private profile"** stays: friends then see only your name and picture, none of your streaks.
- **Live updates** keep working, and Supabase applies the same rules to them, so you only get notices about friends. This will be tested, not assumed.

**Database changes**
- New tables: `friend_codes` and `friendships` (requests and accepted friends), with privacy rules.
- New read rules for `profiles` and `public_streaks`, replacing "anyone signed in can read".
- Protected functions:
  - look up a code (returns only name and picture)
  - request, accept, decline and remove a friend
  - change my code
- Server-side checks on profiles (see F).
- Additive apart from the two read rules. That's an intended behaviour change, applied together with the new app version.

**Existing data**
- The real project has no users, so nothing needs moving.
- Old one-way "following" lists are no longer used by the account version. They stay stored and unused, and aren't deleted.

**Experience**
- The Friends tab shows:
  - your code, with Copy and Share
  - "Add a friend" (enter a code)
  - requests waiting for you
  - your friends and their streaks, as today
- The wording says exactly who can see what, for example "Only your friends can see this streak".

**Tests (test project)**
- For every table and function: a stranger, a pending request, a friend, an ex-friend, a private profile and a private streak each see exactly what they should, through the app and through direct requests.
- Live updates don't leak to strangers.
- A code can't be listed, and lookups are rate-limited.
- Removing a friend cuts access immediately.
- Stage 1's friends test is rewritten for requests.

## D. Bot protection on sign-up

**Solution**
- **Cloudflare Turnstile** (free), built into Supabase, on sign-up, log-in and "Forgot password?".
- Usually invisible. Occasionally a one-click check.
- The server verifies every request, so bots can't skip the app.

**Security and privacy**
- Stops mass automated sign-ups and password guessing.
- Turnstile runs Cloudflare's code on those screens. This goes in the privacy policy.

**Database changes**
- None. Supabase settings: bot check on, with its secret key stored only in Supabase.

**What you need to set up**
- A free Cloudflare account and a Turnstile widget for the site address (and localhost for testing).
- Its secret key goes into the Supabase dashboard. Its public site key is added to the publishing secrets like the Supabase key.

**Tests**
- On the test project, using Cloudflare's published test keys: sign-up passes with a valid check, and a missing or failed check is refused by the server.

## E. The 5-accounts-per-network limit

**Problem**
- Phone carriers and schools put thousands of people behind one internet address.
- The count never goes down, so after 5 sign-ups on a school network nobody else there can ever join.

**Proposal**
- Keep a limit, but make it a **rolling 24 hours**: at most 10 new accounts per network per day, adjustable.
- Rely on Turnstile and Supabase's built-in per-address rate limits for the real protection.
- Network fingerprints older than a day are deleted. That's better for privacy too: today they're kept forever.
- Alternative: remove the network limit entirely once Turnstile is on. Simpler, slightly less protection. **Your choice.**

**Database changes**
- Update the existing sign-up check function and its table: add a time window and clean-up.

**Experience**
- The message stays plain: "Too many accounts were made on this network today. Try again tomorrow."

**Tests**
- The 11th sign-up in a day is refused, and it works again after the window passes (simulated by moving the stored time).
- Other networks aren't affected.

## F. Account security and data protection

- **Remove unneeded database rights.** Supabase gives signed-in users extra table rights by default (for example, emptying a whole table). Our app can't use them, but they should go.
- **Server-side profile checks:**
  - name up to 40 characters, bio up to 140
  - the picture must be a real image under a size limit
  - a basic word filter, so names and bios bypassing the app are still checked

  Today these checks run only in the app.
- **Password changes need the current password**, and send a notice email (A).
- **A full privacy-rule review:**
  - every table and function, with a real test proving each rule from each kind of user, signed out included
  - no protected function callable by the public
  - every protected function locked to the signed-in person
- **Live update channels** reviewed alongside (C).
- **Sessions:** logins stay as now (staying signed in on your phone). Deleting the account or resetting the password signs out every device.
- **Not included (cost or later):**
  - the leaked-password check needs Supabase's paid plan
  - two-step login can come later

## G. Keeping Stage 1 safe (regression testing)

- Every Stage 1 test runs unchanged on every change: 32 real-database and 127 simulated tests today. The only exception is the friends tests, which are rewritten for requests (C).
- New Stage 2 tests run against the test project; the full suite runs before anything reaches `main`.
- Specific checks:
  - merging, receipts, offline opening and the gate (still off) all behave exactly as before
  - account deletion and password reset never leave unsent changes in a broken state
  - the previous version's behaviour is documented if a Stage 2 database change affects it
- GitHub runs the tests on every push (now fixed).

## Order of work

Each step: build on the `stage2-accounts` branch, test against the test project, then show you the database change before anything touches the real project.

1. Test project (0).
2. Security clean-up and profile checks (F). Small and low-risk.
3. Account deletion (B). Needs no outside services.
4. Friends and privacy (C). The biggest change.
5. Bot protection (D). Needs your Turnstile keys.
6. Network limit (E).
7. Password reset (A). Needs a domain and Resend.

## The Claude test page

Claude's page database can't express friendships or delete accounts. Two options:
- **(a)** Keep the test page as it is (Claude accounts, the current friends feature) and say plainly it's for testing.
- **(b)** Hide the Friends tab on the test page.

**Recommendation: (b)**, since the test page is shared by link.

## Decisions needed from you

1. Test project: create it yourself, or approve me creating it (free)?
2. Email: buy a domain for Resend? (Cost; needed for password reset.)
3. Contact email for deletion requests (Google Play requirement).
4. Friends: codes plus approved requests, as proposed?
5. Network limit: rolling 10 a day, or remove it once Turnstile is on?
6. Claude test page: (a) keep friends, or (b) hide them?
7. Approve the order of work above?
