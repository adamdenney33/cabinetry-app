// ProCabinet — Cut list print / PDF pipeline (carved out of src/cutlist.js,
// R.2 split). Print + save-as-PDF plumbing and the five jsPDF document
// builders: quote, stock, work order, order document (invoice/proforma/etc.)
// and cut list. No top-level state and no parse-time executable code — every
// function here runs on user action, after all classic scripts have loaded.
//
// jsPDF is lazy: builders await window._ensureJsPDF() (src/main.js) before
// touching window.jspdf.
//
// Cross-file dependencies (runtime, resolved through the global env):
//   - _toast / _byId (src/ui.js)
//   - getBizInfo / getBizLogo (src/business.js)
//   - formatDim (src/units.js); window.units / window.currency (src/settings.js)
//   - stockItems (src/stock.js); clients (src/clients.js)
//   - quotes / quoteClient / _lineSubtotal (src/quotes.js)
//   - orders / orderClient (src/orders.js); _lineDisplay (src/quote-editor.js)
//   - results + layout prefs (layoutColor, layoutGrain, layoutCutOrder,
//     layoutSheetCutList) and grainIcon / _trimmedDims (src/cutlist.js)
//
// Dispatchers printQuote / printOrderDoc live in src/quote-editor.js and call
// the _build*PDF functions here as runtime globals.

/** @param {string} [mode] */
function printLayout(mode='print') {
  if (!results || !results.layouts || !results.layouts.length) { _toast('Run the optimiser first', 'info'); return; }
  // Brief delay so canvases finish rendering before capture
  setTimeout(() => {
    const biz = getBizInfo();
    const u = window.units === 'metric' ? 'mm' : 'in';
    const cur = window.currency;
    const totalArea = results.layouts.reduce(/** @param {number} s @param {any} l */ (s,l) => s + l.sheet.w * l.sheet.h, 0);
    const usedArea  = results.layouts.reduce(/** @param {number} s @param {any} l */ (s,l) => s + l.placed.reduce(/** @param {number} a @param {any} p */ (a,p) => a + p.w * p.h, 0), 0);
    const avgUtil   = totalArea ? (usedArea / totalArea * 100).toFixed(1) : '0';
    const totalPieces = results.placed;
    const matCost = results.layouts.reduce(/** @param {number} s @param {any} l */ (s,l) => { const si = stockItems.find(i => i.name === l.sheet.name); return s + (si ? (si.cost ?? 0) : 0); }, 0);

    // Capture canvas images
    const canvases = /** @type {NodeListOf<HTMLCanvasElement>} */ (document.querySelectorAll('.canvas-wrap canvas'));
    const imgs = [...canvases].map(c => { try { return c.toDataURL('image/png'); } catch(e) { return ''; } });

    const sheetSections = results.layouts.map(/** @param {any} layout @param {number} i */ (layout, i) => {
      const util = (layout.util * 100).toFixed(0);
      const imgTag = imgs[i] ? `<img src="${imgs[i]}" class="sheet-img">` : '';
      const pieceRows = layout.placed.map(/** @param {any} p */ p => `
        <tr>
          <td style="width:16px"><div style="width:12px;height:12px;border-radius:2px;background:${p.item.color};opacity:.7"></div></td>
          <td><strong>${p.item.label}</strong></td>
          <td class="num">${formatDim(p.item.w)}</td>
          <td class="num">${formatDim(p.item.h)}</td>
          <td class="num">${p.rotated ? '↺ Yes' : '—'}</td>
          <td>${p.item.notes || ''}</td>
        </tr>`).join('');
      return `
      <div class="sheet-section">
        <div class="sheet-heading">
          <span class="sheet-title">Sheet ${i+1} &mdash; ${layout.sheet.name}</span>
          <span class="sheet-meta">${formatDim(layout.sheet.w)}&times;${formatDim(layout.sheet.h)}${u} &nbsp;&bull;&nbsp; ${layout.placed.length} piece${layout.placed.length!==1?'s':''} &nbsp;&bull;&nbsp; ${util}% used</span>
        </div>
        <div class="sheet-body">
          <div class="sheet-left">${imgTag}</div>
          <div class="sheet-right">
            <table class="ptable">
              <thead><tr><th></th><th>Label</th><th>W (${u})</th><th>H (${u})</th><th>Rotated</th><th>Notes</th></tr></thead>
              <tbody>${pieceRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    }).join('');

    const allPieceRows = pieces.map(p => `
      <tr>
        <td><div style="width:10px;height:10px;border-radius:2px;background:${p.color};opacity:.7;display:inline-block"></div></td>
        <td>${p.label}</td>
        <td class="num">${p.w}</td>
        <td class="num">${p.h}</td>
        <td class="num">${p.qty}</td>
        <td>${p.material || '—'}</td>
        <td>${p.grain === 'h' ? 'Horiz' : p.grain === 'v' ? 'Vert' : '—'}</td>
        <td>${p.notes || ''}</td>
      </tr>`).join('');

    const dateStr = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    const bizSub  = [biz.phone, biz.email].filter(Boolean).join(' · ');

    // Optional combined page (summary stats + full cut list) — respects toggles
    const combinedPageHTML = (clShowSummary || clShowCutList) ? `
<div class="combined-pg">
  <div class="hdr">
    <div><div class="biz">${biz.name || 'ProCabinet'}</div>${bizSub ? `<div class="biz-sub">${bizSub}</div>` : ''}</div>
    <div class="doc-right"><div class="doc-title">Cut List</div><div class="doc-meta">${dateStr}</div></div>
  </div>
  ${clShowSummary ? `<div class="summary">
    <div class="sstat"><div class="sstat-val">${results.layouts.length}</div><div class="sstat-lbl">Sheets</div></div>
    <div class="sstat"><div class="sstat-val">${totalPieces}</div><div class="sstat-lbl">Pieces</div></div>
    <div class="sstat"><div class="sstat-val">${avgUtil}%</div><div class="sstat-lbl">Efficiency</div></div>
    <div class="sstat"><div class="sstat-val">${(100-parseFloat(avgUtil)).toFixed(1)}%</div><div class="sstat-lbl">Waste</div></div>
    ${matCost > 0 ? `<div class="sstat"><div class="sstat-val">${cur}${matCost.toLocaleString()}</div><div class="sstat-lbl">Material Cost</div></div>` : ''}
  </div>` : ''}
  ${clShowCutList ? `<div class="section-hdr" style="margin-top:${clShowSummary?'18px':'0'}">Full Cut List — All Pieces</div>
  <table class="ptable" style="border:1px solid #e0e0e0">
    <thead><tr><th></th><th>Label</th><th>W (${u})</th><th>H (${u})</th><th>Qty</th><th>Material</th><th>Grain</th><th>Notes</th></tr></thead>
    <tbody>${allPieceRows}</tbody>
  </table>` : ''}
  <div class="footer"><span>${biz.name || 'ProCabinet'} — ProCabinet.App</span><span>Printed ${dateStr}</span></div>
</div>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cut List — ${new Date().toLocaleDateString('en-GB')}</title>
<style>
  /* A4 — 10mm margins; orientation follows the on-screen Rotate toggle */
  @page { size: A4 ${layoutRotate ? 'portrait' : 'landscape'}; margin: 10mm 10mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; font-size:12px; background:#fff; }
  /* Compact title bar — sits above first sheet on page 1 */
  .doc-title-bar { display:flex; justify-content:space-between; align-items:baseline; font-size:10px; color:#888; border-bottom:1px solid #ddd; padding-bottom:5px; margin-bottom:7px; }
  .doc-title-bar strong { font-size:12px; font-weight:700; color:#111; }
  /* Sheets — first sheet shares page with title bar, subsequent sheets each get their own page */
  .sheet-section { break-inside:avoid; }
  .sheet-section + .sheet-section { break-before:page; }
  .sheet-heading { display:flex; justify-content:space-between; align-items:baseline; background:#f5f5f5; padding:7px 12px; border-radius:5px 5px 0 0; border:1px solid #ddd; border-bottom:2px solid #ddd; }
  .sheet-title { font-size:13px; font-weight:700; }
  .sheet-meta { font-size:10px; color:#777; }
  /* Two-column body: panel LEFT (2/3), cut list RIGHT (1/3) */
  .sheet-body { display:flex; flex-direction:row; gap:12px; align-items:flex-start; border:1px solid #e0e0e0; border-top:none; border-radius:0 0 5px 5px; padding:10px; overflow:hidden; }
  .sheet-left { flex:0 0 66%; overflow:hidden; }
  .sheet-img { display:block; max-width:100%; max-height:158mm; width:auto; height:auto; border:1px solid #e8e8e8; border-radius:3px; }
  .sheet-right { flex:1 1 auto; min-width:0; }
  .ptable { width:100%; border-collapse:collapse; font-size:11px; border:1px solid #e0e0e0; }
  .ptable th { font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#999; padding:5px 8px; background:#fafafa; border-bottom:1px solid #e8e8e8; text-align:left; }
  .ptable td { padding:5px 8px; border-bottom:1px solid #f3f3f3; vertical-align:middle; }
  .ptable tr:last-child td { border-bottom:none; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  /* Combined summary + cut list page — always starts on its own page */
  .combined-pg { break-before:page; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.5px solid #111; padding-bottom:10px; margin-bottom:16px; }
  .biz { font-size:17px; font-weight:800; letter-spacing:-.5px; }
  .biz-sub { font-size:10px; color:#888; margin-top:2px; }
  .doc-right { text-align:right; }
  .doc-title { font-size:22px; font-weight:300; letter-spacing:3px; text-transform:uppercase; color:#333; }
  .doc-meta { font-size:10px; color:#999; margin-top:3px; }
  .summary { display:flex; gap:0; margin-bottom:0; border:1px solid #e0e0e0; border-radius:6px; overflow:hidden; }
  .sstat { flex:1; padding:10px 14px; border-right:1px solid #e0e0e0; }
  .sstat:last-child { border-right:none; }
  .sstat-val { font-size:20px; font-weight:800; }
  .sstat-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#888; margin-top:1px; }
  .section-hdr { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#555; padding:0 0 8px; }
  .footer { margin-top:32px; padding-top:10px; border-top:1px solid #eee; display:flex; justify-content:space-between; font-size:9px; color:#bbb; }
</style></head><body>
<div class="doc-title-bar"><span><strong>${biz.name || 'ProCabinet'}</strong>${bizSub ? ' &nbsp;·&nbsp; ' + bizSub : ''}</span><span style="letter-spacing:2px;text-transform:uppercase;font-size:9px">Cut List &nbsp;·&nbsp; ${dateStr}</span></div>
${sheetSections}
${combinedPageHTML}
</body></html>`;
    if (mode === 'pdf') {
      // Pass uniqueLayouts so the PDF renders one page per unique packing,
      // matching the on-screen viewer (canvases were captured 1:1 with it).
      _buildCutListPDF({ biz, layouts: results.uniqueLayouts || results.layouts, imgs, pieces, u, cur,
        totalPieces, avgUtil, matCost });
    } else {
      _printInFrame(html);
    }
  }, 400);
}

/** @param {string} html */
function _printInFrame(html) {
  // Use a hidden iframe — avoids popup blockers entirely
  const old = _byId('_print_frame');
  if (old) old.remove();
  const frame = document.createElement('iframe');
  frame.id = '_print_frame';
  frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:297mm;height:210mm;border:none;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(frame);
  // contentDocument/contentWindow are guaranteed non-null after appendChild for a
  // freshly-created same-origin iframe.
  const cdoc = /** @type {Document} */ (frame.contentDocument);
  const cwin = /** @type {Window} */ (frame.contentWindow);
  cdoc.open();
  cdoc.write(html);
  cdoc.close();
  setTimeout(() => {
    try {
      cwin.focus();
      cwin.print();
    } catch(e) {
      _saveAsPDF(html); // fallback to new-tab PDF flow
    }
    setTimeout(() => { const f = _byId('_print_frame'); if (f) f.remove(); }, 3000);
  }, 600);
}

/** @param {string} html */
function _saveAsPDF(html) {
  // Open HTML in a new browser tab — user can print/save from there
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  } else {
    // Fallback if popup blocked — use blob URL
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}


// ══════════════════════════════════════════
// PDF HEADER / FOOTER HELPERS — shared by every builder below.
// ══════════════════════════════════════════
// _drawBizHeader: top-left identity block.
//   - If a logo data URL is supplied, the logo replaces the big bold business
//     name. The business name then appears in the caption beneath the logo,
//     followed by address, phone, email (in that order), then ABN.
//   - If no logo, the caption falls back to today's layout (big bold name on
//     top, contact subline below) with address / phone / email reordered.
// Returns the vertical space consumed (mm) so callers can advance `y`.
/**
 * @param {any} pdf jsPDF instance
 * @param {{name?:string,address?:string,phone?:string,email?:string,abn?:string}} biz
 * @param {string} logoDataUrl  data URL from getBizLogo(), or '' if none
 * @param {number} x  left margin
 * @param {number} y  top of block
 * @param {{nameSize?:number}} [opts]  override caption font size (defaults 16/9)
 * @returns {number}  vertical space consumed (mm)
 */
function _drawBizHeader(pdf, biz, logoDataUrl, x, y, opts) {
  const nameSize = (opts && opts.nameSize) || 16;
  let by = y;             // running text baseline
  let lastBaseline = y;   // baseline of the last line drawn (drives height calc)
  let renderedLogo = false;
  if (logoDataUrl) {
    try {
      const props = pdf.getImageProperties(logoDataUrl);
      const maxW = 35, maxH = 18;
      const ratio = (props.width || 1) / (props.height || 1);
      let w = maxW, h = maxW / ratio;
      if (h > maxH) { h = maxH; w = maxH * ratio; }
      pdf.addImage(logoDataUrl, props.fileType || 'PNG', x, y, w, h);
      by = y + h + 6;     // first caption line sits below the logo
      renderedLogo = true;
    } catch (_e) {
      // Fall through to text-only header on bad image data.
    }
  }
  if (renderedLogo) {
    // Caption mode: small bold name, then contact line, then ABN line.
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17);
    pdf.text(biz.name || 'Your Business', x, by);
    lastBaseline = by; by += 5.5;
  } else {
    // Banner mode: large bold name over a contact subline. Generous leading so
    // the contact line doesn't collide with the name's descenders.
    pdf.setFontSize(nameSize); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17);
    by = y + 6;
    pdf.text(biz.name || 'Your Business', x, by);
    lastBaseline = by; by += 7.5;
  }
  const subline = [biz.address, biz.phone, biz.email].filter(Boolean).join('  ·  ');
  if (subline) {
    pdf.setFontSize(renderedLogo ? 7.5 : 8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120);
    pdf.text(subline, x, by);
    lastBaseline = by; by += 5;
  }
  if (biz.abn) {
    pdf.setFontSize(7); pdf.setTextColor(120);
    pdf.text('ABN: ' + biz.abn, x, by);
    lastBaseline = by; by += 4.5;
  }
  // Reset text colour to default-dark so callers don't inherit our grey.
  pdf.setTextColor(17);
  // Consumed height = last baseline + descender room + a gap before the divider.
  return (lastBaseline - y) + 4.5;
}

// _drawPdfFooter: footer line at the bottom of every page.
//   - Pro tier (paid subscription) → business name only.
//   - Free tier → business name + ProCabinet.app branding.
// Variant of the branding is controlled by _PROCAB_FOOTER_VARIANT below — flip
// to switch between subtle / band / band+strip without touching call sites.
/** @type {1|2|3} */
const _PROCAB_FOOTER_VARIANT = 2;
/**
 * @param {any} pdf jsPDF instance
 * @param {{name?:string}} biz
 * @param {string} dateStr
 * @param {number} PW
 * @param {number} PH
 * @param {number} M
 */
function _drawPdfFooter(pdf, biz, dateStr, PW, PH, M) {
  const pro = (typeof _hasProAccess === 'function') ? _hasProAccess() : false;
  const name = biz.name || '';
  if (pro) {
    pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(190);
    if (name) pdf.text(name, M, PH - M);
    pdf.text(dateStr, PW - M, PH - M, { align: 'right' });
    return;
  }
  // Free tier — variant selection. Variant 2 (band) is the default per mockup.
  if (_PROCAB_FOOTER_VARIANT === 1) {
    pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(190);
    const left = name ? (name + '  ·  Made with ProCabinet.app') : 'Made with ProCabinet.app';
    pdf.text(left, M, PH - M);
    pdf.text(dateStr, PW - M, PH - M, { align: 'right' });
    return;
  }
  // Variants 2 & 3 — coloured band along the bottom.
  const bandH = 6;
  pdf.setFillColor(247, 250, 255);
  pdf.rect(0, PH - bandH, PW, bandH, 'F');
  pdf.setDrawColor(74, 158, 255); pdf.setLineWidth(0.4);
  pdf.line(0, PH - bandH, PW, PH - bandH);
  pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(85);
  const leftText = name ? (name + '  ·  ' + dateStr) : dateStr;
  pdf.text(leftText, M, PH - 2);
  pdf.setFont('helvetica', 'bold'); pdf.setTextColor(74, 158, 255);
  pdf.text('Made with ProCabinet.app', PW - M, PH - 2, { align: 'right' });
  pdf.setTextColor(17);
}

// _drawPdfBrandingStrip: variant-3-only corner badge on page 1.
//   Called from the build functions only when _PROCAB_FOOTER_VARIANT === 3 and
//   !isPro(). Keeps the per-builder code untouched for variants 1/2.
/**
 * @param {any} pdf
 * @param {number} PW
 */
function _drawPdfBrandingStrip(pdf, PW) {
  if (_PROCAB_FOOTER_VARIANT !== 3) return;
  if ((typeof _hasProAccess === 'function') && _hasProAccess()) return;
  pdf.setFillColor(74, 158, 255);
  pdf.rect(PW - 56, 0, 56, 6, 'F');
  pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255);
  pdf.text('Made with ProCabinet.app', PW - 4, 4.2, { align: 'right' });
  pdf.setTextColor(17);
}

// _pdfNiceDate: format an ISO YYYY-MM-DD into "15 July 2026" so due dates match
// the issue-date style on the rest of the document. Non-ISO values (e.g. 'TBD',
// 'On receipt') pass through unchanged.
/** @param {string|null|undefined} s @returns {string} */
function _pdfNiceDate(s) {
  const str = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}


// ── Build a real PDF for quotes using jsPDF ──
/**
 * Render the client-facing line-item table for quote/order PDFs. Columns mirror
 * the editor sidebar — Description, Qty, Price (unit), Disc% (only when any line
 * is discounted) and Amount; the sidebar's Hrs column is workshop-only and
 * omitted. Item/stock/labour rows carry qty×price in the columns, so only
 * cabinets keep a spec sub-line (dimensions, material, doors). Returns the y
 * cursor after the table's closing rule.
 * @param {any} pdf jsPDF instance
 * @param {any[]} rows quote_lines / order_lines
 * @param {{M:number,PW:number,PH:number,y:number,anyLineDisc:boolean,fmt:(v:number)=>string,priceScale?:number,scaleFor?:(kind:string)=>number}} opts
 * @returns {number}
 */
function _drawDocLineItems(pdf, rows, opts) {
  const { M, PW, PH, anyLineDisc, fmt } = opts;
  // Markup is hidden on client documents (it's never shown as a line), so it's
  // folded into the displayed line prices. Markup applies to cabinet lines only
  // (stock uses stock_markup, items/labour get nothing), so scaling is per-kind
  // via scaleFor(kind); priceScale is the legacy uniform fallback. Default 1.
  const scaleFor = typeof opts.scaleFor === 'function'
    ? opts.scaleFor
    : /** @param {string} _k */ (_k) => (opts.priceScale || 1);
  let y = opts.y;
  // Right-edge x for each numeric column (values are right-aligned to these).
  const colAmt = PW - M;
  const colDisc = colAmt - 28;
  const colPrice = (anyLineDisc ? colDisc : colAmt) - 30;
  const colQty = colPrice - 24;
  // Description wraps within everything left of the Qty column.
  const descMaxW = Math.max(40, (colQty - 12) - M);
  /** @param {number} n */
  const qtyStr = n => String(Math.round((Number(n) || 0) * 100) / 100);

  // Header row
  pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(140);
  pdf.text('DESCRIPTION', M, y);
  pdf.text('QTY', colQty, y, { align: 'right' });
  pdf.text('PRICE', colPrice, y, { align: 'right' });
  if (anyLineDisc) pdf.text('DISC', colDisc, y, { align: 'right' });
  pdf.text('AMOUNT', colAmt, y, { align: 'right' });
  y += 2;
  pdf.setDrawColor(17); pdf.setLineWidth(0.4); pdf.line(M, y, PW - M, y);
  y += 6;

  let lastKind = '';
  rows.forEach(/** @param {any} row */ row => {
    const d = _lineDisplay(row);
    // Group header when the kind changes
    if (d.kind !== lastKind) {
      pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(160);
      const groupLabel = { cabinet: 'CABINETS', item: 'ITEMS', labour: 'LABOUR' };
      pdf.text((/** @type {any} */ (groupLabel))[d.kind] || d.kind.toUpperCase(), M, y);
      y += 4;
      lastKind = d.kind;
    }
    // Description (wrapped within the description column). Collapse any stray
    // whitespace/line breaks in the user-entered name first — a leading blank
    // line would otherwise become an empty first row and push the qty/price/
    // amount (which align to the first line) out of alignment with the text.
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17);
    const cleanName = String(d.name || '').replace(/\s+/g, ' ').trim() || '—';
    const nameLines = pdf.splitTextToSize(cleanName, descMaxW);
    pdf.text(nameLines, M, y);
    // Qty + unit Price (muted, regular weight) on the first line.
    const scale = scaleFor(d.kind);
    pdf.setFontSize(9.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(95);
    pdf.text(qtyStr(d.qty), colQty, y, { align: 'right' });
    pdf.text(fmt(d.unitPrice * scale), colPrice, y, { align: 'right' });
    if (anyLineDisc) {
      const rowDisc = parseFloat(row.discount) || 0;
      pdf.setTextColor(130);
      pdf.text(rowDisc > 0 ? rowDisc + '%' : '—', colDisc, y, { align: 'right' });
    }
    // Amount (bold).
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17);
    pdf.text(fmt(d.total * scale), colAmt, y, { align: 'right' });
    y += nameLines.length * 5;
    // Spec sub-line — cabinets only. Items/labour show qty×price in columns.
    if (d.kind === 'cabinet' && d.detail) {
      pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(130);
      const detailLines = pdf.splitTextToSize(d.detail, descMaxW);
      detailLines.forEach(/** @param {string} dl */ dl => { pdf.text(dl, M + 4, y); y += 4; });
    }
    y += 3;
    if (y > PH - 60) { pdf.addPage(); y = M + 10; }
  });

  pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.line(M, y, PW - M, y);
  y += 8;
  return y;
}

/**
 * Draw the "addressee + project" two-column block shared by the quote and
 * order documents. The left column shows the recipient name with their
 * address / phone / email stacked beneath; the right column shows the project
 * name. Returns the y baseline after the block (advanced past whichever column
 * is taller). When no client record resolves it falls back to the prior
 * name-only layout, so documents without saved contact details look unchanged.
 *
 * @param {any} pdf jsPDF instance
 * @param {{label: string, clientName: string, projectName: string, client: any, M: number, y: number}} o
 * @returns {number} new y baseline
 */
function _drawDocAddressee(pdf, o) {
  const { M, y } = o;
  const projX = M + 70;          // right-column origin (matches the prior layout)
  const addrW = projX - M - 6;   // wrap width for the address lines
  // Column labels.
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(170);
  pdf.text(o.label || 'PREPARED FOR', M, y);
  pdf.text('PROJECT', projX, y);
  // Recipient name + project name share the first content baseline.
  let ly = y + 5;
  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17);
  pdf.text(o.clientName || '—', M, ly);
  pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
  pdf.text(o.projectName || '—', projX, ly);
  // Contact details stacked under the recipient name.
  ly += 5.5;
  const c = o.client;
  if (c) {
    /** @type {string[]} */
    const detail = [];
    if (c.address) pdf.splitTextToSize(String(c.address), addrW).forEach(/** @param {string} l */ l => detail.push(l));
    if (c.phone) detail.push(String(c.phone));
    if (c.email) detail.push(String(c.email));
    if (detail.length) {
      pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(95);
      detail.forEach(/** @param {string} dl */ dl => { pdf.text(dl, M, ly); ly += 4.3; });
    }
  }
  pdf.setTextColor(17);
  // Advance past the taller column; y + 17 preserves the prior name-only gap.
  return Math.max(ly, y + 17);
}

/**
 * Deliver a finished jsPDF doc: default = force-download via a temporary
 * anchor (the historical behaviour of every builder); opts.output='bloburl'
 * = return an object URL instead; opts.output='arraybuffer' = return the raw
 * bytes (the main-window PDF preview feeds these to pdf.js canvases).
 * @param {any} pdf @param {{output?: 'bloburl'|'arraybuffer', silent?: boolean}} [opts]
 * @returns {string|ArrayBuffer|void}
 */
function _pdfDeliver(pdf, opts) {
  if (opts && opts.output === 'arraybuffer') return /** @type {ArrayBuffer} */ (pdf.output('arraybuffer'));
  if (opts && opts.output === 'bloburl') return /** @type {string} */ (pdf.output('bloburl'));
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** @param {any} q */
/**
 * @param {any} q quote row
 * @param {any[]} [lineRows] quote_lines rows; when omitted, uses cached totals
 *                           (so legacy callers like cabinet.js's preview path
 *                           keep working without an extra fetch).
 * @param {{output?: 'bloburl'|'arraybuffer', silent?: boolean}} [opts] silent skips analytics
 *                           (previews shouldn't count as pdf_created).
 */
async function _buildQuotePDF(q, lineRows, opts) {
  if (!window.jspdf) {
    try { await window._ensureJsPDF(); } catch (e) {}
    if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  }
  if (typeof _track === 'function' && !(opts && opts.silent)) _track('pdf_created', { type: 'quote' });
  const { jsPDF } = window.jspdf;
  const cur = window.currency;
  const biz = getBizInfo();
  const logo = getBizLogo();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  // If lines were passed, recompute from them (source of truth). Otherwise
  // fall back to the in-memory _totals cache.
  let sub, stockMat = 0, cabSub = 0;
  if (Array.isArray(lineRows)) {
    let matSum = 0, labSum = 0;
    for (const row of lineRows) {
      const s = _lineSubtotal(row);
      matSum += s.materials;
      labSum += s.labour;
      if (row.line_kind === 'stock') stockMat += s.materials;
      if ((row.line_kind || 'cabinet') === 'cabinet') cabSub += s.materials + s.labour;
    }
    sub = matSum + labSum;
  } else {
    const matVal = q._totals ? q._totals.materials : (q.materials || 0);
    const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
    stockMat = q._totals ? (q._totals.stockMat || 0) : 0;
    cabSub = q._totals ? (q._totals.cabSub || 0) : 0;
    sub = matVal + labVal;
  }
  const stockMarkupPct = /** @type {any} */ (q).stock_markup ?? 0;
  const stockMarkupAmt = stockMat * stockMarkupPct / 100;
  // Markup applies to cabinet lines only (PLAN.md 2026-07-14).
  const markupAmt = cabSub * (q.markup ?? 0) / 100;
  const afterMarkup = sub + stockMarkupAmt + markupAmt;
  const taxAmt = afterMarkup * (q.tax ?? 0) / 100;
  const afterTax = afterMarkup + taxAmt;
  const orderDiscPct = /** @type {any} */ (q).discount ?? 0;
  const orderDiscAmt = afterTax * orderDiscPct / 100;
  const total = afterTax - orderDiscAmt;
  const anyLineDisc = Array.isArray(lineRows) && lineRows.some(/** @param {any} r */ r => (parseFloat(r.discount) || 0) > 0);
  /** @param {any} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

  // Portrait A4
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18;
  const W = PW - 2*M;
  let y = M;

  // ── Header ──
  // Advance past whichever side is taller: the identity block (taller when a
  // logo is set) or the QUOTATION title block on the right.
  const hdrH = _drawBizHeader(pdf, biz, logo, M, y);
  _drawPdfBrandingStrip(pdf, PW);

  pdf.setFontSize(22); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('QUOTATION', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  const quoteRef = q.quote_number || ('QUO-' + String(q.id).padStart(4,'0'));
  pdf.text('#' + quoteRef + '  ·  ' + (q.date||dateStr), PW - M, y + 13.5, { align:'right' });

  y += Math.max(20, hdrH);
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW-M, y);
  y += 10;

  // ── Client & Project ──
  const qClient = (q && q.client_id) ? clients.find(/** @param {any} x */ x => x.id === q.client_id) : null;
  y = _drawDocAddressee(pdf, {
    label: 'PREPARED FOR', clientName: quoteClient(q), projectName: quoteProject(q),
    client: qClient, M, y,
  });

  // ── Line items ──
  const plainNotes = (q.notes||'').trim();
  const rows = Array.isArray(lineRows) ? lineRows : [];

  // Markup is internal margin — never itemised on client documents. Fold it
  // into the displayed line prices and omit the Stock-markup / Markup rows.
  // Markup applies to cabinet lines only; stock uses stock_markup; items/labour
  // get nothing (PLAN.md 2026-07-14). Tax, discount and the total are unchanged.
  const mkFrac = (q.markup ?? 0) / 100;
  const smFrac = stockMarkupPct / 100;
  /** @param {string} k */
  const scaleFor = k => k === 'cabinet' ? 1 + mkFrac : k === 'stock' ? 1 + smFrac : 1;

  if (rows.length > 0) {
    y = _drawDocLineItems(pdf, rows, { M, PW, PH, y, anyLineDisc, fmt, scaleFor });
  }

  // ── Totals ──
  const totalsX = PW - M;
  const labelX = PW - M - 80;

  if ((q.tax ?? 0) > 0 || orderDiscPct > 0) {
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(140);
    pdf.text('Subtotal', labelX, y); pdf.text(fmt(afterMarkup), totalsX, y, { align:'right' });
    y += 6;
  }
  if ((q.tax ?? 0) > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Tax (' + q.tax + '%)', labelX, y); pdf.text('+ ' + fmt(taxAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if (orderDiscPct > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(196, 68, 68);
    pdf.text('Discount (' + orderDiscPct + '%)', labelX, y); pdf.text('- ' + fmt(orderDiscAmt), totalsX, y, { align:'right' });
    pdf.setTextColor(140);
    y += 5;
  }

  // ── Total box ──
  y += 3;
  pdf.setFillColor(17,17,17); pdf.roundedRect(M, y, W, 14, 3, 3, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(255);
  pdf.text('TOTAL AMOUNT DUE', M + 8, y + 9);
  pdf.setFontSize(18); pdf.setFont('helvetica','bold');
  pdf.text(fmt(total), PW - M - 8, y + 10, { align:'right' });
  y += 22;

  // ── Notes ──
  if (plainNotes) {
    pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(170);
    pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(60);
    const noteWrapped = pdf.splitTextToSize(plainNotes, W);
    noteWrapped.forEach(/** @param {string} nl */ nl => { pdf.text(nl, M, y); y += 4.5; });
    y += 6;
  }

  // ── Validity ──
  pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
  pdf.text('This quote is valid for 30 days from the date of issue.', M, y);
  y += 12;

  // ── Bank details (when configured) ──
  const bankDetails = (biz.bank_details || '').trim();
  if (bankDetails) {
    if (y > PH - 50) { pdf.addPage(); y = M + 10; }
    pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(170);
    pdf.text('PAYMENT DETAILS', M, y); y += 5;
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(60);
    const bankLines = pdf.splitTextToSize(bankDetails, W);
    bankLines.forEach(/** @param {string} bl */ bl => {
      if (y > PH - 30) { pdf.addPage(); y = M + 10; }
      pdf.text(bl, M, y); y += 4.5;
    });
    y += 6;
  }

  // ── Acceptance ──
  if (y > PH - 60) { pdf.addPage(); y = M + 10; }
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(80);
  pdf.text('ACCEPTANCE', M, y); y += 6;
  pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(120);
  // Strip a trailing period from the name so businesses like "… Co." don't
  // produce a doubled full stop.
  const accName = (biz.name || 'us').replace(/\.\s*$/, '');
  const accText = 'To accept this quotation, please sign below and return a copy to ' + accName + '.';
  pdf.text(accText, M, y); y += 10;

  // Signature lines
  pdf.setDrawColor(180); pdf.setLineWidth(0.4);
  pdf.line(M, y + 16, M + 100, y + 16);
  pdf.line(M + 120, y + 16, PW - M, y + 16);
  pdf.setFontSize(6.5); pdf.setTextColor(180);
  pdf.text('Client Signature', M, y + 20);
  pdf.text('Date', M + 120, y + 20);

  // ── Footer ──
  _drawPdfFooter(pdf, biz, dateStr, PW, PH, M);

  // Output
  return _pdfDeliver(pdf, opts);
}


async function _buildStockPDF() {
  if (!window.jspdf) {
    try { await window._ensureJsPDF(); } catch (e) {}
    if (!window.jspdf) { _toast('PDF library not loaded yet', 'error'); return; }
  }
  if (typeof _track === 'function') _track('pdf_created', { type: 'stock_list' });
  const { jsPDF } = window.jspdf;
  const biz = getBizInfo();
  const cur = window.currency;
  const u = window.units === 'metric' ? 'mm' : 'in';
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const totalValue = stockItems.reduce((s,i) => s+(i.qty ?? 0)*(i.cost ?? 0), 0);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 14;
  const W = PW - 2*M;
  let y = M;

  // Header
  const stockLogo = getBizLogo();
  const stockHdrH = _drawBizHeader(pdf, biz, stockLogo, M, y, { nameSize: 14 });
  _drawPdfBrandingStrip(pdf, PW);
  pdf.setFontSize(18); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('STOCK INVENTORY', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text(dateStr + '  ·  ' + stockItems.length + ' items  ·  ' + cur + Math.round(totalValue), PW - M, y + 13.5, { align:'right' });
  y += Math.max(18, stockHdrH);
  pdf.setDrawColor(17); pdf.setLineWidth(0.5); pdf.line(M, y, PW-M, y);
  y += 6;

  // Table column geometry. Text columns are left-aligned at a fixed x and
  // ellipsis-truncated to fit their slot; numeric columns are right-aligned so
  // they can't collide with the text to their left whatever the value width.
  const colMat = M, colSku = M + 56, colSize = M + 78, colSup = M + 102;
  const colQty = M + 142, colAlert = M + 158, colVal = PW - M;
  /** Trim a string with a trailing ellipsis so it fits maxW at the active font. */
  /** @param {string|null|undefined} s @param {number} maxW */
  const fit = (s, maxW) => {
    let str = String(s || '');
    if (pdf.getTextWidth(str) <= maxW) return str;
    while (str.length && pdf.getTextWidth(str + '…') > maxW) str = str.slice(0, -1);
    return str + '…';
  };

  // Table header
  pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(140);
  pdf.text('Material', colMat, y);
  pdf.text('SKU', colSku, y);
  pdf.text('Size', colSize, y);
  pdf.text('Supplier', colSup, y);
  pdf.text('Qty', colQty, y, { align:'right' });
  pdf.text('Alert', colAlert, y, { align:'right' });
  pdf.text(cur + ' Value', colVal, y, { align:'right' });
  y += 4;
  pdf.setDrawColor(200); pdf.setLineWidth(0.2); pdf.line(M, y, PW-M, y);
  y += 5;

  // Rows
  stockItems.forEach(item => {
    if (y > PH - 20) { pdf.addPage(); y = M + 10; }
    const isLow = (item.qty ?? 0) <= (item.low ?? 0);
    const sup = _ssGet(item.id);
    // Material — bold + red when at/below the alert level
    pdf.setFontSize(9); pdf.setFont('helvetica', isLow?'bold':'normal');
    pdf.setTextColor(isLow ? 192 : 40, isLow ? 50 : 40, isLow ? 50 : 40);
    pdf.text(fit(item.name, colSku - colMat - 3), colMat, y);
    // SKU / Size / Supplier — grey, normal weight
    pdf.setTextColor(120); pdf.setFont('helvetica','normal');
    pdf.text(fit(item.sku, colSize - colSku - 3), colSku, y);
    const sizeStr = (item.w || item.h) ? (formatDim(item.w) + '×' + formatDim(item.h) + u) : '—';
    pdf.text(fit(sizeStr, colSup - colSize - 3), colSize, y);
    pdf.text(fit(sup.supplier, colQty - colSup - 10), colSup, y);
    // Qty — bold + red when low, right-aligned
    pdf.setTextColor(isLow ? 192 : 40, isLow ? 50 : 40, isLow ? 50 : 40);
    pdf.setFont('helvetica', isLow?'bold':'normal');
    pdf.text(String(item.qty ?? 0), colQty, y, { align:'right' });
    // Alert + Value — grey, right-aligned
    pdf.setTextColor(120); pdf.setFont('helvetica','normal');
    pdf.text(String(item.low ?? 0), colAlert, y, { align:'right' });
    pdf.text(cur + ((item.qty ?? 0)*(item.cost ?? 0)).toFixed(0), colVal, y, { align:'right' });
    y += 5;
  });

  // Footer
  _drawPdfFooter(pdf, biz, dateStr, PW, PH, M);

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** @param {any} o @param {{output?: 'bloburl'|'arraybuffer', silent?: boolean}} [opts] */
async function _buildWorkOrderPDF(o, opts) {
  if (!window.jspdf) {
    try { await window._ensureJsPDF(); } catch (e) {}
    if (!window.jspdf) { _toast('PDF library not loaded yet', 'error'); return; }
  }
  if (typeof _track === 'function' && !(opts && opts.silent)) _track('pdf_created', { type: 'work_order' });
  const { jsPDF } = window.jspdf;
  const biz = getBizInfo();
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Math.round(v).toLocaleString();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  /** @type {Record<string, string>} */
  const statusLabelMap = { quote:'Quote Sent', confirmed:'Confirmed', production:'In Production', delivery:'Ready for Delivery', complete:'Complete' };
  const statusLabel = statusLabelMap[o.status||''] || o.status;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18;
  const W = PW - 2*M;
  let y = M;

  // Header
  const woLogo = getBizLogo();
  const woHdrH = _drawBizHeader(pdf, biz, woLogo, M, y, { nameSize: 14 });
  _drawPdfBrandingStrip(pdf, PW);
  pdf.setFontSize(20); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('WORK ORDER', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  const woRef = String(o.order_number || ('ORD-' + String(o.id).padStart(4,'0'))).replace(/^ORD-/i, '');
  pdf.text('#WO-' + woRef + '  ·  ' + dateStr, PW - M, y + 13.5, { align:'right' });
  y += Math.max(18, woHdrH);
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW-M, y);
  y += 10;

  // Project info
  /** @type {Array<[string, string]>} */
  const infoItems = [
    ['Client', orderClient(o)], ['Project', orderProject(o)],
    ['Order Value', fmt(o.value ?? 0)], ['Status', statusLabel||''],
    ['Due Date', _pdfNiceDate(o.due) || 'TBD']
  ];
  infoItems.forEach(([label, val]) => {
    pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
    pdf.text(label.toUpperCase(), M, y);
    pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
    pdf.text(String(val), M + 35, y);
    y += 7;
  });
  y += 5;

  // Notes
  if (o.notes) {
    pdf.setDrawColor(220); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y); y += 6;
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
    pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(10); pdf.setFont('helvetica','normal'); pdf.setTextColor(40);
    const noteLines = pdf.splitTextToSize(o.notes, W);
    noteLines.forEach(/** @param {string} nl */ nl => { pdf.text(nl, M, y); y += 5; });
    y += 5;
  }

  // Production notes (blank lines)
  pdf.setDrawColor(220); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y); y += 6;
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
  pdf.text('PRODUCTION NOTES', M, y); y += 8;
  for (let i = 0; i < 8; i++) {
    pdf.setDrawColor(210); pdf.setLineWidth(0.15); pdf.line(M, y, PW-M, y);
    y += 8;
  }
  y += 5;

  // Sign-off
  if (y > PH - 50) { pdf.addPage(); y = M + 10; }
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
  pdf.text('SIGN-OFF', M, y); y += 8;
  ['Prepared by', 'Date started', 'Date completed'].forEach(label => {
    pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
    pdf.text(label, M, y + 10);
    pdf.setDrawColor(180); pdf.setLineWidth(0.3); pdf.line(M + 30, y + 10, M + 80, y + 10);
    y += 14;
  });

  // Footer
  _drawPdfFooter(pdf, biz, dateStr, PW, PH, M);

  return _pdfDeliver(pdf, opts);
}

/**
 * Client-facing order document PDF — Order Confirmation, Pro-forma, or Invoice.
 * Modelled on _buildQuotePDF: same header, same line-items grouping, same
 * subtotal/markup/tax/total stack. Type drives the title, ref prefix,
 * addressee label, payment block, and closing line.
 *
 * The work_order variant is intentionally NOT routed through this builder —
 * _buildWorkOrderPDF stays as the workshop document so its production-note
 * lines and sign-off block don't bleed into client-facing outputs.
 *
 * @param {any} o the order row
 * @param {any[]} lines order_lines rows (may be empty for legacy orders)
 * @param {'order_confirmation'|'proforma'|'invoice'} type
 * @param {Record<number, string[]>} [photos] per-line photo dataURLs (Phase 2; flag-gated)
 * @param {{output?: 'bloburl'|'arraybuffer', silent?: boolean}} [opts]
 */
async function _buildOrderDocPDF(o, lines, type, photos, opts) {
  if (!window.jspdf) {
    try { await window._ensureJsPDF(); } catch (e) {}
    if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  }
  if (typeof _track === 'function' && !(opts && opts.silent)) _track('pdf_created', { type: 'order_document', document_type: type });
  const { jsPDF } = window.jspdf;
  const cur = window.currency;
  const biz = getBizInfo();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  // Strip ORD- since the per-doc prefix (ORC / PRO / INV) replaces it on the
  // PDF — refNum is the digit portion only.
  const refNum = String(o.order_number || ('ORD-' + String(o.id).padStart(4,'0'))).replace(/^ORD-/i, '');
  const dueLabel = (o.due && o.due !== 'TBD') ? _pdfNiceDate(o.due) : 'On receipt';

  /** @type {Record<string, {title: string, prefix: string, addresseeLabel: string, totalLabel: string, closing: string, showPaymentBlock: boolean, showDueInHeader: boolean}>} */
  const cfg = {
    order_confirmation: {
      title: 'ORDER CONFIRMATION', prefix: 'ORC', addresseeLabel: 'PREPARED FOR',
      totalLabel: 'ORDER TOTAL',
      closing: 'Thank you for confirming your order. We will keep you updated as your job progresses.',
      showPaymentBlock: false, showDueInHeader: false,
    },
    proforma: {
      title: 'PRO FORMA INVOICE', prefix: 'PRO', addresseeLabel: 'BILL TO',
      totalLabel: 'AMOUNT DUE',
      closing: 'Pro forma invoice — not a tax invoice. Goods/services not yet supplied.',
      showPaymentBlock: true, showDueInHeader: true,
    },
    invoice: {
      title: 'TAX INVOICE', prefix: 'INV', addresseeLabel: 'BILL TO',
      totalLabel: 'TOTAL DUE',
      closing: 'Payment due by ' + dueLabel + '. Please reference #INV-' + refNum + ' on remittance.',
      showPaymentBlock: true, showDueInHeader: true,
    },
  };
  const c = cfg[type];
  if (!c) { _toast('Unknown document type: ' + type, 'error'); return; }

  // Compute totals from order_lines. If no lines (legacy orders), invert
  // o.value back through markup+tax so the breakdown still adds up.
  const rows = Array.isArray(lines) ? lines : [];
  let sub, stockMat = 0, cabSub = 0;
  if (rows.length > 0) {
    let matSum = 0, labSum = 0;
    for (const row of rows) {
      const s = _lineSubtotal(row);
      matSum += s.materials;
      labSum += s.labour;
      if (row.line_kind === 'stock') stockMat += s.materials;
      if ((row.line_kind || 'cabinet') === 'cabinet') cabSub += s.materials + s.labour;
    }
    sub = matSum + labSum;
  } else {
    // Legacy order with no lines: invert o.value back through markup+tax. Here
    // the whole subtotal is treated as the markup base (no per-line kinds to
    // split), so cabSub = the inferred subtotal.
    const mFrac = (o.markup ?? 0) / 100;
    const tFrac = (o.tax ?? 0) / 100;
    const denom = (1 + mFrac) * (1 + tFrac);
    sub = denom > 0 ? (o.value ?? 0) / denom : (o.value ?? 0);
    cabSub = sub;
  }
  const stockMarkupPct = /** @type {any} */ (o).stock_markup ?? 0;
  const stockMarkupAmt = stockMat * stockMarkupPct / 100;
  // Markup applies to cabinet lines only (PLAN.md 2026-07-14).
  const markupAmt = cabSub * (o.markup ?? 0) / 100;
  const afterMarkup = sub + stockMarkupAmt + markupAmt;
  const taxAmt = afterMarkup * (o.tax ?? 0) / 100;
  const afterTax = afterMarkup + taxAmt;
  const orderDiscPct = /** @type {any} */ (o).discount ?? 0;
  const orderDiscAmt = afterTax * orderDiscPct / 100;
  const total = afterTax - orderDiscAmt;
  const anyLineDisc = rows.some(/** @param {any} r */ r => (parseFloat(r.discount) || 0) > 0);

  /** @param {number} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18;
  const W = PW - 2*M;
  let y = M;

  // ── Header ──
  const orderLogo = getBizLogo();
  const orderHdrH = _drawBizHeader(pdf, biz, orderLogo, M, y);
  _drawPdfBrandingStrip(pdf, PW);

  pdf.setFontSize(22); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text(c.title, PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text('#' + c.prefix + '-' + refNum + '  ·  ' + dateStr, PW - M, y + 13.5, { align:'right' });
  if (c.showDueInHeader) {
    pdf.setFontSize(8); pdf.setTextColor(140);
    pdf.text('Due: ' + dueLabel, PW - M, y + 16, { align:'right' });
  }

  y += Math.max(20, orderHdrH);
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW-M, y);
  y += 10;

  // ── Addressee ──
  const oClient = (o && o.client_id) ? clients.find(/** @param {any} x */ x => x.id === o.client_id) : null;
  y = _drawDocAddressee(pdf, {
    label: c.addresseeLabel, clientName: orderClient(o), projectName: orderProject(o),
    client: oClient, M, y,
  });

  // ── Line items ──
  // Markup is folded into the displayed line prices (never itemised on a client
  // document); see the matching note in _buildQuotePDF. Cabinet lines only.
  const mkFrac = (o.markup ?? 0) / 100;
  const smFrac = stockMarkupPct / 100;
  /** @param {string} k */
  const scaleFor = k => k === 'cabinet' ? 1 + mkFrac : k === 'stock' ? 1 + smFrac : 1;
  if (rows.length > 0) {
    y = _drawDocLineItems(pdf, rows, { M, PW, PH, y, anyLineDisc, fmt, scaleFor });
  }

  // ── Totals ──
  const totalsX = PW - M;
  const labelX = PW - M - 80;

  if ((o.tax ?? 0) > 0 || orderDiscPct > 0) {
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(140);
    pdf.text('Subtotal', labelX, y); pdf.text(fmt(afterMarkup), totalsX, y, { align:'right' });
    y += 6;
  }
  if ((o.tax ?? 0) > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Tax (' + o.tax + '%)', labelX, y); pdf.text('+ ' + fmt(taxAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if (orderDiscPct > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(196, 68, 68);
    pdf.text('Discount (' + orderDiscPct + '%)', labelX, y); pdf.text('- ' + fmt(orderDiscAmt), totalsX, y, { align:'right' });
    pdf.setTextColor(140);
    y += 5;
  }

  // ── Total box ──
  y += 3;
  if (y > PH - 40) { pdf.addPage(); y = M + 10; }
  pdf.setFillColor(17,17,17); pdf.roundedRect(M, y, W, 14, 3, 3, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(255);
  pdf.text(c.totalLabel, M + 8, y + 9);
  pdf.setFontSize(18); pdf.setFont('helvetica','bold');
  pdf.text(fmt(total), PW - M - 8, y + 9.5, { align:'right' });
  y += 22;

  // ── Notes ──
  if (o.notes) {
    if (y > PH - 50) { pdf.addPage(); y = M + 10; }
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
    pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(10); pdf.setFont('helvetica','normal'); pdf.setTextColor(40);
    const noteLines = pdf.splitTextToSize(o.notes, W);
    noteLines.forEach(/** @param {string} nl */ nl => {
      if (y > PH - 30) { pdf.addPage(); y = M + 10; }
      pdf.text(nl, M, y); y += 5;
    });
    y += 5;
  }

  // ── Payment block (proforma + invoice) ──
  if (c.showPaymentBlock) {
    if (y > PH - 40) { pdf.addPage(); y = M + 10; }
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
    pdf.text('PAYMENT', M, y); y += 5;
    const odBank = (biz.bank_details || '').trim();
    if (odBank) {
      pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(60);
      const odBankLines = pdf.splitTextToSize(odBank, W);
      odBankLines.forEach(/** @param {string} bl */ bl => {
        if (y > PH - 30) { pdf.addPage(); y = M + 10; }
        pdf.text(bl, M, y); y += 4.5;
      });
    } else {
      pdf.setFontSize(9); pdf.setFont('helvetica','italic'); pdf.setTextColor(150);
      pdf.text('Bank details not yet configured. Add them in account → business details.', M, y);
      y += 5;
    }
    y += 6;
  }

  // ── Closing line ──
  if (y > PH - 30) { pdf.addPage(); y = M + 10; }
  pdf.setFontSize(8.5); pdf.setFont('helvetica','italic'); pdf.setTextColor(120);
  const closingLines = pdf.splitTextToSize(c.closing, W);
  closingLines.forEach(/** @param {string} cl */ cl => {
    if (y > PH - 25) { pdf.addPage(); y = M + 10; }
    pdf.text(cl, M, y); y += 5;
  });

  // ── Footer ──
  _drawPdfFooter(pdf, biz, dateStr, PW, PH, M);

  // ── Line photos appendix (Phase 2; flag-gated, never blocks the doc) ──
  try {
    if (window._FEAT_LINE_PHOTOS && photos && Object.keys(photos).length) {
      pdf.addPage(); let py = M + 8;
      pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(40);
      pdf.text('Photos', M, py); py += 8;
      const cw = 52, ch = 40, gap = 6;
      for (const line of lines) {
        const arr = photos[line.id]; if (!arr || !arr.length) continue;
        if (py > PH - ch - 16) { pdf.addPage(); py = M + 8; }
        pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(80);
        pdf.text(String(line.name || 'Item'), M, py); py += 4;
        let px = M;
        for (const dataUrl of arr) {
          if (px + cw > PW - M) { px = M; py += ch + gap; }
          if (py + ch > PH - 14) { pdf.addPage(); py = M + 8; px = M; }
          try {
            const fm = /^data:image\/(\w+)/.exec(dataUrl);
            const fmt = fm ? fm[1].toUpperCase().replace('JPG', 'JPEG') : 'JPEG';
            pdf.addImage(dataUrl, fmt, px, py, cw, ch);
          } catch (e) { /* skip an unreadable image */ }
          px += cw + gap;
        }
        py += ch + gap + 4;
      }
    }
  } catch (e) { /* photos are best-effort — never fail the PDF */ }

  return _pdfDeliver(pdf, opts);
}

/** @param {{biz: any, layouts: any[], imgs: string[], pieces: any[], u: string, cur: string, totalPieces: number, avgUtil: string, matCost: number}} arg */
async function _buildCutListPDF({ biz, layouts, imgs, pieces, u, cur, totalPieces, avgUtil, matCost }) {
  if (!window.jspdf) {
    try { await window._ensureJsPDF(); } catch (e) {}
    if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  }
  if (typeof _track === 'function') _track('pdf_created', { type: 'cutlist' });
  _toast('Building PDF\u2026', 'info', 8000);
  try {
    const { jsPDF } = window.jspdf;
    const isPortrait = layoutRotate;
    const PW = isPortrait ? 210 : 297;
    const PH = isPortrait ? 297 : 210;
    const M = 10;
    const W = PW - 2*M, H = PH - 2*M;
    const pdf = new jsPDF({ orientation: isPortrait ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

    // ── safe hex → [r,g,b] ──
    /** @param {string} hex */
    function hexRgb(hex) {
      if (!hex || hex.length < 7) return [180,180,180];
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }

    // ── compact title bar drawn at top of each sheet page ──
    // Stacked layout: name + sub on left (two lines), CUT LIST + date on right (two lines).
    // Eliminates horizontal collision when business contact info is long.
    function titleBar() {
      // Per plan §4c: text-only on the compact bar (logos would crowd the
      // 12mm strip). Reordered subline: address · phone · email.
      const sub = [biz.address, biz.phone, biz.email].filter(Boolean).join(' · ');
      pdf.setFontSize(9); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      pdf.text(biz.name || 'ProCabinet', M, M+4);
      if (sub) {
        pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
        pdf.text(sub, M, M+8);
      }
      // Right side — CUT LIST top, date bottom
      pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(110);
      pdf.text('CUT LIST', PW-M, M+4, { align:'right' });
      pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
      pdf.text(dateStr, PW-M, M+8, { align:'right' });
      // Divider
      pdf.setDrawColor(200); pdf.setLineWidth(0.25); pdf.line(M, M+10, PW-M, M+10);
      pdf.setTextColor(17);
    }

    // ── full-page header used on the combined summary/cutlist page ──
    // Returns the divider Y so the caller can flow content below a tall
    // (logo) header instead of overlapping a fixed offset.
    function pageHeader() {
      const clLogo = getBizLogo();
      const clHdrH = _drawBizHeader(pdf, biz, clLogo, M, M, { nameSize: 14 });
      _drawPdfBrandingStrip(pdf, PW);
      pdf.setFontSize(20); pdf.setFont('helvetica','normal'); pdf.setTextColor(51);
      pdf.text('CUT LIST', PW-M, M+9, { align:'right' });
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(153);
      pdf.text(dateStr, PW-M, M+15.5, { align:'right' });
      const divY = M + Math.max(17, clHdrH);
      pdf.setDrawColor(17); pdf.setLineWidth(0.7); pdf.line(M, divY, PW-M, divY);
      pdf.setTextColor(17);
      return divY;
    }

    // ── one page per sheet — sheets start on page 1 ──
    // Wider image column in landscape (3/4) than portrait (2/3) — portrait's
    // table can't take any more squeeze, but landscape has room to spare.
    const leftW  = Math.floor(W * (isPortrait ? 2/3 : 3/4));
    const gap    = 8;
    const rightX = M + leftW + gap;
    const rightW = W - leftW - gap;
    const hdgH   = 9;                     // heading bar height
    const titleBarH = 12;                 // stacked title bar height

    layouts.forEach(/** @param {any} layout @param {number} i */ (layout, i) => {
      if (i > 0) pdf.addPage();           // first sheet on page 1, rest add pages
      titleBar();
      const util = (layout.util*100).toFixed(0);

      // Effective sheet dims — swap when the on-screen viewer is rotated, so the
      // captured (rotated) PNG and the displayed dims agree on aspect & values.
      const sw = layoutRotate ? layout.sheet.h : layout.sheet.w;
      const sh = layoutRotate ? layout.sheet.w : layout.sheet.h;

      // sheet heading bar (sits below title bar)
      const sheetHdgY = M + titleBarH + 2;
      pdf.setFillColor(245,245,245); pdf.rect(M, sheetHdgY, W, hdgH, 'F');
      pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.rect(M, sheetHdgY, W, hdgH, 'S');
      pdf.setFontSize(9.5); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      // Sheet label: physical-sheet numbers (e.g. "Sheet 1", "Sheets 2-4 (\u00d73)")
      // when this entry collapses multiple identical physical sheets.
      const lqty = layout.qty || 1;
      const lphys = layout.physIndexes || [i];
      const lLabel = lqty > 1
        ? (lphys[0] === lphys[lphys.length-1]
            ? `Sheet ${lphys[0]+1} (\u00d7${lqty})`
            : `Sheets ${lphys[0]+1}\u2013${lphys[lphys.length-1]+1} (\u00d7${lqty})`)
        : `Sheet ${lphys[0]+1}`;
      pdf.text(`${lLabel}  \u2014  ${layout.sheet.name}`, M+4, sheetHdgY+6);
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(110);
      pdf.text(`${formatDim(sw)}\u00d7${formatDim(sh)} ${u}    ${layout.placed.length} piece${layout.placed.length!==1?'s':''}    ${util}% used`, PW-M-2, sheetHdgY+6, { align:'right' });
      pdf.setTextColor(17);

      // panel image — left 2/3, aspect-correct
      if (imgs[i]) {
        const imgX = M+2, imgY = sheetHdgY + hdgH + 3;
        const maxW = leftW-4, maxH = PH-imgY-M-2;
        const aspect = sw / sh;
        let iw, ih;
        if (aspect >= maxW/maxH) { iw = maxW; ih = iw/aspect; }
        else                      { ih = maxH; iw = ih*aspect; }
        pdf.setDrawColor(220); pdf.setLineWidth(0.2); pdf.rect(imgX, imgY, iw, ih, 'S');
        pdf.addImage(imgs[i], 'PNG', imgX, imgY, iw, ih);
      }

      // cut list table — right 1/3
      /** @type {any} */ (pdf).autoTable({
        startY: sheetHdgY + hdgH + 3,
        margin: { left: rightX, right: M },
        tableWidth: rightW,
        head: [['', 'Label', `W (${u})`, `H (${u})`]],
        body: layout.placed.map(/** @param {any} p */ p => ['', p.item.label, formatDim(p.item.w), formatDim(p.item.h)]),
        styles: { fontSize: 7.5, cellPadding: 1.8, overflow:'ellipsize', textColor:[17,17,17] },
        headStyles: { fillColor:[250,250,250], textColor:[140,140,140], fontStyle:'normal', fontSize:6.5, lineWidth:0 },
        columnStyles: { 0:{cellWidth:5}, 2:{halign:'right'}, 3:{halign:'right'} },
        theme: 'plain',
        tableLineColor: [224,224,224], tableLineWidth: 0.2,
        didDrawCell(/** @type {any} */ data) {
          if (data.column.index===0 && data.section==='body') {
            const p = layout.placed[data.row.index];
            if (p) { const [r,g,b]=hexRgb(p.item.color); pdf.setFillColor(r,g,b); pdf.circle(data.cell.x+2.5, data.cell.y+3, 1.5, 'F'); }
          }
        }
      });
    });

    // ── OPTIONAL COMBINED PAGE: summary stats + full cut list ──
    if (clShowSummary || clShowCutList) {
      pdf.addPage();
      const clDivY = pageHeader();
      let cy = clDivY + 5;

      if (clShowSummary) {
        const stats = [
          { v: layouts.length,                           l: 'SHEETS' },
          { v: totalPieces,                              l: 'PIECES' },
          { v: avgUtil + '%',                            l: 'EFFICIENCY' },
          { v: (100-parseFloat(avgUtil)).toFixed(1)+'%', l: 'WASTE' },
        ];
        if (matCost > 0) stats.push({ v: cur + matCost.toLocaleString(), l: 'MATERIAL COST' });
        const sw = W / stats.length;
        stats.forEach((s, i) => {
          const sx = M + i*sw;
          pdf.setFillColor(247,247,247); pdf.roundedRect(sx, cy, sw-2, 20, 2, 2, 'F');
          pdf.setFontSize(18); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
          pdf.text(String(s.v), sx+sw/2-1, cy+12, { align:'center' });
          pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
          pdf.text(s.l, sx+sw/2-1, cy+17, { align:'center' });
        });
        cy += 26;
      }

      if (clShowCutList) {
        if (clShowSummary) { cy += 4; }
        pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(80);
        pdf.text('ALL PIECES', M, cy);
        pdf.setDrawColor(210); pdf.setLineWidth(0.2); pdf.line(M, cy+1.5, PW-M, cy+1.5);
        cy += 5;
        /** @type {any} */ (pdf).autoTable({
          startY: cy, margin: { left:M, right:M },
          head: [['','Label',`W (${u})`,`H (${u})`,'Qty','Material','Grain']],
          body: pieces.map(/** @param {any} p */ p => ['',p.label,p.w,p.h,p.qty,p.material||'--',p.grain==='h'?'Horiz':p.grain==='v'?'Vert':'--']),
          styles: { fontSize:8, cellPadding:2, overflow:'ellipsize', textColor:[17,17,17] },
          headStyles: { fillColor:[250,250,250], textColor:[140,140,140], fontStyle:'normal', fontSize:7, lineWidth:0 },
          columnStyles: { 0:{cellWidth:6}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right',cellWidth:10} },
          theme: 'plain', tableLineColor:[224,224,224], tableLineWidth:0.2,
          didDrawCell(/** @type {any} */ data) {
            if (data.column.index===0 && data.section==='body') {
              const p = pieces[data.row.index];
              if (p) { const [r,g,b]=hexRgb(p.color); pdf.setFillColor(r,g,b); pdf.circle(data.cell.x+2.5, data.cell.y+3, 1.5, 'F'); }
            }
          }
        });
      }

      // footer
      _drawPdfFooter(pdf, biz, 'Printed ' + dateStr, PW, PH, M);
    }

    // output as real PDF blob → opens in browser PDF viewer
    const blob = pdf.output('blob');
    const url  = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    _toast('PDF opened in new tab', 'success', 3000);
  } catch(err) {
    console.error(err);
    _toast('PDF generation failed: '+(/** @type {any} */ (err).message), 'error');
  }
}

