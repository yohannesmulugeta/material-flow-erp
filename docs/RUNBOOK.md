# Material Flow ERP — Operations Runbook

## Project at a glance

| Item | Value |
|---|---|
| Frontend | Vercel (auto-deploy from `main` branch) |
| Backend | Supabase project `qpxdhnabiledsjcnbvnv` |
| GitHub repo | https://github.com/yohannesmulugeta/material-flow-erp |
| Local dev | `D:\material-flow-erp\` |

---

## 1. Deploy

### Frontend (Vercel)
1. Push to `main` → Vercel auto-builds and deploys.
2. Required env vars in Vercel project settings:
   - `VITE_SUPABASE_URL` = `https://qpxdhnabiledsjcnbvnv.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (from Supabase Dashboard → Settings → API)
   - `VITE_DEMO_MODE` = `false` (set `true` only on demo deployment)

### Database migrations
```powershell
cd D:\material-flow-erp
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
supabase db push --password "YOUR_DB_PASSWORD"
```

### Edge Functions
```powershell
supabase functions deploy notify-sale-created --project-ref qpxdhnabiledsjcnbvnv
supabase functions deploy notify-transfer-requested --project-ref qpxdhnabiledsjcnbvnv
supabase functions deploy notify-approval-needed --project-ref qpxdhnabiledsjcnbvnv
```

---

## 2. Add a user / change a role

1. User signs in with Google or email — a `profiles` row is auto-created with `role='unassigned'`.
2. They see "Pending Approval" screen and cannot access any data.
3. Admin runs in Supabase SQL Editor:

```sql
-- Grant role
update public.profiles
set role = 'manager'           -- or: super_admin, warehouse_staff, sales_staff, accountant
where lower(email) = lower('newuser@example.com');
```

4. User hard-reloads the app (close tab → reopen).

### Available roles

| Role | Capabilities |
|---|---|
| `super_admin` | Full access including delete |
| `manager` | Full access except delete products/warehouses |
| `warehouse_staff` | View inventory, create transfers/damages, receive containers |
| `sales_staff` | Create sales, manage customers, view payments |
| `accountant` | View everything, manage accounts and payments, view reports |

### Deactivate a user
```sql
update public.profiles set status = 'inactive' where lower(email) = lower('user@example.com');
-- Also revoke their Supabase Auth account if needed:
-- Dashboard → Authentication → Users → find user → Delete
```

---

## 3. Read Supabase logs

- **Edge Function logs**: Dashboard → Edge Functions → select function → Logs tab
- **Database logs**: Dashboard → Database → Logs (slow queries, errors)
- **Auth logs**: Dashboard → Authentication → Logs
- **PostgREST errors** (403 / RLS): Dashboard → API → Logs

### Common errors

| Symptom | Cause | Fix |
|---|---|---|
| 403 on any table query | Missing GRANT to authenticated role | Re-run GRANTs block from migration |
| "Could not find column X" in console | Form sends a column the schema lacks | Add column via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` |
| Empty list when data exists | RLS policy denying select | Check policy `using` clause; ensure user is authenticated |
| "Pending Approval" loop | Profile row has `role='unassigned'` | Run the SQL update above |

---

## 4. Secrets location

| Secret | Where stored |
|---|---|
| Supabase URL + anon key | `D:\material-flow-erp\.env.local` (not in git) AND Vercel env vars |
| Supabase access token | Only your browser session / password manager |
| Database password | Only your password manager |
| Telegram bot token | Supabase secrets: `supabase secrets set TELEGRAM_BOT_TOKEN=…` |
| Telegram chat ID | Supabase secrets: `supabase secrets set TELEGRAM_CHAT_ID=…` |

### Set / rotate Telegram secrets
```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
supabase secrets set TELEGRAM_BOT_TOKEN="your-bot-token" --project-ref qpxdhnabiledsjcnbvnv
supabase secrets set TELEGRAM_CHAT_ID="-100xxxxxxxxxx" --project-ref qpxdhnabiledsjcnbvnv
```

---

## 5. Enable Google OAuth (optional)

1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID → Web application
   - Authorized JS origins: `https://your-vercel-url.vercel.app` + `http://localhost:5173`
   - Authorized redirect URIs: `https://qpxdhnabiledsjcnbvnv.supabase.co/auth/v1/callback`
3. Supabase Dashboard → Authentication → Providers → Google → paste Client ID + Secret → Enable → **Save**
4. Update `supabase/config.toml` `[auth.external.google]` → set `enabled = true`

---

## 6. Backup and recovery

### Backup test (quarterly)
1. Supabase Dashboard → Database → Backups → pick a date → Restore to a **new** project
2. Query a known row in that project to confirm data is intact
3. Delete the temp project

### Point-in-time recovery
Available on Pro tier. Dashboard → Database → Backups → PITR.

---

## 7. Rotation schedule

| Item | Frequency | How |
|---|---|---|
| Telegram bot token | Every 6 months | BotFather `/revoke` → `supabase secrets set` |
| Supabase access token | When leaving the team | Dashboard → Account → Tokens → revoke |
| DB password | If exposed | Dashboard → Settings → Database → Reset → `supabase link` again |
| npm audit | Monthly | `cd D:\material-flow-erp && npm audit` |

---

## 8. Run locally

```powershell
cd D:\material-flow-erp
# Ensure .env.local has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
node_modules/.bin/vite
# App runs at http://localhost:5173
```

---

## 9. Run tests

```powershell
cd D:\material-flow-erp
# Set env vars (or add to .env.test)
$env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
node_modules/.bin/playwright test
```

---

## 10. Emergency contacts / bills

| Service | Who pays | Where to find bill |
|---|---|---|
| Supabase | Account owner | https://supabase.com/dashboard/account/billing |
| Vercel | Account owner | https://vercel.com/account/billing |
| GitHub | Account owner | https://github.com/settings/billing |

---

*Last updated: 2026-06-02. Update this file whenever the deployment or architecture changes.*
