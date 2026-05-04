// ProCabinet — Supabase / DB layer (Phase 6 module split)
// Loaded BEFORE src/app.js. Defines globals: _sb, _SBURL, _SBKEY, _dbHeaders, _DBBuilder, _db.

/** @typedef {import('./database.types').Database} Database */
/** @typedef {Database['public']['Tables']} _Tables */
/** @typedef {keyof _Tables} _TableName */

// ══════════════════════════════════════════
// SUPABASE
// ══════════════════════════════════════════
// _SBURL / _SBKEY are populated by src/main.js from import.meta.env at startup
// (Vite inlines them at build time from .env.local in dev / Cloudflare Pages
// env vars in prod). main.js is a <script type="module"> that runs before
// this classic-defer script per HTML spec.
const _sb = window.supabase.createClient(window._SBURL, window._SBKEY);

// ── Raw-fetch DB helper (replaces _db() for queries — SDK hangs with sb_publishable keys) ──
const _SBURL = window._SBURL;
const _SBKEY = window._SBKEY;
/** @returns {Record<string, string>} */
function _dbHeaders() {
  try {
    const raw = localStorage.getItem('sb-mhzneruvlfmhnsohfrdo-auth-token');
    const token = raw ? (JSON.parse(raw)?.access_token || _SBKEY) : _SBKEY;
    return { 'apikey': _SBKEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  } catch(e) { return { 'apikey': _SBKEY, 'Content-Type': 'application/json' }; }
}
/**
 * @template {_TableName} K
 * @template {boolean} [Single=false]
 */
class _DBBuilder {
  /** @param {K} table */
  constructor(table) {
    /** @type {K} */
    this._t = table;
    this._method = 'select'; this._sel = '*';
    /** @type {Record<string, string>} */
    this._where = {};
    /** @type {string | null} */
    this._orderBy = null;
    this._orderAsc = true;
    this._isSingle = false;
    /** @type {any} */
    this._body = null;
    /** @type {number | null} */
    this._lim = null;
  }
  _clone() { const b = new _DBBuilder(this._t); return Object.assign(b, this, { _where: { ...this._where } }); }
  /** @returns {_DBBuilder<K, Single>} */
  select(cols = '*') { const b = this._clone(); b._sel = cols; return /** @type {any} */ (b); }
  /** @param {_Tables[K]['Insert'] | _Tables[K]['Insert'][]} body @returns {_DBBuilder<K, Single>} */
  insert(body)       { const b = this._clone(); b._method = 'insert'; b._body = body; return /** @type {any} */ (b); }
  /** @param {_Tables[K]['Update']} body @returns {_DBBuilder<K, Single>} */
  update(body)       { const b = this._clone(); b._method = 'update'; b._body = body; return /** @type {any} */ (b); }
  /** @returns {_DBBuilder<K, Single>} */
  delete()           { const b = this._clone(); b._method = 'delete'; return /** @type {any} */ (b); }
  /** @param {keyof _Tables[K]['Row']} col @param {any} val @returns {_DBBuilder<K, Single>} */
  eq(col, val)       { const b = this._clone(); b._where[/** @type {string} */ (col)] = `eq.${val}`; return /** @type {any} */ (b); }
  /** @param {keyof _Tables[K]['Row']} col @returns {_DBBuilder<K, Single>} */
  order(col, { ascending = true } = {}) { const b = this._clone(); b._orderBy = /** @type {string} */ (col); b._orderAsc = ascending; return /** @type {any} */ (b); }
  /** @param {number} n @returns {_DBBuilder<K, Single>} */
  limit(n)           { const b = this._clone(); b._lim = n; return /** @type {any} */ (b); }
  /** @returns {_DBBuilder<K, true>} */
  single()           { const b = this._clone(); b._isSingle = true; return /** @type {any} */ (b); }
  _params() {
    const p = new URLSearchParams();
    if (this._method === 'select') p.set('select', this._sel);
    Object.entries(this._where).forEach(([c, v]) => p.set(c, v));
    if (this._orderBy) p.set('order', `${this._orderBy}.${this._orderAsc ? 'asc' : 'desc'}`);
    if (this._lim) p.set('limit', String(this._lim));
    return p.toString();
  }
  /**
   * Custom thenable — `await new _DBBuilder(...)` triggers the fetch and
   * resolves with `{ data, error }`. JSDoc lies about the return being
   * `Promise<T>` (the runtime returns `this`, which is itself thenable
   * and recurs once); the lie is what teaches TypeScript that `await`
   * over the builder is valid. The Single template flips the data type
   * between Row[] (default) and Row | null (after .single()).
   *
   * @param {(value: { data: (Single extends true ? _Tables[K]['Row'] | null : _Tables[K]['Row'][] | null), error: any }) => any} [onfulfilled]
   * @returns {Promise<{ data: (Single extends true ? _Tables[K]['Row'] | null : _Tables[K]['Row'][] | null), error: any }>}
   */
  then(onfulfilled) {
    const h = _dbHeaders(), ps = this._params();
    const url = `${_SBURL}/rest/v1/${this._t}${ps ? '?' + ps : ''}`;
    /** @type {RequestInit} */
    let opts = { headers: h };
    if (this._method === 'insert') opts = { method: 'POST',  headers: { ...h, 'Prefer': 'return=representation' }, body: JSON.stringify(this._body) };
    if (this._method === 'update') opts = { method: 'PATCH', headers: { ...h, 'Prefer': 'return=representation' }, body: JSON.stringify(this._body) };
    if (this._method === 'delete') opts = { method: 'DELETE', headers: h };
    fetch(url, opts).then(async r => {
      const txt = await r.text();
      let data; try { data = JSON.parse(txt); } catch(e) { data = null; }
      // The conditional Single → Row|null vs Row[]|null return type can't statically
      // narrow inside this generic handler, so cast through any at the resolve site.
      const resolve = /** @type {(v: any) => any} */ (onfulfilled);
      if (!r.ok) return resolve && resolve({ data: null, error: data || { message: 'HTTP ' + r.status } });
      if (this._isSingle) return resolve && resolve({ data: Array.isArray(data) ? (data[0] || null) : (data || null), error: null });
      resolve && resolve({ data: data || [], error: null });
    }).catch(e => onfulfilled && /** @type {(v: any) => any} */ (onfulfilled)({ data: null, error: { message: e.message } }));
    // @ts-expect-error fake-thenable: `this` is structurally PromiseLike (it has .then),
    // but TS can't reconcile the fixed-shape resolve type with PromiseLike's generic signature
    return this;
  }
  catch() { return this; }
}
/**
 * @template {_TableName} K
 * @param {K} table
 * @returns {_DBBuilder<K>}
 */
function _db(table) { return new _DBBuilder(table); }

// Dev-only: assistant-driven test signin. main.js stashes _isDev + creds on
// window (production builds skip the gate). Run window._signInForTesting()
// from the browser console to authenticate via VITE_TEST_EMAIL/PASSWORD.
if (window._isDev && window._TEST_EMAIL && window._TEST_PASSWORD) {
  window._signInForTesting = async function() {
    const { data, error } = await _sb.auth.signInWithPassword({
      email: /** @type {string} */ (window._TEST_EMAIL),
      password: /** @type {string} */ (window._TEST_PASSWORD),
    });
    if (error) { console.error('[test-signin] failed:', error.message); return { ok: false, error: error.message }; }
    console.log('[test-signin] OK — onAuthStateChange will load data');
    return { ok: true, userId: data.user?.id };
  };
}
