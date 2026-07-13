# Email — Launch pricing ends 14 July

**Audience:** all existing users
**Send:** 12–13 July 2026
**Sender:** Adam (first person — cold/direct email register per brand-voice § 4)

---

**Subject line options**

1. Launch pricing ends on the 14th
2. What changes on 15 July
3. The launch prices come off on Monday

**Preheader:** After the 14th the discounted first periods go, and the Founders' Lifetime moves to $499.

---

## Body

Short note about pricing, because it changes this week and it seemed wrong to let you find out at checkout.

Launch pricing runs until the 15th of July. Until then, monthly is $25 for the first six months and annual is $180 for the first year. The Founders' Lifetime is $299 — one payment, no renewal.

From the 15th the discounted first periods go entirely. Monthly is $35, annual is $299, and there is no introductory rate on either. The Founders' Lifetime goes to $499.

[PRICING GRAPHIC — plan / until 14 July / from 15 July]

If you're already on a plan, nothing about your price changes. This is only about what's available to take up before Tuesday.

The Founders' Lifetime is the same price as one year of annual, used forever, so it makes sense if you expect to still be quoting in this thing in 2028. If you'd rather not commit to that, the annual at $180 for the first year is the other thing worth doing before the 14th.

procabinet.app/#pricing

Adam

---

## Chosen: Version 3 (three cards)

**Send file:** `2026-07-12-launch-pricing-ends-SEND.html` — standalone, label blocks stripped, ready to paste into Resend.
**Subject:** Launch pricing ends on Tuesday
**Preheader:** Monthly, annual and lifetime — what each costs before the 14th, and after.

## Versions

All five live in `2026-07-12-launch-pricing-ends.html` — complete emails with subject options and preheaders, not fragments. Pick one, strip the grey label blocks and the preview `<style>`, and send.

1. **The ledger** — plan / before / after table. One amber CTA. The safe default; body copy is the markdown above.
2. **Founder-led** — opens on the arithmetic of the lifetime plan. Replica Founder card, one amber CTA.
3. **Three cards** — the landing plan picker, three paid tiers, three CTAs straight into checkout.
4. **Before / after** — struck-through prices. Fastest scan; paired amber + ghost CTAs.
5. **Plain note** — no chrome, amber left-rule, one full-width amber bar. Reads like a personal email.

## Notes before sending

- **No seat cap.** The Founder plan is unlimited as of 12 July 2026 — the 50-seat cap, the live counter and the sold-out state were removed from `src/limits.js`, `src/walkthrough.js`, `landing.js`, `landing.html` and `supabase/functions/stripe-checkout/index.ts`. No copy anywhere should mention seats. The `founder_seats_taken` RPC still exists in the database but is now unused.
- Redeploy `stripe-checkout` — the old build still enforces the cap and would 409 a Founder checkout once seats were "gone".
- Confirm the Stripe launch coupons (`STRIPE_COUPON_MONTHLY_LAUNCH` / `STRIPE_COUPON_ANNUAL_LAUNCH`) expire end of 14 July, and that the Founder price moves to $499 on the 15th, so the email and the checkout agree.
- If your list splits cleanly, cut the "if you're already on a plan" paragraph from the free-user send — it's only there so paying subscribers don't panic.
