// ProCabinet — Features menu: suggest-by-email + upvotable leaderboard.
//
// The Features button in the top toolbar (left of Help; markup in index.html)
// opens a dropdown with two items: "Vote on new features" runs
// _openFeaturesBoard() — a popup leaderboard of owner-curated feature ideas
// that signed-in users can upvote — and "Suggest a feature" runs _openSuggestion().
//
// "Suggest a feature" (_openSuggestion — moved here from src/help.js) keeps the
// mailto: flow. It reuses _helpContext / _mailtoHref / SUPPORT_EMAIL, which
// stay in src/help.js (Bug Report + Support still use them).
//
// Leaderboard data lives in two tables (see migration 20260517120000):
//   feature_suggestions       — curated entries (shared; the owner writes them
//                               in the Supabase dashboard, so the app reads only)
//   feature_suggestion_votes  — one row per user per upvote; a DB trigger keeps
//                               feature_suggestions.vote_count in sync.

// ── Suggest a feature (mailto:) — relocated from the Help dropdown ──
function _openSuggestion() {
  document.getElementById('features-dropdown')?.classList.remove('open');
  const body = `What would you like to see?\n\nWhy would it help your workflow?\n${_helpContext()}`;
  const href = _mailtoHref('[Suggestion] ', body);
  const html = `
    <div class="popup-header">
      <div class="popup-title">Suggest a Feature</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <p style="margin:0 0 12px;color:var(--text2);font-size:13px">
        Got an idea for a new feature or an improvement? Tell us:
      </p>
      <ul style="margin:0 0 12px 18px;padding:0;color:var(--text2);font-size:13px;line-height:1.7">
        <li>What you'd like to see</li>
        <li>Why it would help your workflow</li>
      </ul>
      <p style="margin:0;color:var(--muted);font-size:12px">
        Clicking below opens your email client with a starter template. Popular
        ideas get added to the feature board for everyone to upvote.
      </p>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <a class="btn btn-primary" href="${href}" onclick="_closePopup()">Open Email</a>
    </div>
  `;
  /** @type {any} */ (window)._openPopup(html, 'sm');
}

// ── Feature leaderboard ──────────────────────────────────────────────────

/** @type {any[]} Cached feature_suggestions rows while the popup is open. */
let _featSuggestions = [];
/** @type {Set<number>} Suggestion ids the current user has upvoted. */
let _featVoted = new Set();
/** @type {Set<number>} Suggestion ids with an in-flight vote toggle (de-dupes rapid clicks). */
let _featVoting = new Set();

const _FEAT_ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="6"/><polyline points="5 13 12 6 19 13"/></svg>';

/**
 * Build the Features popup markup around a board-body fragment.
 * @param {string} bodyHtml
 * @returns {string}
 */
function _featureShell(bodyHtml) {
  return `
    <div class="popup-header">
      <div class="popup-title">New Features</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <p class="feat-intro">Upvote the ideas you'd most like us to build next.</p>
      <div id="feat-board">${bodyHtml}</div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Close</button>
    </div>
  `;
}

/** Open the Features popup: the upvotable feature-idea leaderboard. */
function _openFeaturesBoard() {
  document.getElementById('features-dropdown')?.classList.remove('open');
  // Signed-out / demo visitors can still suggest by email, but the board needs
  // an account (per-user vote rows), so skip all DB calls in that case.
  if (!_userId || window._demoMode) {
    /** @type {any} */ (window)._openPopup(_featureShell(
      '<div class="feat-empty">Sign in to view and upvote feature ideas.</div>'
    ), 'md');
    return;
  }
  /** @type {any} */ (window)._openPopup(_featureShell(
    '<div class="feat-empty">Loading…</div>'
  ), 'md');
  _featureLoad();
}

/** Fetch the board + the current user's votes, then render. */
async function _featureLoad() {
  const sg = await _db('feature_suggestions').select('*').order('vote_count', { ascending: false });
  const vt = await _db('feature_suggestion_votes').select('suggestion_id').eq('user_id', _userId);
  const board = document.getElementById('feat-board');
  if (!board) return;                          // popup closed mid-fetch
  if (sg.error) {
    board.innerHTML = '<div class="feat-empty">Couldn\'t load the feature board. Please try again.</div>';
    return;
  }
  _featSuggestions = sg.data || [];
  _featVoted = new Set((vt.data || []).map(v => v.suggestion_id));
  _featureRenderBoard();
}

/** Re-render the leaderboard list from cached state into #feat-board. */
function _featureRenderBoard() {
  const board = document.getElementById('feat-board');
  if (!board) return;
  if (!_featSuggestions.length) {
    board.innerHTML = '<div class="feat-empty">No feature ideas on the board yet — use “Suggest a feature” in the Features menu to send us yours.</div>';
    return;
  }
  const rows = _featSuggestions.slice().sort(/** @param {any} a @param {any} b */ (a, b) =>
    (b.vote_count - a.vote_count) ||
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
  board.innerHTML = '<div class="feat-list">' + rows.map(_featureRow).join('') + '</div>';
}

/**
 * One leaderboard row: idea + status badge + upvote button. The row itself
 * is not clickable — it only gets a light hover fill; the vote pill is the
 * interactive control.
 * @param {any} s
 * @returns {string}
 */
function _featureRow(s) {
  const voted = _featVoted.has(s.id);
  const desc = s.description
    ? `<div class="feat-desc">${_escHtml(s.description)}</div>`
    : '';
  return `<div class="feat-row">
    <div class="feat-row-body">
      <div class="feat-title">${_escHtml(s.title)}${_featureStatusBadge(s.status)}</div>
      ${desc}
    </div>
    <button class="feat-vote${voted ? ' voted' : ''}" onclick="_featureToggleVote(${s.id})"
      aria-pressed="${voted}" title="${voted ? 'Remove your upvote' : 'Upvote this idea'}">
      <span class="feat-vote-count">${s.vote_count}</span>
      ${_FEAT_ARROW}
    </button>
  </div>`;
}

/**
 * Coloured progress badge; nothing for the default 'open' status.
 * @param {string} status
 * @returns {string}
 */
function _featureStatusBadge(status) {
  if (status === 'planned')     return ' <span class="feat-badge planned">Planned</span>';
  if (status === 'in_progress') return ' <span class="feat-badge in-progress">In progress</span>';
  if (status === 'shipped')     return ' <span class="feat-badge shipped">Shipped</span>';
  return '';
}

/**
 * Toggle the current user's upvote on a suggestion. Optimistic — the row
 * updates immediately and reverts if the write fails.
 * @param {number} id
 */
async function _featureToggleVote(id) {
  if (!_userId) { _toast('Sign in to vote', 'error'); return; }
  if (_featVoting.has(id)) return;             // ignore rapid double-clicks
  const s = _featSuggestions.find(/** @param {any} x */ x => x.id === id);
  if (!s) return;
  const uid = _userId;
  const wasVoted = _featVoted.has(id);

  // Optimistic update.
  if (wasVoted) { _featVoted.delete(id); s.vote_count = Math.max(0, s.vote_count - 1); }
  else          { _featVoted.add(id);    s.vote_count = s.vote_count + 1; }
  _featureRenderBoard();

  _featVoting.add(id);
  const res = wasVoted
    ? await _db('feature_suggestion_votes').delete().eq('suggestion_id', id).eq('user_id', uid)
    : await _db('feature_suggestion_votes').insert({ suggestion_id: id, user_id: uid });
  _featVoting.delete(id);

  if (res.error) {
    // Revert the optimistic change.
    if (wasVoted) { _featVoted.add(id);    s.vote_count = s.vote_count + 1; }
    else          { _featVoted.delete(id); s.vote_count = Math.max(0, s.vote_count - 1); }
    _featureRenderBoard();
    _toast('Couldn\'t save your vote — please try again', 'error');
  }
}
