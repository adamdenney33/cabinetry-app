// @ts-check
// ProCabinet — Unit formatting, parsing, and conversion library.
// Loaded before cutlist.js and settings.js via <script defer>.

/** @type {{ mode: string, decimals: number, denominator: number }} */
window.unitFormat = {
  mode: 'decimal',
  decimals: 1,
  denominator: 16,
};

/**
 * Format a raw numeric dimension for display.
 * Rounding is display-only — stored values keep full precision.
 * @param {number} val
 * @param {{ showUnit?: boolean }} [opts]
 * @returns {string}
 */
function formatDim(val, opts) {
  if (val == null || isNaN(val)) return '0';
  var showUnit = opts && opts.showUnit;
  var fmt = window.unitFormat;

  if (window.units === 'metric') {
    if (fmt.mode === 'cm') {
      var s = (val / 10).toFixed(fmt.decimals);
      return showUnit ? s + 'cm' : s;
    }
    var s = Number(val).toFixed(fmt.decimals);
    return showUnit ? s + 'mm' : s;
  }

  switch (fmt.mode) {
    case 'fractional':
      return _toFraction(val, fmt.denominator) + (showUnit ? '"' : '');
    case 'feetInches':
      return _toFeetInches(val, fmt.denominator);
    default:
      var s = Number(val).toFixed(fmt.decimals);
      return showUnit ? s + '"' : s;
  }
}

/**
 * Parse a dimension string back to a raw number in the current unit.
 * Superset of parseVal — also handles feet-inches and unit suffixes.
 * @param {string|number} str
 * @returns {number}
 */
function parseDim(str) {
  if (typeof str === 'number') return str;
  str = String(str).trim();
  if (!str) return 0;

  // Check feet-inches before stripping quotes (apostrophe is the foot marker)
  var ftMatch = str.match(/^(\d+)[′''']\s*(.*)$/);
  if (ftMatch) {
    var feet = parseFloat(ftMatch[1]);
    var inchPart = ftMatch[2].replace(/["″]/g, '').trim();
    return feet * 12 + (inchPart ? parseDim(inchPart) : 0);
  }

  str = str.replace(/["″]/g, '').replace(/\s*(?:mm|cm|in)$/i, '').trim();

  var mixed = str.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3]);

  var frac = str.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);

  var safe = str.replace(/[^0-9+\-*/.() ]/g, '');
  try { var v = Function('"use strict";return(' + safe + ')')(); if (isFinite(v)) return v; } catch(e) {}
  return parseFloat(str) || 0;
}

/**
 * Convert a dimension value between unit systems. Full precision, no rounding.
 * @param {number} val
 * @param {string} from - 'imperial' or 'metric'
 * @param {string} to   - 'imperial' or 'metric'
 * @returns {number}
 */
function convertDim(val, from, to) {
  if (from === to) return val;
  if (from === 'imperial' && to === 'metric') return val * 25.4;
  if (from === 'metric' && to === 'imperial') return val / 25.4;
  return val;
}

/**
 * Returns the current unit suffix string for column headers / labels.
 * @returns {string}
 */
function unitLabel() {
  if (window.units === 'metric') {
    return window.unitFormat.mode === 'cm' ? 'cm' : 'mm';
  }
  if (window.unitFormat.mode === 'feetInches') return 'ft/in';
  return 'in';
}

// ── Internal helpers ──

/** @param {number} val @param {number} denom */
function _toFraction(val, denom) {
  var sign = val < 0 ? '-' : '';
  val = Math.abs(val);
  var whole = Math.floor(val);
  var remainder = val - whole;
  var numerator = Math.round(remainder * denom);

  if (numerator === 0) return sign + String(whole || '0');
  if (numerator === denom) return sign + String(whole + 1);

  var g = _gcd(numerator, denom);
  var rn = numerator / g, rd = denom / g;

  return whole > 0
    ? sign + whole + ' ' + rn + '/' + rd
    : sign + rn + '/' + rd;
}

/** @param {number} val @param {number} denom */
function _toFeetInches(val, denom) {
  var sign = val < 0 ? '-' : '';
  val = Math.abs(val);
  var feet = Math.floor(val / 12);
  var inches = val - feet * 12;
  var inchStr = _toFraction(inches, denom);

  // Rounding may push inches to 12 — normalize to next foot
  if (parseFloat(inchStr) >= 12) { feet++; inchStr = '0'; }

  if (feet === 0) return sign + inchStr + '"';
  return sign + feet + "' " + inchStr + '"';
}

/** @param {number} a @param {number} b @returns {number} */
function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b); }
