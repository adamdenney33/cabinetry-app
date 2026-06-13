# MARKETING.md — ProCabinet.App

> Central marketing strategy + activity tracker. This file drives all marketing decisions; update it when anything changes.
> Live dashboard: **ProCabinet Marketing HQ** artifact (pulls Meta Ads + Supabase live). Launch assets live in `marketing/` (see its README for the day-by-day posting plan).
> Last full review: **2026-06-13**. Cadence: weekly Monday review + daily 2-minute CPR check.

## 1. Positioning & audience

- **Product:** Workshop OS for cabinetmakers — quote, price, cut-list, schedule, stock, clients, orders in one tool.
- **ICP:** owner-operator cabinet shops (1–10 people), UK/US/CA/AU/NZ, currently on spreadsheets + paper. Subscription-sceptical trades audience — lead with time saved and "built by a maker", not software-speak.
- **Voice:** British English, peer-to-peer trade voice, founder-led (`marketing/specs/brand-voice.md`).
- **Core proof asset:** the Overview reel ("workshop OS") — best performer at £0.33/LPV, CTR 1.78%.

## 2. Offers (source of truth)

| Offer | Price | Notes |
|---|---|---|
| Free | 14-day Pro trial, no card | Free tier after trial (unlimited stock, 5/other library) |
| Monthly | **$25/mo first 6 months** (list $35) | Stripe launch coupon |
| Annual | **$180 year one** (list $299/yr) | "$15/mo" framing |
| Founder | **$299 once, forever** — 50 seats | Live seat counter on landing page. Seat 1 sold. |
| Creator Lifetime | ~20 gifted spots (separate pool) | For YouTube/IG/TikTok makers, honest review within 30 days |

Framing: *"$299 lifetime = the price of one year, used forever."* Never gift from the paid 50.

## 3. Funnel — where we are (13 Jun 2026)

| Stage | Number | Note |
|---|---|---|
| Signups, last 7 days | **31** (53 total users) | Sharp acceleration since signups campaign went live 10 Jun |
| Ad-attributed signups | 10 on £79.37 → **£7.94/signup** | 11 Jun: 8 @ £4.68 · 12 Jun: 2 @ £11.54 — learning phase noise |
| Activation | only ~10/35 returned after day 1 (to 11 Jun) | **The biggest leak.** Email flows attack this. |
| Trial → paid | first ads cohort hits trial end **~24 Jun** | No verdict on paid conversion until then |
| Paying | 1 real founder seat (1/50) + 2 suspected test rows | Audit/purge test rows |

Spend history: creative test (29 May–10 Jun) £326.73 → 915 LPVs @ £0.36; proved the reel + interest stack, produced ~20–35 signups unattributed (LPV-optimised, CAPI not live for most of it).

## 4. Channels — status board

| Channel | Status | Detail |
|---|---|---|
| Meta paid — Signups campaign | 🟢 ACTIVE £25/day | Ad set 52550164945314, COMPLETE_REGISTRATION-optimised, interest stack, 1 creative |
| Meta paid — Advantage+ ad set | 🟡 BUILT, PAUSED | £15/day, awaiting explicit enable decision |
| Meta paid — Founders retargeting | 🔴 BLOCKED | Needs 2 custom audiences created in Ads Manager (manual — API can't) |
| Email — welcome/activation flow | 🟡 IN SETUP | 5-email plan (`email-flow-plan.html`), welcome email drafted 12 Jun |
| Email — founders push (16 prospects) | 🔵 READY TO SEND | `marketing/founders-email-2026-06-10.md`; welcome + WhatsApp perk prepared |
| Creator Lifetime gifting | ⚪ NOT STARTED | DM templates ready (`marketing/posts/05`) |
| Organic social + forums | ⚪ PARKED | Full day-by-day plan in `marketing/README.md` — deliberately behind paid |
| SEO / YouTube / referrals | ⚪ POST-LAUNCH | PLAN.md months 2–12 |

## 5. KPI targets — 30 June

| KPI | Target | Today |
|---|---|---|
| New signups (June) | ≥ 75 | 31 in last 7d — on track |
| Blended cost per signup | ≤ £5.00 | £7.94 (early, 3 days of data) |
| Activation (created a PDF ≤ 48h) | ≥ 50% | ~28/53 historically; flow not live |
| Trial → paid (Jun-10 cohort) | ≥ 8% | readable from 24 Jun |
| Founder seats | ≥ 3/50 | 1/50 |

## 6. Budget & guardrails

- Now: £25/day (~£750/mo). If Advantage+ enabled: £40/day. Hard cap **£1,200/mo until trial→paid is proven**.
- Kill-line: pause any ad set with CPR > £10 over a trailing 7 days after learning.
- Scale rule: CPR ≤ £5 after learning AND trial→paid ≥ 8% → step budget +50% per week, never mid-learning.
- CAC guardrail: ≤ £60 per paying customer (annual £142 yr-1 / founder £236 keep this honest).
- No budget/targeting edits to the live ad set before ~17 Jun (let learning finish). One change at a time.

## 7. Next actions — prioritised

### P0 — this week
| # | Action | Owner | Why now |
|---|---|---|---|
| 1 | **Send the founders email** (16 prospects) | Adam | Ready since 12 Jun; zero cost; directly sells seats |
| 2 | **Create 2 custom audiences** in Ads Manager: "Video viewers 25% — 180d" (Overview reel) + "Website visitors — 30d" | Adam (manual) | Sole blocker on the retargeting campaign; audiences start filling only once created |
| 3 | **Finish + switch on the welcome/activation email flow** | Adam + Claude | 70% of signups never return — biggest ROI lever in the whole funnel |
| 4 | **Protect learning**: no edits to the live ad set until ~17 Jun; daily CPR check | Both | Resets cost a week of spend |
| 5 | Verify CAPI dedupe in Events Manager + set `POSTHOG_KEY` on stripe-webhook | Adam | Clean data before scaling decisions |

### P1 — next 14 days
| # | Action | Owner |
|---|---|---|
| 6 | Add 2–3 fresh reel creatives to the Signups ad set (specs: `marketing/posts/10-reel-ads-2026-06.md`; scenes already rendered) — single-creative fatigue risk | Claude drafts, Adam approves |
| 7 | Enable the Advantage+ ad set (£15/day) once the main ad set exits learning — A/B Meta's AI audience vs interest stack | Adam decision |
| 8 | Build Founders Retargeting ad set (£10/day) as soon as audiences exist — reel + "$299 once" copy | Claude (API) after #2 |
| 9 | **24 Jun: first trial→paid cohort review** — the single most important read of the month; sets scale/kill | Both |
| 10 | Audit/purge the 2 suspected test-mode subscription rows | Adam |

### P2 — following
| # | Action |
|---|---|
| 11 | Creator Lifetime outreach — 10 DMs/week from `marketing/posts/05` |
| 12 | Start organic cadence from `marketing/README.md` week plan |
| 13 | First SEO post + YouTube tutorial (PLAN.md G.1/G.2) |

## 8. Activity log

| Date | Event |
|---|---|
| 2026-05-29 | Creative test live (3 creatives, £25/day, LPV) |
| 2026-06-10 | Growth stack shipped: CAPI signup + purchase conversions, founders hero, signups campaign created |
| 2026-06-10/11 | Signups campaign ACTIVE £25/day; creative test PAUSED; Advantage+ ad set built (paused) |
| 2026-06-11 | 8 ad-attributed signups @ £4.68; CAPI token confirmed set; S.9 Stripe live confirmed |
| 2026-06-12 | Founders email unblocked (claim link live); welcome email drafted |
| 2026-06-13 | MARKETING.md created; Marketing HQ dashboard launched; ads audit (this doc § 3–7) |

## 9. Operating cadence

- **Daily (2 min):** dashboard → CPR + spend sanity check. Act only on kill-line breaches.
- **Monday (30 min):** weekly review against § 5 targets; update § 4 board + § 8 log; pick the week's P0s.
- **Per cohort (14 d):** trial→paid review; scale/kill decision per § 6 rules.
