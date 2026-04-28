# ProCabinet.App — Build Plan

## Companion Docs

- **`SPEC.md`** — pre-launch refactor spec (what gets cleaned up before this plan can ship)
- **`SCHEMA.md`** — full database schema with DDL and migration order
- **`CLAUDE.md`** — development guidelines and code conventions
- **`Building Docs/Database_Visual_Guide.docx`** — plain-English schema overview

This file (`PLAN.md`) covers the launch-level stack and progress. The structural work that has to happen first is in `SPEC.md`.

## The Stack

### Frontend — Plain HTML/CSS/JS
- Status: ✅ Done

### Auth + Database — Supabase
- Handles user login, passwords, sessions
- PostgreSQL database (projects, users, settings)
- Free tier
- Status: ✅ Done (auth + orders/quotes/stock tables wired up)

### Payments — Stripe
- Subscriptions, free trials, invoices
- 2.9% per transaction, no monthly fee
- Status: ⬜ Not started

### Hosting — Netlify (frontend) + Supabase (backend)
- Netlify hosts the HTML app for free
- Supabase acts as the backend
- No VPS needed
- Status: ⬜ Not started

---

## Progress

| Step | Task                        | Status |
|------|-----------------------------|--------|
| 1    | Frontend app (HTML/CSS/JS)  | ✅ Done |
| 2    | Supabase auth + database    | ✅ Done |
| 3    | Stripe payments             | ⬜ Todo |
| 4    | Netlify hosting             | ⬜ Todo |

---

## Monthly Cost

| Service | Cost              |
|---------|-------------------|
| Netlify | Free              |
| Supabase | Free             |
| Stripe  | Free (2.9%/txn)   |
| Domain  | ~$1/mo            |
| **Total** | **~$1/mo**      |
