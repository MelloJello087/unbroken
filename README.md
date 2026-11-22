# Motif

![Motif](assets/motif-mark.svg)

A streak tracker. Give each streak a photo and a title, double-tap it whenever you do it, and keep the chain going. Add friends to follow each other's streaks.

## What it does today

- Streaks with your own photo or a preset picture, on any schedule: every day, certain days, every few days, or a number of times a week or month.
- Double-tap a streak to count it. Rest days and "free misses" keep a streak alive.
- Profiles with a picture, friends you can add, and privacy for your whole profile or single streaks.
- Six themes (dark Forest green by default), a daily reminder time, and backup to a file.
- Safety: new photos are checked before friends can see them, and rude words are blocked in titles and names.

## Accounts

The published version has real accounts on Supabase: sign up with an email and password, log in, and log out from Settings.
- Passwords need 8 or more characters, an uppercase letter, a lowercase letter, a number and a symbol. Supabase checks this on its server too.
- No email confirmation, so people can start right away.
- At most 5 accounts per network (IP address). Only a salted fingerprint of the address is stored.
- Database tables and their privacy rules are in `supabase/migrations/`. People can only change their own data; signed-out visitors see nothing.

## Publishing

Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/pages.yml`). The Supabase publishable key comes from the repository's encrypted Actions secret `SUPABASE_PUBLISHABLE_KEY`; it is never stored in the code.

## Where it runs right now

The app is one file, `app/unbroken.html`. It is published as a private Claude page for testing:
https://claude.ai/artifact/VD69xcp8H5pyn3V46WkQuC

Inside Claude, sign-in, saving, friends and the photo check all go through the viewer's Claude account. Opened anywhere else, it still works but saves only in that browser.

To try it in a normal browser, run `tools/standalone.sh` and open `dist/index.html`.

## Keeping secrets out

Passwords, keys, tokens and codes never go in this repository. A check blocks them before every commit and again on GitHub. After cloning, turn on the local check once:

```
git config core.hooksPath .githooks
```

## Plan to become a real app

1. **Accounts and database (done).** Sign up, log in and log out on Supabase. Still to come: password reset (needs an email service) and deleting your account.
2. **Server-side safety.** Run the photo check and the word filter on the server too, so nobody can get around them.
3. **Phone apps.** Wrap the same screens for iPhone and Android with Capacitor. This also fixes photo uploads, which the Claude Android app blocks inside pages.
4. **Push notifications** for the daily reminder.
5. **App Store and Google Play** listings. iPhone needs a Mac and Apple's developer program ($99 a year); Android needs a Google Play account ($25 once).
