// ProCabinet — Local backup / export (carved out of src/app.js in phase E carve 5)
//
// Loaded as a classic <script defer> AFTER src/app.js (no state declarations
// here — only the `_exportLocal` function, which app.js only calls at
// runtime via a settings-menu button). Cross-file dependencies referenced
// from this file's function: `_toast` (called via typeof guard, defined in
// app.js).

// ══════════════════════════════════════════
// LOCAL BACKUP / EXPORT  (Phase 0 of pre-launch refactor)
// Exports every localStorage key the app uses as a single JSON file.
// Use this before running migrations, or as an offline backup at any time.
// ══════════════════════════════════════════
function _exportLocal() {
  /** @type {{exported_at: string, app: string, purpose: string, user_agent: string, keys: Record<string, string | null>}} */
  const snapshot = {
    exported_at: new Date().toISOString(),
    app: 'ProCabinet',
    purpose: 'Local browser-storage backup. Each key under "keys" is a verbatim copy of localStorage. Re-import by setting them back manually or via a script.',
    user_agent: navigator.userAgent,
    keys: {},
  };
  // Capture every key that starts with "pc" (covers pc_*, pcDark, pcUnits, pcCurrency, pcOptCount, etc.)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith('pc')) {
      snapshot.keys[key] = localStorage.getItem(key);
    }
  }
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const a = document.createElement('a');
  a.href = url;
  a.download = `procabinet-local-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const count = Object.keys(snapshot.keys).length;
  if (typeof _toast === 'function') {
    _toast(`Exported ${count} localStorage keys`, 'success');
  }
  return snapshot;
}

// Migration code moved to src/migrate.js (Phase 6 — module split, partial)
