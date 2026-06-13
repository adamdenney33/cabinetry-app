# Resend — MCP setup, architecture, and email best practices

ProCabinet sends all email through [Resend](https://resend.com) from the
verified domain `procabinet.app` (sender `adam@procabinet.app`). The
`RESEND_API_KEY` lives only in Supabase Edge Function secrets and (for the
MCP) your local shell — never in client code or committed files.

## Two ways email is sent

1. **Production automation — Supabase Edge Functions (authoritative).**
   App events trigger these; they run server-side and must stay as functions
   (an MCP can't fire on a signup or a purchase):
   - `send-welcome-email` — one per new signup (transactional).
   - `send-founders-welcome` — fires on a founder-seat purchase via the
     `trg_founders_welcome` trigger on `subscriptions`; embeds the WhatsApp
     QR served by `founders-qr`.
   - `send-test-email` — guarded test sender for the Cowork email-plan artifact.
   - `list-subscribe` — adds opt-in signups to the Resend audience.

2. **Interactive / manual — the Resend MCP (this setup).**
   For composing one-off emails, managing **contacts, audiences, broadcasts,
   templates, domains, and webhooks** by hand from an AI client. It does NOT
   replace the edge functions; it complements them.

> The MCP is a local `npx` stdio server. It works in **Claude Code, Claude
> Desktop, and Cursor** — not inside a Cowork chat session (which only loads
> remote connectors).

## Setup

Put your Resend key in your shell env (don't commit it):

```bash
export RESEND_API_KEY=re_xxxxxxxxx   # add to ~/.zshrc or .env.local
```

**Claude Code** — the project `.mcp.json` already wires it up (sender +
reply-to preset to `adam@procabinet.app`). With `RESEND_API_KEY` in your
env, just run `claude` in the repo and approve the `resend` server, or:

```bash
claude mcp add resend -e RESEND_API_KEY=$RESEND_API_KEY -- npx -y resend-mcp \
  --sender "Adam at ProCabinet <adam@procabinet.app>" --reply-to adam@procabinet.app
```

**Claude Desktop / Cursor** — Settings → Developer/MCP → Edit Config:

```json
{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp",
        "--sender", "Adam at ProCabinet <adam@procabinet.app>",
        "--reply-to", "adam@procabinet.app"],
      "env": { "RESEND_API_KEY": "re_xxxxxxxxx" }
    }
  }
}
```

Capabilities: send/list/get/cancel/batch emails, contacts, audiences,
broadcasts, templates, domains, segments, topics, webhooks, API keys.

## Email best practices (applied to ProCabinet)

- **Verified domain + SPF/DKIM/DMARC.** Already in place for
  `procabinet.app`. Keep DMARC at least `p=none` with a reporting address;
  move toward `quarantine` once aligned.
- **Separate transactional from marketing.** Welcome + founders' emails are
  transactional (no unsubscribe needed). The drip/marketing series is
  opt-in only (`list-subscribe`). Consider a dedicated sending subdomain
  (e.g. `send.procabinet.app`) for bulk/marketing so a deliverability dip on
  campaigns can't hurt transactional signup/receipt mail.
- **Unsubscribe on anything marketing.** Any broadcast or drip send must
  include a working unsubscribe — use Resend **Broadcasts/Audiences** (they
  add `List-Unsubscribe` and a footer link automatically) rather than the
  raw `/emails` API for marketing.
- **Plain-text alongside HTML.** Every function sends both. Keep doing it —
  improves deliverability and accessibility.
- **Host images, don't inline.** Use `<img src="https://…">` (e.g. the
  `founders-qr` endpoint), not `cid:` attachments or `data:` URIs — those
  render inconsistently (Apple Mail/Gmail).
- **Idempotency keys.** Real sends use a stable key per recipient
  (exactly-once); test sends use a unique key (so corrected previews aren't
  deduped within Resend's ~24h window).
- **Warm up volume.** When the drip launches to the list, ramp send volume
  gradually rather than blasting the whole audience at once.
- **Monitor.** Watch Resend's bounce/complaint/open metrics and wire a
  webhook for hard bounces and spam complaints to auto-suppress addresses.
