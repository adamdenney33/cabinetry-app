// ProCabinet — line-item & cabinet-template photos (Phase 2 of the quote/order
// overhaul). Reuses the public `business-assets` Supabase Storage bucket and the
// raw-fetch + in-memory-token upload pattern from src/business.js (_uploadLogoAsset),
// so it stays authenticated on storage-blocked browsers (iOS / in-app webviews).
//
// Loaded as a classic <script defer> after db.js + ui.js. Defines window globals:
//   loadLinePhotos, _addLinePhotos, _removeLinePhoto, _linePhotoStrip,
//   _linePhotoThumbs, _linePhotoUrls, _linePhotoDataUrl.
//
// FEATURE-FLAGGED: every entry point no-ops while window._FEAT_LINE_PHOTOS is
// false (the default), so this file is inert until the migration that creates
// public.line_photos is applied and the flag is flipped. The render helpers
// return '' when off, so call sites can embed them unconditionally.
//
// Cross-file deps: _sb / _db / _SBURL / _SBKEY / _dbAuthToken (db.js),
// _userId (limits.js/app.js), _toast / _escHtml (ui.js).

/** @typedef {'quote_line'|'order_line'|'cabinet_template'} LPKind */

if (typeof window._FEAT_LINE_PHOTOS === 'undefined') window._FEAT_LINE_PHOTOS = true;

// In-memory cache, grouped by owner. Hydrated by loadLinePhotos() on boot.
/** @type {Record<LPKind, Record<number, Array<{id:number,storage_path:string,url:string|null,caption:string|null,position:number}>>>} */
let _linePhotos = { quote_line: {}, order_line: {}, cabinet_template: {} };

/** The new table isn't in database.types.ts until the migration is applied +
 *  types regenerated, so route its calls through an `any`-typed builder. */
function _lpTable() { return /** @type {any} */ (_db(/** @type {any} */ ('line_photos'))); }

/** @param {string} path @returns {string|null} */
function _lpPublicUrl(path) {
  try { return _sb.storage.from('business-assets').getPublicUrl(path).data?.publicUrl || null; }
  catch (e) { return null; }
}

/** @param {LPKind} kind @param {number} ownerId */
function _linePhotosFor(kind, ownerId) { return (_linePhotos[kind] && _linePhotos[kind][ownerId]) || []; }

// ── Boot hydrate ─────────────────────────────────────────────────────────────
async function loadLinePhotos() {
  _linePhotos = { quote_line: {}, order_line: {}, cabinet_template: {} };
  if (!window._FEAT_LINE_PHOTOS) return;
  if (!_userId && !window._demoMode) return;
  try {
    const { data } = await _lpTable()
      .select('id, owner_kind, owner_id, storage_path, caption, position')
      .order('position');
    (data || []).forEach(/** @param {any} r */ r => {
      const bucket = _linePhotos[/** @type {LPKind} */ (r.owner_kind)];
      if (!bucket) return;
      (bucket[r.owner_id] = bucket[r.owner_id] || []).push({
        id: r.id, storage_path: r.storage_path, caption: r.caption,
        position: r.position, url: _lpPublicUrl(r.storage_path),
      });
    });
  } catch (e) { /* table not present yet / offline — stay empty */ }
}

// ── Upload (via the image-upload edge function) ──────────────────────────────
// Direct Storage uploads on this project land as anonymous (Storage doesn't
// honor user JWTs here — RLS denies every write). We route through the
// authenticated image-upload function instead; it verifies the JWT, computes
// the per-user path server-side, and uploads with the service role.
/** @param {string} _uid @param {LPKind} kind @param {number} ownerId @param {File} file */
async function _uploadLinePhotoAsset(_uid, kind, ownerId, file) {
  const token = _dbAuthToken();
  if (!token) return { path: null, url: null, error: { message: 'not signed in' } };
  const form = new FormData();
  form.append('file', file);
  form.append('prefix', 'line_photo');
  form.append('owner_kind', kind);
  form.append('owner_id', String(ownerId));
  try {
    const res = await fetch(`${_SBURL}/functions/v1/image-upload`, {
      method: 'POST',
      headers: { 'apikey': _SBKEY, 'Authorization': 'Bearer ' + token },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (window.Sentry) window.Sentry.captureMessage('line photo upload failed (' + res.status + ')', { level: 'warning', extra: { status: res.status, detail } });
      return { path: null, url: null, error: { message: 'HTTP ' + res.status } };
    }
    const data = await res.json();
    return { path: data.path, url: data.url || _lpPublicUrl(data.path), error: null };
  } catch (e) {
    return { path: null, url: null, error: { message: (/** @type {any} */ (e)).message || String(e) } };
  }
}

// Downscale a photo client-side before upload. A typical phone shot is 4000+px
// and 6–12MB — overkill for a line-item context photo and a real cost on the
// customer page / PDF. We rasterise to ≤2000px on the long side as a JPEG@0.85,
// which lands at ~300–500KB for almost any input. Passes the file through
// unchanged for formats createImageBitmap can't decode (SVG, animated GIF) or
// if anything fails — the caller still has the original to upload.
/** @param {File} file */
async function _lpDownscale(file) {
  const MAX_DIM = 2000;
  const QUALITY = 0.85;
  // Only re-encode raster formats. SVG (vector) and unknown types pass through.
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    // Small files at native size — no point re-encoding (would lose quality).
    if (scale === 1 && file.size < 1_000_000) { bitmap.close && bitmap.close(); return file; }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    let blob;
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      /** @type {any} */ (canvas.getContext('2d')).drawImage(bitmap, 0, 0, w, h);
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      /** @type {any} */ (canvas.getContext('2d')).drawImage(bitmap, 0, 0, w, h);
      blob = await new Promise(/** @param {(b: any) => void} resolve */ resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    }
    bitmap.close && bitmap.close();
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch (e) {
    return file; // fall back to the original — upload will still attempt it
  }
}

// ── Add (from a file input) / remove ─────────────────────────────────────────
/** @param {LPKind} kind @param {number} ownerId @param {HTMLInputElement} input */
async function _addLinePhotos(kind, ownerId, input) {
  if (!window._FEAT_LINE_PHOTOS) return;
  if (!_userId) { _toast('Sign in to add photos', 'error'); return; }
  const files = [...(input.files || [])];
  input.value = '';
  for (const original of files) {
    if (!original.type.startsWith('image/')) continue;
    // Reject ridiculous originals BEFORE the downscale read (avoid OOM on a 100MB
    // RAW). The 25MB threshold is generous — any phone photo is well under.
    if (original.size > 25_000_000) { _toast(`${original.name} is too large (max 25MB)`, 'error'); continue; }
    const file = await _lpDownscale(original);
    if (file.size > 15_000_000) { _toast(`${original.name} couldn't be shrunk small enough`, 'error'); continue; }
    const { path, url, error } = await _uploadLinePhotoAsset(/** @type {string} */ (_userId), kind, ownerId, file);
    if (error || !path) { _toast('Photo upload failed', 'error'); continue; }
    const position = _linePhotosFor(kind, ownerId).length;
    const { data, error: insErr } = await _lpTable()
      .insert({ user_id: _userId, owner_kind: kind, owner_id: ownerId, storage_path: path, position })
      .select().single();
    if (insErr || !data) { _toast('Photo saved but not linked', 'error'); continue; }
    (_linePhotos[kind][ownerId] = _linePhotos[kind][ownerId] || []).push({ id: data.id, storage_path: path, caption: null, position, url });
  }
  _lpRefresh(kind, ownerId);
}

/** @param {LPKind} kind @param {number} ownerId @param {number} id */
async function _removeLinePhoto(kind, ownerId, id) {
  const arr = _linePhotosFor(kind, ownerId);
  const idx = arr.findIndex(p => p.id === id);
  if (idx < 0) return;
  arr.splice(idx, 1);
  try { await _lpTable().delete().eq('id', id); } catch (e) { /* keep optimistic removal */ }
  _lpRefresh(kind, ownerId);
}

// Re-render any open strips/thumbs for this owner in place.
/** @param {LPKind} kind @param {number} ownerId */
function _lpRefresh(kind, ownerId) {
  document.querySelectorAll(`[data-lp-strip="${kind}:${ownerId}"]`).forEach(el => { el.innerHTML = _linePhotoStripInner(kind, ownerId); });
  document.querySelectorAll(`[data-lp-thumbs="${kind}:${ownerId}"]`).forEach(el => { el.innerHTML = _linePhotoThumbsInner(kind, ownerId, 4); });
}

// ── Editor strip: thumbnails + an "add photos" button ────────────────────────
/** @param {LPKind} kind @param {number} ownerId @returns {string} */
function _linePhotoStrip(kind, ownerId) {
  if (!window._FEAT_LINE_PHOTOS) return '';
  const inputId = `lp-in-${kind}-${ownerId}`;
  return `<div class="lp-strip" data-lp-strip="${kind}:${ownerId}">${_linePhotoStripInner(kind, ownerId)}</div>`
    + `<input type="file" id="${inputId}" accept="image/*" multiple style="display:none" onchange="_addLinePhotos('${kind}',${ownerId},this)">`;
}
/** @param {LPKind} kind @param {number} ownerId @returns {string} */
function _linePhotoStripInner(kind, ownerId) {
  const photos = _linePhotosFor(kind, ownerId);
  const thumbs = photos.map(p =>
    `<div class="lp-thumb"><img src="${_escHtml(p.url || '')}" alt="" loading="lazy"><button type="button" class="lp-del" title="Remove photo" onclick="_removeLinePhoto('${kind}',${ownerId},${p.id})">×</button></div>`
  ).join('');
  const add = `<button type="button" class="lp-add" title="Add photos" onclick="document.getElementById('lp-in-${kind}-${ownerId}').click()">`
    + `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg></button>`;
  return thumbs + add;
}

// ── Display thumbnails (cards / live page) ───────────────────────────────────
/** @param {LPKind} kind @param {number} ownerId @param {number} [max] @returns {string} */
function _linePhotoThumbs(kind, ownerId, max) {
  if (!window._FEAT_LINE_PHOTOS) return '';
  if (!_linePhotosFor(kind, ownerId).length) return '';
  return `<div class="lp-thumbs" data-lp-thumbs="${kind}:${ownerId}">${_linePhotoThumbsInner(kind, ownerId, max || 4)}</div>`;
}
/** @param {LPKind} kind @param {number} ownerId @param {number} max @returns {string} */
function _linePhotoThumbsInner(kind, ownerId, max) {
  const photos = _linePhotosFor(kind, ownerId);
  const shown = photos.slice(0, max);
  const more = photos.length - shown.length;
  return shown.map(p => `<img class="lp-thumb-img" src="${_escHtml(p.url || '')}" alt="" loading="lazy">`).join('')
    + (more > 0 ? `<span class="lp-more">+${more}</span>` : '');
}

/** Public URLs for a line's photos — used by the live customer page. @param {LPKind} kind @param {number} ownerId */
function _linePhotoUrls(kind, ownerId) { return _linePhotosFor(kind, ownerId).map(p => p.url).filter(Boolean); }

/** Fetch a photo and return a dataURL — jsPDF.addImage needs base64/dataURL.
 *  @param {string} url @returns {Promise<string|null>} */
async function _linePhotoDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(/** @type {string} */ (r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch (e) { return null; }
}

/** Open a popup to add/manage a line's or cabinet template's photos. A reusable
 *  hook so editors only need a 📷 button (`onclick="_openLinePhotosPopup('quote_line', id, name)"`).
 *  @param {LPKind} kind @param {number} ownerId @param {string} [title] */
function _openLinePhotosPopup(kind, ownerId, title) {
  if (!window._FEAT_LINE_PHOTOS) { if (typeof _toast === 'function') _toast('Photos aren’t enabled yet', 'info'); return; }
  if (typeof _openPopup !== 'function') return;
  _openPopup(
    `<div class="popup-header"><div class="popup-title">${_escHtml(title || 'Photos')}</div><button class="popup-close" onclick="_closePopup()">&times;</button></div>`
    + `<div class="popup-body"><p style="font-size:12px;color:var(--muted);margin:0 0 12px">Add photos — they show on the live quote page and the PDF.</p>${_linePhotoStrip(kind, ownerId)}</div>`,
    'md');
}

Object.assign(window, {
  loadLinePhotos, _addLinePhotos, _removeLinePhoto, _openLinePhotosPopup,
  _linePhotoStrip, _linePhotoThumbs, _linePhotoUrls, _linePhotoDataUrl, _uploadLinePhotoAsset,
});
