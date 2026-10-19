# NEKAI — Anime Watchlist

A responsive anime watchlist split into three services and a PostgreSQL database: a plain HTML, CSS and JavaScript **frontend**, an Express **api** (accounts, each user's data, anime data from the [Tenrai API](https://api.tenrai.org/documentation), an unofficial MyAnimeList data provider) and an Express **ai-service** (the Neko chatbot and Nekai's Picks, powered by Gemini). One reverse proxy is the single entry point.

```
Browser ──► proxy ─┬─ /                          ──► frontend   (static files)
                   ├─ /api/neko, /api/recommend  ──► ai-service ──(session + anime lookups)──► api
                   └─ /api/*, /avatars/*         ──► api ──► db (PostgreSQL, named volume)
```

![NEKAI system architecture](docs/architecture.png)

The full write-up (architecture, Dockerfiles, Compose, Jenkins, pipeline, testing, rollback, problems and contributions) is in [`docs/technical-documentation.pdf`](docs/technical-documentation.pdf), also as an editable Word file: [`docs/technical-documentation.docx`](docs/technical-documentation.docx).

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
| `proxy` | `nginxinc/nginx-unprivileged:1.27.5-alpine` | The only published port (8080). Routes `/api/neko` and `/api/recommend` to the ai-service, other `/api` paths and `/avatars` to the api, everything else to the frontend |
| `frontend` | `nginxinc/nginx-unprivileged:1.27.5-alpine` | The static site. Shows the deployed build number in the corner of every page (`/build.json`) |
| `api` | `node:24.22.0-alpine` | Accounts, user data, anime data |
| `ai-service` | `node:24.22.0-alpine` | Neko chat and Nekai's Picks |
| `db` | `postgres:16.15-alpine` | PostgreSQL, data in the `pg-data` named volume (profile pictures are in `uploads`) |

Base images are pinned to exact versions, so every build uses the same ones. To update one, change the tag in its `Dockerfile` (the api and ai-service use `node` in two stages each), and let the pipeline's tests confirm the change.

- **Networks:** `web-net` (proxy, frontend, api, ai-service) and `data-net` (api, db). Only the api can reach the database, and the database port is not published.
- **Start order:** health checks plus `depends_on: condition: service_healthy`: db, then api, then ai-service, then proxy.
- **Persistence:** `docker compose down` followed by `docker compose up -d` keeps all data. Only `down -v` deletes the volumes.
- **Tests:** `docker build --target test ./api` (and `./ai-service`, `./frontend`) runs that service's tests inside Docker. The api and ai-service run their unit and route tests; the frontend checks that every script parses and every page, script and style points at a file that exists (`frontend/tests/site.test.js`).
- **Schema:** `db/init.sql` runs only when the `pg-data` volume is empty. Existing data is never touched.
- **Image tags:** images are tagged `${TAG}` (the Jenkins build number; `latest` when unset). Roll back with the `nekai-rollback` Jenkins job (see [Rollback](#rollback)), or by hand with `TAG=<earlier build> docker compose up -d --no-build`.
- **Logs:** `docker compose logs -f api`. Password reset emails are printed there when `SMTP_HOST` isn't set.
- **Port 8080 taken?** (for example by a Jenkins installed directly on Windows) Set `HTTP_PORT=8090` and `APP_URL=http://localhost:8090` in `.env`.

### CI/CD with Jenkins

Jenkins runs in its own container, from its own compose file (`infra/jenkins/`), so the pipeline never redeploys Jenkins itself. It talks to the host's Docker through the mounted Docker socket, and its plugins (`infra/jenkins/plugins.txt`, pinned versions) are baked into the image, so the setup wizard has nothing to download.

**1. Start Jenkins**

```bash
cd infra/jenkins
docker compose up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword   # the unlock password
```

If jenkins.io's plugin servers are unreachable, build from a mirror instead:

```bash
JENKINS_UC=https://ftp.halifax.rwth-aachen.de/jenkins/updates \
JENKINS_UC_DOWNLOAD=https://ftp.halifax.rwth-aachen.de/jenkins \
docker compose up -d --build
```

**2. First visit** ([http://localhost:8081](http://localhost:8081)): paste the unlock password, choose **Select plugins to install → None → Install** (everything needed is already installed), then create your admin user. Check that Jenkins can use Docker: `docker exec jenkins docker ps` lists the NEKAI containers.

**3. The `.env` credential.** *Manage Jenkins → Credentials → System → Global credentials → Add Credentials*: Kind **Secret file**, upload your production `.env` (same format as `.env.example`), ID **`nekai-env`**. The pipeline passes it to compose with `--env-file`, so it's never written into the workspace or into Git.

**4. The pipeline job.** *New Item* → name `nekai` → **Pipeline** → *Pipeline*: Definition **Pipeline script from SCM**, SCM **Git**, Repository URL `https://github.com/jnncy-techcookie/nekai.git` (add a GitHub access token credential if the repository is private), Branch `*/main`, Script Path `Jenkinsfile`. Save, then press **Build Now once**: the first run registers the trigger declared in the Jenkinsfile. From then on, pushes start it automatically.

**Trigger:** the Jenkinsfile declares two triggers, so a push starts the pipeline with nobody pressing Build Now.
- **Webhook (instant):** `githubPush()`. Run `ngrok http 8081`, then add `https://<ngrok-url>/github-webhook/` under the repository's *Settings → Webhooks* (content type `application/json`, push events). Jenkins runs on a laptop with no public address, so ngrok is what lets GitHub reach it.
- **Poll SCM (fallback):** `pollSCM('H/2 * * * *')` checks GitHub every 2 minutes. It needs no public URL, so pushes are still picked up (within 2 minutes) if ngrok or the network is down.

**Stages:** Checkout → Test (`docker build --target test` for the api, the ai-service and the frontend; a failing test stops the pipeline here, so nothing is deployed) → Build Images (tagged with the build number) → Deploy (`docker compose up -d --wait`, waits for every health check) → Smoke Test / Verify (`scripts/smoke-test.js`: the proxy, the frontend, the api and its database, the ai-service, AI routing, and that the build number being served is this build's).

#### Rollback

Every build's images stay tagged with its build number (`nekai/api:14`, `nekai/db:14`, …), so a rollback rebuilds nothing: it points the running stack at an earlier build's images. It is a second, parameterized Jenkins job, defined in `Jenkinsfile.rollback`.

**Set it up once:** *New Item* → name `nekai-rollback` → **Pipeline** → *Pipeline script from SCM*, the same repository and branch as the `nekai` job, Script Path **`Jenkinsfile.rollback`**. It has no triggers: it only runs when someone starts it. Press **Build Now** once (it stops at Validate because no tag is set, and lists the builds you can use); from then on the job shows **Build with Parameters**.

**Use it:** *Build with Parameters*, enter `ROLLBACK_TAG` (a build number, e.g. `14`), and run. Its stages:

1. **Validate**: the tag must be digits only, and all five images for that build (`proxy`, `frontend`, `api`, `ai-service`, `db`) must still exist on the Jenkins host. If not, the log lists the builds that do exist, and nothing is changed.
2. **Rollback**: `docker compose up -d --no-build --wait` with `TAG` set to that build, using the same `nekai-env` credential.
3. **Smoke Test / Verify**: the same checks as a deploy, plus the page must report the build you rolled back to (the build label in the corner of every page).

Notes:
- **Data is kept.** The `pg-data` and `uploads` volumes are not touched. The database schema isn't versioned per build, so rolling back moves the code, not the data.
- **It uses the current `docker-compose.yml`.** If a later build changed the compose file itself (for example added a service), roll back far enough that all five images exist, and check the result.
- **The next push deploys a new build** on top of the rolled-back one: fix the problem, push, and the normal pipeline takes over.
- Old images are not cleaned up automatically. If the Jenkins host prunes them (`docker image prune -a`), those builds can no longer be rolled back to.
- Without Jenkins, the same thing by hand on the Jenkins host: `TAG=<earlier build> docker compose --env-file <your .env> up -d --no-build`.

**Security note:** mounting `/var/run/docker.sock` and running Jenkins as root gives Jenkins full control of the host's Docker. That's acceptable on a lab laptop, not in production: there, builds run on dedicated agents, with rootless Docker, Docker-in-Docker over TLS, or daemonless builders such as Kaniko or BuildKit. Jenkins's port is bound to `127.0.0.1`, so only this computer (or the ngrok tunnel) can reach it.

### Without Docker

You need Node.js 24 and a PostgreSQL 16 database. The quickest way to get the database is Docker (from the repository root):

```bash
docker run -d --name nekai-db \
  -e POSTGRES_USER=nekai -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=nekai \
  -p 5432:5432 -v nekai-pg-data:/var/lib/postgresql/data \
  -v "$PWD/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
  postgres:16.15-alpine
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
├── Jenkinsfile                deploy pipeline: Checkout, Test, Build Images, Deploy, Smoke Test
├── Jenkinsfile.rollback       parameterized rollback pipeline (ROLLBACK_TAG = a build number)
├── scripts/smoke-test.js      post-deploy checks, shared by both pipelines (runs inside the api container)
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
    ├── tests/site.test.js     static checks: scripts parse, every referenced file exists (run by the pipeline)
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

## Team

Course project: System Architecture and Integration (Docker and Jenkins final project).

| Member | Role | Main areas (from the Git history) |
|---|---|---|
| Jenna Cyrille Pugal (`jnncy-techcookie`) | *to confirm* | Jenkins pipeline and setup, failing-test and automatic-deployment demos, API tests, sign-in and profile fixes |
| Kristine Madronero | *to confirm* | Frontend: redesigns, dark mode, onboarding, library and phone layout, badges, Neko chat styling |
| Raiza Lhyn A. Gloria | *to confirm* | AI recommendations, XP, streak and achievements, Neko backend, settings, pull request reviews |
| Cheska Joyce | *to confirm* | PostgreSQL migration, api and ai-service test suites, Jenkins changes |
| Heidee David | *to confirm* | Module split, Dockerfiles and `docker-compose.yml` |

## Documentation

`docs/` holds the technical documentation as an editable Word file (`technical-documentation.docx`) and as a PDF, plus the architecture diagram, with their sources and the commands that rebuild them. See [`docs/README.md`](docs/README.md).

## Credits

Anime data © MyAnimeList, served through the unofficial Tenrai API. Fonts: Dela Gothic One via Google Fonts.
