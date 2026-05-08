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
  const inputVal = id => /** @type {HTMLInputElement | null} */ (document.getElementById(id))?.value;
  const payload = {
    name:    inputVal('biz-name')    || '',
    phone:   inputVal('biz-phone')   || '',
    email:   inputVal('biz-email')   || '',
    address: inputVal('biz-address') || '',
    abn:     inputVal('biz-abn')     || '',
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
/** @param {{name?: string, phone?: string, email?: string, address?: string, abn?: string}} payload */
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
      unit_format: JSON.stringify(window.unitFormat),
      updated_at: new Date().toISOString()
    };
    let failed = false;
    const { data: existing } = await _db('business_info').select('id').eq('user_id', uid);
    if (existing && existing.length > 0) {
      const { error } = await _db('business_info').update(fields).eq('user_id', uid);
      if (error) { console.warn('[biz_info] DB sync failed:', error.message); failed = true; }
    } else {
      const { error } = await _db('business_info').insert([fields]);
      if (error) { console.warn('[biz_info] DB sync failed:', error.message); failed = true; }
    }
    w._saveInFlight.delete('business');
    if (typeof _setSaveStatus === 'function') {
      _setSaveStatus('business', failed ? 'failed' : 'saved', failed ? { retry: () => _syncBizInfoToDB(payload) } : undefined);
    }
  }, 800);
}

// Phase 4.1: write cbSettings.materials / cbSettings.hardware / cbSettings.finishes
// to the catalog_items table. REPLACE semantics — delete all rows of these
// three types for the user, then re-insert from in-memory state. Mirrors the
// _syncCBLinesToDB / _syncCBSettingsToDB pattern (debounced 800ms, fire-and-forget).
/** @type {ReturnType<typeof setTimeout> | null} */
let _catalogSyncTimer = null;
function _syncCatalogToDB() {
  if (!_userId) return;
  if (typeof cbSettings === 'undefined' || !cbSettings) return;
  if (_catalogSyncTimer) clearTimeout(_catalogSyncTimer);
  const uid = _userId;
  _catalogSyncTimer = setTimeout(async () => {
    _catalogSyncTimer = null;
    /** @type {any[]} */
    const rows = [];
    (cbSettings.materials || []).forEach(/** @param {any} m */ m => {
      if (m && m.name) rows.push({ user_id: uid, type: 'material', name: m.name, price: parseFloat(m.price) || 0, unit: 'sheet', specs: m.specs || {} });
    });
    (cbSettings.hardware || []).forEach(/** @param {any} h */ h => {
      if (h && h.name) rows.push({ user_id: uid, type: 'hardware', name: h.name, price: parseFloat(h.price) || 0, unit: 'each', specs: {} });
    });
    (cbSettings.finishes || []).forEach(/** @param {any} f */ f => {
      if (f && f.name) rows.push({ user_id: uid, type: 'finish', name: f.name, price: parseFloat(f.price) || 0, unit: 'm²', specs: {} });
    });
    try {
      await _db('catalog_items').delete().eq('user_id', uid).in('type', ['material', 'hardware', 'finish']);
      if (rows.length > 0) {
        const { error } = await _db('catalog_items').insert(rows);
        if (error) console.warn('[catalog] DB sync failed:', error.message);
      }
    } catch (e) {
      console.warn('[catalog] DB sync exception:', (/** @type {any} */ (e)).message || e);
    }
  }, 800);
}

// Item 2 phase 3: write cbSettings (rates, markup, tax, deposit, edging,
// labour_times, base_types, constructions, edge_banding) to business_info.
// Materials/hardware/finishes live in catalog_items — handled by _syncCatalogToDB above.
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
      default_contingency_pct:      parseFloat(cbSettings.contingencyPct) || 0,
      production_queue_start_date:  cbSettings.queueStartDate || null,
      updated_at: new Date().toISOString()
    };
    /** @type {any} */ const w = window;
    if (!w._saveInFlight) w._saveInFlight = new Set();
    w._saveInFlight.add('cabinet-settings');
    if (typeof _setSaveStatus === 'function') _setSaveStatus('cabinet', 'saving');
    let failed = false;
    const { data: existing } = await _db('business_info').select('id').eq('user_id', uid);
    if (existing && existing.length > 0) {
      const { error } = await _db('business_info').update(fields).eq('user_id', uid);
      if (error) { console.warn('[cb_settings] DB sync failed:', error.message); failed = true; }
    } else {
      // Need name (NOT NULL) — ensure baseline before insert
      fields.name = '';
      const { error } = await _db('business_info').insert([fields]);
      if (error) { console.warn('[cb_settings] DB sync failed:', error.message); failed = true; }
    }
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
    const input = id => /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    const b = JSON.parse(localStorage.getItem('pc_biz') || '{}');
    if (b.name)    { const el = input('biz-name');    if (el) el.value = b.name; }
    if (b.phone)   { const el = input('biz-phone');   if (el) el.value = b.phone; }
    if (b.email)   { const el = input('biz-email');   if (el) el.value = b.email; }
    if (b.address) { const el = input('biz-address'); if (el) el.value = b.address; }
    if (b.abn)     { const el = input('biz-abn');     if (el) el.value = b.abn; }
  } catch(e) {}
}
/** @param {HTMLInputElement} input */
function handleLogoUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 500000) { _toast('Logo too large (max 500KB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    // 1. Always write to localStorage (legacy compatibility)
    const result = /** @type {string} */ (/** @type {FileReader} */ (e.target).result);
    localStorage.setItem('pc_biz_logo', result);
    loadLogoPreview();
    // 2. Phase 3.3: also upload to Supabase Storage and store URL on business_info
    if (_userId) {
      try {
        const ext = (file.type.split('/')[1] || 'png').replace('+xml','svg');
        const path = _userId + '/logo.' + ext;
        const up = await _sb.storage.from('business-assets').upload(path, file, { contentType: file.type, upsert: true });
        if (up.error) {
          console.warn('[logo] Storage upload failed:', up.error.message);
          _toast('Logo saved locally — cloud sync failed', 'success');
        } else {
          const pub = _sb.storage.from('business-assets').getPublicUrl(path);
          const url = pub.data && pub.data.publicUrl ? pub.data.publicUrl : null;
          if (url) {
            // UPSERT business_info.logo_url
            const { data: existing } = await _db('business_info').select('id').eq('user_id', _userId);
            if (existing && existing.length > 0) {
              await _db('business_info').update({ logo_url: url, updated_at: new Date().toISOString() }).eq('user_id', _userId);
            } else {
              await _db('business_info').insert([{ user_id: _userId, logo_url: url, name: '' }]);
            }
            _toast('Logo saved & synced', 'success');
            return;
          }
        }
      } catch(err) { console.warn('[logo] Sync exception:', (/** @type {any} */ (err)).message || err); }
    }
    _toast('Logo saved', 'success');
  };
  reader.readAsDataURL(file);
}
function removeLogo() {
  localStorage.removeItem('pc_biz_logo');
  loadLogoPreview();
}
function loadLogoPreview() {
  const logo = localStorage.getItem('pc_biz_logo');
  const img = /** @type {HTMLImageElement | null} */ (document.getElementById('biz-logo-preview'));
  const btn = document.getElementById('biz-logo-remove');
  if (img) { img.style.display = logo ? '' : 'none'; if (logo) img.src = logo; }
  if (btn) btn.style.display = logo ? '' : 'none';
}
function getBizLogo() { return localStorage.getItem('pc_biz_logo') || ''; }

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
  if (!_userId) return;
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

