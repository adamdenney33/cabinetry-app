// ProCabinet — Business info + logo (carved out of src/app.js in phase E carve 7)
//
// Loaded as a classic <script defer> BEFORE src/app.js. The file declares
// state (`_bizInfoSyncTimer`) and `loadBizInfo()` is called by app.js's
// INIT block at script-load time, so the bindings here must exist before
// app.js executes.
//
// Cross-file dependencies: _userId, _toast (defined in app.js / ui.js),
// _db, _sb (defined in src/db.js, which loads first).

// ══════════════════════════════════════════
// BUSINESS INFO
// ══════════════════════════════════════════
function saveBizInfo() {
  /** @param {string} id */
  const inputVal = id => /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(id))?.value;
  // Merge into the existing payload so a popup that only renders some fields
  // (or a future settings panel that owns only one of them) can't blank-out
  // the others. Important now that bank_details lives in the popup only.
  const prev = (() => { try { return JSON.parse(localStorage.getItem('pc_biz') || '{}'); } catch { return {}; } })();
  /** @param {string} id @param {string} key */
  const merge = (id, key) => {
    const el = document.getElementById(id);
    return el ? (inputVal(id) || '') : (prev[key] || '');
  };
  const payload = {
    name:         merge('biz-name', 'name'),
    phone:        merge('biz-phone', 'phone'),
    email:        merge('biz-email', 'email'),
    address:      merge('biz-address', 'address'),
    abn:          merge('biz-abn', 'abn'),
    bank_details: merge('biz-bank-details', 'bank_details'),
  };
  localStorage.setItem('pc_biz', JSON.stringify(payload));
  // Strategy C: surface dirty hint only when there is a user to sync to.
  // (When not signed in, the localStorage write is the save and there's
  // nothing pending — showing 'unsaved' would lie.)
  if (_userId && typeof _setSaveStatus === 'function') _setSaveStatus('business', 'dirty');
  // Phase 3.3: debounced dual-write to business_info table
  _syncBizInfoToDB(payload);
}

/** @type {ReturnType<typeof setTimeout> | null} */
let _bizInfoSyncTimer = null;
/** @param {{name?: string, phone?: string, email?: string, address?: string, abn?: string, bank_details?: string}} payload */
function _syncBizInfoToDB(payload) {
  if (!_userId) return;
  if (_bizInfoSyncTimer) clearTimeout(_bizInfoSyncTimer);
  const uid = _userId;
  _bizInfoSyncTimer = setTimeout(async () => {
    /** @type {any} */ const w = window;
    if (!w._saveInFlight) w._saveInFlight = new Set();
    w._saveInFlight.add('business');
    if (typeof _setSaveStatus === 'function') _setSaveStatus('business', 'saving');
    const fields = {
      user_id: uid,
      name: payload.name || '',
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      abn: payload.abn || null,
      bank_details: payload.bank_details || null,
      unit_format: JSON.stringify(window.unitFormat),
      updated_at: new Date().toISOString()
    };
    let failed = false;
    const { error } = await _db('business_info').upsert([fields], { onConflict: 'user_id' });
    if (error) { console.warn('[biz_info] DB sync failed:', error.message); failed = true; }
    w._saveInFlight.delete('business');
    if (typeof _setSaveStatus === 'function') {
      _setSaveStatus('business', failed ? 'failed' : 'saved', failed ? { retry: () => _syncBizInfoToDB(payload) } : undefined);
    }
    if (failed) _toast('Business details didn’t save — check your connection and try again', 'error');
  }, 800);
}

// Item 2 phase 3: write cbSettings (rates, markup, tax, deposit, edging,
// labour_times, base_types, constructions, edge_banding) to business_info.
// Materials/hardware/finishes are in-memory only (stock_items is the source of
// truth); the deprecated catalog_items sync has been removed.
/** @type {ReturnType<typeof setTimeout> | null} */
let _cbSettingsSyncTimer = null;
function _syncCBSettingsToDB() {
  if (!_userId) return;
  if (typeof cbSettings === 'undefined' || !cbSettings) return;
  if (_cbSettingsSyncTimer) clearTimeout(_cbSettingsSyncTimer);
  const uid = _userId;
  // Strategy C: surface 'dirty' immediately; pill flips to saving when the
  // 800 ms debounce timer fires.
  if (typeof _setSaveStatus === 'function') _setSaveStatus('cabinet', 'dirty');
  _cbSettingsSyncTimer = setTimeout(async () => {
    /** @type {any} */
    const fields = {
      user_id: uid,
      default_labour_rate: parseFloat(cbSettings.labourRate) || 0,
      default_markup_pct:  parseFloat(cbSettings.markup)     || 0,
      default_tax_pct:     parseFloat(cbSettings.tax)        || 0,
      default_deposit_pct:  parseFloat(cbSettings.deposit)    || 0,
      default_edging_per_m: parseFloat(cbSettings.edgingPerM) || 0,
      default_labour_times:        cbSettings.labourTimes       || {},
      default_base_types:          cbSettings.baseTypes         || [],
      default_constructions:       cbSettings.constructions     || [],
      default_edge_banding:        cbSettings.edgeBanding       || [],
      default_carcass_types:       cbSettings.carcassTypes      || [],
      default_door_types:          cbSettings.doorTypes         || [],
      default_drawer_front_types:  cbSettings.drawerFrontTypes  || [],
      default_drawer_box_types:    cbSettings.drawerBoxTypes    || [],
      // Production scheduler defaults (S.2):
      default_workday_hours:        parseFloat(cbSettings.workdayHours)     || 8,
      default_weekday_hours:        Array.isArray(cbSettings.weekdayHours) && cbSettings.weekdayHours.length === 7
                                      ? cbSettings.weekdayHours.map(/** @param {any} h */ h => parseFloat(h) || 0)
                                      : [8, 8, 8, 8, 8, 0, 0],
      default_packaging_hours:      parseFloat(cbSettings.packagingHours) || 0,
      default_installation_hours:   parseFloat(cbSettings.installationHours) || 0,
      default_contingency_pct:      parseFloat(cbSettings.contingencyPct) || 0,
      production_queue_start_date:  cbSettings.queueStartDate || null,
      updated_at: new Date().toISOString()
    };
    /** @type {any} */ const w = window;
    if (!w._saveInFlight) w._saveInFlight = new Set();
    w._saveInFlight.add('cabinet-settings');
    if (typeof _setSaveStatus === 'function') _setSaveStatus('cabinet', 'saving');
    let failed = false;
    // Partial upsert: name (NOT NULL) is omitted — its DB default '' applies on
    // first insert, and an existing business name is never overwritten.
    const { error } = await _db('business_info').upsert([fields], { onConflict: 'user_id' });
    if (error) { console.warn('[cb_settings] DB sync failed:', error.message); failed = true; }
    w._saveInFlight.delete('cabinet-settings');
    if (typeof _setSaveStatus === 'function') {
      _setSaveStatus('cabinet', failed ? 'failed' : 'saved', failed ? { retry: _syncCBSettingsToDB } : undefined);
    }
    if (failed) _toast('Save failed — check connection', 'error');
  }, 800);
}
function loadBizInfo() {
  try {
    /** @param {string} id */
    const input = id => /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(id));
    const b = JSON.parse(localStorage.getItem('pc_biz') || '{}');
    if (b.name)         { const el = input('biz-name');         if (el) el.value = b.name; }
    if (b.phone)        { const el = input('biz-phone');        if (el) el.value = b.phone; }
    if (b.email)        { const el = input('biz-email');        if (el) el.value = b.email; }
    if (b.address)      { const el = input('biz-address');      if (el) el.value = b.address; }
    if (b.abn)          { const el = input('biz-abn');          if (el) el.value = b.abn; }
    if (b.bank_details) { const el = input('biz-bank-details'); if (el) el.value = b.bank_details; }
  } catch(e) {}
}

// ══════════════════════════════════════════
// BUSINESS DETAILS POPUP
// ══════════════════════════════════════════
// All business-identity fields (name / address / phone / email / ABN / logo /
// bank details) edited in one modal. Mounted from the account dropdown via
// the "Edit business details" button; replaces the older inline sidebar form.
function _openBusinessDetailsPopup() {
  const b = getBizInfo();
  const logo = getBizLogo();
  /** @param {any} s */
  const esc = s => /** @type {(v:any)=>string} */ (/** @type {any} */ (window)._escHtml)(s);
  const html = `
    <div class="popup-header">
      <div class="popup-title" style="display:flex;align-items:center;gap:8px">
        <span>Business details</span>
        <span class="cl-unsaved-pill" data-save-pill="business" style="display:none"></span>
      </div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label class="pf-label">Logo (appears on PDFs)</label>
        <div style="display:flex;align-items:center;gap:12px">
          <img id="biz-logo-preview" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:6px;border:1px solid var(--border);background:var(--surface2);${logo ? '' : 'display:none'}" ${logo ? `src="${esc(logo)}"` : ''}>
          <div style="flex:1">
            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('biz-logo-input').click()">Upload logo</button>
            <input type="file" id="biz-logo-input" accept="image/*" style="display:none" onchange="handleLogoUpload(this)">
            <button type="button" id="biz-logo-remove" class="btn btn-outline btn-sm" style="${logo ? '' : 'display:none'};margin-left:6px" onclick="removeLogo()">Remove</button>
            <div style="font-size:10px;color:var(--muted);margin-top:6px">Max 500KB. PNG / JPG / SVG. Replaces the business-name text in the top-left of every PDF.</div>
          </div>
        </div>
      </div>
      <div class="pf"><label class="pf-label">Business name</label><input class="pf-input pf-input-lg" id="biz-name" value="${esc(b.name)}" oninput="saveBizInfo()" placeholder="Your business name"></div>
      <div class="pf"><label class="pf-label">Address</label><input class="pf-input" id="biz-address" value="${esc(b.address)}" oninput="saveBizInfo()" placeholder="Street, city, postcode"></div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Phone</label><input class="pf-input" id="biz-phone" value="${esc(b.phone)}" oninput="saveBizInfo()"></div>
        <div class="pf"><label class="pf-label">Email</label><input class="pf-input" id="biz-email" value="${esc(b.email)}" oninput="saveBizInfo()"></div>
      </div>
      <div class="pf"><label class="pf-label">ABN / Tax number (optional)</label><input class="pf-input" id="biz-abn" value="${esc(b.abn)}" oninput="saveBizInfo()"></div>
      <div class="pf">
        <label class="pf-label">Bank details (printed on quotes &amp; invoices)</label>
        <textarea class="pf-input" id="biz-bank-details" rows="5" oninput="saveBizInfo()" placeholder="Account Name: Acme Cabinetry Ltd&#10;Sort Code: 12-34-56&#10;Account #: 12345678&#10;IBAN / SWIFT / Routing # as needed.">${esc(b.bank_details)}</textarea>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-primary" onclick="_closePopup()">Done</button>
    </div>
  `;
  _openPopup(html, 'md');
}
/** @type {any} */ (window)._openBusinessDetailsPopup = _openBusinessDetailsPopup;
/**
 * Upload a logo via the authenticated `image-upload` edge function.
 *
 * History: this used to POST directly to `/storage/v1/object/...` with the
 * in-memory auth token, but Storage on this project doesn't honor user JWTs —
 * every direct upload (SDK or raw fetch, any apikey) lands as anonymous and is
 * rejected by the owner-folder RLS policy ("new row violates row-level security
 * policy"). The doorman function verifies the JWT itself and writes with the
 * service role; it derives the per-user path server-side so callers still can't
 * write outside their own `{uid}/...` folder.
 *
 * @param {string} _uid (kept for call-site compatibility; the function derives uid from the JWT)
 * @param {Blob | Uint8Array} body
 * @param {string} contentType
 * @returns {Promise<{ url: string | null, error: { message: string } | null }>}
 */
async function _uploadLogoAsset(_uid, body, contentType) {
  const token = _dbAuthToken();
  if (!token) return { url: null, error: { message: 'not signed in' } };
  const blob = body instanceof Blob ? body : new Blob([/** @type {any} */ (body)], { type: contentType });
  const ext = (contentType.split('/')[1] || 'png').replace('+xml', '');
  const form = new FormData();
  form.append('file', new File([blob], 'logo.' + ext, { type: contentType }));
  form.append('prefix', 'logo');
  try {
    const res = await fetch(`${_SBURL}/functions/v1/image-upload`, {
      method: 'POST',
      headers: { 'apikey': _SBKEY, 'Authorization': 'Bearer ' + token },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (window.Sentry) window.Sentry.captureMessage('logo upload failed (' + res.status + ')', { level: 'warning', extra: { status: res.status, detail } });
      return { url: null, error: { message: 'HTTP ' + res.status } };
    }
    const data = await res.json();
    return { url: data.url || null, error: null };
  } catch (e) {
    if (window.Sentry) window.Sentry.captureException(/** @type {any} */ (e));
    return { url: null, error: { message: (/** @type {any} */ (e)).message || String(e) } };
  }
}

/** @param {HTMLInputElement} input */
function handleLogoUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  // 2MB client cap (the image-upload edge fn hard-caps at 16MB). Kept under the
  // localStorage quota so the data-URL cache below doesn't overflow.
  if (file.size > 2_000_000) { _toast('Logo too large (max 2MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    // 1. Always write to localStorage (legacy compatibility). A large logo can
    //    exceed the storage quota — guard it so the cloud upload still proceeds.
    const result = /** @type {string} */ (/** @type {FileReader} */ (e.target).result);
    try { localStorage.setItem('pc_biz_logo', result); } catch (e2) { /* over quota — cloud copy below is the source of truth */ }
    loadLogoPreview();
    // 2. Phase 3.3: also upload to Supabase Storage and store URL on business_info.
    //    Uses _uploadLogoAsset (raw fetch + in-memory token) rather than
    //    _sb.storage.upload() so it stays authenticated on storage-blocked
    //    browsers (iOS / in-app webviews).
    if (_userId) {
      const { url, error } = await _uploadLogoAsset(_userId, file, file.type);
      if (error) {
        console.warn('[logo] Storage upload failed:', error.message);
        _toast('Logo saved on this device, but cloud sync failed', 'error');
        return;
      }
      if (url) {
        await _db('business_info').upsert(
          [{ user_id: _userId, logo_url: url, updated_at: new Date().toISOString() }],
          { onConflict: 'user_id' }
        );
        _toast('Logo saved & synced', 'success');
        return;
      }
    }
    _toast('Logo saved', 'success');
  };
  reader.readAsDataURL(file);
}
async function removeLogo() {
  localStorage.removeItem('pc_biz_logo');
  loadLogoPreview();
  // Also clear the synced URL so the customer live link (which reads
  // business_info.logo_url server-side) stops showing the removed logo.
  if (_userId) {
    try {
      await _db('business_info').upsert(
        [{ user_id: _userId, logo_url: null, updated_at: new Date().toISOString() }],
        { onConflict: 'user_id' }
      );
    } catch (e) { console.warn('[logo] remove sync failed:', (/** @type {any} */ (e))?.message || e); }
  }
}
function loadLogoPreview() {
  const logo = localStorage.getItem('pc_biz_logo');
  const img = /** @type {HTMLImageElement | null} */ (document.getElementById('biz-logo-preview'));
  const btn = document.getElementById('biz-logo-remove');
  if (img) { img.style.display = logo ? '' : 'none'; if (logo) img.src = logo; }
  if (btn) btn.style.display = logo ? '' : 'none';
}
function getBizLogo() { return localStorage.getItem('pc_biz_logo') || ''; }

/**
 * Self-heal the synced logo URL from the device's localStorage logo.
 *
 * The customer live link renders `business_info.logo_url` server-side, so a logo
 * that only ever lived in localStorage (`pc_biz_logo`) never reaches it — it
 * shows on PDFs but the live link falls back to the name initial. That gap opens
 * whenever the upload→DB sync didn't run for the current logo: it was added
 * before the one-time migration, before the upload-sync shipped, or on a run
 * where the cloud upload failed ("saved on this device, but cloud sync failed").
 *
 * Called from _applyBizInfoFromDB on boot when the DB has no logo_url but
 * localStorage does — mirrors the currency self-heal there (the device wins).
 * Background + silent; runs at most once per successful sync per session.
 */
let _logoHealDone = false;
async function _healLogoToDB() {
  if (_logoHealDone || !_userId) return;
  _logoHealDone = true;
  const dataUrl = localStorage.getItem('pc_biz_logo') || '';
  const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return;
  try {
    const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    const { url, error } = await _uploadLogoAsset(_userId, bin, m[1]);
    if (error || !url) { console.warn('[logo] heal upload failed:', error?.message); _logoHealDone = false; return; }
    const { error: upErr } = await _db('business_info').upsert(
      [{ user_id: _userId, logo_url: url, updated_at: new Date().toISOString() }],
      { onConflict: 'user_id' }
    );
    if (upErr) { console.warn('[logo] heal upsert failed:', upErr.message); return; }
    console.info('[logo] synced device logo to business_info.logo_url — live link will now show it');
  } catch (e) {
    console.warn('[logo] heal exception:', (/** @type {any} */ (e))?.message || e);
    _logoHealDone = false;
  }
}

/**
 * Reverse of _healLogoToDB: when the DB has a logo_url but THIS device's
 * localStorage has none — a second device, or after clearing site data — fetch
 * the public image and cache it as a data URL in pc_biz_logo. The PDF/print
 * header reads only getBizLogo()/localStorage, so without this a synced-from-DB
 * device would render quotes/orders with no logo even though the live link has
 * it. business-assets is a public bucket so the cross-origin GET is allowed;
 * failure is non-fatal (PDF just falls back to the name, as before).
 * @param {string} url
 */
let _logoHydrateDone = false;
async function _hydrateLogoToLS(/** @type {string} */ url) {
  if (_logoHydrateDone || !url || localStorage.getItem('pc_biz_logo')) return;
  _logoHydrateDone = true;
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) { _logoHydrateDone = false; return; }
    const blob = await res.blob();
    const dataUrl = await /** @type {Promise<string>} */ (new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    }));
    if (dataUrl.startsWith('data:image/')) {
      localStorage.setItem('pc_biz_logo', dataUrl);
      loadLogoPreview();
    }
  } catch (e) {
    console.warn('[logo] hydrate failed:', (/** @type {any} */ (e))?.message || e);
    _logoHydrateDone = false;
  }
}

function getBizInfo() {
  try { return JSON.parse(localStorage.getItem('pc_biz') || '{}'); } catch(e) { return {}; }
}

// ══════════════════════════════════════════
// SCHEDULE DAY OVERRIDES (S.2)
// ══════════════════════════════════════════
// In-memory mirror of public.schedule_day_overrides. Sorted by date asc.
/** @type {Array<{ id: number|null, date: string, hours: number, label: string|null }>} */
let dayOverrides = [];

async function loadDayOverrides() {
  if (!_userId && !window._demoMode) return;
  try {
    const { data, error } = await _db('schedule_day_overrides')
      .select('id, date, hours, label')
      .eq('user_id', _userId)
      .order('date');
    if (error) { console.warn('[day_overrides] load failed:', error.message); return; }
    dayOverrides = (data || []).map(/** @param {any} r */ r => ({
      id: r.id,
      date: r.date,
      hours: parseFloat(r.hours) || 0,
      label: r.label || null,
    }));
  } catch (e) {
    console.warn('[day_overrides] load exception:', (/** @type {any} */ (e)).message || e);
  }
}

/** @param {string} date  YYYY-MM-DD
 *  @param {number} hours
 *  @param {string|null} [label] */
async function upsertDayOverride(date, hours, label) {
  if (!_userId) return null;
  if (!date) return null;
  const hoursNum = parseFloat(String(hours)) || 0;
  const labelVal = label || null;
  try {
    // _db() lacks upsert; use find-or-insert via the unique (user_id, date) constraint.
    const existing = dayOverrides.find(o => o.date === date);
    if (existing && existing.id != null) {
      const { data, error } = await _db('schedule_day_overrides')
        .update({ hours: hoursNum, label: labelVal })
        .eq('id', existing.id)
        .select('id, date, hours, label')
        .single();
      if (error || !data) { if (error) console.warn('[day_overrides] update failed:', error.message); return null; }
      const next = { id: data.id, date: data.date, hours: parseFloat(String(data.hours)) || 0, label: data.label || null };
      const idx = dayOverrides.findIndex(o => o.id === existing.id);
      if (idx >= 0) dayOverrides[idx] = next;
      dayOverrides.sort((a, b) => a.date.localeCompare(b.date));
      return next;
    }
    const { data, error } = await _db('schedule_day_overrides')
      .insert({ user_id: _userId, date, hours: hoursNum, label: labelVal })
      .select('id, date, hours, label')
      .single();
    if (error || !data) { if (error) console.warn('[day_overrides] insert failed:', error.message); return null; }
    const next = { id: data.id, date: data.date, hours: parseFloat(String(data.hours)) || 0, label: data.label || null };
    dayOverrides.push(next);
    dayOverrides.sort((a, b) => a.date.localeCompare(b.date));
    return next;
  } catch (e) {
    console.warn('[day_overrides] upsert exception:', (/** @type {any} */ (e)).message || e);
    return null;
  }
}

/** @param {number} id */
async function deleteDayOverride(id) {
  if (!_userId || !id) return false;
  try {
    const { error } = await _db('schedule_day_overrides').delete().eq('id', id);
    if (error) { console.warn('[day_overrides] delete failed:', error.message); return false; }
    dayOverrides = dayOverrides.filter(o => o.id !== id);
    return true;
  } catch (e) {
    console.warn('[day_overrides] delete exception:', (/** @type {any} */ (e)).message || e);
    return false;
  }
}


// (moved here from src/app.js — business.js owns the business-info surface;
// loadAllData (app.js) calls this at runtime with the boot business_info rows.)
// Phase 3.3: overlay business_info row onto pc_biz fields and form inputs.
// If DB has no row, existing localStorage-loaded values remain.
/** @param {any[]} rows */
function _applyBizInfoFromDB(rows) {
  if (!rows || rows.length === 0) {
    // No business_info row (brand-new account): reset the walkthrough gate so
    // a previous account's state can't leak across a same-tab account switch.
    /** @type {any} */ (window)._onboardingState = {};
    return;
  }
  const b = rows[0];
  // O.2: stash the guided-walkthrough state for walkthrough.js's auto-start
  // gate. Absent/non-object => {} (treated as a never-onboarded user).
  /** @type {any} */ (window)._onboardingState =
    (b && b.onboarding_state && typeof b.onboarding_state === 'object') ? b.onboarding_state : {};
  // Update form inputs (these mirror what saveBizInfo / loadBizInfo manage)
  /** @param {string} id @param {any} v */
  const set = (id, v) => { const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id)); if (el && v != null) el.value = v; };
  set('biz-name', b.name);
  set('biz-phone', b.phone);
  set('biz-email', b.email);
  set('biz-address', b.address);
  set('biz-abn', b.abn);
  set('biz-bank-details', b.bank_details);
  // Logo: if DB has a public URL, use it; otherwise fall through to localStorage
  // base64 — and self-heal the DB from that localStorage logo so the customer
  // live link (which reads business_info.logo_url server-side) shows it too.
  if (b.logo_url) {
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById('biz-logo-preview'));
    const btn = document.getElementById('biz-logo-remove');
    if (img) { img.src = b.logo_url; img.style.display = ''; }
    if (btn) btn.style.display = '';
    // Reverse self-heal: cache the logo into localStorage so the PDF/print header
    // (getBizLogo(), localStorage-only) shows it on a device that synced from DB.
    if (!localStorage.getItem('pc_biz_logo') && typeof _hydrateLogoToLS === 'function') {
      _hydrateLogoToLS(b.logo_url);
    }
  } else if (localStorage.getItem('pc_biz_logo') && typeof _healLogoToDB === 'function') {
    _healLogoToDB();
  }
  // Unit format from DB overrides localStorage
  if (b.unit_format) {
    try {
      var uf = typeof b.unit_format === 'string' ? JSON.parse(b.unit_format) : b.unit_format;
      if (uf) {
        Object.assign(window.unitFormat, uf);
        // The synced unit_format.mode is also the source of truth for the
        // imperial/metric SYSTEM. Keep window.units in agreement so a second
        // device (where localStorage pcUnits is stale or absent) doesn't render
        // the wrong system. fromDB:true skips the mm<->inch data conversion —
        // stored values are already in the maker's true unit.
        var _sys = ['decimal', 'fractional', 'feetInches'].includes(uf.mode) ? 'imperial'
                 : ['mm', 'cm', 'm'].includes(uf.mode) ? 'metric' : '';
        if (_sys && _sys !== window.units && typeof setUnits === 'function') {
          setUnits(_sys, { fromDB: true });
        }
        _syncUnitFormatUI();
      }
    } catch(e) {}
  }
  // Currency: window.currency (the in-app pick, from localStorage, shown on the
  // PDF/print) is the user's authoritative choice. business_info.default_currency
  // — which the public live link reads — was only ever written at the one-time
  // migration (frozen, often a stale '£'), so the DEVICE wins: heal the DB from
  // window.currency when they disagree, NEVER the reverse. (Overwriting
  // window.currency from the stale DB would wrongly flip a correct '$' PDF to
  // '£'.) Unlike unit_format, default_currency has no live sync to trust — this
  // makes the live link follow the in-app selection / PDF.
  if (window.currency && b.default_currency !== window.currency) {
    try { if (typeof _syncCurrencyToDB === 'function') _syncCurrencyToDB(window.currency); } catch(e) {}
  }
  // Persist back to localStorage so other reads pick it up (legacy compatibility)
  try {
    localStorage.setItem('pc_biz', JSON.stringify({
      name: b.name || '', phone: b.phone || '', email: b.email || '',
      address: b.address || '', abn: b.abn || '',
      bank_details: b.bank_details || ''
    }));
  } catch(e) {}
  // Phase 3: business_info is the source of truth for all cbSettings scalars
  // and labour/list defaults. Hard overlay — DB always wins. Hardcoded defaults
  // in cabinet.js still apply for new users with no business_info row.
  // Race guard (mirrors _loadCBLinesFromDB): _applyBizInfoFromDB re-runs on
  // every auth event including hourly TOKEN_REFRESHED. If a sync is pending,
  // the user has unsaved cbSettings edits — leave them alone.
  if (typeof cbSettings !== 'undefined' && (typeof _cbSettingsSyncTimer === 'undefined' || !_cbSettingsSyncTimer)) {
    if (b.default_labour_rate != null) cbSettings.labourRate = parseFloat(b.default_labour_rate);
    if (b.default_markup_pct  != null) cbSettings.markup     = parseFloat(b.default_markup_pct);
    if (b.default_tax_pct     != null) cbSettings.tax        = parseFloat(b.default_tax_pct);
    if (b.default_deposit_pct  != null) cbSettings.deposit    = parseFloat(b.default_deposit_pct);
    if (b.default_edging_per_m != null) cbSettings.edgingPerM = parseFloat(b.default_edging_per_m);
    if (b.default_labour_times && typeof b.default_labour_times === 'object' && Object.keys(b.default_labour_times).length > 0) {
      // Merge: DB values override defaults for known keys; new defaults fill in
      // for keys not yet present in the DB row (e.g. carcass power-law fields
      // added 2026-05-05). Wholesale replace would wipe forward-compat defaults.
      cbSettings.labourTimes = { ...cbSettings.labourTimes, ...b.default_labour_times };
    }
    if (Array.isArray(b.default_base_types)         && b.default_base_types.length         > 0) {
      // Migrate legacy base types (flat price → labour hours). Old rows hold
      // {name, price}; base now contributes labour (hours × rate), so drop the
      // price and default refHours to 0 rather than double-counting it.
      cbSettings.baseTypes = b.default_base_types.map(/** @param {any} bt */ bt => ({ name: bt.name, refHours: bt.refHours != null ? bt.refHours : 0 }));
    }
    if (Array.isArray(b.default_constructions)      && b.default_constructions.length      > 0) cbSettings.constructions     = b.default_constructions;
    if (Array.isArray(b.default_edge_banding)       && b.default_edge_banding.length       > 0) cbSettings.edgeBanding       = b.default_edge_banding;
    if (Array.isArray(b.default_carcass_types)      && b.default_carcass_types.length      > 0) cbSettings.carcassTypes      = b.default_carcass_types;
    if (Array.isArray(b.default_door_types)         && b.default_door_types.length         > 0) cbSettings.doorTypes         = b.default_door_types;
    if (Array.isArray(b.default_drawer_front_types) && b.default_drawer_front_types.length > 0) cbSettings.drawerFrontTypes  = b.default_drawer_front_types;
    if (Array.isArray(b.default_drawer_box_types)   && b.default_drawer_box_types.length   > 0) cbSettings.drawerBoxTypes    = b.default_drawer_box_types;
    // Production scheduler defaults (S.2):
    if (b.default_workday_hours     != null) cbSettings.workdayHours     = parseFloat(b.default_workday_hours);
    if (b.default_packaging_hours   != null) cbSettings.packagingHours   = parseFloat(b.default_packaging_hours);
    if (b.default_installation_hours!= null) cbSettings.installationHours= parseFloat(b.default_installation_hours);
    if (b.default_contingency_pct   != null) cbSettings.contingencyPct   = parseFloat(b.default_contingency_pct);
    if (Array.isArray(b.default_weekday_hours) && b.default_weekday_hours.length === 7) {
      cbSettings.weekdayHours = b.default_weekday_hours.map(/** @param {any} h */ h => parseFloat(h) || 0);
    }
    if (b.production_queue_start_date) cbSettings.queueStartDate = b.production_queue_start_date;
    // Phase 3 cleanup: DB is authoritative; drop the legacy LS key so it
    // can't shadow on a future session.
    localStorage.removeItem('pc_cq_settings');
  }
}
