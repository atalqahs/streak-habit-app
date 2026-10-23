# Habits

A premium, ultra-light weekly habit tracker for iPhone, built as an installable PWA.
One screen, a seven-day grid, and Snapchat-style streaks. Everything is stored locally.

- React 19 + TypeScript + Vite, plain CSS, IndexedDB (no runtime dependencies besides React).
- Hand-written service worker: the app shell is precached and works fully offline.
- Day boundaries and streaks use the **Asia/Kuwait** timezone. Weeks run Sunday → Saturday.

## Using it

| Action | How |
|---|---|
| Add a habit | **+** (name, emoji, type, weekdays, target) |
| Check / uncheck a day | Tap the circle (Check habits) |
| Log a counter or value | Tap the circle → sheet with − / + or a number field |
| Change week | Swipe the grid left/right, or the ‹ › buttons |
| Streak, best, total, edit, delete | Tap the habit name or its 🔥 streak |
| Reorder, export, import | ⚙︎ Settings |

**Habit types:** *Check* (one tap), *Counter* (whole-number target, e.g. 8 glasses),
*Value* (measured amount, e.g. 7.5 of 8 hours).

### Streak rules
- Each completed **scheduled** day adds 1; unscheduled days are ignored.
- One missed scheduled day → **🔥 n ⏳** (at risk). Completing the next scheduled day keeps it.
- Two consecutive missed scheduled days → reset to 0. Best streak is kept.
- Today is never counted as missed until midnight in Kuwait.
- Streaks are always recomputed from stored history. Schedule edits take effect from the day of
  the edit and are stored as versions, so past days keep their original schedule. Counter/value
  records store the target they were logged against, so changing a goal never rewrites history.

### Weight tracker
The card below the weekly grid shows the latest weight, the change since the previous entry,
start and goal, a progress bar, total lost, remaining, and the next 5 kg milestone. Weights can be
logged for any past date (no schedule, no streaks). Several entries on one day are kept in the
order logged; the most recent is current. Two compact "Coming Soon" cards are reserved below it
for future features (`ReservedCard` in `src/components/WeightCard.tsx`).

### Install on iPhone
Open the site in **Safari** → **Share** → **Add to Home Screen**. It launches full-screen,
offline, with its own icon and splash screen.

### Backups
Data lives only in this browser's storage, which iOS may clear (for example after long
inactivity, or when Safari website data is cleared). Backups include weight data; older
habit-only backups still import and leave existing weight data untouched. Use **Settings → Export Backup** regularly
and keep the JSON file in Files/iCloud Drive. **Import Backup** validates the whole file before
replacing anything; a bad file leaves current data untouched.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (streak engine, dates, backup validation)
npm run build      # typecheck + production build to dist/
npm run preview    # serve dist/
npm run icons      # regenerate icons/splash PNGs (needs Playwright + Chromium)
```

`vite.config.ts` uses `base: './'`, so the same build works at
`https://<user>.github.io/<repo>/` and on a custom domain. The service worker (`dist/sw.js`) is
generated at build time from `src/sw-template.js` with a content-hashed cache name. When a new
version activates it removes the old cache and reloads open windows, so updates appear on the next
launch. IndexedDB upgrades only ever add stores (v1 → v2 added the weight stores).

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys on every push to the default branch.

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to the default branch (or run the workflow manually from the **Actions** tab).
3. The site is served at `https://<user>.github.io/streak-habit-app/`.

## Design

The design system was produced with the UI UX Pro Max skill (installed in `.claude/skills/`);
decisions and tokens are recorded in [`design-system/habits/MASTER.md`](design-system/habits/MASTER.md).
