# Unbroken

A streak tracker. Give each streak a photo and a title, double-tap it whenever you do it, and keep the chain going. Add friends to follow each other's streaks.

## What it does today

- Streaks with your own photo or a preset picture, on any schedule: every day, certain days, every few days, or a number of times a week or month.
- Double-tap a streak to count it. Rest days and "free misses" keep a streak alive.
- Profiles with a picture, friends you can add, and privacy for your whole profile or single streaks.
- Six themes (dark Forest green by default), a daily reminder time, and backup to a file.
- Safety: new photos are checked before friends can see them, and rude words are blocked in titles and names.

## Where it runs right now

The app is one file, `app/unbroken.html`. It is published as a private Claude page for testing:
https://claude.ai/artifact/VD69xcp8H5pyn3V46WkQuC

Inside Claude, sign-in, saving, friends and the photo check all go through the viewer's Claude account. Opened anywhere else, it still works but saves only in that browser.

To try it in a normal browser, run `tools/standalone.sh` and open `dist/index.html`.

## Plan to become a real app

1. **Accounts and database (next).** Move sign-in and saving to Supabase: email and password with strong password rules (8+ characters, upper and lower case, a number and a symbol), log in and out, password reset, and a limit on sign-ups enforced by the server.
2. **Server-side safety.** Run the photo check and the word filter on the server too, so nobody can get around them.
3. **Phone apps.** Wrap the same screens for iPhone and Android with Capacitor. This also fixes photo uploads, which the Claude Android app blocks inside pages.
4. **Push notifications** for the daily reminder.
5. **App Store and Google Play** listings. iPhone needs a Mac and Apple's developer program ($99 a year); Android needs a Google Play account ($25 once).
