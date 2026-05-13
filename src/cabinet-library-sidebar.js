// ProCabinet — Cabinet Library sidebar gate (standalone, out-of-client workflow).
// Renders into #cb-lib-gate when the Cabinet Library sub-tab is active and no
// template is currently being edited. Mirrors the Clients/Stock sidebar gate
// pattern: recent items + "+ Add Template" → drill into the cabinet editor
// (reuses the existing #cb-cab-editor rendering and _cbScheduleAutosave's
// cabEditingLibraryIdx route to cabinet_templates).

function _renderCBLibSidebarGate() {
  const gate = _byId('cb-lib-gate');
  if (!gate) return;
  const lib = (typeof cbLibrary !== 'undefined' ? cbLibrary : []);
  const editingIdx = (typeof cbEditingLibraryIdx !== 'undefined') ? cbEditingLibraryIdx : -1;
  const recents = lib.slice().sort(/** @param {any} a @param {any} b */ (a, b) => {
    const av = a.updated_at ? +new Date(a.updated_at) : (a.db_id || a.id || 0);
    const bv = b.updated_at ? +new Date(b.updated_at) : (b.db_id || b.id || 0);
    return bv - av;
  }).map(/** @param {any} c */ c => {
    const idx = lib.indexOf(c);
    const dims = `${c.w||0} × ${c.h||0} × ${c.d||0} mm`;
    return {
      id: c.db_id || idx,
      name: c._libName || c.name || 'Cabinet',
      meta: dims,
      onClick: `cbEditLibraryEntry(${idx})`,
    };
  });
  gate.innerHTML = _renderListEmpty({
    iconSvg: '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    title: 'Cabinet Library',
    subtitle: 'Add and edit cabinet templates without picking a client. Templates are reusable across quotes.',
    btnLabel: '+ Add Template',
    btnOnclick: 'cbStartNewLibraryEntry()',
    recentItems: recents,
    itemIconSvg: /** @type {any} */ (window)._TYPE_ICON_CABINET,
    activeId: editingIdx >= 0 ? (lib[editingIdx]?.db_id || editingIdx) : null,
  });
}
/** @type {any} */ (window)._renderCBLibSidebarGate = _renderCBLibSidebarGate;

// Create a fresh template entry and drill straight into the editor.
// First autosave fires _saveCabinetToDB (via cabEditingLibraryIdx route) and
// back-fills db_id.
function cbStartNewLibraryEntry() {
  if (typeof _enforceFreeLimit === 'function'
      && !_enforceFreeLimit('cabinet_templates', cbLibrary.length)) return;
  /** @type {any} */
  const entry = cbDefaultLine();
  const name = (typeof _cbNextCabinetName === 'function') ? _cbNextCabinetName(true) : 'Cabinet';
  entry._libName = name;
  entry.name = name;
  cbLibrary.push(entry);
  cbEditingLibraryIdx = cbLibrary.length - 1;
  cbEditingLineIdx = -1;
  cbScratchpad = entry;
  if (typeof renderCBPanel === 'function') renderCBPanel();
  if (typeof renderCBLibraryView === 'function') renderCBLibraryView();
  if (typeof _cbScheduleAutosave === 'function') _cbScheduleAutosave();
  if (typeof _scrollCBEditorIntoView === 'function') _scrollCBEditorIntoView();
}
/** @type {any} */ (window).cbStartNewLibraryEntry = cbStartNewLibraryEntry;
