# Onboarding welcome email — every new sign-up (2026-06-12)

One automated email per new account, sent once on the first signed-in load
after signup (email signups: right after they confirm; Google signups:
immediately). Goes to **all** new sign-ups regardless of the marketing
opt-in — it is a transactional/service email, so the content stays strictly
non-promotional: no pricing, no upgrade pitch, no marketing claims. The
only offer in it is the free setup call, which is part of the service.

Sent server-side by the `send-welcome-email` edge function (Resend API),
from `Adam at ProCabinet <adam@procabinet.app>`, reply-to the same address.
Plain text is the primary artifact; the HTML variant is the same words in
simple paragraphs with one plain link. No images, no buttons.

**Greeting rule:** newer signups carry a name in `user_metadata`
(`first_name` / `full_name`). When a first name exists the greeting is
`Hi {first name},` — otherwise `Hello,`. Nothing else is personalised.

**Booking link:** Google Calendar appointment schedule ("ProCabinet setup
call", 15 minutes, Google Meet, Mon–Fri 9–5 UK) on Adam's calendar:
`https://calendar.app.google/3KU7rrEd8mnUu7599` — the live URL is a constant
in the edge function.

---

## Subject options

1. `Welcome to ProCabinet`
2. `Your ProCabinet account`
3. `Getting set up with ProCabinet`

(1) ships: plain, recognisable in a crowded inbox, obviously not a campaign.

---

## Body

> Hello, *(or: Hi {first name},)*
>
> Thanks for creating a ProCabinet account. I'm Adam, the cabinet maker who
> built the app. Replies to this address come straight to me, so if anything
> is unclear you can just write back.
>
> Your account starts with full Pro access for 14 days. No card details
> needed. After that it moves to the free plan unless you choose to upgrade,
> and everything you have made stays yours.
>
> The quickest way in: open Settings, put in your rates and sheet materials,
> then build your first cabinet. The app walks you through it, and once a
> cabinet exists a quote is a couple of clicks.
>
> If you would rather set it up together, I do a free fifteen-minute setup
> call. Pick a time here:
>
> https://calendar.app.google/3KU7rrEd8mnUu7599
>
> Fifteen minutes is enough to get your rates, sheet materials and first
> cabinet quote set up around how your workshop runs. If none of the times
> fit, reply with a day that suits and we will sort something out.
>
> Kind regards,
> Adam
> Founder, ProCabinet

Footer, small and separated from the signature:

> You're receiving this one-off email because a ProCabinet account was
> created with this address.

No unsubscribe link — it is a one-time transactional service email, not a
mailing-list send. The mailing list (tips and product news) remains separate
and opt-in only (`list-subscribe`).
