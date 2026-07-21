# LifeOS Zero-Cost Backend Setup

This project now has the first backend/database foundation for the Finance Hub:

- Cloudflare Pages Functions under `functions/api`
- Cloudflare D1 schema in `db/schema.sql`
- Optional demo seed data in `db/seed.sql`
- Frontend finance API service in `src/services/financeApi.js`
- Local Cloudflare/Wrangler scripts in `scripts/`
- No frontend finance fallback data is used at runtime.

## Runtime Architecture

- Frontend: React/Vite/PWA hosted on Cloudflare Pages.
- Backend: Cloudflare Pages Functions at the same domain under `/api`.
- Database: Cloudflare D1 bound as `DB`.
- Receipt/document storage: Cloudflare R2 bucket, planned binding name `RECEIPTS_BUCKET`.
- Auth: Public email/password login first, with HttpOnly session cookies. Cloudflare Access remains available as a private-app mode later.

## Backend Code Location

The backend code is written in `functions/api/[[path]].js`.

Cloudflare Pages Functions turns that file into API routes such as:

- `/api/health`
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/me`
- `/api/auth/logout`
- `/api/finance/summary`
- `/api/finance/transactions`

No separate Express server is needed for the zero-cost path.

## Local Development

Run the local app through Cloudflare Pages, not plain Vite, when testing API/database behavior.

First-time setup:

```bash
npm install
npm run db:local:setup
```

Start the local app:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8788
```

This runs:

- built React app from `dist`
- Pages Functions from `functions/api`
- local D1 database bound as `DB`
- `AUTH_MODE=public`

Plain frontend-only dev is still available:

```bash
npm run dev:frontend
```

Use frontend-only mode only for UI work. It does not run `/api`.

## API Routes Added

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/finance/summary`
- `GET /api/finance/transactions`
- `POST /api/finance/transactions`
- `PATCH /api/finance/transactions/:id`
- `DELETE /api/finance/transactions/:id`
- `GET /api/finance/categories`
- `GET /api/finance/budgets`
- `POST /api/finance/budgets`
- `GET /api/finance/goals`
- `POST /api/finance/goals`
- `PATCH /api/finance/goals/:id`
- `GET /api/finance/insights`
- `GET /api/finance/reports`
- `GET /api/finance/export.csv`
- `POST /api/finance/receipts`

## What I Need From You

1. Cloudflare project/account access
   - Needed when you want me to create the D1 database, run migrations, bind it to Pages, and deploy.
   - Do not paste Cloudflare API tokens or secrets into chat. The safer path is to sign in locally with Wrangler or let me use an approved connector/tooling flow.

2. App access mode
   - Current direction: public app with normal email/password login.
   - Private option: set `AUTH_MODE=access` and put Cloudflare Access in front of the app.

3. Currency and locale
   - Current direction: USD and INR are both supported.
   - Transactions, accounts, budgets, goals, reports, and exports keep their own currency. They are not automatically converted.

4. Receipt storage choice
   - Metadata only for now: free and already supported by the API.
   - Full receipt uploads: needs an R2 bucket and upload flow.

5. Deployment target
   - Cloudflare Pages is the recommended zero-cost target for the current architecture.
   - The repo currently appears to have broken or incomplete Git metadata, so Git-based deployment needs a valid GitHub repo first.

## Suggested Cloudflare Binding Names

- D1 database binding: `DB`
- R2 receipt bucket binding: `RECEIPTS_BUCKET` when full uploads are added later.
- Optional environment variables:
  - `AUTH_MODE=public`
  - `AUTH_MODE=access`
  - `AUTH_MODE=demo`
  - `DEV_USER_ID=demo-user`
  - `DEV_USER_EMAIL=demo@lifeos.local`
  - `SESSION_DAYS=30`

## Next Build Steps

1. Finish backend APIs for the remaining modules: dashboard, car, work, learning, pantry, documents, services, AI assistant, and settings.
2. Add empty states and real create/edit/delete flows for each module.
3. Create the production D1 database and bind it as `DB` in Cloudflare Pages.
4. Keep receipt metadata only until full uploads are needed.
5. Add password reset and email verification before inviting real public users.
6. Add optional Cloudflare Access private mode for personal/private deployments.
7. Add AI receipt extraction and recommendation jobs using free-tier Workers AI carefully.
8. Add Excel/PDF export workers after CSV export is stable.
