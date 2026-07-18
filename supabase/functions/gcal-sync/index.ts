// ProCabinet — Google Calendar 2-way sync (GC.3).
//
// Wide-window reconcile (no syncToken, no webhooks — decision 2026-07-11):
// each call lists the user's primary-calendar events in a fixed window
// (today −30d … +180d) and partitions them by extendedProperties.private:
//
//   pc_task_id  → schedule_tasks. The DIRECTION depends on the task's
//                 auto_schedule flag, so the bucket is chosen by the LOCAL row,
//                 never by anything on the event:
//                   auto_schedule = false → TWO-WAY. Last-write-wins against
//                     the task's gcal_synced_at watermark; local deletes
//                     propagate (tagged event with no local row → remote
//                     delete), remote deletes propagate (task's event vanished
//                     → events.get confirm → local delete). No tombstones.
//                   auto_schedule = true  → PUSH-ONLY, like orders. The
//                     production queue owns these dates; start_at/end_at are
//                     only a duration carrier, so the client sends the computed
//                     placement in `autoTasks` and Google edits are overwritten.
//                     Flipping the flag re-buckets the SAME event (PATCHed, not
//                     recreated), so the event id survives.
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
const calEventsURL = (calId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;
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
  auto_schedule: boolean;
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

async function listWindow(token: string, timeMin: string, timeMax: string, calId = 'primary'): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({
      singleEvents: 'true', maxResults: '2500', timeMin, timeMax, orderBy: 'startTime',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await gfetch(token, `${calEventsURL(calId)}?${q}`);
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

    // GC.7 — overlay calendar selection ([{id, summary}]); default = primary.
    const selection: { id: string; summary?: string }[] = Array.isArray(conn.selected_calendars)
      ? conn.selected_calendars
      : [{ id: 'primary' }];
    const includePrimaryOverlay = selection.some((s) => s && s.id === 'primary');

    // Auto-scheduled tasks are PUSH-ONLY: the production queue owns their dates,
    // so Google must never write back into them. This id set is fetched
    // UNWINDOWED on purpose — an auto task's start_at/end_at are only a duration
    // carrier with a possibly stale date, so the windowed query below can miss a
    // task whose computed placement is squarely inside the window.
    const { data: idRows, error: idErr } = await admin.from('schedule_tasks')
      .select('id,auto_schedule').eq('user_id', uid);
    if (idErr) throw new Error(idErr.message);
    const autoIds = new Set<string>((idRows ?? []).filter((r) => r.auto_schedule).map((r) => String(r.id)));
    const allTaskIds = new Set<string>((idRows ?? []).map((r) => String(r.id)));

    const remoteTaskEvents = new Map<string, GEvent>();     // pinned  pc_task_id → event
    const remoteAutoTaskEvents = new Map<string, GEvent>(); // auto    pc_task_id → event
    const remoteOrderEvents = new Map<string, GEvent[]>();  // pc_order_id → events
    const overlay: { id: string; title: string; start: string; end: string; allDay: boolean; cal?: string }[] = [];
    // All-day bounds at noon → the event stays on its own calendar date(s)
    // after local-time conversion (see allDayDate note).
    const toOverlay = (ev: GEvent, cal?: string) => {
      if (overlay.length >= OVERLAY_CAP) return;
      overlay.push({
        id: ev.id,
        title: (ev.summary ?? '').trim() || '(busy)',
        start: ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T12:00:00.000Z` : ''),
        end: ev.end?.dateTime ?? (ev.end?.date ? `${addDays(ev.end.date, -1)}T13:00:00.000Z` : ''),
        allDay: !!ev.start?.date,
        ...(cal ? { cal } : {}),
      });
    };
    for (const ev of remote) {
      if (ev.status === 'cancelled') continue;
      const priv = ev.extendedProperties?.private ?? {};
      if (priv.pc_task_id) {
        // Bucket by the LOCAL flag, not by anything on the event: a task flipped
        // to auto keeps its existing event, which the auto path then PATCHes to
        // date-only rather than deleting and recreating (no churn, no lost id).
        (autoIds.has(priv.pc_task_id) ? remoteAutoTaskEvents : remoteTaskEvents).set(priv.pc_task_id, ev);
      } else if (priv.pc_order_id) {
        const arr = remoteOrderEvents.get(priv.pc_order_id) ?? [];
        arr.push(ev);
        remoteOrderEvents.set(priv.pc_order_id, arr);
      } else if (includePrimaryOverlay) {
        toOverlay(ev);
      }
    }
    // Extra selected calendars → read-only overlay (per-calendar failures are
    // non-fatal: a renamed/unshared calendar just drops out until re-picked).
    await Promise.all(selection.map(async (sel) => {
      if (!sel || !sel.id || sel.id === 'primary') return;
      try {
        for (const ev of await listWindow(accessToken, timeMin, timeMax, sel.id)) {
          if (ev.status === 'cancelled') continue;
          if (ev.extendedProperties?.private?.pc_task_id || ev.extendedProperties?.private?.pc_order_id) continue;
          toOverlay(ev, sel.summary);
        }
      } catch (e) {
        console.warn('[gcal-sync] overlay calendar failed:', sel.id, (e as Error).message);
      }
    }));

    // 3. Local tasks overlapping the window.
    const { data: taskRows, error: tErr } = await admin.from('schedule_tasks')
      .select('*').eq('user_id', uid).lt('start_at', timeMax).gt('end_at', timeMin);
    if (tErr) throw new Error(tErr.message);
    const tasks = (taskRows ?? []) as TaskRow[];

    let pushed = 0, pulled = 0, deletedLocal = 0, deletedRemote = 0;
    const syncStamp = new Date().toISOString();

    // 4. Tasks — two-way reconcile. Tasks are independent, so reconcile them
    // concurrently (was a sequential per-task chain of Google round-trips — the
    // dominant sync cost). The counters below are safe to ++ across interleaved
    // awaits: an edge function runs single-threaded, so no update is lost.
    // Auto-scheduled tasks are excluded here — this is the load-bearing line.
    // Leaving them in lets LWW on updated_at hand Google the win and write its
    // times straight back into the duration carrier, fighting the scheduler.
    const pinnedTasks = tasks.filter((t) => !autoIds.has(String(t.id)));
    await Promise.all(pinnedTasks.map(async (t) => {
      const key = String(t.id);
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
            return;
          }
          ev = got;
        } else if (res.status === 404 || res.status === 410) {
          await admin.from('schedule_tasks').delete().eq('id', t.id);
          deletedLocal++;
          return;
        }
        // other errors: skip this task this round
        if (!ev) return;
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
        return;
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
    }));

    // Tagged remote events whose task no longer exists locally → deleted in-app.
    //
    // ONE pass over BOTH buckets, keyed on the UNWINDOWED allTaskIds. Two things
    // matter here and getting either wrong destroys real calendar events:
    //   • the id set must be unwindowed — the old code compared against the
    //     windowed task list, so an auto task pinned outside the window but
    //     placed inside it would have its event deleted every sync;
    //   • it must be one pass — with two buckets claiming pc_task_id, a
    //     per-bucket check would treat the other bucket's ids as strays.
    for (const [key, ev] of [...remoteTaskEvents, ...remoteAutoTaskEvents]) {
      if (allTaskIds.has(key)) continue;
      const res = await gfetch(accessToken, `${CAL}/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
      if (res.ok || res.status === 404 || res.status === 410) deletedRemote++;
      remoteTaskEvents.delete(key);
      remoteAutoTaskEvents.delete(key);
    }

    // 4b. Auto-scheduled tasks — push-only, exactly like orders. The client
    // sends the computed placement; the stored start_at/end_at are only a
    // duration carrier and must not be used to position the event.
    if (Array.isArray(payload.autoTasks)) {
      const winMinDate = timeMin.slice(0, 10);
      const winMaxDate = timeMax.slice(0, 10);
      const wantedTasks = new Map<string, { id: number; label: string; startISO: string; endISO: string }>();
      for (const t of payload.autoTasks) {
        if (t && t.id != null && /^\d{4}-\d{2}-\d{2}$/.test(t.startISO) && /^\d{4}-\d{2}-\d{2}$/.test(t.endISO)) {
          wantedTasks.set(String(t.id), t);
        }
      }
      await Promise.all(Array.from(wantedTasks).map(async ([key, t]) => {
        const body = {
          summary: t.label || `Task ${key}`,
          start: { date: t.startISO },
          end: { date: addDays(t.endISO, 1) },
          transparency: 'transparent',
          extendedProperties: { private: { pc_task_id: key, pc_auto: '1' } },
        };
        const ev = remoteAutoTaskEvents.get(key);
        if (!ev) {
          // Same guard as orders: creating for a placement the next listing
          // can't see would spawn a duplicate on every run.
          if (!(t.startISO <= winMaxDate && t.endISO >= winMinDate)) return;
          const res = await gfetch(accessToken, CAL, { method: 'POST', body: JSON.stringify(body) });
          if (res.ok) {
            pushed++;
            const created = await res.json().catch(() => null);
            if (created?.id) {
              await admin.from('schedule_tasks')
                .update({ gcal_event_id: created.id, gcal_synced_at: syncStamp }).eq('id', Number(key));
            }
          }
          return;
        }
        // Push unconditionally when anything differs — no LWW, no pull. A title
        // edited in Google is overwritten, which is the point of push-only.
        if ((ev.summary ?? '') !== body.summary
          || ev.start?.date !== body.start.date || ev.end?.date !== body.end.date) {
          const res = await gfetch(accessToken, `${CAL}/${encodeURIComponent(ev.id)}`, {
            method: 'PATCH', body: JSON.stringify(body),
          });
          if (res.ok) pushed++;
        }
        if (ev.id) {
          await admin.from('schedule_tasks')
            .update({ gcal_event_id: ev.id, gcal_synced_at: syncStamp }).eq('id', Number(key));
        }
      }));
    }

    // 5. Orders — push-only mirror of the client's computed placements.
    if (Array.isArray(payload.orders)) {
      // Date-only window bounds. An order event outside the listed window can't
      // be seen — so we must not blind-create one for it (see the guard below).
      const winMinDate = timeMin.slice(0, 10);
      const winMaxDate = timeMax.slice(0, 10);
      const wanted = new Map<string, { id: number; label: string; startISO: string; endISO: string }>();
      for (const o of payload.orders) {
        if (o && o.id != null && /^\d{4}-\d{2}-\d{2}$/.test(o.startISO) && /^\d{4}-\d{2}-\d{2}$/.test(o.endISO)) {
          wanted.set(String(o.id), o);
        }
      }
      await Promise.all(Array.from(wanted).map(async ([key, o]) => {
        const body = {
          summary: o.label || `Order ${key}`,
          start: { date: o.startISO },
          end: { date: addDays(o.endISO, 1) },
          transparency: 'transparent', // don't mark the maker "busy"
          extendedProperties: { private: { pc_order_id: key } },
        };
        const existing = remoteOrderEvents.get(key) ?? [];
        if (existing.length === 0) {
          // Only create when the placement overlaps the listed window. Beyond it
          // the next sync can't see the event we just made, so it would be
          // recreated every run — silently spawning duplicate events. It gets
          // created once the order moves inside the window.
          const overlapsWindow = o.startISO <= winMaxDate && o.endISO >= winMinDate;
          if (!overlapsWindow) return;
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
      }));
      // Order events whose order left the schedule (completed/deleted) → delete.
      await Promise.all(Array.from(remoteOrderEvents).map(async ([key, evs]) => {
        if (wanted.has(key)) return;
        for (const ev of evs) {
          const res = await gfetch(accessToken, `${CAL}/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
          if (res.ok || res.status === 404 || res.status === 410) deletedRemote++;
        }
      }));
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
