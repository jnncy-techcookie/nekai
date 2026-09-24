# NEKAI — Anime Watchlist

A responsive anime watchlist with a plain HTML, CSS and JavaScript frontend and a small Express backend. The backend serves the site and fetches anime data from the [Tenrai API](https://api.tenrai.org/documentation) (an unofficial MyAnimeList data provider).

## Run it

From the repository root:

```bash
cd backend
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). The frontend calls the backend at `/api/tenrai`; the backend requests `https://api.tenrai.org/v1`. To deploy live anime search, deploy both the frontend and the Node.js backend.

## Pages

| File (in `frontend/`) | Page | What it does |
|---|---|---|
| `index.html` | Home | Greeting, stats, continue-watching hero with episode stepper, streak, latest achievement, *Picked for you* row |
| `my-anime.html` | My Anime | Search, sort and filter by status (Watching / Plan to Watch / Completed / Dropped); change progress, rating (a "★ 8.4" button that opens a pane: drag across the stars or type 1–10, one decimal) and status inline; remove |
| `discover.html` | Discover | Live Tenrai search with type and genre filters, *What should I watch next?* genre picker, Nekai's Picks, browse-by-genre signs |
| `<page>#anime-<id>` | Anime details | There is no separate details page. Titles, posters and "View details" links (`#anime-<id>`, where `id` is the MyAnimeList ID) open the **detail panel** (`js/core/detail-panel.js`) as a split view beside the page: poster, stats, synopsis, watchlist controls, details, trailer and episodes. It sits next to the content from 1024px (1280px with the sidebar expanded) and takes the content's place on narrower screens. Close with the X, Esc or Back; Ctrl/⌘-click opens the same page in a new tab with the panel open |
| `profile.html` | Profile | Level and XP, stats dashboard, favorite-genre mix, achievements |
| `settings.html` | Settings | Profile form with validation, sound / confetti / Lolli / streak toggles, reduce motion, larger text, stronger outlines, CSV export, sign out, delete |
| `signin.html` | Sign in / Create account | Validated forms with show-password and loading states |

## Project structure

```
nekai-anime-watchlist/
├── README.md
├── backend/                   Express server and Tenrai API proxy
│   ├── package.json
│   └── src/
│       ├── server.js          serves the frontend and /api/tenrai
│       ├── routes/anime.js    validates anime requests
│       └── services/tenrai.js queues and caches upstream requests
└── frontend/                  the browser interface
    ├── index.html, my-anime.html, discover.html,
    │   profile.html, settings.html, signin.html
    ├── assets/
    │   ├── fonts/             Kamikaze 3D Gradient, The Last Shuriken (declared in css/base/fonts.css)
    │   └── icons/favicon.svg
    ├── css/
    │   ├── main.css           entry point; @imports the files below in cascade order
    │   ├── base/              fonts.css (@font-face), tokens.css (colors, sizes), base.css (reset, type scale)
    │   ├── components/        components.css (buttons, cards, chips, pills, forms, poster art, picks, toasts)
    │   ├── layout/            shell.css (sidebar, mobile bars), helpers.css (spacing, grids), responsive.css
    │   ├── pages/             one stylesheet per page
    │   └── utilities/         preferences.css (reduce motion, larger text, stronger outlines)
    └── js/
        ├── data/sample-data.js   sample catalog (keyed by real MyAnimeList IDs), seed list, picks, genre colors
        ├── core/store.js         localStorage state, list actions with undo, streak / XP / achievements / match %
        ├── core/ui.js            icons, app shell (sidebar, mobile bars, Lolli), toasts, confetti, sound, shared components
        ├── core/detail-panel.js  the anime detail panel, a split view beside the page (opens from any #anime-<id> link)
        ├── services/tenrai.js     Tenrai client: rate-limited queue, 429 retry, normalisation
        └── pages/                one script per page
```

HTML pages sit at the root of `frontend/` so their URLs stay short and links between pages are plain file names.

Scripts are classic `<script>` tags that share one `window.NEKAI` namespace. Serve the site through the backend so `/api/tenrai` is available. Each page loads them in dependency order: `data/sample-data.js`, `core/store.js`, `services/tenrai.js`, `core/ui.js`, then its own `pages/*.js`.

Add new styles to the file that matches their scope (a token, a shared component, a single page), and add any new stylesheet to `css/main.css` so it loads.

## How the data works

- **Your list** (status, episodes watched, your rating from 1 to 10 (one decimal; older 1–5 star ratings are converted once, ×2), hidden picks, watch log, settings and profile) is saved in the browser's `localStorage` under `nekai:v1`. Clear site data or use *Settings → Delete account* to start over.
- **Sample data**: a first visit is seeded with a realistic list so every screen has content. Each title uses its real MyAnimeList ID, so NEKAI fetches the real poster, score, synopsis and trailer in the background.
- **Tenrai** is called for search, anime details, episode lists, the genre picker and poster images. Browser requests are spaced 400 ms apart, and the backend queues requests across users and caches successful responses. Tenrai's public limit is 120 requests per minute, 4 per second, and 40,000 per day per IP.
- **Offline or rate-limited?** Search falls back to the built-in sample list, and the detail panel shows saved data. Each fallback is clearly labelled in the UI.

### Rules the app enforces
- Episode progress can't go past the total. Unknown totals show a count with no percentage.
- When every episode is watched, NEKAI offers **Mark completed**.
- Adding an episode to a *Plan to Watch* title moves it to *Watching*.
- Confetti plays only the **first** time a title is completed, and never with reduce motion on.
- Your personal 1–10 rating is kept separate from the MyAnimeList community score.
- Changes to your list show a toast with **Undo** (removing, rating, status changes, adding episodes).

### Formulas
- **Match %** = 60% genre overlap with your viewing + 30% how highly you rate those genres + 10% finish-vs-drop history, mapped to 35–95%.
- **XP** = 2 per episode + 50 per completed anime + 5 per rating. Every 500 XP is a level.
- **Streak** counts consecutive days with at least one logged episode. Today stays open until midnight.

## Design system

The official palette is **cream, cobalt blue and orange**. The tokens in `css/base/tokens.css` drive everything (some keep older names like `--red` and `--yellow` but hold palette colors):

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0F1F5C` | Navy: text, strokes, text on orange |
| `--paper` | `#F3EAD7` | Cream page background (32 px grid) |
| `--cream` | `#FAF3E6` | Light cream: sidebar, labels |
| `--red` | `#F25C05` | Brand orange: primary actions |
| `--blue` | `#1F3FA6` | Brand cobalt blue |
| `--yellow` | `#FFA25C` | Light orange: selected nav, accents, score chips |
| `--pink` / `--teal` / `--orange` | `#FFD3B3` / `#6F8FE8` / `#F7823A` | Peach, periwinkle, mid orange: stats, tags, signs |

- **Type:** Dela Gothic One for display headings; The Last Shuriken (`.display-title`) for the Home greeting and name and the My Anime, Discover and Profile page titles; Kamikaze 3D Gradient is installed but unused; the body stack is `"Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`. Scale: 48 / 32 / 24 / 20 / 18 / 16 / 14.
- **Spacing:** an 8 pt scale (8, 16, 24, 32, 48, 64).
- **Strokes and shadows:** 1.5 px strokes. Shadows appear only on hovered and floating pick cards.
- **Touch targets:** primary buttons 48 px; icon buttons (close, more, heart) at least 44 × 44.
- **Breakpoints:**

  | Width | Layout |
  |---|---|
  | ≤ 1280 | Home and Profile go to a single column; My Anime list rows stack |
  | ≤ 1100 | Tablet: 2-column stats |
  | ≤ 767 | Phone: the sidebar becomes a top bar plus bottom tabs, and the quick-info panel becomes a bottom sheet |

## Accessibility

- Skip link, landmarks and visible 3 px focus rings.
- Labelled form fields, with errors announced via `role="alert"` and `aria-invalid`.
- `role="tab"` status filters with arrow-key support.
- Switches use `role="switch"`, and progress bars expose their values.
- The live region announces toasts, and focus is kept when lists re-render.
- The quick-info panel opens on keyboard focus and closes with Esc.
- Respects `prefers-reduced-motion`, plus an in-app *Reduce motion* switch.

## What's still local

- **Sign in, sign up, Google sign-in and password reset** validate the form and store your profile locally. Replace `submit()` in `frontend/js/pages/signin.js` with your auth API to make them real.
- **Share list** copies a link to your list, but the list only exists in your browser until it's synced to a server.

## Credits

Anime data © MyAnimeList, served through the unofficial Tenrai API. Fonts: Dela Gothic One via Google Fonts.
