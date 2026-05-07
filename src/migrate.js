// ProCabinet — localStorage→Postgres migration (Phase 2 + 6 of pre-launch refactor)
// Loaded after src/app.js; depends on globals from app.js: _db, _userId, _toast, _confirm,
// _openPopup, _closePopup, _escHtml, _sb, stockItems, orders, etc.
// Triggered by the "Run Migration to Database" button in Settings.

// ══════════════════════════════════════════
// MIGRATION: localStorage -> Postgres  (Phase 2 of pre-launch refactor)
// One-time idempotent migration. Safe to run multiple times.
// Each subroutine is independent; failures in one don't stop others.
// See SCHEMA.md and SPEC.md for the target schema and decisions log.
// ══════════════════════════════════════════
/** @typedef {{sub: string, status: string, msg: string, count: number | null, ts: number}} MigEntry */
/** @typedef {MigEntry[]} MigLog */
/** @param {string} key @param {boolean} [parseJson] */
function _migReadLS(key, parseJson) {
  if (parseJson === undefined) parseJson = true;
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  if (!parseJson) return raw;
  try { return JSON.parse(raw); } catch(e) { return null; }
}
/** @param {MigLog} log @param {string} sub @param {string} status @param {string} msg @param {number} [count] */
function _migLog(log, sub, status, msg, count) {
  /** @type {MigEntry} */
  const entry = { sub, status, msg, count: (count !== undefined ? count : null), ts: Date.now() };
  log.push(entry);
  const c = entry.count !== null ? ` [${entry.count}]` : '';
  console.log(`[migrate] ${sub}: ${status}${c} - ${msg}`);
}

// ── 1. Business info ──
/** @param {MigLog} log */
async function _migrateBizInfo(log) {
  const sub = 'business_info';
  const biz = _migReadLS('pc_biz') || {};
  const cbSettings = _migReadLS('pc_cq_settings') || {};
  const logoB64 = _migReadLS('pc_biz_logo', false);
  const currency = _migReadLS('pcCurrency', false) || '£';
  const units = (_migReadLS('pcUnits', false) === 'metric') ? 'mm' : 'inches';
  if (!biz.name && !logoB64 && !cbSettings.labourRate) {
    _migLog(log, sub, 'SKIP', 'No business info in localStorage');
    return;
  }
  // Logo upload
  let logoUrl = null;
  if (logoB64 && typeof logoB64 === 'string' && logoB64.startsWith('data:image/')) {
    try {
      const m = logoB64.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (m) {
        const mime = m[1];
        const ext = mime.split('/')[1].replace('+xml','svg');
        const path = _userId + '/logo.' + ext;
        const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
        const up = await _sb.storage.from('business-assets').upload(path, bin, { contentType: mime, upsert: true });
        if (up.error) {
          _migLog(log, sub, 'WARN', 'Logo upload failed: ' + up.error.message);
        } else {
          const pub = _sb.storage.from('business-assets').getPublicUrl(path);
          logoUrl = pub.data && pub.data.publicUrl ? pub.data.publicUrl : null;
          _migLog(log, sub, 'OK', 'Logo uploaded to ' + path);
        }
      }
    } catch(e) { _migLog(log, sub, 'WARN', 'Logo upload exception: ' + ((/** @type {any} */ (e)).message || e)); }
  }
  if (!_userId) return;
  const uid = _userId;
  /** @type {any} */
  const fields = {
    user_id: uid,
    name: biz.name || '',
    phone: biz.phone || null,
    email: biz.email || null,
    address: biz.address || null,
    abn: biz.abn || null,
    logo_url: logoUrl,
    default_currency: currency,
    default_units: units,
    default_labour_rate: parseFloat(cbSettings.labourRate) || 50,
    default_markup_pct: parseFloat(cbSettings.markup) || 20,
    default_tax_pct: parseFloat(cbSettings.tax) || 13,
    updated_at: new Date().toISOString()
  };
  const { data: existing } = await _db('business_info').select('id').eq('user_id', uid);
  if (existing && existing.length > 0) {
    const { error } = await _db('business_info').update(fields).eq('user_id', uid);
    if (error) { _migLog(log, sub, 'ERR', 'Update failed: ' + error.message); return; }
    _migLog(log, sub, 'OK', 'Updated existing business_info row', 1);
  } else {
    const { error } = await _db('business_info').insert([fields]);
    if (error) { _migLog(log, sub, 'ERR', 'Insert failed: ' + error.message); return; }
    _migLog(log, sub, 'OK', 'Inserted business_info row', 1);
  }
}

// ── 2. Catalog items (materials/handles/finishes/hardware unified) ──
/** @param {MigLog} log */
async function _migrateCatalog(log) {
  const sub = 'catalog_items';
  const cab = _migReadLS('pc_cab_settings') || {};
  const cb = _migReadLS('pc_cq_settings') || {};
  /** @type {any[]} */
  const items = [];
  const seen = new Set();
  /** @param {string} type @param {string} name @param {any} price @param {string} unit @param {any} [specs] */
  function add(type, name, price, unit, specs) {
    if (!name) return;
    const key = type + '|' + name;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      user_id: _userId, type, name,
      price: parseFloat(price) || 0,
      unit: unit || 'each',
      specs: specs || {}
    });
  }
  (cab.materials || []).forEach(/** @param {any} m */ m => add('material', m.name, m.price, 'sheet', m.specs || {}));
  (cb.materials || []).forEach(/** @param {any} m */ m => add('material', m.name, m.price, 'sheet', m.specs || {}));
  (cab.handles || []).forEach(/** @param {any} h */ h => add('handle', h.name, h.price, 'each'));
  (cb.handles || []).forEach(/** @param {any} h */ h => add('handle', h.name, h.price, 'each'));
  (cb.hardware || []).forEach(/** @param {any} h */ h => add('hardware', h.name, h.price, 'each'));
  (cb.finishes || []).forEach(/** @param {any} f */ f => add('finish', f.name, f.price, 'm²'));
  if (items.length === 0) {
    _migLog(log, sub, 'SKIP', 'No catalog items in localStorage');
    return;
  }
  const { data: existing } = await _db('catalog_items').select('type,name').eq('user_id', _userId);
  const existingSet = new Set((existing || []).map(r => r.type + '|' + r.name));
  const toInsert = items.filter(it => !existingSet.has(it.type + '|' + it.name));
  if (toInsert.length === 0) {
    _migLog(log, sub, 'SKIP', 'All ' + items.length + ' catalog items already in DB', 0);
    return;
  }
  const { error } = await _db('catalog_items').insert(toInsert);
  if (error) { _migLog(log, sub, 'ERR', 'Insert failed: ' + error.message); return; }
  _migLog(log, sub, 'OK', 'Inserted ' + toInsert.length + ' new catalog items (' + (items.length - toInsert.length) + ' already existed)', toInsert.length);
}

// ── 3. Stock metadata (UPDATE existing rows) ──
/** @param {MigLog} log */
async function _migrateStock(log) {
  const sub = 'stock_metadata';
  const cats = _migReadLS('pc_stock_cats') || {};
  const sups = _migReadLS('pc_stock_suppliers') || {};
  const vars = _migReadLS('pc_stock_variants') || {};
  const ids = new Set(Object.keys(cats).concat(Object.keys(sups), Object.keys(vars)));
  if (ids.size === 0) {
    _migLog(log, sub, 'SKIP', 'No stock metadata in localStorage');
    return;
  }
  let updated = 0;
  for (const id of ids) {
    const cat = cats[id];
    const sup = sups[id] || {};
    const v = vars[id] || {};
    /** @type {any} */
    const fields = {};
    if (cat) fields.category = cat;
    if (sup.supplier) fields.supplier = sup.supplier;
    if (sup.url) fields.supplier_url = sup.url;
    if (v.variant) fields.variant = v.variant;
    if (v.thickness !== undefined && v.thickness !== '') fields.thickness_mm = parseFloat(v.thickness) || null;
    if (v.width !== undefined && v.width !== '') fields.width_mm = parseFloat(v.width) || null;
    if (v.length !== undefined && v.length !== '') fields.length_m = parseFloat(v.length) || null;
    if (v.glue) fields.glue = v.glue;
    if (Object.keys(fields).length === 0) continue;
    fields.updated_at = new Date().toISOString();
    const { error } = await _db('stock_items').update(fields).eq('id', parseInt(id, 10));
    if (error) { _migLog(log, sub, 'WARN', 'Stock id=' + id + ': ' + error.message); continue; }
    updated++;
  }
  _migLog(log, sub, 'OK', 'Updated metadata for ' + updated + ' stock items', updated);
}

// ── 4. Cabinet templates (from pc_cq_library) ──
// Migrates the localStorage saved-cabinet library to the cabinet_templates DB
// table. Idempotent via name match. Replaces an earlier version that read
// pc_cab_items from the now-removed orphan cabItems system.
/** @param {MigLog} log */
async function _migrateCabinets(log) {
  const sub = 'cabinet_templates';
  /** @type {any[]} */
  const items = _migReadLS('pc_cq_library') || [];
  if (items.length === 0) {
    _migLog(log, sub, 'SKIP', 'No saved cabinets in localStorage');
    return;
  }
  const { data: existing } = await _db('cabinet_templates').select('name').eq('user_id', _userId);
  const existingNames = new Set((existing || []).map(r => r.name));
  const toInsert = items
    .filter(/** @param {any} c */ c => (c._libName || c.name) && !existingNames.has(c._libName || c.name))
    .map(/** @param {any} c */ c => ({
      user_id: _userId,
      name: c._libName || c.name,
      type: 'base',
      default_w_mm: parseFloat(c.w) || null,
      default_h_mm: parseFloat(c.h) || null,
      default_d_mm: parseFloat(c.d) || null,
      default_specs: c
    }));
  if (toInsert.length === 0) {
    _migLog(log, sub, 'SKIP', 'All ' + items.length + ' saved cabinets already migrated', 0);
    return;
  }
  const { error } = await _db('cabinet_templates').insert(/** @type {any} */ (toInsert));
  if (error) { _migLog(log, sub, 'ERR', error.message); return; }
  _migLog(log, sub, 'OK', 'Inserted ' + toInsert.length + ' cabinet templates', toInsert.length);
}

// ── 5. Cut list data from existing projects.ui_prefs (formerly `data`) jsonb ──
/** @param {MigLog} log */
async function _migrateCutListProjects(log) {
  const sub = 'cutlist_projects';
  const { data: projects } = await _db('projects').select('id,name,ui_prefs').eq('user_id', _userId);
  if (!projects || projects.length === 0) {
    _migLog(log, sub, 'SKIP', 'No projects to migrate');
    return;
  }
  let totalSheets = 0, totalPieces = 0, projectsTouched = 0;
  for (const p of projects) {
    const { data: existingSheets } = await _db('sheets').select('id').eq('project_id', p.id).limit(1);
    const { data: existingPieces } = await _db('pieces').select('id').eq('project_id', p.id).limit(1);
    if ((existingSheets && existingSheets.length) || (existingPieces && existingPieces.length)) continue;
    const blob = /** @type {any} */ (p.ui_prefs);
    const cl = (blob && blob.cutlist) || (blob && (blob.sheets || blob.pieces) ? blob : null);
    if (!cl) continue;
    const sheets = cl.sheets || [];
    const pieces = cl.pieces || [];
    if (sheets.length === 0 && pieces.length === 0) continue;
    if (sheets.length) {
      const sheetRows = sheets.map(/** @param {any} s @param {number} i */ (s, i) => ({
        project_id: p.id, user_id: _userId, position: i,
        name: s.name || 'Sheet',
        w_mm: parseFloat(s.w) || 0,
        h_mm: parseFloat(s.h) || 0,
        qty: parseInt(s.qty, 10) || 1,
        kerf_mm: parseFloat(s.kerf) || 3,
        grain: s.grain || 'none',
        color: s.color || null,
        enabled: s.enabled !== false
      }));
      const { error } = await _db('sheets').insert(sheetRows);
      if (error) { _migLog(log, sub, 'WARN', 'Sheets for "' + p.name + '": ' + error.message); continue; }
      totalSheets += sheets.length;
    }
    if (pieces.length) {
      const pieceRows = pieces.map(/** @param {any} pc @param {number} i */ (pc, i) => ({
        project_id: p.id, user_id: _userId, position: i,
        label: pc.label || 'Part',
        w_mm: parseFloat(pc.w) || 0,
        h_mm: parseFloat(pc.h) || 0,
        qty: parseInt(pc.qty, 10) || 1,
        grain: pc.grain || 'none',
        material: pc.material || null,
        notes: pc.notes || null,
        color: pc.color || null,
        enabled: pc.enabled !== false
      }));
      const { error } = await _db('pieces').insert(pieceRows);
      if (error) { _migLog(log, sub, 'WARN', 'Pieces for "' + p.name + '": ' + error.message); continue; }
      totalPieces += pieces.length;
    }
    projectsTouched++;
  }
  _migLog(log, sub, 'OK', 'Migrated ' + totalSheets + ' sheets + ' + totalPieces + ' pieces across ' + projectsTouched + ' projects', projectsTouched);
}

// ── cbLines ↔ quote_lines boundary converters ──
//
// cbLines (in-memory editing shape) and quote_lines (DB row shape) use
// different field names: camelCase + abbreviated dimensions in cb form,
// snake_case + `_mm`/`_count`/etc. in DB form. These two functions are the
// single boundary between the two shapes.
//
// Round-trip caveat — cb-only fields lost on save:
//   • `id`           — local numeric handle, separate from DB primary key
//   • `backMat`      — back-panel material; DB only stores `material`, so on
//                      reload backMat falls back to material (carcass)
//   • `doorMat`      — door material; same fallback pattern as backMat
// The matching renderCBEditor inputs ("Back Panel", "Door Material") let the
// user pick distinct values in-session; saving and reloading collapses them
// to `material`. Future fix would be schema columns `back_material` /
// `door_material`; not done as part of Phase 4.4.

/** @param {any} row → cbLines line shape */
function _quoteLineRowToCB(row) {
  return {
    name: row.name || '',
    type: row.type || null,
    room: row.room || null,
    w: parseFloat(row.w_mm) || 0,
    h: parseFloat(row.h_mm) || 0,
    d: parseFloat(row.d_mm) || 0,
    qty: parseInt(row.qty, 10) || 1,
    material: row.material || null,
    backMat: row.material || null,
    doorMat: row.material || null,
    finish: row.finish || null,
    construction: row.construction || null,
    baseType: row.base_type || null,
    doors: parseInt(row.door_count, 10) || 0,
    doorPct: row.door_pct != null ? parseFloat(row.door_pct) : null,
    doorHandle: row.door_handle || null,
    drawers: parseInt(row.drawer_count, 10) || 0,
    drawerPct: row.drawer_pct != null ? parseFloat(row.drawer_pct) : null,
    drawerFrontMat: row.drawer_front_material || null,
    drawerInnerMat: row.drawer_inner_material || null,
    shelves: parseInt(row.fixed_shelves, 10) || 0,
    adjShelves: parseInt(row.adj_shelves, 10) || 0,
    looseShelves: parseInt(row.loose_shelves, 10) || 0,
    partitions: parseInt(row.partitions, 10) || 0,
    endPanels: parseInt(row.end_panels, 10) || 0,
    labourHrs: parseFloat(row.labour_hours) || 0,
    labourOverride: !!row.labour_override,
    matCostOverride: row.material_cost_override != null ? parseFloat(row.material_cost_override) : null,
    hwItems: row.hardware || [],
    extras: row.extras || [],
    notes: row.notes || ''
  };
}

/** @param {any} l cbLines line @param {number} position @param {number} quoteId → quote_lines row */
function _cbLineToRow(l, position, quoteId) {
  return {
    quote_id: quoteId, user_id: _userId, position,
    line_kind: 'cabinet',
    name: l.name || '',
    type: l.type || null, room: l.room || null,
    w_mm: parseFloat(l.w) || null,
    h_mm: parseFloat(l.h) || null,
    d_mm: parseFloat(l.d) || null,
    qty: parseInt(l.qty, 10) || 1,
    material: l.material || null,
    finish: l.finish || null,
    construction: l.construction || null,
    base_type: l.baseType || null,
    door_count: parseInt(l.doors, 10) || 0,
    door_pct: parseFloat(l.doorPct) || null,
    door_handle: l.doorHandle || null,
    drawer_count: parseInt(l.drawers, 10) || 0,
    drawer_pct: parseFloat(l.drawerPct) || null,
    drawer_front_material: l.drawerFrontMat || null,
    drawer_inner_material: l.drawerInnerMat || null,
    fixed_shelves: parseInt(l.shelves, 10) || 0,
    adj_shelves: parseInt(l.adjShelves, 10) || 0,
    loose_shelves: parseInt(l.looseShelves, 10) || 0,
    partitions: parseInt(l.partitions, 10) || 0,
    end_panels: parseInt(l.endPanels, 10) || 0,
    labour_hours: parseFloat(l.labourHrs) || null,
    labour_override: !!l.labourOverride,
    material_cost_override: parseFloat(l.matCostOverride) || null,
    hardware: l.hwItems || [],
    extras: l.extras || [],
    notes: l.notes || null
  };
}

// ── 6. CB projects -> projects + quotes + quote_lines ──
/** @param {MigLog} log */
async function _migrateCBProjects(log) {
  const sub = 'cb_projects';
  const projs = _migReadLS('pc_cq_projects') || [];
  if (projs.length === 0) {
    _migLog(log, sub, 'SKIP', 'No CB projects in localStorage');
    return;
  }
  if (!_userId) return;
  const uid = _userId;
  let projectsCreated = 0, quotesCreated = 0, linesCreated = 0;
  for (const cbp of projs) {
    const name = cbp.name || cbp.projectName;
    if (!name) continue;
    // Find or create projects row
    const { data: existing } = await _db('projects').select('id').eq('user_id', uid).eq('name', name);
    /** @type {number | null} */
    let projectId;
    if (existing && existing.length > 0) {
      projectId = existing[0].id;
    } else {
      const { data: created, error } = await _db('projects').insert([{ user_id: uid, name }]);
      if (error) { _migLog(log, sub, 'WARN', 'Project create: ' + error.message); continue; }
      projectId = (created && created[0]) ? created[0].id : null;
      if (!projectId) continue;
      projectsCreated++;
    }
    // Tag quotes with CB-source-id to avoid double-migration
    const tag = '[CBMIG:' + cbp.id + ']';
    const { data: existQ } = await _db('quotes').select('id,notes').eq('project_id', projectId).eq('user_id', uid);
    let alreadyMigrated = (existQ || []).some(q => (q.notes || '').includes(tag));
    if (alreadyMigrated) continue;
    const { data: createdQ, error: qErr } = await _db('quotes').insert([{
      user_id: uid, project_id: projectId,
      notes: tag,
      status: 'draft',
      date: cbp.date || new Date().toLocaleDateString()
    }]);
    if (qErr) { _migLog(log, sub, 'WARN', 'Quote create for "' + name + '": ' + qErr.message); continue; }
    const quoteId = (createdQ && createdQ[0]) ? createdQ[0].id : null;
    if (!quoteId) continue;
    quotesCreated++;
    const lines = cbp.lines || [];
    if (lines.length > 0) {
      const lineRows = lines.map(/** @param {any} l @param {number} i */ (l, i) => _cbLineToRow(l, i, quoteId));
      const { error: lErr } = await _db('quote_lines').insert(lineRows);
      if (lErr) { _migLog(log, sub, 'WARN', 'Lines for "' + name + '": ' + lErr.message); continue; }
      linesCreated += lines.length;
    }
  }
  _migLog(log, sub, 'OK', 'Created ' + projectsCreated + ' projects, ' + quotesCreated + ' quotes, ' + linesCreated + ' quote_lines', projectsCreated + quotesCreated + linesCreated);
}

// ── 7. Saved quotes from pc_cq_saved ──
/** @param {MigLog} log */
async function _migrateSavedQuotes(log) {
  const sub = 'saved_quotes';
  const saved = _migReadLS('pc_cq_saved') || [];
  if (saved.length === 0) {
    _migLog(log, sub, 'SKIP', 'No saved quotes in localStorage');
    return;
  }
  if (!_userId) return;
  const uid = _userId;
  let quotesCreated = 0, linesCreated = 0;
  // Get all existing quotes once
  const { data: existQ } = await _db('quotes').select('id,notes').eq('user_id', uid);
  const existingNotes = (existQ || []).map(q => q.notes || '');
  for (const sq of saved) {
    const tag = '[SAVEDMIG:' + sq.id + ']';
    if (existingNotes.some(n => n.includes(tag))) continue;
    const settings = sq.settings || {};
    const { data: createdQ, error: qErr } = await _db('quotes').insert([{
      user_id: uid,
      notes: ((sq.notes || '') + '\n' + tag).trim(),
      quote_number: sq.quoteNum || null,
      markup: parseFloat(settings.markup) || 0,
      tax: parseFloat(settings.tax) || 0,
      status: 'draft',
      date: sq.date || new Date().toLocaleDateString()
    }]);
    if (qErr) { _migLog(log, sub, 'WARN', 'Quote create for "' + (sq.project || '?') + '": ' + qErr.message); continue; }
    const quoteId = (createdQ && createdQ[0]) ? createdQ[0].id : null;
    if (!quoteId) continue;
    quotesCreated++;
    const lines = sq.lines || [];
    if (lines.length > 0) {
      const lineRows = lines.map(/** @param {any} l @param {number} i */ (l, i) => _cbLineToRow(l, i, quoteId));
      const { error: lErr } = await _db('quote_lines').insert(lineRows);
      if (lErr) { _migLog(log, sub, 'WARN', 'Lines for "' + (sq.project || '?') + '": ' + lErr.message); continue; }
      linesCreated += lines.length;
    }
  }
  _migLog(log, sub, 'OK', 'Created ' + quotesCreated + ' quotes, ' + linesCreated + ' quote_lines', quotesCreated + linesCreated);
}

// ── 8. Order refs (UPDATE existing order rows) ──
/** @param {MigLog} log */
async function _migrateOrderRefs(log) {
  const sub = 'order_refs';
  const qref = _migReadLS('pc_order_quote_ref') || {};
  const notes = _migReadLS('pc_order_notes') || {};
  const starts = _migReadLS('pc_order_prodstarts') || {};
  const ids = new Set(Object.keys(qref).concat(Object.keys(notes), Object.keys(starts)));
  if (ids.size === 0) {
    _migLog(log, sub, 'SKIP', 'No order refs in localStorage');
    return;
  }
  let updated = 0;
  for (const id of ids) {
    /** @type {any} */
    const fields = {};
    if (qref[id]) fields.quote_id = parseInt(qref[id], 10);
    if (notes[id]) fields.notes = notes[id];
    if (starts[id]) fields.production_start_date = starts[id];
    if (Object.keys(fields).length === 0) continue;
    fields.updated_at = new Date().toISOString();
    const { error } = await _db('orders').update(fields).eq('id', parseInt(id, 10));
    if (error) { _migLog(log, sub, 'WARN', 'Order ' + id + ': ' + error.message); continue; }
    updated++;
  }
  _migLog(log, sub, 'OK', 'Updated ' + updated + ' orders', updated);
}

// ── 9. Migrate legacy "Manual Quote" stub rows into Item + Labour lines ──
// Pre-line-items quotes created via the simplified form had a single
// quote_lines row called "Manual Quote" with material_cost_override +
// labour_hours filled in. Split them into one item line ("Materials") and
// one labour line ("Labour"). Idempotent: rows are deleted as they're
// converted, so re-running the migration becomes a no-op.
/** @param {MigLog} log */
async function _migrateManualStubLines(log) {
  const sub = 'manual_quote_stubs';
  if (!_userId) { _migLog(log, sub, 'SKIP', 'Not signed in'); return; }
  const { data: stubs, error } = await _db('quote_lines')
    .select('*').eq('user_id', _userId).eq('name', 'Manual Quote');
  if (error) { _migLog(log, sub, 'WARN', 'Stub query: ' + error.message); return; }
  if (!stubs || stubs.length === 0) {
    _migLog(log, sub, 'SKIP', 'No legacy Manual Quote stubs to convert');
    return;
  }
  const businessRate = (typeof cbSettings !== 'undefined' && cbSettings && cbSettings.labourRate) ? cbSettings.labourRate : 65;
  let converted = 0;
  for (const stub of stubs) {
    /** @type {any} */
    const s = stub;
    /** @type {any[]} */
    const replacements = [];
    const mat = parseFloat(s.material_cost_override) || 0;
    const hrs = parseFloat(s.labour_hours) || 0;
    if (mat > 0) {
      replacements.push({
        quote_id: s.quote_id, user_id: _userId, position: 0,
        line_kind: 'item', name: 'Materials', qty: 1, unit_price: mat,
      });
    }
    if (hrs > 0) {
      replacements.push({
        quote_id: s.quote_id, user_id: _userId, position: replacements.length,
        line_kind: 'labour', name: 'Labour', labour_hours: hrs, unit_price: businessRate,
      });
    }
    if (replacements.length) {
      const { error: insErr } = await _db('quote_lines').insert(replacements);
      if (insErr) { _migLog(log, sub, 'WARN', 'Insert for quote ' + s.quote_id + ': ' + insErr.message); continue; }
    }
    const { error: delErr } = await _db('quote_lines').delete().eq('id', s.id);
    if (delErr) { _migLog(log, sub, 'WARN', 'Delete stub ' + s.id + ': ' + delErr.message); continue; }
    converted++;
  }
  _migLog(log, sub, 'OK', 'Converted ' + converted + ' Manual Quote stubs into item/labour lines', converted);
}

// ── 10. Drop pc_stock_libraries (no migration target per resolved decision) ──
/** @param {MigLog} log */
function _dropStockLibraries(log) {
  const sub = 'drop_stock_libraries';
  const had = localStorage.getItem('pc_stock_libraries') !== null;
  if (had) {
    localStorage.removeItem('pc_stock_libraries');
    _migLog(log, sub, 'OK', 'Removed pc_stock_libraries (resolved decision: no migration target)', 1);
  } else {
    _migLog(log, sub, 'SKIP', 'pc_stock_libraries not present');
  }
}

// ── Orchestrator ──
async function migrateLocalToDB() {
  if (!_userId) { _toast('Please sign in before running migration', 'error'); return null; }
  /** @type {MigLog} */
  const log = [];
  _migLog(log, 'orchestrator', 'OK', 'Starting migration for user_id=' + _userId);
  /** @type {[string, (log: MigLog) => Promise<void>][]} */
  const subs = [
    ['business_info', _migrateBizInfo],
    ['catalog_items', _migrateCatalog],
    ['stock_metadata', _migrateStock],
    ['cabinet_templates', _migrateCabinets],
    ['cutlist_projects', _migrateCutListProjects],
    ['cb_projects', _migrateCBProjects],
    ['saved_quotes', _migrateSavedQuotes],
    ['order_refs', _migrateOrderRefs],
    ['manual_quote_stubs', _migrateManualStubLines],
  ];
  for (const [name, fn] of subs) {
    try { await fn(log); }
    catch(e) { _migLog(log, name, 'ERR', 'Exception: ' + (/** @type {any} */(e).message || e)); }
  }
  try { _dropStockLibraries(log); }
  catch(e) { _migLog(log, 'drop_stock_libraries', 'ERR', (/** @type {any} */ (e)).message || e); }
  _migLog(log, 'orchestrator', 'OK', 'Migration complete');
  return log;
}

// ── UI: confirm and run ──
function _runMigration() {
  if (!_userId) { _toast('Sign in first', 'error'); return; }
  _confirm(
    'Run a one-time migration of localStorage data to the database?<br><br>' +
    'Safe to run multiple times — already-migrated rows are skipped.<br><br>' +
    'Tip: run <em>Export Local Backup</em> first.',
    async () => {
      _toast('Migration started — see console for live progress', 'info');
      const log = await migrateLocalToDB();
      if (log) _showMigrationLog(log);
    }
  );
}

// ── UI: show log modal ──
/** @param {MigLog} log */
function _showMigrationLog(log) {
  const rows = log.map(e => {
    const color = e.status === 'ERR' ? '#c44' : e.status === 'WARN' ? '#c80' : e.status === 'SKIP' ? '#888' : '#2a7';
    const cnt = e.count !== null ? `<span style="color:#888">[${e.count}]</span> ` : '';
    return `<tr>
      <td style="padding:5px 10px;font-family:monospace;font-size:11px;color:#666;border-bottom:1px solid var(--border2)">${_escHtml(e.sub)}</td>
      <td style="padding:5px 10px;font-family:monospace;font-size:11px;font-weight:700;color:${color};border-bottom:1px solid var(--border2)">${e.status}</td>
      <td style="padding:5px 10px;font-size:12px;border-bottom:1px solid var(--border2)">${cnt}${_escHtml(e.msg)}</td>
    </tr>`;
  }).join('');
  const errCount = log.filter(e => e.status === 'ERR').length;
  const warnCount = log.filter(e => e.status === 'WARN').length;
  const summary = errCount > 0
    ? `<span style="color:#c44;font-weight:700">${errCount} error${errCount===1?'':'s'}</span>${warnCount > 0 ? `, <span style="color:#c80">${warnCount} warning${warnCount===1?'':'s'}</span>` : ''}`
    : warnCount > 0
      ? `<span style="color:#c80;font-weight:700">${warnCount} warning${warnCount===1?'':'s'}</span> (no errors)`
      : `<span style="color:#2a7;font-weight:700">All clean</span>`;
  const html = `
    <div class="popup-header">
      <div class="popup-title">
        <div style="font-size:16px;font-weight:800">Migration Log</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${summary} · ${log.length} entries</div>
      </div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body" style="max-height:60vh;overflow-y:auto;padding:0">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--surface2);color:var(--muted);text-align:left;position:sticky;top:0">
          <th style="padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.5px">SUBROUTINE</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.5px">STATUS</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.5px">MESSAGE</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="popup-footer">
      <button class="btn btn-primary" onclick="_closePopup()">Close</button>
    </div>
  `;
  _openPopup(html, 'lg');
}

