# ProCabinet.App — Development Guidelines

## Reference Docs

Read these before making structural decisions or schema changes:

- **`SPEC.md`** — pre-launch refactor spec (problem, goals, non-goals, scope, success criteria, phases, decisions log). The contract for what "done" means.
- **`SCHEMA.md`** — full database schema with DDL, RLS patterns, and migration order. Source of truth for all tables, columns, and FKs.
- **`PLAN.md`** — launch-level stack/hosting/payments plan.
- **`Building Docs/Database_Visual_Guide.docx`** — plain-English version of the schema for non-technical reading.

When making non-obvious decisions during work, append a one-line entry to `SPEC.md § 13 Decisions log`.

## Stack
- Single-file app: `index.html` (HTML + CSS + JS, no build step)
- Auth/DB: Supabase (PostgreSQL)
- No frameworks — plain vanilla JS

## Library / Data Inputs Pattern

All entity inputs (clients, projects, stock materials) follow a **smart search input** pattern. Never use tabbed library panels, collapsible lists, or inline item lists.

### How it works:
1. **Search input with `+` button** — wrapped in `.smart-input-wrap`:
   - `<input>` with `oninput` calling a suggest function, `onfocus` to show on click, `onblur` to dismiss
   - `.smart-input-add` div (the `+` button) that opens the **full creation popup** for that entity type
2. **Dropdown suggest list** — uses `.client-suggest-list` class:
   - Shows matching items as the user types (search-as-you-type)
   - Each item is a `.client-suggest-item` with an icon, name, and optional metadata
   - Bottom row (`.client-suggest-add`) offers to create a new entry with the typed text
   - Positioned absolutely; use `.suggest-up` class when input is near the bottom of a scrollable container
3. **`+` button opens a full popup** — not a simple prompt, not a nav to another tab:
   - Clients → `_openNewClientPopup(targetInputId)`
   - Projects → `_openNewProjectPopup(targetInputId)`
   - Stock → `_openNewStockPopup()`
   - The popup includes all fields for that entity (same fields as the sidebar form / edit popup)

### Rules:
- No collapsible/accordion library sections
- No tabbed library panels pinned to sidebars
- No inline item lists — the dropdown is the only list, and it appears on focus/type
- The `+` button always opens a **full popup modal** with all fields, never navigates to another tab
- After creating via popup, the input is auto-filled with the new entry name
- Suggest functions: `_smartClientSuggest`, `_smartProjectSuggest`, `_smartCLProjectSuggest`, `_smartCLStockSuggest`

### Example HTML:
```html
<label>Client</label>
<div class="smart-input-wrap">
  <input type="text" id="q-client" placeholder="Search or add client..."
    autocomplete="off"
    oninput="_smartClientSuggest(this,'q-client-suggest')"
    onfocus="_smartClientSuggest(this,'q-client-suggest')"
    onblur="setTimeout(()=>document.getElementById('q-client-suggest').style.display='none',150)">
  <div class="smart-input-add" onclick="_openNewClientPopup('q-client')" title="Add new client">+</div>
</div>
<div id="q-client-suggest" class="client-suggest-list" style="display:none"></div>
```

## Popup Modal System

All entity editing/creation uses popup modals via `_openPopup(html, size)` / `_closePopup()`.

- Sizes: `'sm'`, `'md'`, `'lg'` (or omit for default)
- Read values with `_popupVal(id)` helper
- Structure: `.popup-header` > `.popup-title` + `.popup-close`, `.popup-body` with `.pf` form groups, `.popup-footer`
- GPU compositing: overlay uses `transform: translateZ(0)` for reliable rendering
- Responsive: `max-width: calc(100vw - 32px)` with mobile adjustments at 480px

## UI Conventions

- Cards are clickable (open popup on click), with `cursor: pointer` and hover border highlight
- Footer action buttons use `event.stopPropagation()` to prevent card click
- Toast notifications via `_toast(message, type)` — types: `'success'`, `'error'`
- Confirmation dialogs via `_confirm(message, callback)`
- Import/Export buttons belong in the main content area filter bars, not in sidebars
