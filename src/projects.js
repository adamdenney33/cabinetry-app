// ProCabinet — Per-cutlist helpers (formerly the Projects subsystem).
//
// F6 (2026-05-13): the projects entity is retired. This file used to host
// the unified project save flow (_saveProjectScoped + _findOrCreateCutlist +
// _replaceCutListChildTables + _clSaveProjectByName + the whole _pj* set).
// All of that is gone. What's left is the per-cutlist load / duplicate /
// delete / rename helpers — they used to be co-located here because they
// shared callsites with the project flow. Renaming the file to
// `src/cutlists.js` is a follow-up cosmetic step.
//
// Loaded as a classic <script defer> AFTER src/app.js. No state declarations
// here; the cutlist editor's globals live in src/cutlist.js.

/** Load a single cutlist's sheets / pieces / edge_bands into the live arrays
 *  and set _clCurrentCutlistId/Name. Stays on whatever tab is active.
 *  @param {number} cutlistId */
async function _clLoadCutlist(cutlistId) {
  if (!cutlistId) return;
  const { data: cl, error } = await _db('cutlists').select('id, name').eq('id', cutlistId).single();
  if (error || !cl) { _toast('Could not load cut list.', 'error'); return; }
  sheets = []; pieces = []; edgeBands = []; _sheetId = 1; _pieceId = 1; _edgeBandId = 1; pieceColorIdx = 0;
  const [{ data: dbSheets }, { data: dbPieces }, { data: dbEdges }] = await Promise.all([
    _db('sheets').select('*').eq('cutlist_id', cutlistId).order('position', { ascending: true }),
    _db('pieces').select('*').eq('cutlist_id', cutlistId).order('position', { ascending: true }),
    _db('edge_bands').select('*').eq('cutlist_id', cutlistId).order('position', { ascending: true }),
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
  results = null;
  _clCurrentCutlistId = cl.id;
  _clCurrentCutlistName = cl.name || '';
  _clDirty = false;
  renderSheets(); renderPieces();
  if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
  _setClDirty(false);
  const resArea = document.getElementById('results-area');
  if (resArea) resArea.innerHTML = '<div class="empty-state"><h3>Cut list loaded</h3><p>Click Optimize to generate layouts.</p></div>';
  if (!(/** @type {any} */ (window))._pcSuppressToasts) {
    _toast(`"${_clCurrentCutlistName}" loaded`, 'success');
  }
  if (typeof _clRenderContext === 'function') _clRenderContext();
  if (typeof renderCLCutListLibraryView === 'function') renderCLCutListLibraryView();
}
/** @type {any} */ (window)._clLoadCutlist = _clLoadCutlist;

/** Duplicate a cutlist row + clone its sheets/pieces/edge_bands.
 *  @param {number} cutlistId */
async function _clDuplicateCutlist(cutlistId) {
  if (!cutlistId || !_userId) return;
  const { data: cl } = await _db('cutlists').select('*').eq('id', cutlistId).single();
  if (!cl) return;
  const newName = `${cl.name} (copy)`;
  const { data: created, error } = await _db('cutlists')
    .insert([{ user_id: _userId, name: newName, position: (cl.position || 0) + 1, ui_prefs: cl.ui_prefs || {} }])
    .select('id')
    .single();
  if (error || !created) { _toast('Duplicate failed', 'error'); return; }
  const newId = created.id;
  const [{ data: srcSheets }, { data: srcPieces }, { data: srcEdges }] = await Promise.all([
    _db('sheets').select('*').eq('cutlist_id', cutlistId),
    _db('pieces').select('*').eq('cutlist_id', cutlistId),
    _db('edge_bands').select('*').eq('cutlist_id', cutlistId),
  ]);
  /** @param {any} r */
  const strip = (r) => { const o = { ...r }; delete o.id; delete o.created_at; delete o.updated_at; o.cutlist_id = newId; return o; };
  if (srcSheets && srcSheets.length) await _db('sheets').insert(srcSheets.map(strip));
  if (srcPieces && srcPieces.length) await _db('pieces').insert(srcPieces.map(strip));
  if (srcEdges  && srcEdges.length)  await _db('edge_bands').insert(srcEdges.map(strip));
  _toast(`"${newName}" created`, 'success');
  if (typeof renderCLCutListLibraryView === 'function') renderCLCutListLibraryView();
}
/** @type {any} */ (window)._clDuplicateCutlist = _clDuplicateCutlist;

/** Delete a cutlist row. Children cascade-delete via FK.
 *  @param {number} cutlistId */
function _clDeleteCutlist(cutlistId) {
  if (!cutlistId) return;
  _confirm('Delete this cut list? All its parts and panels will be removed.', async () => {
    const { error } = await _db('cutlists').delete().eq('id', cutlistId);
    if (error) { _toast('Delete failed', 'error'); return; }
    if (cutlistId === _clCurrentCutlistId) {
      _clCurrentCutlistId = null;
      _clCurrentCutlistName = '';
      sheets = []; pieces = []; edgeBands = [];
      renderSheets(); renderPieces();
      if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
    }
    _toast('Cut list deleted', 'success');
    if (typeof renderCLCutListLibraryView === 'function') renderCLCutListLibraryView();
  });
}
/** @type {any} */ (window)._clDeleteCutlist = _clDeleteCutlist;

// _clRenameCutlist / _clConfirmRenameCutlist popup helpers removed 2026-05-14.
// They were dead orphans from the pre-F6 projects-tab UI (no remaining callers)
// AND their window.* assignments were clobbering cutlist.js's editor live-
// rename handler (same name, different signature), which silently broke cut
// list rename autosave. The cutlist.js version is the canonical one.
