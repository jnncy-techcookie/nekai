# NEKAI — Anime Watchlist

A responsive anime watchlist split into three services and a PostgreSQL database: a plain HTML, CSS and JavaScript **frontend**, an Express **api** (accounts, each user's data, anime data from the [Tenrai API](https://api.tenrai.org/documentation), an unofficial MyAnimeList data provider) and an Express **ai-service** (the Neko chatbot and Nekai's Picks, powered by Gemini). One reverse proxy is the single entry point.

```
Browser ──► proxy ─┬─ /                          ──► frontend   (static files)
                   ├─ /api/neko, /api/recommend  ──► ai-service ──(session + anime lookups)──► api
                   └─ /api/*, /avatars/*         ──► api ──► db (PostgreSQL, named volume)
```

Only the **api** talks to PostgreSQL. The **ai-service** has no database: it asks the api to check the session cookie and to search Tenrai, so every Tenrai call shares one rate-limited queue and cache. Everything runs in containers with Docker Compose (see below). Without Docker, the three services can also run on a laptop behind `dev/gateway.js`, a small stand-in for the proxy.

## Run it

### With Docker (recommended)

You need Docker (Docker Desktop with WSL 2 on Windows) and nothing else.

```bash
cp .env.example .env        # then set DB_PASSWORD and GEMINI_API_KEY
docker compose up -d --build
```

Open [http://localhost:8080](http://localhost:8080). The stack is five containers:

| Container | Image | Role |
|---|---|---|
| `proxy` | `nginxinc/nginx-unprivileged:1.27-alpine` | The only published port (8080). Routes `/api/neko` and `/api/recommend` to the ai-service, other `/api` paths and `/avatars` to the api, everything else to the frontend |
| `frontend` | `nginxinc/nginx-unprivileged:1.27-alpine` | The static site. Shows the deployed build number in the corner of every page (`/build.json`) |
| `api` | `node:24-alpine` | Accounts, user data, anime data |
| `ai-service` | `node:24-alpine` | Neko chat and Nekai's Picks |
| `db` | `postgres:16-alpine` | PostgreSQL, data in the `pg-data` named volume (profile pictures are in `uploads`) |

- **Networks:** `web-net` (proxy, frontend, api, ai-service) and `data-net` (api, db). Only the api can reach the database, and the database port is not published.
- **Start order:** health checks plus `depends_on: condition: service_healthy`: db, then api, then ai-service, then proxy.
- **Persistence:** `docker compose down` followed by `docker compose up -d` keeps all data. Only `down -v` deletes the volumes.
- **Tests:** `docker build --target test ./api` (and `./ai-service`) runs a service's tests inside Docker.
- **Schema:** `db/init.sql` runs only when the `pg-data` volume is empty. Existing data is never touched.
- **Image tags:** images are tagged `${TAG}` (the Jenkins build number; `latest` when unset). Roll back with `TAG=<earlier build> docker compose up -d --no-build`.
- **Logs:** `docker compose logs -f api`. Password reset emails are printed there when `SMTP_HOST` isn't set.

### Without Docker

You need Node.js 24 and a PostgreSQL 16 database. The quickest way to get the database is Docker (from the repository root):

```bash
docker run -d --name nekai-db \
  -e POSTGRES_USER=nekai -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=nekai \
  -p 5432:5432 -v nekai-pg-data:/var/lib/postgresql/data \
  -v "$PWD/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
  postgres:16-alpine
```

The schema in `db/init.sql` runs the first time the container starts with an empty `nekai-pg-data` volume. The data stays in that volume when the container is stopped, removed or recreated. To apply the schema to an existing database by hand, run `psql "$DATABASE_URL" -f db/init.sql` (every statement skips what already exists).

Then start the three pieces, each in its own terminal, from the repository root:

```bash
# 1. api (port 3000)
cd api && cp .env.example .env     # then fill it in
npm install && npm start

# 2. ai-service (port 3001)
cd ai-service && cp .env.example .env     # then add your GEMINI_API_KEY
npm install && npm start

# 3. dev gateway: serves frontend/ and routes the /api paths (port 8080)
node dev/gateway.js
```

`.env` files are gitignored, and every value in them stays on the server:

- `api/.env`: `DATABASE_URL` points the api at PostgreSQL, e.g. `postgresql://nekai:change-me@localhost:5432/nekai`. `APP_URL` and the optional `SMTP_*` settings are for password reset emails (without `SMTP_HOST`, the api prints each reset email, with its link, to its log). `UPLOAD_DIR` (optional) is where profile pictures are stored; it defaults to `api/uploads/` (gitignored).
- `ai-service/.env`: `GEMINI_API_KEY` turns on the **Neko chatbot** and AI picks (get one at [Google AI Studio](https://aistudio.google.com/apikey)); without it the rest of the app works and Neko explains that it isn't set up. `API_URL` is where the api lives (`http://localhost:3000`).

Open [http://localhost:8080](http://localhost:8080) and create an account. Each backend service has a health check: `GET /api/health` on the api answers `{"status":"ok","database":"ok"}` when it can reach the database (503 when it can't), and `GET /health` on the ai-service answers `{"status":"ok"}`.

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
nekai/
├── README.md
├── db/init.sql                PostgreSQL schema (tables, keys, checks)
├── dev/gateway.js             local stand-in for the reverse proxy (no Docker needed)
├── api/                       service 1: accounts, user data and anime data (the only one that uses PostgreSQL)
│   ├── package.json, .env.example
│   └── src/
│       ├── server.js          the API, /avatars and GET /api/health
│       ├── routes/anime.js    validates anime requests (/api/tenrai)
│       ├── routes/auth.js     accounts: sign up, sign in, sign out, password reset, change email
│       ├── routes/me.js       the signed-in user's data: load it all, save changes (one transaction), avatar, Neko chats
│       ├── routes/catalog.js  reads saved anime details from anime_catalog
│       ├── routes/account.js  deletes the signed-in user's account and all its data
│       ├── services/db.js     PostgreSQL connection pool and transactions (DATABASE_URL)
│       ├── services/auth.js   password hashing (scrypt) and cookie sessions
│       ├── services/avatars.js profile picture files (UPLOAD_DIR)
│       ├── services/mailer.js password reset emails (SMTP, or the log)
│       ├── services/tenrai.js queues and caches upstream requests
│       ├── services/catalog.js saves anime details from Tenrai into anime_catalog
│       └── services/rate-limit.js per-IP limits for sign-in and password reset
├── ai-service/                service 2: Neko chat and Nekai's Picks (Gemini), no database
│   ├── package.json, .env.example
│   └── src/
│       ├── server.js          /api/neko, /api/recommend and GET /health
│       ├── routes/neko.js     Neko chat: validates, rate-limits, builds the prompt
│       ├── routes/recommend.js AI picks: asks Gemini for JSON picks, finds each on MyAnimeList through the api
│       ├── services/api-client.js asks the api to check the session cookie and to search Tenrai (API_URL)
│       ├── services/gemini.js calls the Gemini API (key from ai-service/.env)
│       └── services/rate-limit.js per-user request limits for the Gemini routes
└── frontend/                  service 3: the browser interface (static files)
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
        ├── core/db.js            talks to the api service: signs in, loads the user's data and saves each change
        ├── core/start.js         checks the session, loads the data, then runs the page's scripts
        ├── core/store.js         the user's data in memory, list actions with undo, streak / XP / achievements / match %
        ├── core/ui.js            icons, app shell (sidebar, mobile bars, floating Neko button), toasts, confetti, sound, shared components
        ├── core/neko.js          Neko chat panel (sends your list summary to /api/neko/chat)
        ├── core/detail-panel.js  the anime detail panel, a split view beside the page (opens from any #anime-<id> link)
        ├── services/tenrai.js    Tenrai client: rate-limited queue, 429 retry, normalisation
        ├── services/recommend.js AI picks client (Discover only): sends your history to /api/recommend, saves the picks
        └── pages/                one script per page
```

HTML pages sit at the root of `frontend/` so their URLs stay short and links between pages are plain file names.

Scripts are classic `<script>` tags that share one `window.NEKAI` namespace. Serve the site through the proxy (or `dev/gateway.js`) so the `/api` paths are available. Each page loads `data/sample-data.js` and `core/db.js`, then `core/start.js`, which runs the scripts listed in its `data-app` attribute in dependency order (`core/store.js`, `services/tenrai.js`, `core/ui.js`, `core/neko.js`, then the page's own `pages/*.js`) once the user's data has loaded.

Add new styles to the file that matches their scope (a token, a shared component, a single page), and add any new stylesheet to `css/main.css` so it loads.

## How the data works

- **Accounts**: every page needs an account (email and password). Signed-out visitors go to the sign-in page, and a new account starts empty, then picks 3 genres. Passwords are hashed with scrypt. Signing in sets an HttpOnly, SameSite=Lax session cookie; the `sessions` table keeps only a SHA-256 hash of each token, and a session lasts 30 days from its last use. Password reset links are single use and expire after an hour. Sign-in, sign-up and reset requests are rate-limited per IP.
- **Your data** lives in PostgreSQL (schema: `db/init.sql`): the library (`user_anime`), watch history (`watch_events`, one row per change), badges (`user_achievements`), *Not interested* titles (`hidden_recommendations`), AI picks (`user_recommendations`), settings (`user_settings`), profile (`profiles`) and Neko chats (`neko_conversations` / `neko_messages`). The browser never talks to the database: `core/start.js` loads everything from `GET /api/me` before the page runs, and `core/db.js` compares each change with what was last saved and sends only what changed to `POST /api/me/changes`, which checks every value and saves the batch in one transaction. Every query is limited to the signed-in user's own rows. Removing a title sets `deleted_at` instead of deleting the row. *Settings → Delete account* calls `DELETE /api/account`, which deletes the `users` row; every other table cascades from it, and the profile picture files are removed too.
- **Profile pictures** are files in `UPLOAD_DIR/avatars/<user id>/`, served at `/avatars/…`. The server checks each upload's first bytes (WebP, JPEG or PNG only, up to 1 MB), and a profile can only point at its owner's own file.
- **Anime details** (title, poster, genres…) are saved to `anime_catalog` by the api service whenever it fetches them from Tenrai, so a library loads without asking Tenrai again (`GET /api/catalog`). The only things kept in the browser are this device's sidebar and theme (`nekai:display`), so pages paint in the right theme before your data arrives, and a per-tab copy of your data (sessionStorage) that makes moving between pages instant.
- **Nekai's Picks** (Discover, and *Picked for you* on Home once they exist) come from Gemini. `services/recommend.js` sends up to 60 of your titles with their genres, status, rating and the first 200 characters of your review (if any) to `POST /api/recommend`. Gemini returns 10 titles, each with a one-line reason and a 0–100 fit estimate. The ai-service finds each title on MyAnimeList through the api service (Tenrai) and drops anything already on your list or marked *Not interested*, keeping 8. Picks are saved in `user_recommendations` and only requested again when a title, status, rating, review or *Not interested* changes, after a day, or when you select **New picks**. If the AI can't answer, the curated picks in `sample-data.js` are shown and the page says so.
- **Match %** on AI picks is 60% the history formula (`store.match`: genre overlap, genres you rated highly, finished vs dropped) and 40% the AI's fit estimate (`store.blendMatch`). Other cards use the formula alone. Tiers: **High** 80%+, **Medium** 65–79%, **Low** under 65%.
- **Tenrai** is called for search, anime details, episode lists, the genre picker and poster images. Browser requests are spaced 400 ms apart, and the api service queues requests across users and caches successful responses. Tenrai's public limit is 120 requests per minute, 4 per second, and 40,000 per day per IP.
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

- **Google sign-in** isn’t set up yet: it would need a Google OAuth client and an OAuth route in `routes/auth.js`.
- **Share list** copies a link to your list, but there's no public page for someone else's list yet.

## Credits

Anime data © MyAnimeList, served through the unofficial Tenrai API. Fonts: Dela Gothic One via Google Fonts.
