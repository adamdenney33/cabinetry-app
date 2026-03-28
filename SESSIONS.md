# ProCabinet.App — Session Log

---

## Session 1 (approx. Mar 26 2026)

### Work done
- Rebrand to ProCabinet.App with monochrome UI and dark mode toggle
- Added Chrome-style tabs with SVG icons and settings dropdown
- Reordered tabs: Cut List first, circular saw blade icon
- Unified header buttons (same height, person icon for account)
- Metric/imperial switch that converts all cutlist dimensions
- Settings redesign: Dark/Light Mode, Units, Currency toggles
- Moved Pro Plan to account dropdown

---

## Session 2 (approx. Mar 26 2026)

### Work done
- Redesigned cutlist inputs as inline spreadsheet tables
- Added spreadsheet-style features:
  - Colour dot toggles part on/off
  - Eye icon toggles sheet panels on/off
  - Grain direction cycles (none → horizontal → vertical)
  - Stock panel dropdown per part row
  - Custom +/− quantity steppers
  - Alternating row shading
  - Tab/Enter keyboard nav, new row at end
  - Paste TSV data from spreadsheet apps
  - Fraction input (1 1/2) and math expressions (562+25)
  - CSV export/import + blank template download
  - Column visibility toggles for Grain and Material columns
- Layout view improvements:
  - Pastel printer-friendly colours
  - Grain lines matching grain direction
  - Zoom in/out/fit controls
  - Colour and grain line toggles
  - Font size A− / A+ buttons
  - Dimension lines with tick marks
  - PDF print button

---

## Session 3 (approx. Mar 26 2026)

### Work done
- Added missing cutlist features:
  - Drag handles on every row (⠿) — reorder parts/panels
  - Resizable left panel (drag divider)
  - Label column toggle pill
  - Rotate layout button (swaps sheet orientation 90°)
  - Pages per sheet select (1/2/4)
  - Grain lines and rotate use rotated piece coords correctly
- Settings bar redesign:
  - Units as compact in/mm pill toggle
  - Kerf input inline alongside units
  - CSV import/export as icon-only buttons
  - Grain column header uses SVG lines icon

---

## Session 4 (Mar 26–27 2026)

### Work done
- Added Dashboard tab (positioned after Orders, then moved to sit directly next to Orders)
- Dashboard renders:
  - KPI row: Pipeline value, Revenue, Quoted total, Stock value
  - Orders by Status breakdown (coloured dots + counts)
  - Active Orders card (top 5, with client/due/value/status badge)
  - Stock Alerts card (low stock items)
  - Recent Quotes card (last 3)
  - Production Pipeline progress bars

---

## Session 5 (Mar 27 2026)

### Work done
- Fixed dev server setup (preview tool sandbox can't access ~/Documents; server runs from /tmp/cabinetry_www with auto file watcher syncing changes)
- Fixed `--accent2` CSS variable missing — delivery status dot/step colour was invisible
- Added data persistence via localStorage — orders, quotes, and stock now survive page refresh
- Added "→ Order" button on quotes — converts a quote to a confirmed order in one click (marks quote as Approved, pre-fills order value from quote total)
- Dashboard moved to sit directly next to Orders in the nav bar

### Known issues / notes
- Dev server workaround: preview tool cannot access macOS ~/Documents folder due to sandbox restrictions. File watcher copies index.html to /tmp/cabinetry_www on every save.
- Run watcher manually each session: `python3 /tmp/cabinetry_watch.py &`

---

## Session 6 (Mar 28 2026)

### Work done
- **Printable quote**: `printQuote(id)` opens a formatted HTML document in a new tab and triggers print/PDF. Quote shows business name, phone, email from Settings.
- **Duplicate quote**: `⧉ Copy` button on each quote card.
- **Inline edit all quote fields**: project name, client, notes all contenteditable directly on the card. Actions moved to a footer row (Mark Sent, → Order, ⎙ Print, ⧉ Copy).
- **Business Info in Settings**: Business Name, Phone, Email — saved to `localStorage`, used in printed quote header.
- **Order notes visible**: notes field now saved when creating an order (was clearing but not saving). Shown on card as italic text, also inline-editable.
- **Overdue order detection**: orders with a past due date get a red left border + "Overdue" badge. Detected in both order cards and dashboard Active Orders list.
- **Order inline editing**: project name and client name now contenteditable on the order card (was only value/due before).
- **Relative due dates**: order cards show "in 3 days", "Tomorrow", "Today", or "5d overdue" in coloured text next to the due date.
- **Orders search**: search input above the filter tabs — filters by client or project name.
- **Bulk stock adjust**: Added `+5` and `+10` buttons to stock cards alongside the existing `−1` and `+1`.
- **Stock search**: search input on the stock tab filters items by name or SKU.
- **Cut list state persistence**: pieces/sheets/IDs saved to `localStorage` on every render; restored on page load. First visit still shows demo data.
- **Kerf saved to localStorage**: kerf value persists across sessions.
- **Cut list clear wipes localStorage**: `clearCutList()` also removes all saved cut list keys.
- **Material cost in results**: if sheet names match stock items, the total material cost is shown as a stat card in the results summary.
- **"Quote this Job" button**: appears in cut list results when material cost can be calculated; switches to Quote tab with materials cost pre-filled and the field highlighted.
- **Live quote total preview**: the sidebar form shows a live breakdown (Labour: Nh @ $X/hr = $Y, Materials, Total) that updates as you type, before creating the quote.
- **Quote Create button** changed to full-width primary style for clarity.
- **Dashboard quick actions**: `+ New Quote`, `+ New Order`, `⚙ Cut List` buttons at the top of the dashboard.
- **Dashboard overdue count**: a red badge shows count of overdue orders in the quick actions row.
- **Dashboard active orders**: overdue orders get a red left border + ⚠ indicator in the dashboard list.
- **Client autocomplete**: typing a client name in the quote form shows matching names from past quotes/orders.

---

## Pending / next steps

See PLAN.md for the full build plan. Next steps:
- Step 3: Stripe payments/subscriptions
- Step 4: Netlify hosting

### Supabase details
- Project URL: https://mhzneruvlfmhnsohfrdo.supabase.co
- Tables: orders, quotes, stock_items (all with RLS, scoped to user_id)
- Auth: email + password via Supabase Auth

