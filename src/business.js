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
    const fields = {
      user_id: uid,
      name: payload.name || '',
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      abn: payload.abn || null,
      updated_at: new Date().toISOString()
    };
    const { data: existing } = await _db('business_info').select('id').eq('user_id', uid);
    if (existing && existing.length > 0) {
      const { error } = await _db('business_info').update(fields).eq('user_id', uid);
      if (error) console.warn('[biz_info] DB sync failed:', error.message);
    } else {
      const { error } = await _db('business_info').insert([fields]);
      if (error) console.warn('[biz_info] DB sync failed:', error.message);
    }
  }, 800);
}

// Item 2 phase 3: write cbSettings (rates, markup, tax, deposit, edging,
// labour_times, base_types, constructions, edge_banding) to business_info.
// Materials/hardware/finishes live in catalog_items — handled separately.
/** @type {ReturnType<typeof setTimeout> | null} */
let _cbSettingsSyncTimer = null;
function _syncCBSettingsToDB() {
  if (!_userId) return;
  if (typeof cbSettings === 'undefined' || !cbSettings) return;
  if (_cbSettingsSyncTimer) clearTimeout(_cbSettingsSyncTimer);
  const uid = _userId;
  _cbSettingsSyncTimer = setTimeout(async () => {
    /** @type {any} */
    const fields = {
      user_id: uid,
      default_labour_rate: parseFloat(cbSettings.labourRate) || 0,
      default_markup_pct:  parseFloat(cbSettings.markup)     || 0,
      default_tax_pct:     parseFloat(cbSettings.tax)        || 0,
      default_deposit_pct:  parseFloat(cbSettings.deposit)    || 0,
      default_edging_per_m: parseFloat(cbSettings.edgingPerM) || 0,
      default_labour_times:  cbSettings.labourTimes  || {},
      default_base_types:    cbSettings.baseTypes    || [],
      default_constructions: cbSettings.constructions || [],
      default_edge_banding:  cbSettings.edgeBanding  || [],
      updated_at: new Date().toISOString()
    };
    const { data: existing } = await _db('business_info').select('id').eq('user_id', uid);
    if (existing && existing.length > 0) {
      const { error } = await _db('business_info').update(fields).eq('user_id', uid);
      if (error) console.warn('[cb_settings] DB sync failed:', error.message);
    } else {
      // Need name (NOT NULL) — ensure baseline before insert
      fields.name = '';
      const { error } = await _db('business_info').insert([fields]);
      if (error) console.warn('[cb_settings] DB sync failed:', error.message);
    }
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

