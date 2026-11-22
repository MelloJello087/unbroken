# Motif design system

Every screen is built from the pieces below. If something new is needed, add it here first, then use it.

## Idea

Motif is a log of small, repeated acts: the patterns you keep. The look borrows from a field notebook: flat paper surfaces, thin ruled lines, one ink color for text and one accent for action. Decoration comes from the user's own content (their photos and streak colors) and from one signature element, **the chain**: linked squares that fill in as days are done. The chain appears on every streak and in the calendar. Nothing glows, fades or floats.

## Logo

The mark is a serif **M** with a four-point star above it, in `assets/motif-mark.svg` (the original artwork is `assets/motif-logo-original.png`). In the app the M uses `--ink` and the star uses `--accent`, so it fits every theme. Use it flat: no glow, outline or gradient. Keep clear space of at least half the mark's width around it. Next to the wordmark "Motif", set the mark 24px tall with a 10px gap.

## Color

Each theme defines the same roles. Components use roles, never raw colors.

| Role | Used for |
|---|---|
| `--bg` | App background |
| `--surface` | Cards, sheets, the tab bar |
| `--surface-2` | Inputs, wells, unselected controls |
| `--line` | Hairline borders and dividers (1px) |
| `--ink` | Main text and icons |
| `--ink-2` | Secondary text |
| `--ink-3` | Hints, empty chain links, disabled |
| `--accent` / `--on-accent` | The one primary action per screen, selected states, progress |
| `--accent-soft` | Background of selected items and the reminder |
| `--danger` / `--on-danger` | Delete and errors only |
| `--hc` | A streak's own color: its chain, its counter and its tile |

Themes: Forest (default, dark green), Moss, Midnight, Ember, Sand, Ocean.

Rules: one filled accent button per screen at most. No gradients, except over a user's photo where text must stay readable, and even there use a solid chip instead where possible. Shadows only on things that sit above the page (sheets, the toast).

## Type

Two families. **Bricolage Grotesque** for numbers and titles, **Instrument Sans** for everything else.

| Token | Size / line | Weight | Used for |
|---|---|---|---|
| `--t-xs` | 12 / 16 | 600 | Labels, chips, meta |
| `--t-sm` | 13 / 18 | 400 | Hints, secondary lines |
| `--t-md` | 15 / 22 | 400–600 | Body, inputs, list rows |
| `--t-lg` | 17 / 24 | 600 | Card titles, buttons |
| `--t-xl` | 22 / 28 | 700 display | Sheet titles |
| `--t-2xl` | 28 / 32 | 700 display | Screen titles |
| `--t-num` | 64 / 64 | 700 display | The streak number on a streak's page |

Labels are sentence case, not all caps.

## Space

A 4px grid: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 20, `--s6` 24, `--s7` 32, `--s8` 48. Screen side margins are 16 (`--s4`). Gaps between cards are 12. Gaps between sections are 24 to 32.

## Shape and size

| Token | Value | Used for |
|---|---|---|
| `--r-sm` | 8px | Chips, day cells, small buttons |
| `--r-md` | 12px | Buttons, inputs, thumbnails, segmented controls |
| `--r-lg` | 16px | Cards, tiles, photo boxes |
| `--r-xl` | 24px | Top corners of sheets |
| round | 50% | Avatars, toggles, the streak check |

Control heights: `--h-sm` 36px, `--h-md` 44px (the default; every tap target is at least this), `--h-lg` 52px.

## Motion

`--fast` 120ms for presses, `--base` 200ms for state changes, `--slow` 280ms for sheets. One easing curve, `--ease`. Buttons and tiles dip to 97% when pressed. Sheets slide up; screens fade in when you switch tabs. Everything respects "reduce motion".

## Components

- **Tab bar** at the bottom: My streaks and Friends, with icons and labels. The selected tab is in ink with a short accent bar above it.
- **Header**: the logo, then the New button (accent outline), your picture, and settings.
- **Streak tile**: the photo or preset picture on a flat tint of the streak's color, a solid counter chip in the corner, and below it the title, status and a 7-day chain.
- **Streak row** (list layout): thumbnail, title and status with the chain, streak number, and today's check.
- **Sheet**: rises from the bottom with a grab handle, a title on the left, a close button on the right, and a 20px inner margin.
- **Grouped list** (settings, people): one bordered card with hairline dividers between rows; each row is at least 52px tall.
- **Buttons**: primary (filled accent), secondary (surface with a hairline), ghost (text only), danger. Heights 44, or 36 when small.
