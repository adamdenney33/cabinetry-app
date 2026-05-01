// ProCabinet — Supabase / DB layer (Phase 6 module split)
// Loaded BEFORE src/app.js. Defines globals: _sb, _SBURL, _SBKEY, _dbHeaders, _DBBuilder, _db.

// ══════════════════════════════════════════
// SUPABASE
// ══════════════════════════════════════════
const _sb = window.supabase.createClient(
  'https://mhzneruvlfmhnsohfrdo.supabase.co',
  'sb_publishable_4lHAEgWPQz8DX8TH2KnuiA_oimj8J__'
);

// ── Raw-fetch DB helper (replaces _db() for queries — SDK hangs with sb_publishable keys) ──
const _SBURL = 'https://mhzneruvlfmhnsohfrdo.supabase.co';
const _SBKEY = 'sb_publishable_4lHAEgWPQz8DX8TH2KnuiA_oimj8J__';
/** @returns {Record<string, string>} */
function _dbHeaders() {
  try {
    const raw = localStorage.getItem('sb-mhzneruvlfmhnsohfrdo-auth-token');
    const token = raw ? (JSON.parse(raw)?.access_token || _SBKEY) : _SBKEY;
    return { 'apikey': _SBKEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  } catch(e) { return { 'apikey': _SBKEY, 'Content-Type': 'application/json' }; }
}
class _DBBuilder {
  constructor(table) {
    this._t = table; this._method = 'select'; this._sel = '*';
    this._where = {}; this._orderBy = null; this._orderAsc = true;
    this._isSingle = false; this._body = null; this._lim = null;
  }
  _clone() { const b = new _DBBuilder(this._t); return Object.assign(b, this, { _where: { ...this._where } }); }
  select(cols = '*') { const b = this._clone(); b._sel = cols; return b; }
  insert(body)       { const b = this._clone(); b._method = 'insert'; b._body = body; return b; }
  update(body)       { const b = this._clone(); b._method = 'update'; b._body = body; return b; }
  delete()           { const b = this._clone(); b._method = 'delete'; return b; }
  eq(col, val)       { const b = this._clone(); b._where[col] = `eq.${val}`; return b; }
  order(col, { ascending = true } = {}) { const b = this._clone(); b._orderBy = col; b._orderAsc = ascending; return b; }
  limit(n)           { const b = this._clone(); b._lim = n; return b; }
  single()           { const b = this._clone(); b._isSingle = true; return b; }
  _params() {
    const p = new URLSearchParams();
    if (this._method === 'select') p.set('select', this._sel);
    Object.entries(this._where).forEach(([c, v]) => p.set(c, v));
    if (this._orderBy) p.set('order', `${this._orderBy}.${this._orderAsc ? 'asc' : 'desc'}`);
    if (this._lim) p.set('limit', this._lim);
    return p.toString();
  }
  /**
   * Custom thenable — `await new _DBBuilder(...)` triggers the fetch and
   * resolves with `{ data, error }`. JSDoc lies about the return being
   * `Promise<T>` (the runtime returns `this`, which is itself thenable
   * and recurs once); the lie is what teaches TypeScript that `await`
   * over the builder is valid.
   *
   * @param {(value: { data: any, error: any }) => any} [onfulfilled]
   * @returns {Promise<{ data: any, error: any }>}
   */
  then(onfulfilled) {
    const h = _dbHeaders(), ps = this._params();
    const url = `${_SBURL}/rest/v1/${this._t}${ps ? '?' + ps : ''}`;
    let opts = { headers: h };
    if (this._method === 'insert') opts = { method: 'POST',  headers: { ...h, 'Prefer': 'return=representation' }, body: JSON.stringify(this._body) };
    if (this._method === 'update') opts = { method: 'PATCH', headers: { ...h, 'Prefer': 'return=representation' }, body: JSON.stringify(this._body) };
    if (this._method === 'delete') opts = { method: 'DELETE', headers: h };
    fetch(url, opts).then(async r => {
      const txt = await r.text();
      let data; try { data = JSON.parse(txt); } catch(e) { data = null; }
      if (!r.ok) return onfulfilled && onfulfilled({ data: null, error: data || { message: 'HTTP ' + r.status } });
      if (this._isSingle) return onfulfilled && onfulfilled({ data: Array.isArray(data) ? (data[0] || null) : (data || null), error: null });
      onfulfilled && onfulfilled({ data: data || [], error: null });
    }).catch(e => onfulfilled && onfulfilled({ data: null, error: { message: e.message } }));
    // @ts-expect-error fake-thenable: `this` is structurally PromiseLike (it has .then),
    // but TS can't reconcile the fixed-shape resolve type with PromiseLike's generic signature
    return this;
  }
  catch() { return this; }
}
function _db(table) { return new _DBBuilder(table); }
