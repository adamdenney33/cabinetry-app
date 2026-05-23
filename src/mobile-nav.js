// ══════════════════════════════════════════
// MOBILE NAV — single-column "one pane at a time" (portrait phones)
// ══════════════════════════════════════════
// On a narrow viewport the desktop two-pane layout (editor sidebar + list
// main) collapses to one column. `body[data-mv]` ("mobile view") decides which
// pane shows: "list" (default) or "editor". The marker classes `.mv-pane-editor`
// / `.mv-pane-list` live on the panes (see index.html); all the show/hide logic
// is pure CSS inside the `@media (max-width:760px)` block in styles.css — this
// file only flips `data-mv`. Back navigation is handled by each section's own
// header back arrow (which calls `_mvShowList()`), so there's no global bar.
//
// `_mvShowEditor()` is appended to the existing card→editor drill-in paths and
// `_mvShowList()` to the back/exit paths; both no-op on desktop (the CSS only
// reacts to `data-mv` under the mobile media query, so wide screens are
// untouched regardless of the attribute's value).

(function () {
  var MQ = '(max-width: 760px)';

  /** @param {'list'|'editor'} view */
  function _mvSet(view) {
    document.body.dataset.mv = (view === 'editor') ? 'editor' : 'list';
  }
  function _mvIsMobile() {
    return window.matchMedia(MQ).matches;
  }
  // Only flip to the editor pane on mobile — on desktop both panes show, so
  // there's nothing to switch and we must not leave a stale "editor" state.
  function _mvShowEditor() { if (_mvIsMobile()) _mvSet('editor'); }
  function _mvShowList() { _mvSet('list'); }

  function _mvInit() {
    if (!document.body.dataset.mv) document.body.dataset.mv = 'list';
  }

  // Set the default synchronously (defer scripts run after the DOM is parsed,
  // so document.body exists) to avoid a flash of both panes before init.
  if (document.body && !document.body.dataset.mv) document.body.dataset.mv = 'list';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _mvInit);
  } else {
    _mvInit();
  }

  window._mvSet = _mvSet;
  window._mvIsMobile = _mvIsMobile;
  window._mvShowEditor = _mvShowEditor;
  window._mvShowList = _mvShowList;
})();
