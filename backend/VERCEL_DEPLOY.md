# Deploy NEKAI to Vercel

Use these settings when importing this repository into Vercel:

- Production branch: `main` (after this deployment branch is merged)
- Root Directory: `backend`
- Framework preset: auto-detect Express
- Node.js: `24.x`
- Build Command: leave blank/default
- Output Directory: leave blank/default
- Install Command: leave blank/default
- Do not set `PORT`

Required Vercel environment variables:

- `GEMINI_API_KEY` — use a newly rotated Gemini key
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Set them for Production and Preview. Never commit `backend/.env`.

After Vercel gives you the production URL:

1. In Supabase Authentication → URL Configuration, set Site URL to the production Vercel URL.
2. Add `https://YOUR-PROJECT.vercel.app/**` to Redirect URLs.
3. Keep `http://localhost:3000/**` for local development.
4. Test `/api/health`, sign-up, sign-in, password reset, library persistence, Neko and Nekai's Picks.

Production notes:

- The browser-facing Supabase publishable key in `public/js/core/supabase.js` is expected; the secret key must remain server-side.
- Neko and Nekai's Picks now require a valid Supabase access token.
- Google sign-in and Share list are hidden until those features are actually implemented.
- Vercel serves files from `public/`; Express serves the same directory when running locally.
