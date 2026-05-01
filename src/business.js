// @ts-nocheck
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
  const payload = {
    name:    document.getElementById('biz-name')?.value    || '',
    phone:   document.getElementById('biz-phone')?.value   || '',
    email:   document.getElementById('biz-email')?.value   || '',
    address: document.getElementById('biz-address')?.value || '',
    abn:     document.getElementById('biz-abn')?.value     || '',
  };
  localStorage.setItem('pc_biz', JSON.stringify(payload));
  // Phase 3.3: debounced dual-write to business_info table
  _syncBizInfoToDB(payload);
}

let _bizInfoSyncTimer = null;
function _syncBizInfoToDB(payload) {
  if (!_userId) return;
  if (_bizInfoSyncTimer) clearTimeout(_bizInfoSyncTimer);
  _bizInfoSyncTimer = setTimeout(async () => {
    const fields = {
      user_id: _userId,
      name: payload.name || '',
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      abn: payload.abn || null,
      updated_at: new Date().toISOString()
    };
    const { data: existing } = await _db('business_info').select('id').eq('user_id', _userId);
    if (existing && existing.length > 0) {
      const { error } = await _db('business_info').update(fields).eq('user_id', _userId);
      if (error) console.warn('[biz_info] DB sync failed:', error.message);
    } else {
      const { error } = await _db('business_info').insert([fields]);
      if (error) console.warn('[biz_info] DB sync failed:', error.message);
    }
  }, 800);
}
function loadBizInfo() {
  try {
    const b = JSON.parse(localStorage.getItem('pc_biz') || '{}');
    if (b.name)    document.getElementById('biz-name').value    = b.name;
    if (b.phone)   document.getElementById('biz-phone').value   = b.phone;
    if (b.email)   document.getElementById('biz-email').value   = b.email;
    if (b.address) document.getElementById('biz-address').value = b.address;
    if (b.abn)     document.getElementById('biz-abn').value     = b.abn;
  } catch(e) {}
}
function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 500000) { _toast('Logo too large (max 500KB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    // 1. Always write to localStorage (legacy compatibility)
    localStorage.setItem('pc_biz_logo', e.target.result);
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
      } catch(err) { console.warn('[logo] Sync exception:', err.message || err); }
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
  const img = document.getElementById('biz-logo-preview');
  const btn = document.getElementById('biz-logo-remove');
  if (img) { img.style.display = logo ? '' : 'none'; if (logo) img.src = logo; }
  if (btn) btn.style.display = logo ? '' : 'none';
}
function getBizLogo() { return localStorage.getItem('pc_biz_logo') || ''; }

function getBizInfo() {
  try { return JSON.parse(localStorage.getItem('pc_biz') || '{}'); } catch(e) { return {}; }
}

