// ProCabinet — Google Calendar 2-way sync (GC.3).
//
// Wide-window reconcile (no syncToken, no webhooks — decision 2026-07-11):
// each call lists the user's primary-calendar events in a fixed window
// (today −30d … +180d) and partitions them by extendedProperties.private:
//
//   pc_task_id  → schedule_tasks, TWO-WAY. Last-write-wins against the
//                 task's gcal_synced_at watermark; local deletes propagate
//                 (tagged event with no local row → remote delete), remote
//                 deletes propagate (task's event vanished → events.get
//                 confirm → local delete). No tombstones needed.
//   pc_order_id → orders, PUSH-ONLY. The client sends its computed schedule
//                 placements (the scheduler runs client-side); the server
//                 rebuilds matching all-day events and deletes strays. GCal
//                 edits to order events are overwritten on the next sync.
//   untagged    → returned to the client as a READ-ONLY overlay; never stored.
//
// Auth: caller's Supabase JWT (deploy with verify_jwt = true).
// Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ACCOUNTING_TOKEN_KEY,
// SUPABASE_URL/SERVICE_ROLE_KEY.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';
import { decrypt, encrypt } from '../_shared/crypto.ts';

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const WINDOW_BACK_DAYS = 30;
const WINDOW_FWD_DAYS = 180;
const OVERLAY_CAP = 500;

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

type TaskRow = {
  id: number; title: string; notes: string | null;
  start_at: string; end_at: string; all_day: boolean; done: boolean;
  gcal_event_id: string | null; gcal_synced_at: string | null; updated_at: string;
};

// ── small helpers ────────────────────────────────────────────────────────────
const iso = (d: Date) => d.toISOString();
function addDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const ts = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0);

// All-day timestamps are anchored at NOON so the calendar date survives
// timezone conversion (naive UTC-midnight anchoring bled events into the
// neighbouring local day — e.g. BST rendered a 1-day GCal event on two days,
// and an app-created all-day task stored at local midnight sliced to the
// previous UTC date when pushed). `allDayDate` extracts the intended date
// from EITHER convention (legacy local-midnight rows or noon rows) by
// sampling 6h into the stored instant; correct for offsets within ±11h.
const allDayDate = (isoStr: string) =>
  new Date(ts(isoStr) + 6 * 3600_000).toISOString().slice(0, 10);

/** Task → GCal event body. All-day tasks map to date-only events
 *  (GCal's all-day end date is EXCLUSIVE). */
function taskToEventBody(t: TaskRow) {
  const base = {
    summary: t.title || '(untitled task)',
    description: t.notes || '',
    extendedProperties: { private: { pc_task_id: String(t.id) } },
  };
  if (t.all_day) {
    const s = allDayDate(t.start_at);
    const e = addDays(allDayDate(t.end_at), 1);
    return { ...base, start: { date: s }, end: { date: e } };
  }
  return {
    ...base,
    start: { dateTime: new Date(t.start_at).toISOString() },
    end: { dateTime: new Date(t.end_at).toISOString() },
  };
}

/** GCal event times → task columns. All-day events land on their calendar
 *  dates (00:00 → 23:59 UTC of the span; the client ignores the clock for
 *  all_day rows). */
function eventTimesToTask(ev: GEvent): { start_at: string; end_at: string; all_day: boolean } {
  if (ev.start?.date) {
    const endIncl = addDays(ev.end?.date ?? ev.start.date, -1);
    return {
      all_day: true,
      start_at: `${ev.start.date}T12:00:00.000Z`,
      end_at: `${endIncl}T12:30:00.000Z`,
    };
  }
  const s = ev.start?.dateTime ?? new Date().toISOString();
  const e = ev.end?.dateTime ?? s;
  return { all_day: false, start_at: new Date(s).toISOString(), end_at: new Date(e).toISOString() };
}

function eventsDiffer(ev: GEvent, body: ReturnType<typeof taskToEventBody>): boolean {
  const evStart = ev.start?.date ?? (ev.start?.dateTime ? new Date(ev.start.dateTime).toISOString() : '');
  const evEnd = ev.end?.date ?? (ev.end?.dateTime ? new Date(ev.end.dateTime).toISOString() : '');
  const bStart = (body.start as any).date ?? (body.start as any).dateTime;
  const bEnd = (body.end as any).date ?? (body.end as any).dateTime;
  return (ev.summary ?? '') !== body.summary
    || (ev.description ?? '') !== (body.description ?? '')
    || evStart !== bStart || evEnd !== bEnd;
}

// ── Google API plumbing ──────────────────────────────────────────────────────
async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) {
    throw new Error(`refresh_failed:${tok.error ?? res.status}`);
  }
  return tok as { access_token: string; expires_in?: number };
}

async function gfetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  return await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function listWindow(token: string, timeMin: string, timeMax: string): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({
      singleEvents: 'true', maxResults: '2500', timeMin, timeMax, orderBy: 'startTime',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await gfetch(token, `${CAL}?${q}`);
    if (!res.ok) throw new Error(`events_list_failed:${res.status}`);
    const body = await res.json();
    out.push(...(body.items ?? []));
    pageToken = body.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const uid = auth.user.id;

  let payload: { orders?: { id: number; label: string; startISO: string; endISO: string }[] } = {};
  try { payload = await req.json(); } catch { /* empty body is fine */ }

  const { data: conn } = await admin.from('gcal_connections')
    .select('*').eq('user_id', uid).maybeSingle();
  if (!conn || conn.status !== 'connected' || !conn.refresh_token_enc) {
    return jsonResponse({ connected: false }, 200, cors);
  }

  try {
    // 1. Fresh access token (refresh when <2 min of life left).
    let accessToken = '';
    if (conn.access_token_enc && ts(conn.expires_at) - Date.now() > 120_000) {
      accessToken = await decrypt(conn.access_token_enc);
    } else {
      const tok = await refreshAccessToken(await decrypt(conn.refresh_token_enc));
      accessToken = tok.access_token;
      await admin.from('gcal_connections').update({
        access_token_enc: await encrypt(accessToken),
        expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', uid);
    }

    // 2. Remote window.
    const now = new Date();
    const timeMin = iso(new Date(Date.now() - WINDOW_BACK_DAYS * 86400_000));
    const timeMax = iso(new Date(Date.now() + WINDOW_FWD_DAYS * 86400_000));
    const remote = await listWindow(accessToken, timeMin, timeMax);

    const remoteTaskEvents = new Map<string, GEvent>();   // pc_task_id → event
    const remoteOrderEvents = new Map<string, GEvent[]>(); // pc_order_id → events
    const overlay: { id: string; title: string; start: string; end: string; allDay: boolean }[] = [];
    for (const ev of remote) {
      if (ev.status === 'cancelled') continue;
      const priv = ev.extendedProperties?.private ?? {};
      if (priv.pc_task_id) {
        remoteTaskEvents.set(priv.pc_task_id, ev);
      } else if (priv.pc_order_id) {
        const arr = remoteOrderEvents.get(priv.pc_order_id) ?? [];
        arr.push(ev);
        remoteOrderEvents.set(priv.pc_order_id, arr);
      } else if (overlay.length < OVERLAY_CAP) {
        // All-day bounds at noon → the event stays on its own calendar
        // date(s) after local-time conversion (see allDayDate note).
        overlay.push({
          id: ev.id,
          title: ev.summary ?? '(busy)',
          start: ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T12:00:00.000Z` : ''),
          end: ev.end?.dateTime ?? (ev.end?.date ? `${addDays(ev.end.date, -1)}T13:00:00.000Z` : ''),
          allDay: !!ev.start?.date,
        });
      }
    }

    // 3. Local tasks overlapping the window.
    const { data: taskRows, error: tErr } = await admin.from('schedule_tasks')
      .select('*').eq('user_id', uid).lt('start_at', timeMax).gt('end_at', timeMin);
    if (tErr) throw new Error(tErr.message);
    const tasks = (taskRows ?? []) as TaskRow[];

    let pushed = 0, pulled = 0, deletedLocal = 0, deletedRemote = 0;
    const syncStamp = new Date().toISOString();

    // 4. Tasks — two-way reconcile.
    const seenTaskIds = new Set<string>();
    for (const t of tasks) {
      const key = String(t.id);
      seenTaskIds.add(key);
      let ev = remoteTaskEvents.get(key) ?? null;

      // Task believes it has an event that the window listing didn't return:
      // either it was deleted remotely, or a remote edit moved it out of the
      // window — events.get disambiguates.
      if (!ev && t.gcal_event_id) {
        const res = await gfetch(accessToken, `${CAL}/${encodeURIComponent(t.gcal_event_id)}`);
        if (res.ok) {
          const got = (await res.json()) as GEvent;
          if (got.status === 'cancelled') {
            await admin.from('schedule_tasks').delete().eq('id', t.id);
            deletedLocal++;
            continue;
          }
          ev = got;
        } else if (res.status === 404 || res.status === 410) {
          await admin.from('schedule_tasks').delete().eq('id', t.id);
          deletedLocal++;
          continue;
        }
        // other errors: skip this task this round
        if (!ev) continue;
      }

      if (!ev) {
        // Never synced → create remotely.
        const res = await gfetch(accessToken, CAL, {
          method: 'POST', body: JSON.stringify(taskToEventBody(t)),
        });
        if (res.ok) {
          const created = await res.json();
          await admin.from('schedule_tasks').update({
            gcal_event_id: created.id, gcal_synced_at: syncStamp,
          }).eq('id', t.id);
          pushed++;
        }
        continue;
      }

      // Adopt the event id if the local row lost it (re-connect etc.).
      if (t.gcal_event_id !== ev.id) {
        await admin.from('schedule_tasks').update({ gcal_event_id: ev.id }).eq('id', t.id);
      }

      const lastSync = ts(t.gcal_synced_at);
      const localDirty = ts(t.updated_at) > lastSync + 1500;
      const remoteDirty = ts(ev.updated) > lastSync + 1500;

      if (localDirty && (!remoteDirty || ts(t.updated_at) >= ts(ev.updated))) {
        // Local wins → patch remote.
        const body = taskToEventBody(t);
        if (eventsDiffer(ev, body)) {
          const res = await gfetch(accessToken, `${CAL}/${encodeURIComponent(ev.id)}`, {
            method: 'PATCH', body: JSON.stringify(body),
          });
          if (res.ok) pushed++;
        }
        await admin.from('schedule_tasks').update({ gcal_synced_at: syncStamp }).eq('id', t.id);
      } else if (remoteDirty) {
        // Remote wins → pull into the local row.
        const times = eventTimesToTask(ev);
        await admin.from('schedule_tasks').update({
          title: ev.summary ?? t.title,
          notes: ev.description || null,
          ...times,
          updated_at: syncStamp,
          gcal_synced_at: syncStamp,
        }).eq('id', t.id);
        pulled++;
      }
    }

    // Tagged remote events with no local row → the task was deleted in-app.
    for (const [key, ev] of remoteTaskEvents) {
      if (seenTaskIds.has(key)) continue;
      const res = await gfetch(accessToken, `${CAL}/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
      if (res.ok || res.status === 404 || res.status === 410) deletedRemote++;
    }

    // 5. Orders — push-only mirror of the client's computed placements.
    if (Array.isArray(payload.orders)) {
      const wanted = new Map<string, { id: number; label: string; startISO: string; endISO: string }>();
      for (const o of payload.orders) {
        if (o && o.id != null && /^\d{4}-\d{2}-\d{2}$/.test(o.startISO) && /^\d{4}-\d{2}-\d{2}$/.test(o.endISO)) {
          wanted.set(String(o.id), o);
        }
      }
      for (const [key, o] of wanted) {
        const body = {
          summary: o.label || `Order ${key}`,
          start: { date: o.startISO },
          end: { date: addDays(o.endISO, 1) },
          transparency: 'transparent', // don't mark the maker "busy"
          extendedProperties: { private: { pc_order_id: key } },
        };
        const existing = remoteOrderEvents.get(key) ?? [];
        if (existing.length === 0) {
          const res = await gfetch(accessToken, CAL, { method: 'POST', body: JSON.stringify(body) });
          if (res.ok) pushed++;
        } else {
          const ev = existing[0];
          if ((ev.summary ?? '') !== body.summary
            || ev.start?.date !== body.start.date || ev.end?.date !== body.end.date) {
            const res = await gfetch(accessToken, `${CAL}/${encodeURIComponent(ev.id)}`, {
              method: 'PATCH', body: JSON.stringify(body),
            });
            if (res.ok) pushed++;
          }
          // Stray duplicates for the same order → delete.
          for (const dup of existing.slice(1)) {
            await gfetch(accessToken, `${CAL}/${encodeURIComponent(dup.id)}`, { method: 'DELETE' });
          }
        }
      }
      // Order events whose order left the schedule (completed/deleted) → delete.
      for (const [key, evs] of remoteOrderEvents) {
        if (wanted.has(key)) continue;
        for (const ev of evs) {
          const res = await gfetch(accessToken, `${CAL}/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
          if (res.ok || res.status === 404 || res.status === 410) deletedRemote++;
        }
      }
    }

    await admin.from('gcal_connections').update({
      last_synced_at: syncStamp, updated_at: syncStamp,
    }).eq('user_id', uid);

    return jsonResponse({
      connected: true,
      email: conn.google_email ?? null,
      overlay,
      tasksChanged: pulled > 0 || deletedLocal > 0,
      stats: { pushed, pulled, deletedLocal, deletedRemote, remote: remote.length },
      syncedAt: syncStamp,
      now: now.toISOString(),
    }, 200, cors);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error('[gcal-sync]', msg);
    if (msg.startsWith('refresh_failed:invalid_grant')) {
      // Token revoked on Google's side — surface a re-auth state.
      await admin.from('gcal_connections').update({
        status: 'error', updated_at: new Date().toISOString(),
      }).eq('user_id', uid);
      return jsonResponse({ connected: false, reauth: true }, 200, cors);
    }
    return jsonResponse({ error: msg }, 500, cors);
  }
});
