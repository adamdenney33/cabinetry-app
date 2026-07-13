# ProCabinet.App — Creator Affiliate Program Plan

*Drafted 2026-06-29. Owner: Adam. Status: proposal for build.*

Decisions locked in for this plan:
- **Payout model:** recurring revenue share
- **Tooling:** dedicated affiliate platform (Stripe-native)
- **90-day goal:** build a self-serve affiliate funnel any creator can join

---

## 1. The offer at a glance

Woodworking and maker creators recommend ProCabinet.App to their audience. They get a unique link/code. When someone signs up and becomes a paying Pro customer, the creator earns a **recurring share of that customer's subscription** for as long as the commission window runs. Tracking, dashboards, and payouts are automated through a Stripe-connected affiliate platform.

This works because your audience and a maker creator's audience are the same people: cabinet makers, joiners, furniture builders, kitchen fitters, and serious hobbyists who already buy tools and software.

---

## 2. Why creators are the right channel

- **Trust transfer.** A subscriber watching a cabinet maker run a real job is in buying-intent mode. A genuine "this is the quoting tool I use" beats a cold ad.
- **You pay for results, not impressions.** Unlike the Google/Meta spend (per memory: ~£15/day Search + Meta signups campaign), affiliates only cost money when a paying customer lands. CAC is capped by design.
- **You already produce the assets.** The Remotion reels/carousels, the demo video, and the founder's own credibility (10 years running a workshop) are exactly what creators need to make content.
- **Compounding.** A single well-made integration video keeps converting for years from search and suggested feeds, long after a paid ad stops.

---

## 3. Who you're recruiting

Tiered by reach, but the program is open self-serve to all of them.

| Segment | Examples | Why they fit | Priority |
|---|---|---|---|
| **Trade YouTubers** | Cabinet/kitchen build channels, workshop vloggers (10k–500k subs) | Long-form = room to actually show the quoting/cutlist workflow | **Highest** |
| **Instagram / TikTok makers** | Reel-first furniture & joinery accounts | High volume, great for short "watch me quote this in 60s" clips | High |
| **Trade educators / course sellers** | People teaching others to start a cabinet business | Their audience is *new* businesses = your ideal first-time Pro buyer | High |
| **Tool / workshop reviewers** | Channels that review saws, CNC, software | Software fits naturally into a "shop setup" or "business side" video | Medium |
| **Trade-adjacent micro-creators** | <10k but tight niche (e.g. one-man-band joiners) | Tiny reach, huge trust, cheap to onboard at scale via self-serve | Medium (volume play) |

Geographic note: your pricing is in USD and the app is global, so don't over-index on UK creators. The biggest English-language woodworking creator base is US, then UK/AU/CA.

---

## 4. Commission structure (recommended)

**Recommendation: 30% recurring for 12 months per referred customer, then it ends.**

Why this shape:
- 30% is competitive — it reads as generous to creators (most SaaS programs sit 20–30%).
- Capping at 12 months instead of "lifetime" protects your margin and keeps the program economically safe even if a creator drives hundreds of accounts.
- Recurring (vs one-time) is what gets a creator to make a *second* and *third* video, because the back catalogue keeps paying.

### What a creator actually earns

| Plan referred | Customer pays | 30% to creator | Over 12 mo |
|---|---|---|---|
| Monthly (launch $25/mo) | $25/mo | $7.50/mo | **$90** |
| Monthly (standard $35/mo) | $35/mo | $10.50/mo | **$126** |
| Annual ($180 yr one) | $180 upfront | — | **$54** (one payment) |
| Founder ($299 one-time) | $299 once | — | **$89.70** (one payment) |

A creator who converts 10 monthly Pro customers a month is earning ~$1,000+/mo within a few months as it stacks. That's a real number you can put in front of them.

### Guardrails on the number
- **Cookie / attribution window:** 60 days (long enough for a trial-then-pay cycle; your trial is 14 days + decision time).
- **Commission triggers on first *paid* invoice,** not on signup or trial start — so you never pay for a tyre-kicker.
- **Clawback / hold period:** 30-day hold before a commission is payable, reversed on refund or chargeback. Stripe-native tools do this automatically.
- **No commission on self-referrals or the creator's own account.**

### Founding creator cohort (decided 2026-07-10)

The first creators get a better deal, run as a **separate private campaign in Rewardful**:

- **Offer: 25–30% recurring lifetime (gross, not net of fees)** — final rate to confirm at Rewardful setup.
- **Hard cap:** first 10 creators (or a fixed deadline) — scarcity is part of the pitch and bounds the liability.
- **Why lifetime is affordable:** at ~15-month average customer life, 30% lifetime ≈ $157/customer vs ~$126 on the 12-month cap — only ~$31 more. It only gets expensive if retention improves, i.e. when it's affordable.
- **Why gross, not "after payment fees":** Stripe fees are ~3%, so netting them out saves ~$0.09/customer/mo but wrecks the headline and makes earnings impossible for creators to compute. If margin worries, offer 25% lifetime gross instead of 30% net — simpler, same cost.
- **Grandfathering:** Rewardful keeps original terms on existing referrals, so the founding campaign coexists cleanly with the public 30%/12mo program. No retroactive changes ever.
- **Good-standing clause in T&Cs:** lifetime commission continues while the affiliate remains in the program; terminable for fraud or brand damage.
- Mirrors the customer-side Founders' Lifetime offer — coherent launch story.

### Alternatives if 30%/12mo feels wrong later
- More aggressive recruiting: **40% for 6 months** (bigger headline, shorter tail).
- You can A/B these per cohort once volume justifies it. Start with one public rate to keep the funnel clean.

---

## 5. Can you afford it? (unit economics)

Rough back-of-envelope — refine once you have real retention data from PostHog/Stripe.

- A monthly Pro at standard $35 over an assumed ~15-month average life ≈ **~$525 gross LTV**.
- You pay 30% for the first 12 months ≈ **~$126** to the creator.
- That's a blended **affiliate CAC of ~$126 for a ~$525 customer** → payback inside ~5 months of that customer's life, with the back two-thirds of LTV kept.
- Compare to current paid: per memory, Meta signups run ~£4.60/*signup*, but signups aren't paying customers — affiliate CAC is per *paying* customer, which is the honest comparison.

**Conclusion:** at 30%/12mo the program is margin-safe as long as referred customers retain anywhere near the base. The risk isn't cost, it's *volume* — getting enough good creators in.

---

## 6. Tooling

**Recommendation: Rewardful.**

| Tool | Fit | Cost | Verdict |
|---|---|---|---|
| **Rewardful** | Built specifically for Stripe subscriptions; recurring commissions, self-serve affiliate sign-up pages, cookie attribution, coupon-code referrals, auto payout via PayPal/Wise | ~$49/mo starter | **Pick this** — least work, Stripe-native, made for exactly this |
| FirstPromoter | Very similar, slightly more features (tiers, MLM) | ~$49–99/mo | Fine alternative; more than you need day one |
| PartnerStack | Enterprise partner ecosystems | $$$ | Overkill, skip |
| DIY (codes + spreadsheet) | Zero cost | Free | You ruled this out — correctly; recurring attribution by hand is painful |

Rewardful connects to your existing Stripe (you're already live on Stripe Connect), reads subscription events, and handles the recurring math and the 30-day hold automatically. Affiliates get their own dashboard so you're not fielding "how much have I earned" emails.

Both link tracking **and** coupon codes matter: YouTubers convert better with a memorable code (`MAKERNAME10`) that also gives the *customer* a small incentive — see §7.

---

## 7. The self-serve funnel (the 90-day deliverable)

This is the core build. Five pieces:

### 7.1 Public landing page — `/affiliates` (or `/creators`)
One page that sells the program *to creators*, not to cabinet makers. Sections:
- Headline: earn recurring income recommending the tool you'd use anyway
- The number (30% recurring, real $ examples from §4 table)
- 3-step how-it-works (join → share your link/code → get paid monthly)
- Who it's for (creators in the trades/maker space)
- Social proof slot (fill once you have first partners)
- FAQ (payouts, when commissions trigger, cookie window, disclosure rules)
- One CTA: **Apply / Join** → Rewardful sign-up

### 7.2 Light application gate
Self-serve, but not a free-for-all. A short form (name, channel link, audience size, platform) with **auto-approval for anyone with a real maker channel** and manual review only for edge cases. This keeps spammers out without adding friction for genuine creators.

### 7.3 Customer-side incentive
Give referred customers a reason to use the code: **extra trial time (e.g. 30 days instead of 14) or first month at the $15 annual-equivalent rate.** Double-sided offers convert far better and give the creator a stronger hook ("use my code for an extended trial").

### 7.4 The creator asset kit
A shared folder (Drive/Notion) so creators never have to make assets from scratch:
- Brand kit: logo, colours, fonts
- Ready-to-post Remotion reels & carousels (you already generate these via `remotion-ig/` and `marketing-posts`)
- The 65s demo video (re-cut, no VO, for them to talk over)
- Screenshot pack + b-roll of the actual app (cutlist, quoting, live quote link)
- Caption/hook templates and talking points
- A one-page "what ProCabinet does in 30 seconds" brief
- Their unique link + code, prominently

### 7.5 Onboarding email sequence (via Resend — already wired)
Triggered on approval:
1. **Welcome** — your link/code + where to grab assets
2. **How to make content that converts** — the angles in §8
3. **Your first payout explained** — sets expectations on the 30-day hold
4. (Day 30) **Check-in** — "posted yet? here's what's working for others"

---

## 8. Content angles to hand creators

Give them the ideas so they don't have to invent them. Best-converting formats for this product:

- **"The business side of cabinet making"** — most maker channels show the build; few show quoting/admin. ProCabinet fits a gap they're not filling.
- **"I quoted this kitchen live in under 5 minutes"** — screen-record the quote → live quote link → done.
- **"How I stopped underpricing my work"** — pain-first, the costing engine is the hero.
- **"Watch me send a client a quote they can edit themselves"** — the live-link auto-accept feature is genuinely novel; lead with it.
- **"My whole workshop software setup"** — listicle/roundup, low effort, ProCabinet is one slot.
- **Shorts/Reels:** before/after of a messy spreadsheet vs the app; one-take "quote in 60s".

Keep creator-facing copy plainspoken and personal — no hype, no buzzwords. Let the tool do the talking.

---

## 9. Terms & compliance (don't skip)

- **Disclosure:** require creators to disclose the paid relationship (FTC in US, ASA/CAP in UK). Put it in the terms and remind them in onboarding — it protects them and you.
- **Brand rules:** no bidding on "ProCabinet" branded keywords in their own paid ads (cannibalises your Google spend), no spam, no misleading claims about features.
- **No self-referral / no incentivised fake signups.**
- **Payout terms:** minimum payout threshold (e.g. $50), monthly via PayPal/Wise, 30-day hold, reversed on refund/chargeback.
- **You can terminate** for fraud or brand damage. Standard affiliate T&Cs — Rewardful provides a template you can adapt.

---

## 10. 90-day roadmap

**Phase 0 — Foundations (Week 1–2)**
- Sign up for Rewardful, connect Stripe, set 30%/12mo, 60-day cookie, 30-day hold
- Decide + configure the customer-side incentive (extended trial recommended)
- Write affiliate T&Cs

**Phase 1 — Funnel build (Week 2–4)**
- Build `/affiliates` landing page (reuse existing site styles)
- Wire the application form → Rewardful, set auto-approve rule
- Assemble the asset kit folder
- Write + load the 4-email onboarding sequence in Resend

**Phase 2 — Soft launch / seed (Week 4–6)**
- Personally invite 5–10 creators you already rate (warm outreach, see template below) to pressure-test the funnel before going public — pitch them the **founding creator lifetime offer** (§4), capped at 10
- Fix anything that confuses those first partners
- Capture the first testimonial/social proof for the landing page

**Phase 3 — Open the doors (Week 6–10)**
- Announce the program publicly: footer link, in-app banner for power users, your own socials, a post in maker communities (Reddit r/woodworking-adjacent, FB groups, forums)
- Add a subtle "Earn with us" / "Creators" link in the app footer and help menu

**Phase 4 — Optimise (Week 10–13)**
- Review first cohort in PostHog + Rewardful: which creators/links convert
- Double down on outreach to creators *like* your best performer
- Decide whether to introduce a top-tier rate or bonuses for high performers

---

## 11. KPIs to track

| Metric | Why | Early target (90 days) |
|---|---|---|
| Approved affiliates | Funnel top | 25–40 |
| Active affiliates (≥1 click driver) | Real participation | 10+ |
| Referred trials started | Mid-funnel | track baseline |
| Referred **paid** conversions | The only one that pays | 15–30 |
| Affiliate CAC | Margin safety | < $150/paying customer |
| Referred-customer retention vs baseline | Quality of traffic | ≥ baseline |
| Revenue from affiliate channel | The point | establish baseline |

Wire affiliate signups as a distinct source in PostHog (you already have it installed) so you can compare retention of affiliate-sourced vs paid-ad-sourced customers — that's the number that tells you if it's working.

---

## 12. Outreach template (warm, for Phase 2)

Plainspoken, founder-to-maker. No corporate tone.

> Subject: built a quoting tool, think your audience would actually use it
>
> Hi [name],
>
> I'm Adam — ran my own cabinet/furniture workshop for about ten years, and built ProCabinet.App to handle the part I always hated: quoting, costing, and cutlists without a mess of spreadsheets.
>
> I watch your channel and your audience is exactly who I built this for. I've just opened an affiliate program: 30% of every subscription you refer, paid monthly for a year. Real numbers — a handful of monthly customers stacks to a few hundred a month pretty quickly.
>
> I've got reels, screenshots, and a demo cut ready so you don't have to make anything from scratch, and your audience gets an extended free trial through your code.
>
> Want me to set you up? Takes two minutes.
>
> Adam

---

## 13. Risks & honest caveats

- **Biggest risk is supply, not cost.** Recruiting genuinely engaged creators is the hard part; the payout math is fine. Budget real time for outreach, not just the build.
- **Attribution leakage:** people who hear about you in a video but Google you later may not get cookied. Coupon codes mitigate this — push the code as much as the link.
- **Low-effort affiliates** who join and never post are normal; expect a small fraction to drive most results. That's fine, the cost is zero.
- **Brand control:** one creator misrepresenting features can cause support headaches. The asset kit + clear talking points reduce this.
- **Don't cannibalise paid:** the keyword-bidding ban in §9 matters — otherwise affiliates compete with your own Google Ads.

---

## 14. Immediate next actions

1. Confirm the rate: **30% recurring / 12 months** public, plus the **founding cohort lifetime rate (25% or 30% gross — pick one)** as a private Rewardful campaign capped at 10 creators.
2. Confirm the customer-side incentive: **extended 30-day trial** via affiliate codes.
3. I can draft the `/affiliates` landing page (HTML in your existing site style), the application form, the 4 Resend onboarding emails, and the T&Cs whenever you're ready to build.
4. You sign up for Rewardful + connect Stripe (the one bit only you can do).
