# Jonathan Runs 🏃‍♂️

Personal half marathon training site with live Strava integration, Apple Watch heart rate zones, journal, and race results.

**Race Goal:** Sub-2:15 half marathon · December 13, 2026

---

## Setup Instructions

### 1. Run the Supabase schema

1. Go to your Supabase project → SQL Editor → New Query
2. Open `supabase-schema.sql` from this repo
3. Paste the entire contents and hit Run
4. You should see tables: `settings`, `posts`, `results`, `subscribers`

### 2. Set environment variables in Vercel

Go to your Vercel project → Settings → Environment Variables and add:

| Variable | Where to find it |
|---|---|
| `STRAVA_CLIENT_ID` | strava.com/settings/api |
| `STRAVA_CLIENT_SECRET` | strava.com/settings/api |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API (service_role) |
| `ADMIN_PASSWORD` | Choose anything secure |
| `SITE_URL` | Your Vercel URL e.g. https://jonathan-runs.vercel.app |

### 3. Deploy to Vercel

Push this repo to GitHub. Vercel will auto-deploy on every push.

### 4. Connect Strava

After deploy, visit `https://your-site.vercel.app/api/strava/auth` in your browser.
You'll be redirected to Strava to authorize — click Accept.
You'll be redirected back to the admin dashboard with Strava connected.

### 5. Update your frontend

Copy `jonathan-runs-v4.html` to `public/index.html` and update the API fetch URLs from mock data to:
- `fetch('/api/strava/runs')` for runs
- `fetch('/api/posts')` for journal posts  
- `fetch('/api/results')` for race results

---

## File Structure

```
jonathan-runs/
├── api/
│   ├── strava/
│   │   ├── auth.js          # Redirects to Strava OAuth
│   │   ├── callback.js      # Handles OAuth callback, saves tokens
│   │   └── runs.js          # Returns recent runs with HR zones
│   ├── posts/
│   │   ├── index.js         # GET all posts, POST new post
│   │   └── [id].js          # DELETE/PATCH post by ID
│   ├── results/
│   │   └── index.js         # GET all results, POST new result
│   └── subscribe/
│       └── index.js         # POST email subscriber
├── admin/
│   └── index.html           # Private admin dashboard
├── public/
│   └── index.html           # Your main site (copy v4 here)
├── supabase-schema.sql      # Run this in Supabase SQL Editor
├── vercel.json              # Routing config
├── package.json
├── .env.example             # Copy to .env for local dev
└── .gitignore
```

## Admin Dashboard

Visit `/admin` on your deployed site to:
- Connect and sync Strava
- Write and publish journal posts
- Add race results
- View subscribers

---

Built with Vercel · Supabase · Strava API · Apple Watch
