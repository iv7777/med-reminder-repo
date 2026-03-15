# 每日用药提醒 — Med Reminder

A family medication reminder system built on Cloudflare Pages + D1.

## Features

- **Daily medication schedule** with live clock, countdown timer, and audio alarm at each dose time
- **Check-off tracking** — caregivers mark each dose as taken, with timestamp recorded
- **Full history log** — review any date range with compliance percentage per day
- **Schedule editor** — add/edit/delete time blocks and medications
- **User management** — role-based access (admin / caregiver / patient)
- **Multi-patient support** — manage up to 5 patients from one account

## Project Structure

```
med-reminder/
├── public/
│   └── index.html          # Full frontend (single page app)
├── functions/
│   └── api/
│       └── [[path]].js     # Cloudflare Pages Function (all API routes)
├── schema.sql              # D1 database schema
├── seed.sql                # Initial data (schedule + default users)
└── wrangler.toml           # Cloudflare config (update DB ID before deploying)
```

## Deployment

### 1. Create the D1 database

```bash
npx wrangler d1 create med-reminder
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "med-reminder"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 2. Run schema + seed

```bash
npx wrangler d1 execute med-reminder --file=schema.sql
npx wrangler d1 execute med-reminder --file=seed.sql
```

### 3. Connect to Cloudflare Pages (Git deploy)

1. Push this repo to GitHub / GitLab
2. Go to **Cloudflare Dashboard → Workers & Pages → Create → Pages**
3. Connect your Git repository
4. Build settings:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `public`
5. After first deploy, go to **Settings → Functions → D1 database bindings**
6. Add: Variable name = `DB`, select your `med-reminder` database
7. Redeploy to activate the binding

### 4. Alternative: deploy via wrangler CLI

```bash
npm install -g wrangler
wrangler pages deploy public --project-name=med-reminder
```

## Default Accounts

| Username     | Password    | Role       | Access           |
|--------------|-------------|------------|------------------|
| `admin`      | `admin1234` | 管理员      | Full — all pages |
| `caregiver1` | `care1234`  | 护理员      | Today / History / Schedule |
| `patient1`   | `1234`      | 患者        | Today / History (view only) |

**Change these passwords immediately after first login** (User Management page).

## API Routes

All routes are served by `functions/api/[[path]].js` and require a Bearer token
(obtained from `POST /api/login`), except login itself.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/login` | Authenticate, returns token |
| GET | `/api/patients` | List accessible patients |
| POST | `/api/patients` | Create patient (admin only) |
| GET | `/api/patients/:id/schedule` | Full schedule with meds |
| GET | `/api/patients/:id/logs` | Dose logs (`?date=` or `?from=&to=`) |
| POST | `/api/patients/:id/logs` | Record dose taken/missed |
| POST | `/api/blocks` | Add time block |
| PUT | `/api/blocks/:id` | Edit time block |
| DELETE | `/api/blocks/:id` | Delete time block + meds |
| POST | `/api/medications` | Add medication |
| PUT | `/api/medications/:id` | Edit medication |
| DELETE | `/api/medications/:id` | Soft-delete medication |
| GET | `/api/users` | List users (admin only) |
| POST | `/api/users` | Create user (admin only) |
| DELETE | `/api/users/:id` | Delete user (admin only) |

## Local Development

```bash
npm install -g wrangler
npx wrangler pages dev public --d1=DB=<your-database-id>
```
