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
2. `Your ProCabinet account` — ✅ **ships** (founder-picked 2026-06-13 in the email-plan artifact)
3. `Getting set up with ProCabinet`

---

## Body

v2, founder-edited in the email-plan artifact, live since 2026-06-13
(function `send-welcome-email` v2). HTML version ends with the ProCabinet.App
wordmark (styled text, links to procabinet.app); plain text carries a bare
`ProCabinet.App` line.

> Hello, *(or: Hi {first name},)*
>
> Thanks for creating a ProCabinet account. I'm Adam, the cabinet maker and
> developer who built the app. The aim is to build the ultimate operating
> system for cabinetry businesses, the one I wish I had 15 years ago.
>
> Before anything else: replies to this address come straight to me. If you
> have any questions or have experienced any issues with the app, write back
> and I'll sort it.
>
> Your account has full Pro access for 14 days, no card needed. After that
> it moves to the free plan, and everything you have made will still be
> accessible.
>
> If you'd like a hand getting started, I do a free fifteen-minute setup
> call — I can explain the workflow in more detail, show you how to set up
> your rates, cabinet quotes, schedule, billing etc, around how you already
> work. Pick a time here:
>
> https://calendar.app.google/3KU7rrEd8mnUu7599
>
> If you have any feedback for me or features that you would need for the
> app to work for you, I'd love to hear about them. Thank you for supporting
> the project.
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
