# NEKAI — Anime Watchlist

A responsive anime watchlist with a plain HTML, CSS and JavaScript frontend and a small Express backend. The backend serves the site and fetches anime data from the [Tenrai API](https://api.tenrai.org/documentation) (an unofficial MyAnimeList data provider).

## Run it

From the repository root:

```bash
cd backend
npm install
npm start
```

Copy `backend/.env.example` to `backend/.env` and fill it in. `.env` is gitignored, and every key in it stays on the server.

- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API keys): the server uses the secret key to fill `anime_catalog` and to delete accounts. Never put it in frontend code.
- `GEMINI_API_KEY` turns on the **Neko chatbot** and AI picks (get one at [Google AI Studio](https://aistudio.google.com/apikey)). Without it, the rest of the app works and Neko explains that it isn't set up.

The browser signs in with Supabase's publishable key, set in `frontend/js/core/supabase.js`. It's safe to ship: row level security only lets each user read and write their own rows. For password reset emails, add `http://localhost:3000/signin.html` to *Authentication → URL Configuration → Redirect URLs* in Supabase.

Open [http://localhost:3000](http://localhost:3000). The frontend calls the backend at `/api/tenrai`; the backend requests `https://api.tenrai.org/v1`. To deploy live anime search, deploy both the frontend and the Node.js backend.

## Pages

| File (in `frontend/`) | Page | What it does |
|---|---|---|
| `index.html` | Home | Greeting, stats, continue-watching hero with episode stepper, streak, latest achievement, *Picked for you* row |
| `library.html` | Library | Search, sort and filter by status (Watching / Plan to Watch / Completed / Dropped); change progress, rating (a "★ 8.4" button that opens a pane: drag across the stars or type 1–10, one decimal) and status inline; remove |
| `discover.html` | Discover | Live Tenrai search with type and genre filters, *What should I watch next?* genre picker, Nekai's Picks (AI recommendations with a match % and High / Medium / Low tier), browse-by-genre signs |
| `<page>#anime-<id>` | Anime details | There is no separate details page. Titles, posters and "View details" links (`#anime-<id>`, where `id` is the MyAnimeList ID) open the **detail panel** (`js/core/detail-panel.js`) as a split view beside the page: poster, stats, synopsis, watchlist controls, details, trailer and episodes. It sits next to the content from 1024px (1280px with the sidebar expanded) and takes the content's place on narrower screens. Close with the X, Esc or Back; Ctrl/⌘-click opens the same page in a new tab with the panel open |
| `profile.html` | Profile | Level and XP, stats dashboard, favorite-genre mix, achievements |
| `settings.html` | Settings | Profile form with validation, sound / confetti / Neko / streak toggles, reduce motion, larger text, stronger outlines, CSV export, sign out, delete |
| *(every page)* | Neko chat | Click the floating Neko button at the bottom right of any page; the chat box grows out of it (click again, ×, or Esc to close). On phones it sits above the tab bar and the chat opens as a bottom sheet. Neko's greeting includes the page's tip, such as a streak reminder. Neko answers with Google Gemini and knows your list, ratings, streak, XP and achievements |
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
│       ├── routes/neko.js    Neko chat: validates, rate-limits, builds the prompt
│       ├── routes/recommend.js AI picks: asks Gemini for JSON picks, finds each on MyAnimeList via Tenrai
│       ├── routes/account.js  deletes the signed-in user's account (Supabase admin API)
│       ├── services/tenrai.js queues and caches upstream requests
│       ├── services/catalog.js saves anime details from Tenrai into Supabase's anime_catalog
│       ├── services/supabase.js server-side Supabase client (secret key) and access-token check
│       ├── services/gemini.js calls the Gemini API (key from backend/.env)
│       └── services/rate-limit.js per-IP request limits for the Gemini routes
└── frontend/                  the browser interface
    ├── index.html, library.html, discover.html,
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
        ├── data/sample-data.js   curated catalog (keyed by real MyAnimeList IDs), starter picks, genre colors
        ├── core/supabase.js      Supabase client: loads the signed-in user's data and saves each change
        ├── core/start.js         checks the session, loads the data, then runs the page's scripts
        ├── core/store.js         the user's data in memory, list actions with undo, streak / XP / achievements / match %
        ├── core/ui.js            icons, app shell (sidebar, mobile bars, floating Neko button), toasts, confetti, sound, shared components
        ├── core/neko.js         Neko chat panel (sends your list summary to /api/neko/chat)
        ├── core/detail-panel.js  the anime detail panel, a split view beside the page (opens from any #anime-<id> link)
        ├── services/tenrai.js     Tenrai client: rate-limited queue, 429 retry, normalisation
        ├── services/recommend.js  AI picks client (Discover only): sends your history to /api/recommend, saves the picks
        └── pages/                one script per page
```

HTML pages sit at the root of `frontend/` so their URLs stay short and links between pages are plain file names.

Scripts are classic `<script>` tags that share one `window.NEKAI` namespace. Serve the site through the backend so `/api/tenrai` is available. Each page loads Supabase's library, `data/sample-data.js` and `core/supabase.js`, then `core/start.js`, which runs the scripts listed in its `data-app` attribute in dependency order (`core/store.js`, `services/tenrai.js`, `core/ui.js`, `core/neko.js`, then the page's own `pages/*.js`) once the user's data has loaded.

Add new styles to the file that matches their scope (a token, a shared component, a single page), and add any new stylesheet to `css/main.css` so it loads.

## How the data works

- **Accounts**: every page needs a Supabase account (email and password). Signed-out visitors go to the sign-in page, and a new account starts empty, then picks 3 genres.
- **Your data** lives in Supabase: the library (`user_anime`), watch history (`watch_events`, one row per change), badges (`user_achievements`), *Not interested* titles, AI picks, settings, profile and Neko chats. `core/start.js` loads it all before the page runs, and `core/supabase.js` compares each change with what was last saved and writes only the rows that changed. Removing a title sets `deleted_at` instead of deleting the row. *Settings → Delete account* calls `DELETE /api/account`, which removes the account and, through the tables' cascades, all its data. Neko chats are saved in the `neko_conversations` / `neko_messages` tables, and the Neko switches in the `neko` / `neko_hidden` columns of `user_settings` (`core/supabase.js` maps them).
- **Anime details** (title, poster, genres…) are saved to `anime_catalog` by the backend whenever it fetches them from Tenrai, so a library loads without asking Tenrai again. The only thing kept in the browser is this device's sidebar and theme (`nekai:display`), so pages paint in the right theme before your data arrives.
- **Nekai's Picks** (Discover, and *Picked for you* on Home once they exist) come from Gemini. `services/recommend.js` sends up to 60 of your titles with their genres, status, rating and the first 200 characters of your review (if any) to `POST /api/recommend`. Gemini returns 10 titles, each with a one-line reason and a 0–100 fit estimate. The backend finds each title on MyAnimeList through Tenrai and drops anything already on your list or marked *Not interested*, keeping 8. Picks are saved in `user_recommendations` and only requested again when a title, status, rating, review or *Not interested* changes, after a day, or when you select **New picks**. If the AI can't answer, the curated picks in `sample-data.js` are shown and the page says so.
- **Match %** on AI picks is 60% the history formula (`store.match`: genre overlap, genres you rated highly, finished vs dropped) and 40% the AI's fit estimate (`store.blendMatch`). Other cards use the formula alone. Tiers: **High** 80%+, **Medium** 65–79%, **Low** under 65%.
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
- **XP** = 2 per episode + 50 per completed anime + 5 per rating + 10 per written review + 25 per badge + a streak bonus: each day you watch earns 5 × the day of the streak it continues (5, 10, 15 … up to 50 a day from day 10). XP is worked out from your list, log and badges, so removing a show takes its XP back.
- **Levels**: level *n* costs 500 + 100 × (*n* − 1) XP (500, 600, 700 …), so Level 10 takes 8,100 XP in total.
- **Titles** cover a range of levels: Newcomer 1–2, Casual Viewer 3–4, Regular 5–7, Weekend Binger 8–10, Enthusiast 11–14, Seasoned Viewer 15–18, Otaku in Training 19–22, Veteran 23–26, Sensei 27–29, Legend 30–39, then a new rank every 10 levels (Legend II 40–49 … Legend IX 110–119) and **Legendary** (Legend X) from Level 120.
- **Streak** counts consecutive days with at least one logged episode. Today stays open until midnight.
  - Episodes are logged by **+1**, and by marking a *Watching* title completed (its remaining episodes count for today). *Plan to Watch → Completed* is treated as backfilling history and isn't logged. **−1** takes back one of today's episodes.
  - The first episode of the day adds "Day N of your streak" to the toast; days 3, 7, 14, 30, 50, 100 and 365 get confetti and a sound.
  - With *Settings → Streak reminders* on, from 6 pm Neko warns on every page when a running streak has nothing logged today, and a toast repeats it once a day. With it off, Neko leaves the streak alone.
- **Achievements** are saved with the time they were unlocked (`earned` in `nekai:v1`), so a badge stays earned even if its condition stops holding (Week Streak counts any 7-day run). A change that unlocks one adds "<name> badge earned!" to its toast, or shows a toast of its own. Home shows the most recently unlocked badge. Badges already earned before unlock times were saved are recorded silently.

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

- **Type:** Dela Gothic One for display headings; The Last Shuriken (`.display-title`) for the Home greeting and name and the Library, Discover and Profile page titles; Kamikaze 3D Gradient is installed but unused; the body stack is `"Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`. Scale: 48 / 32 / 24 / 20 / 18 / 16 / 14.
- **Spacing:** an 8 pt scale (8, 16, 24, 32, 48, 64).
- **Strokes and shadows:** 1.5 px strokes. Shadows appear only on hovered and floating pick cards.
- **Touch targets:** primary buttons 48 px; icon buttons (close, more, heart) at least 44 × 44.
- **Breakpoints:**

  | Width | Layout |
  |---|---|
  | ≤ 1280 | Home and Profile go to a single column; Library list rows stack |
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

## Not done yet

- **Google sign-in** isn't set up yet: it needs a Google OAuth client added under *Authentication → Providers* in Supabase.
- **Share list** copies a link to your list, but there's no public page for someone else's list yet.

## Credits

Anime data © MyAnimeList, served through the unofficial Tenrai API. Fonts: Dela Gothic One via Google Fonts.
