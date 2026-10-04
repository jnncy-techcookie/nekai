# NEKAI — Anime Watchlist

NEKAI is a responsive full-stack anime tracking and discovery web app. Users can build and manage an anime library, track episode progress, rate and review titles, maintain watch streaks, unlock achievements, discover personalized recommendations, and chat with **Neko**, NEKAI's Gemini-powered anime watch buddy.

The browser UI is built with plain **HTML, CSS, and JavaScript** and is served by a small **Node.js + Express** backend. **Supabase** provides authentication, PostgreSQL data storage, and profile-image storage. Anime data comes from the **Tenrai API**, and AI features use the **Google Gemini API**. The production app is prepared for **Vercel** deployment.

## Current features

### Accounts and onboarding

- Email/password sign up and sign in through Supabase Auth.
- New accounts start with an empty library instead of sample watchlist data.
- First-time onboarding asks the user to choose **3 favorite genres**. These are used as the starting point for personalization until the user builds watch history.
- Password reset and email-change flows.
- Editable display name and bio.
- Upload, change, or remove a profile picture. Images are validated, center-cropped, resized to 256 × 256, and stored in Supabase Storage.
- Sign out and permanent account deletion.
- Usernames/handles are no longer part of the profile model.

### Home

- Personalized greeting and account summary.
- Continue-watching section with episode progress controls.
- Library status overview.
- Current watch streak and latest achievement.
- XP and level progress.
- **Picked for you** recommendations based on the same recommendation data used by Discover.

### Library

- Full watchlist CRUD: add, view, update, and remove anime.
- Statuses: **Watching**, **Plan to Watch**, **Completed**, and **Dropped**.
- Search, status filters, sorting, and list/card layouts.
- Episode progress controls.
- Personal 1–10 rating, separate from the MyAnimeList community score.
- Written review/note support.
- Inline status changes.
- Multi-select mode for moving or removing several anime at once.
- Ctrl/Cmd-click, Shift-click, Ctrl/Cmd+A, hover checkboxes, and touch long-press selection.
- Undo support for major library actions.
- Completing the final episode automatically marks the anime as completed.

### Discover

- Live anime search through Tenrai.
- Type filtering and multi-genre filtering.
- Genres are fetched dynamically from Tenrai instead of being hardcoded.
- The most populated genres are surfaced first, while the full list stays alphabetized.
- Search results use pagination and current card/skeleton styling.
- **What should I watch next?** randomizer:
  - choose up to 5 genres or leave them blank for a fully random result;
  - skips titles already watched or dropped;
  - animated wheel/card reveal;
  - selected anime opens in a result dialog with **Add to Library**, **View details**, and **Spin again**.
- **Nekai's Picks** — Gemini-assisted recommendations personalized to the current user.
- **Popular right now** — top-rated currently airing titles from MyAnimeList/Tenrai.
- **Not interested** removes a title from recommendation surfaces and future picks.
- Offline/rate-limit fallbacks use NEKAI's built-in sample catalog where possible.

### Anime detail panel

NEKAI does not use a separate details page. Anime links open a reusable split-view detail panel on the current page using URLs such as `#anime-<mal_id>`.

The panel can show:

- poster and basic metadata;
- genres, type, year/season, studio, score, and episode information;
- synopsis;
- trailer when available;
- episode list/data;
- current library status and progress;
- rating/review controls;
- add, update, or remove actions.

On wide screens the panel sits beside the page. On smaller screens it takes over the content area. It can be closed with the X button, Escape, or browser Back.

### Profile, progression, and achievements

- Profile picture, display name, member-since year, and bio.
- Library totals, completed count, watched episodes, average rating, and best streak.
- Five highest-rated anime.
- Favorite-genre breakdown based on anime the user has actually started, completed, or dropped.
- Empty accounts correctly show a zero/empty genre state instead of assigning the remainder to **Other**.
- XP, levels, rank titles, and XP breakdown.
- Persistent achievements with unlock timestamps.
- Latest unlocked achievement appears on Home.

### Neko — AI watch buddy

Neko is available as a floating chat assistant across the authenticated app.

Neko can use a summary of the user's:

- library and statuses;
- ratings and reviews;
- watch streak;
- XP and level;
- achievements;
- recommendation context.

The backend sends Neko requests to Gemini. Requests require a valid Supabase access token and are rate-limited server-side. Neko conversation data is stored in Supabase. Some database tables and columns still use the older **Lolli** naming for compatibility, while the user-facing app consistently uses **Neko**.

### Settings and experience

- Profile picture, display name, email, and bio editing.
- Change-password flow.
- Sound effects toggle.
- Completion confetti toggle.
- Neko supporter toggle.
- Streak reminder toggle.
- Dark mode.
- Reduce motion.
- CSV watchlist export.
- Sign out.
- Permanent account deletion.

## Pages

All browser-facing files now live in `backend/public/`.

| File | Page | Main purpose |
|---|---|---|
| `index.html` | Home | Greeting, continue watching, stats, streak, achievement, personalized picks |
| `library.html` | Library | Search/filter/sort library, progress, ratings, status, bulk actions |
| `discover.html` | Discover | Tenrai search, dynamic genre filters, randomizer, AI picks, popular anime |
| `profile.html` | Profile | User stats, XP/level, top-rated titles, favorite genres, achievements |
| `settings.html` | Settings | Account/profile editing, preferences, CSV export, sign out/delete |
| `welcome.html` | Onboarding | Pick 3 favorite genres for a new account |
| `signin.html` | Authentication | Sign in, account creation, password-reset flow |
| `#anime-<id>` | Detail panel | Opens anime details inside the current page |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript |
| Backend | Node.js 24.x, Express 5 |
| Authentication | Supabase Auth |
| Database | Supabase PostgreSQL |
| File storage | Supabase Storage |
| Anime data | Tenrai API v1 / MyAnimeList data |
| AI | Google Gemini API |
| Hosting | Vercel |
| Client library | `@supabase/supabase-js` |

## How personalization works

### Favorite genres for a new account

A new account starts with no viewing history. During onboarding, the user chooses 3 favorite genres. Until the user starts adding and rating anime, those genres are used as the fallback signal for match percentages and AI recommendations.

For a title with no viewing history yet, the local match score is based on how many of the user's 3 chosen genres appear in that anime:

| Matching favorite genres | Starting match |
|---:|---:|
| 0 | 48% |
| 1 | 68% |
| 2 | 80% |
| 3+ | 90% |

### History-based match percentage

Once the user has started anime, the local match formula becomes:

```text
Match =
  60% genre overlap
+ 30% rating preference for those genres
+ 10% finish-vs-drop history
```

The result is mapped into approximately a **35–95%** range.

### Nekai's Picks

The recommendation client sends a summarized version of the user's recent library/history to `POST /api/recommend`. Gemini proposes candidate titles and a fit estimate. The backend resolves those titles through Tenrai, removes anime already in the user's library or marked **Not interested**, and returns the usable recommendations.

For AI-generated picks, the displayed match score blends both systems:

```text
Final AI match =
  60% NEKAI history-based match
+ 40% Gemini fit estimate
```

Recommendations are cached in Supabase and are refreshed when relevant library/recommendation inputs change, when they become stale, or when the user requests **New picks**.

**Popular right now** is different: the list itself comes from Tenrai's top currently airing titles. NEKAI may still show a user-specific match percentage on those cards, but the popularity ranking is not personalized.

## Data and persistence

Supabase is the source of truth for account data.

The app currently persists data such as:

- user profile and onboarding choices;
- library entries and statuses;
- watched episode history;
- ratings and written reviews;
- earned achievements;
- hidden / Not interested recommendations;
- cached AI recommendations;
- user settings and UI preferences;
- Neko conversations and messages;
- anime metadata cached in `anime_catalog`.

Deleting a library item uses a soft-delete timestamp so changes can be synchronized safely. Deleting the account uses the backend's Supabase admin access and removes the user's account data through the configured database relationships.

For faster page changes, NEKAI also keeps a temporary per-tab account snapshot in `sessionStorage`. Supabase remains the source of truth, and the page refreshes from Supabase in the background. Local storage is used for display/layout settings needed before first paint, such as dark mode and sidebar state.

## CRUD and online integration

NEKAI still covers the core CRUD + online-service requirements of the original anime watchlist project:

| Requirement | NEKAI implementation |
|---|---|
| Create | Add an anime to the library |
| Read | Load and display the signed-in user's saved library |
| Update | Change status, episode progress, rating, or review |
| Delete | Remove one or multiple anime from the library |
| Persistent data | Supabase PostgreSQL |
| Online lookup | Search and fetch live anime data through Tenrai |
| JSON handling | Browser ↔ Express ↔ Tenrai/Gemini/Supabase integrations |
| Safe integration | Server-side secrets, access-token validation, request validation, and rate limiting |

## Local development

### Requirements

- Node.js **24.x**
- npm
- Access to the configured Supabase project
- Gemini API key for Neko and AI recommendations

### 1. Install dependencies

From the repository root:

```bash
cd backend
npm ci
```

### 2. Create the backend environment file

Copy:

```text
backend/.env.example
```

to:

```text
backend/.env
```

Then provide the required server-side values:

```env
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
GEMINI_API_KEY=...
```

`backend/.env` is gitignored and must never be committed.

The browser uses the Supabase publishable key from `backend/public/js/core/supabase.js`. A publishable key is expected to be visible in frontend code; security depends on the project's Row Level Security policies. The Supabase secret/service-role key must stay server-side.

### 3. Start NEKAI

```bash
npm start
```

Open:

```text
http://localhost:3000
```

A quick backend health check is available at:

```text
http://localhost:3000/api/health
```

## Vercel deployment

The repository is structured so Vercel can deploy the Express backend and static frontend together.

Use:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root Directory | `backend` |
| Framework preset | Express / auto-detect |
| Node.js | `24.x` |
| Build Command | default / blank |
| Output Directory | default / blank |
| Install Command | default / blank |

Required Vercel environment variables:

```text
GEMINI_API_KEY
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Set them for both **Production** and **Preview** environments. Do not manually set `PORT`.

After deployment, update Supabase **Authentication → URL Configuration**:

- Site URL → the production Vercel URL
- Redirect URLs → the production Vercel URL pattern
- Keep `http://localhost:3000/**` for local development

See `backend/VERCEL_DEPLOY.md` for the deployment checklist.

## Project structure

```text
nekai/
├── README.md
└── backend/
    ├── .env.example
    ├── VERCEL_DEPLOY.md
    ├── package.json
    ├── package-lock.json
    ├── public/                     Browser application
    │   ├── index.html
    │   ├── library.html
    │   ├── discover.html
    │   ├── profile.html
    │   ├── settings.html
    │   ├── signin.html
    │   ├── welcome.html
    │   ├── assets/
    │   ├── css/
    │   └── js/
    │       ├── data/
    │       │   └── sample-data.js
    │       ├── core/
    │       │   ├── boot.js
    │       │   ├── start.js
    │       │   ├── store.js
    │       │   ├── supabase.js
    │       │   ├── ui.js
    │       │   ├── neko.js
    │       │   ├── panes.js
    │       │   └── detail-panel.js
    │       ├── services/
    │       │   ├── tenrai.js
    │       │   └── recommend.js
    │       └── pages/
    │           ├── home.js
    │           ├── library.js
    │           ├── discover.js
    │           ├── profile.js
    │           ├── settings.js
    │           ├── signin.js
    │           └── welcome.js
    └── src/                        Express backend
        ├── server.js
        ├── routes/
        │   ├── anime.js
        │   ├── neko.js
        │   ├── recommend.js
        │   └── account.js
        └── services/
            ├── tenrai.js
            ├── catalog.js
            ├── supabase.js
            ├── gemini.js
            └── rate-limit.js
```

### Main backend routes

| Route | Purpose |
|---|---|
| `GET /api/health` | Deployment/server health check |
| `/api/tenrai/*` | Validated Tenrai proxy and anime metadata caching |
| `POST /api/neko/chat` | Authenticated Gemini-powered Neko chat |
| `POST /api/recommend` | Authenticated Gemini + Tenrai recommendations |
| `DELETE /api/account` | Permanently delete the signed-in Supabase account |

## Important app rules

- Episode progress cannot exceed a known total.
- Incrementing a **Plan to Watch** anime starts it and changes the status to **Watching**.
- Watching the final known episode automatically changes the anime to **Completed**.
- Personal ratings and MyAnimeList community scores are stored/displayed separately.
- Completion confetti only triggers on the first completion and is disabled when Reduce motion is on.
- Achievements stay earned once unlocked.
- Watch streaks are based on days with logged episode activity.
- Major list changes offer Undo.
- Favorite-genre statistics ignore **Plan to Watch** titles because the user has not started them yet.

## Responsive design and accessibility

NEKAI supports desktop, tablet, and phone layouts.

On phones, the desktop sidebar becomes a compact top bar with a menu button that opens the navigation as a drawer. Hover-only interactions are removed or replaced for touch users.

Accessibility support includes labelled form controls, visible keyboard focus, ARIA roles/states, live regions for important feedback, keyboard-operable filters and dialogs, and a Reduce motion setting that works with `prefers-reduced-motion`.

## Current limitations / not yet implemented

- **Google sign-in** is not enabled yet.
- **Public Share list pages** are not implemented; the Share list action remains hidden.
- A completely new Supabase project cannot currently be recreated from the README alone unless the required NEKAI database schema, RLS policies, triggers, and storage configuration are also available.

## Credits

Anime metadata is sourced from MyAnimeList through the unofficial Tenrai API.

NEKAI uses Google Gemini for AI-assisted recommendations and the Neko chat assistant.

Dela Gothic One is loaded through Google Fonts. Additional project fonts and artwork are stored under `backend/public/assets/`.
