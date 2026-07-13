// Cloudflare Pages Function — Google Calendar OAuth callback proxy.
//
// Google's consent screen displays (and brand verification demands ownership
// of) the redirect URI's domain — and we can't prove ownership of
// *.supabase.co. So the Google client registers THIS URL
// (https://procabinet.app/api/gcal-callback); we hand the untouched query
// string to the Supabase `gcal-oauth` edge function, which verifies the HMAC
// state, exchanges the code, and answers with a 302 → /os?gcal=… that we pass
// straight back to the browser. No secrets live here; the state signature +
// one-time code carry all the security, exactly as when Google called the
// edge function directly.
//
// Lives in /functions (Cloudflare Pages Functions), deploys with the normal
// push-to-main Pages build.

const TARGET = 'https://mhzneruvlfmhnsohfrdo.supabase.co/functions/v1/gcal-oauth';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const target = new URL(TARGET);
  target.search = url.search;
  const res = await fetch(target.toString(), { redirect: 'manual' });
  // Pass the edge function's response through verbatim (normally a 302 whose
  // Location already points at https://procabinet.app/os?gcal=…).
  return new Response(res.body, { status: res.status, headers: res.headers });
}
