# 🎈 Hangout

**The group scheduler that actually decides.** Make a plan, share one link. Friends tap when they're free, and when everyone's answered, Hangout locks in the time and place automatically. Then JAX — your in-app AI — helps you figure out what to actually do.

## Features

- **Dark, futuristic design** — deep space theme with neon glow
- **Intro tour** — first launch walks new users through what the app does in 4 quick slides
- **Real accounts** — everyone creates an account (name, email, password) with a custom generated avatar, or logs back in. Premium and JAX limits follow the account across devices.
- **One shareable link** — friends respond in seconds from their phone
- **Auto-decide** — you set the group size; the moment everyone's in, the plan locks (most-available slot wins, earliest breaks ties). The organizer can also lock in early.
- **Place voting** — add spot options, everyone votes, the winner is announced with the time
- **🤖 JAX, your hangout AI** — a full JARVIS-style assistant on every hangout page: HUD panel with a boot sequence ("JAX CORE v2.1 — INITIALIZING…"), an animated arc-reactor orb, replies typed out letter by letter, and an optional 🔊 voice mode where JAX speaks its answers out loud. Ask it anything ("we're broke, cheap ideas?") and it answers with suggestions curated to your group's vibes, size, and time. Works out of the box; gets fully AI-powered with an Anthropic key.
- **📍 Good spots near you** — real nearby restaurants, cafés, and activities via OpenStreetMap (free, no key), one tap to add as a place option
- **📡 JAX local intel** — tap "Enable local intel" in JAX's panel and it recommends actual verified places near you when you ask where to go
- **Your hangouts** — the home screen lists everything you're organizing or joined, with live status
- **Organizer tools** — edit an open hangout (days, times, places, size) or cancel it for everyone
- **📅 Add to calendar** — one tap on a locked-in plan downloads a calendar event (works with Apple + Google Calendar)
- **Duplicate-name safe** — two friends named Sam become "Sam" and "Sam 2" instead of overwriting each other
- **Installable app** — full PWA: on a phone, "Add to Home Screen" gives it an icon and it opens like a native app
- **Live updates** — the page refreshes itself as friends respond

## Run it locally

You need Node.js 22.5 or newer (uses Node's built-in SQLite — no database setup at all).

```bash
npm install        # server deps
npm run build      # installs client deps + builds the frontend
npm start          # → http://localhost:3000
```

That's it. Data is stored in `data/hangout.db` (created automatically).

## Optional: real AI idea generation

Out of the box, ideas come from a built-in engine personalized to your group's vibe tags. To upgrade to fully AI-written suggestions, set an Anthropic API key before starting the server:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

No key? Everything still works — it just uses the built-in engine.

## 💸 JAX Premium (built-in monetization)

Everyone gets **2 free JAX queries per month** per account. After that, JAX shows a paywall: **$3/month** for unlimited. With Stripe connected, the unlock button opens a real checkout with **Apple Pay, Google Pay, and card entry**, and premium activates automatically the moment they pay — tied to their account, on every device.

### Connect Stripe (one-time, ~15 min)

1. Create a free account at [stripe.com](https://stripe.com) (this is how the money reaches your bank; Stripe takes ~2.9% + 30¢ per charge).
2. In Stripe: **Product catalog → Add product** → name "JAX Premium", price **$3.00 recurring monthly** → save, and copy the **price ID** (starts with `price_`).
3. **Developers → API keys** → copy the **secret key** (starts with `sk_live_`, or `sk_test_` for testing).
4. **Developers → Webhooks → Add endpoint** → URL: `https://YOUR-APP-URL/api/stripe/webhook` → select events `checkout.session.completed` and `customer.subscription.deleted` → copy the **signing secret** (starts with `whsec_`).
5. Set these environment variables on your host (Render → your service → Environment):
   - `STRIPE_SECRET_KEY=sk_...`
   - `STRIPE_PRICE_ID=price_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...`
   - `APP_URL=https://YOUR-APP-URL`

That's it — the paywall switches to real checkout automatically.

### Fallbacks (before Stripe is set up)

- `PREMIUM_CODES=CODE1,CODE2` — access codes you can hand out manually (there's a "have an access code?" link in the paywall).
- `PAYMENT_LINK=https://...` — a simple Stripe Payment Link if you want payments without the webhook auto-unlock.
- With nothing set, the paywall shows "Payments are being set up — check back soon."

## Accounts

Sign-up is email + password (passwords are salted-and-hashed server-side, never stored in plain text; sessions are random tokens). There's no password reset yet — that's a good next feature before the app gets big. Google sign-in can be added later if wanted.

## Deploy it (so friends can use it)

The app is one Node server that also serves the frontend, so any Node host works. The only requirement is a **persistent disk** for the SQLite file.

**Railway** (easiest): create a project from this folder (or a GitHub repo of it), add a **Volume** mounted at `/data`, and set the environment variable `DATA_DIR=/data`. Railway auto-detects `npm start`. Set the build command to `npm run build`.

**Render**: create a Web Service, build command `npm install && npm run build`, start command `npm start`, add a Disk mounted at `/data`, and set `DATA_DIR=/data`.

**Fly.io**: `fly launch`, then `fly volumes create data`, mount it at `/data` in `fly.toml`, and set `DATA_DIR=/data`.

Once deployed, your link is `https://your-app.up.railway.app` (or similar) — that's the link that goes in the group chat, and the URL people install to their home screen.

## Project structure

```
server/
  index.js    Express API + serves the built frontend
  db.js       SQLite schema (Node built-in sqlite, zero setup)
  ideas.js    Idea engine (local + optional Claude API)
client/
  src/        React app (Vite): Home, HangoutPage, styles
  public/     PWA manifest, service worker, icons
```

## API (if you want to build on it)

- `POST /api/hangouts` — create `{title, creator, note, days[], blocks[], places[], expected}` → `{id, creatorKey}`
- `GET /api/hangouts/:id` — full hangout state + responses
- `POST /api/hangouts/:id/respond` — `{name, slots[], placeVote, interests[]}` (upserts by name; auto-decides when the expected count is reached)
- `POST /api/hangouts/:id/decide` — `{creatorKey}` locks the plan early
- `POST /api/hangouts/:id/edit` — `{creatorKey, title?, note?, days?, blocks?, places?, expected?}` (open hangouts only; prunes removed options from existing answers)
- `POST /api/hangouts/:id/cancel` — `{creatorKey}` cancels for everyone
- `GET /api/hangouts/:id/calendar.ics` — calendar file for a decided hangout
- `GET /api/hangouts/:id/ideas` — personalized hangout ideas
- `POST /api/hangouts/:id/assistant` — `{question, vibes[], nearby[]}` ask JAX
