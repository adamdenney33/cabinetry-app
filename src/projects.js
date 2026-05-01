// ProCabinet — Projects panel + persistence (carved out of src/app.js in
// phase E carve 9).
//
// Loaded as a classic <script defer> AFTER src/app.js. No state declarations
// here. Functions reference globals defined in app.js:
//   - _clProjectCache (a `let`-declared cache currently inside the
//     CABINET BUILDER section of app.js — moves to its own home if/when
//     CABINET BUILDER is carved)
//   - _db / _dbInsertSafe (src/db.js)
//   - _userId / _toast / _confirm / _openPopup / _closePopup / _popupVal
//     / _escHtml / switchSection (app.js / ui.js)
//   - cqLines, cqSettings, sheets, pieces, edgeBands, stockItems, etc.
//     (state held in their respective sections of app.js)

// ══════════════════════════════════════════
// PROJECTS PANEL
// ══════════════════════════════════════════
async function _clLoadProjectList() {
  const { data, error } = await _db('projects').select('id,name,updated_at').order('updated_at', { ascending: false });
  if (!error && data) { _clProjectCache = data; }
}

// ──────────────────────────────────────────────
// UNIFIED PROJECT SAVE
// One canonical place to save project data, regardless of which subsystem (Cut List
// or Cabinet Quote) initiated the save. Ensures (user_id, name) maps to ONE projects
// row. The scope payload is written to the schema's child tables (sheets, pieces,
// edge_bands, quote_lines); the projects row itself only holds UI prefs in `ui_prefs`
// post Phase 7 (alias `data` pre-rename).
// scope: 'cutlist' | 'quote'
// payload: free-form scope-specific blob (cutlist: {sheets, pieces, settings}; quote: {lines, date})
// Returns: { projectId, isNew, error }
// ──────────────────────────────────────────────
async function _saveProjectScoped({ name, scope, payload }) {
  if (!_userId) return { error: 'Not authenticated' };
  if (!name || !name.trim()) return { error: 'Project name required' };
  if (scope !== 'cutlist' && scope !== 'quote') return { error: 'Invalid scope: ' + scope };
  const trimmed = name.trim();

  // 1. Find-or-create the projects row for (user, name). The row itself stores
  //    nothing scope-specific anymore — child tables hold the data.
  const { data: existing, error: lookupErr } = await _db('projects')
    .select('id')
    .eq('user_id', _userId)
    .eq('name', trimmed);
  if (lookupErr) return { error: 'Lookup failed: ' + lookupErr.message };

  let projectId, isNew;
  if (existing && existing.length > 0) {
    projectId = existing[0].id; isNew = false;
    await _db('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
  } else {
    const { data: created, error: insertErr } = await _db('projects')
      .insert([{ name: trimmed, user_id: _userId }]);
    if (insertErr) return { error: 'Insert failed: ' + insertErr.message };
    projectId = (created && created[0]) ? created[0].id : null;
    isNew = true;
  }

  // 2. Replace the scope's child-table rows with the current payload.
  if (scope === 'cutlist' && projectId) {
    try { await _replaceCutListChildTables(projectId, payload); }
    catch(e) { console.warn('[saveProjectScoped] child-table sync failed:', e.message || e); }
  }
  if (scope === 'quote' && projectId) {
    try { await _replaceQuoteLinesChildTable(projectId, payload); }
    catch(e) { console.warn('[saveProjectScoped] quote_lines sync failed:', e.message || e); }
  }

  return { projectId, isNew };
}

// Phase 3.6: replace quote_lines for the project's "default" cabinet-quote (tagged [CQ_DEFAULT]).
// Idempotent: finds existing tagged quote or creates one, then deletes old lines and inserts new.
async function _replaceQuoteLinesChildTable(projectId, payload) {
  if (!projectId) return;
  const lines = payload.lines || [];
  const tag = '[CQ_DEFAULT]';
  // Find existing default quote for this project
  const { data: existing } = await _db('quotes').select('id,notes').eq('project_id', projectId).eq('user_id', _userId);
  let quoteId = null;
  if (existing) {
    const found = existing.find(q => (q.notes || '').includes(tag));
    if (found) quoteId = found.id;
  }
  if (!quoteId) {
    const { data: created, error } = await _db('quotes').insert([{
      user_id: _userId, project_id: projectId,
      notes: tag, status: 'draft',
      date: payload.date || new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
      markup: 0, tax: 0,
    }]);
    if (error) { console.warn('[saveProjectScoped] quote create failed:', error.message); return; }
    quoteId = (created && created[0]) ? created[0].id : null;
  }
  if (!quoteId) return;
  // Replace lines
  await _db('quote_lines').delete().eq('quote_id', quoteId);
  if (lines.length > 0 && typeof _cqLineToRow === 'function') {
    const rows = lines.map((l, i) => _cqLineToRow(l, i, quoteId));
    await _db('quote_lines').insert(rows);
  }
}

// Phase 3.5: replace sheets/pieces/edge_bands rows for a project with the current payload.
// Idempotent: deletes existing rows then inserts new ones. Doesn't touch piece_edges yet
// (would require resolving edge_band ids by name; deferred until edge banding flows are migrated).
async function _replaceCutListChildTables(projectId, payload) {
  if (!projectId) return;
  // Delete existing rows for this project (cascade not enabled here, but FK is — cascade handles piece_edges)
  await Promise.all([
    _db('sheets').delete().eq('project_id', projectId),
    _db('pieces').delete().eq('project_id', projectId),
    _db('edge_bands').delete().eq('project_id', projectId),
  ]);
  const sheets = payload.sheets || [];
  const pieces = payload.pieces || [];
  const ebs = payload.edgeBands || [];
  if (sheets.length) {
    const rows = sheets.map((s, i) => ({
      project_id: projectId, user_id: _userId, position: i,
      name: s.name || 'Sheet',
      w_mm: parseFloat(s.w) || 0, h_mm: parseFloat(s.h) || 0,
      qty: parseInt(s.qty, 10) || 1, kerf_mm: parseFloat(s.kerf) || 3,
      grain: s.grain || 'none', color: s.color || null,
      enabled: s.enabled !== false,
    }));
    await _db('sheets').insert(rows);
  }
  if (pieces.length) {
    const rows = pieces.map((pc, i) => ({
      project_id: projectId, user_id: _userId, position: i,
      label: pc.label || 'Part',
      w_mm: parseFloat(pc.w) || 0, h_mm: parseFloat(pc.h) || 0,
      qty: parseInt(pc.qty, 10) || 1,
      grain: pc.grain || 'none', material: pc.material || null,
      notes: pc.notes || null, color: pc.color || null,
      enabled: pc.enabled !== false,
    }));
    await _db('pieces').insert(rows);
  }
  if (ebs.length) {
    const rows = ebs.map((eb, i) => ({
      project_id: projectId, user_id: _userId, position: i,
      name: eb.name || 'Edge Band',
      thickness_mm: parseFloat(eb.thickness) || 0,
      width_mm: parseFloat(eb.width) || 0,
      length_m: parseFloat(eb.length) || 0,
      glue: eb.glue || null, color: eb.color || null,
    }));
    await _db('edge_bands').insert(rows);
  }
}

function _clSaveProjectByName(name) {
  if (!name) return;
  if (!_requireAuth()) return;
  const payload = {
    sheets:    JSON.parse(JSON.stringify(sheets)),
    pieces:    JSON.parse(JSON.stringify(pieces)),
    edgeBands: JSON.parse(JSON.stringify(edgeBands || [])),
    settings:  { units: window.units },
  };
  _saveProjectScoped({ name, scope: 'cutlist', payload }).then(({ projectId, error }) => {
    if (error) { _toast('Save failed: ' + error, 'error'); return; }
    _toast(`"${name}" saved`, 'success');
    _clLoadProjectList();
  });
}

function _clLoadProjectByIdx(idx) {
  const p = _clProjectCache[idx];
  if (!p) return;
  loadProject(p.id);
}

function _clDeleteProjectByIdx(idx) {
  const p = _clProjectCache[idx];
  if (!p) return;
  deleteProject(p.id);
}

// Save project via popup
function showSaveProjectForm() {
  if (!_requireAuth()) return;
  const defaultName = `Project ${new Date().toLocaleDateString()}`;
  _openPopup(`
    <h2 style="margin:0 0 16px">Save Cut List Project</h2>
    <div class="form-group"><label>Project Name</label>
      <input id="pop-save-proj-name" class="pop-input" value="${defaultName}" style="width:100%">
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" onclick="_confirmSaveProjectPopup()" style="flex:1">Save</button>
      <button class="btn" onclick="_closePopup()" style="flex:1">Cancel</button>
    </div>
  `, 'small');
  setTimeout(() => {
    const inp = /** @type {HTMLInputElement | null} */ (document.getElementById('pop-save-proj-name'));
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}
function _confirmSaveProjectPopup() {
  const name = _popupVal('pop-save-proj-name');
  if (!name) return;
  _clSaveProjectByName(name);
  _closePopup();
  _toast('Project saved: ' + name);
}
function hideSaveProjectForm() {}
async function confirmSaveProject() { _confirmSaveProjectPopup(); }
async function promptSaveProject() { showSaveProjectForm(); }

async function saveProject(name) {
  _clSaveProjectByName(name);
}

async function loadProject(id) {
  const { data, error } = await _db('projects').select('*').eq('id', id).single();
  if (error || !data) { _toast('Could not load project.', 'error'); return; }
  sheets = []; pieces = []; edgeBands = []; _sheetId = 1; _pieceId = 1; _edgeBandId = 1; pieceColorIdx = 0;

  // Source of truth: child tables (sheets / pieces / edge_bands).
  const [{ data: dbSheets }, { data: dbPieces }, { data: dbEdges }] = await Promise.all([
    _db('sheets').select('*').eq('project_id', id).order('position', { ascending: true }),
    _db('pieces').select('*').eq('project_id', id).order('position', { ascending: true }),
    _db('edge_bands').select('*').eq('project_id', id).order('position', { ascending: true }),
  ]);

  for (const r of (dbSheets || [])) {
    sheets.push({
      id: _sheetId++,
      name: r.name, w: r.w_mm, h: r.h_mm, qty: r.qty,
      kerf: r.kerf_mm, grain: r.grain,
      color: r.color || COLORS[pieceColorIdx++ % COLORS.length],
      enabled: r.enabled !== false,
      db_id: r.id,
    });
  }
  for (const r of (dbPieces || [])) {
    pieces.push({
      id: _pieceId++,
      label: r.label, w: r.w_mm, h: r.h_mm, qty: r.qty,
      grain: r.grain, material: r.material, notes: r.notes,
      color: r.color || COLORS[pieceColorIdx++ % COLORS.length],
      enabled: r.enabled !== false,
      edges: { L1: null, W2: null, L3: null, W4: null },
      db_id: r.id,
    });
  }
  for (const r of (dbEdges || [])) {
    edgeBands.push({
      id: _edgeBandId++,
      name: r.name, thickness: r.thickness_mm, width: r.width_mm,
      length: r.length_m, glue: r.glue, color: r.color,
      db_id: r.id,
    });
  }

  // ui_prefs holds layout/UI settings only (renamed from `data` in Phase 7).
  const prefs = data.ui_prefs || {};
  if (prefs.settings && prefs.settings.units) setUnits(prefs.settings.units);
  results = null;
  renderSheets(); renderPieces();
  if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
  document.getElementById('results-area').innerHTML = '<div class="empty-state"><h3>Project loaded</h3><p>Click Optimize to generate layouts.</p></div>';
  _toast('Project loaded — click Optimize to generate layouts', 'success');
}

function deleteProject(id) {
  _confirm('Delete this project? This cannot be undone.', async () => {
    await _db('projects').delete().eq('id', id);
    _clProjectCache = _clProjectCache.filter(p => p.id !== id);
  });
}

