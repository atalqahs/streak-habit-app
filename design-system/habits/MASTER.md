# Habits — Design System (Master)

Derived with the UI UX Pro Max skill (`.claude/skills/ui-ux-pro-max`):
`--design-system "habit tracker productivity minimal dark ios" --variance 2 --motion 2 --density 6`,
then refined with focused `--domain style|color|typography|ux|web` and `--stack react` searches.
The aggregate result recommended a light landing-page palette and rounded display fonts; those did not
fit a dark, single-screen iPhone utility, so only the matching parts were kept (per the skill's
"verify, then retry narrower" rule).

## Style
- **Dark Mode (OLED)** + **Minimalism**: black canvas, one dark surface for the grid, no gradients,
  no glass, no decorative shadows. Blur/scrim only to signal a dismissible sheet.
- One screen. Every secondary task is a bottom sheet or alert (no routes, no tab bar).

## Color tokens (`src/styles.css :root`)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#000000` | Page |
| `--surface` | `#121214` | Weekly grid card |
| `--sheet` / `--control` | `#1C1C1E` / `#2C2C2E` | Sheets / inputs, rows, buttons |
| `--text` | `#FFFFFF` | Primary text, completed circles |
| `--text-2` | `rgba(235,235,245,.62)` | Secondary text (≈7.4:1 on black) |
| `--ring` | `rgba(255,255,255,.46)` | Open-day outline (≥3:1 non-text) |
| `--fire` / `--fire-core` | `#FF7A1A` / `#FFC04D` | Streak flame |
| `--amber` | `#FFB340` | At-risk hourglass |
| `--danger` | `#FF453A` | Destructive actions only |

## Typography
- iOS system font (SF Pro via `-apple-system`): native feel, zero font bytes, works offline.
  (Skill suggested Plus Jakarta Sans; rejected to avoid a network font in an offline-first PWA.)
- Large title 34/700, sheet title 20/700, body 17, row names 15/600, labels 12–13.
- `font-variant-numeric: tabular-nums` for dates, streak counts and progress.
- Inputs are ≥16px to prevent iOS focus zoom.

## Icons
- Inline SVG, one 2px round-stroke family (`src/components/icons.tsx`). No icon package.
- Emoji are used only as user-chosen habit content, never as UI controls.

## Spacing, shape, touch
- 4pt scale (`--s1`…`--s6`), radii 10 / 14 / 20 / 22 (sheet).
- Header and sheet controls 44×44pt. Grid cells use the full column × 50px row as hit area
  (≥24 CSS px WCAG 2.5.8; seven columns cannot reach 44pt on a 375pt screen alongside names).

## Motion
- Press 120ms, state 160ms, sheet in 280ms / out 180ms (exit faster than enter).
- Transform/opacity only. `prefers-reduced-motion` collapses all motion.
- Week swipe: 12px threshold + horizontal dominance, live finger tracking, arrow buttons as the
  non-gesture alternative.
