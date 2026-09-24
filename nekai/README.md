# NEKAI — Anime Watchlist

A responsive anime watchlist built with **plain HTML, CSS and JavaScript**: no framework, no build step, no dependencies. Anime data comes from the free [Jikan API](https://docs.api.jikan.moe/) (unofficial MyAnimeList API).

## Run it

Open `index.html` in a browser. That's all.

For the smoothest experience (YouTube trailers in particular), serve the folder locally instead of opening the file directly:

```bash
# any one of these, from inside the nekai/ folder
python3 -m http.server 8000      # then visit http://localhost:8000
npx serve .
```

To deploy, upload the folder as-is to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

## Pages

| File | Page | What it does |
|---|---|---|
| `index.html` | Home | Greeting, stats, continue-watching hero with episode stepper, streak, latest achievement, *Picked for you* row |
| `my-anime.html` | My Anime | Search, sort and filter by status (Watching / Plan to Watch / Completed / Dropped); change progress, 5-star rating and status inline; remove |
| `discover.html` | Discover | Live Jikan search with type and genre filters, *What should I watch next?* genre picker, Nekai's Picks, browse-by-genre signs |
| `anime.html?id=…` | Anime details | Full Jikan record, trailer, episode list, add to list / update your entry. `id` is the MyAnimeList ID |
| `profile.html` | Profile | Level and XP, stats dashboard, favorite-genre mix, achievements |
| `settings.html` | Settings | Profile form with validation, sound / confetti / Lolli / streak toggles, reduce motion, larger text, stronger outlines, CSV export, sign out, delete |
| `signin.html` | Sign in / Create account | Validated forms with show-password and loading states |

## Project structure

```
nekai/
├── index.html, my-anime.html, discover.html, anime.html,
│   profile.html, settings.html, signin.html
├── css/
│   └── styles.css        tokens, base brand styles, components, layouts, responsive rules
├── js/
│   ├── data.js           sample catalog (keyed by real MyAnimeList IDs), seed list, picks, genre colors
│   ├── store.js          localStorage state, list actions with undo, streak / XP / achievements / match %
│   ├── jikan.js          Jikan client: rate-limited queue, 429 retry, normalisation
│   ├── ui.js             icons, app shell (sidebar, mobile bars, Lolli), toasts, confetti, sound, shared components
│   └── pages/            one script per page
└── assets/favicon.svg
```

Scripts are classic `<script>` tags that share one `window.NEKAI` namespace, so everything works from `file://` without a server or bundler.

## How the data works

- **Your list** (status, episodes watched, your 1–5 rating, favorites, hidden picks, watch log, settings and profile) is saved in the browser's `localStorage` under `nekai:v1`. Clear site data or use *Settings → Delete account* to start over.
- **Sample data**: a first visit is seeded with a realistic list so every screen has content. Each title uses its real MyAnimeList ID, so NEKAI fetches the real poster, score, synopsis and trailer in the background.
- **Jikan** is called for search, anime details, episode lists, the genre picker and poster images. Requests are spaced 400 ms apart to respect Jikan's rate limit (about 3 per second) and retried once on HTTP 429.
- **Offline or rate-limited?** Search falls back to the built-in sample list, and details pages show saved data. Each fallback is clearly labelled in the UI.

### Rules the app enforces
- Episode progress can't go past the total. Unknown totals show a count with no percentage.
- When every episode is watched, NEKAI offers **Mark completed**.
- Adding an episode to a *Plan to Watch* title moves it to *Watching*.
- Confetti plays only the **first** time a title is completed, and never with reduce motion on.
- Your personal 5-star rating is kept separate from the Jikan community score.
- Changes to your list show a toast with **Undo** (removing, rating, status changes, adding episodes).

### Formulas
- **Match %** = 60% genre overlap with your viewing + 30% how highly you rate those genres + 10% finish-vs-drop history, mapped to 35–95%.
- **XP** = 2 per episode + 50 per completed anime + 5 per rating. Every 500 XP is a level.
- **Streak** counts consecutive days with at least one logged episode. Today stays open until midnight.

## Design system

The official palette is **cream, cobalt blue and orange**. The tokens at the top of `styles.css` drive everything (some keep older names like `--red` and `--yellow` but hold palette colors):

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0F1F5C` | Navy: text, strokes, text on orange |
| `--paper` | `#F3EAD7` | Cream page background (32 px grid) |
| `--cream` | `#FAF3E6` | Light cream: sidebar, labels |
| `--red` | `#F25C05` | Brand orange: primary actions |
| `--blue` | `#1F3FA6` | Brand cobalt blue |
| `--yellow` | `#FFA25C` | Light orange: selected nav, accents, score chips |
| `--pink` / `--teal` / `--orange` | `#FFD3B3` / `#6F8FE8` / `#F7823A` | Peach, periwinkle, mid orange: stats, tags, signs |

- **Type:** Dela Gothic One for display headings; the body stack is `"Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`. Scale: 48 / 32 / 24 / 20 / 18 / 16 / 14.
- **Spacing:** an 8 pt scale (8, 16, 24, 32, 48, 64).
- **Strokes and shadows:** 1.5 px strokes. Shadows appear only on hovered and floating pick cards.
- **Touch targets:** primary buttons 48 px; icon buttons (close, more, heart) at least 44 × 44.
- **Breakpoints:**

  | Width | Layout |
  |---|---|
  | ≤ 1280 | Home and Profile go to a single column |
  | ≤ 1100 | Tablet: 2-column stats; list rows reflow |
  | ≤ 767 | Phone: the sidebar becomes a top bar plus bottom tabs, and the quick-info panel becomes a bottom sheet |

## Accessibility

- Skip link, landmarks and visible 3 px focus rings.
- Labelled form fields, with errors announced via `role="alert"` and `aria-invalid`.
- `role="tab"` status filters with arrow-key support.
- Switches use `role="switch"`, and progress bars expose their values.
- The live region announces toasts, and focus is kept when lists re-render.
- The quick-info panel opens on keyboard focus and closes with Esc.
- Respects `prefers-reduced-motion`, plus an in-app *Reduce motion* switch.

## What's mocked (no backend)

- **Sign in, sign up, Google sign-in and password reset** validate the form and store your profile locally. Replace `submit()` in `js/pages/signin.js` with your auth API to make them real.
- **Share list** copies a link to your list, but the list only exists in your browser until it's synced to a server.

## Credits

Anime data © MyAnimeList, served through the unofficial Jikan API. Fonts: Dela Gothic One via Google Fonts.
