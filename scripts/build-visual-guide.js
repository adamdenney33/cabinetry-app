// Builds Building Docs/Database_Visual_Guide.docx from this script.
// Run with: node scripts/build-visual-guide.js
// Requires: npm install -g docx   (or run with NODE_PATH set to a global node_modules)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber, PageBreak,
  PageOrientation,
} = require('docx');
const fs = require('fs');

// ── Colors (pulled from app's accent palette) ──
const ACCENT = "C9962B";        // gold/amber
const ACCENT_LIGHT = "F5E9C8";
const TEAL = "2C7873";
const TEAL_LIGHT = "D5E8E5";
const RED = "B33A3A";
const RED_LIGHT = "F5DCDC";
const GRAY = "555555";
const GRAY_LIGHT = "F0F0F0";
const GRAY_MID = "DDDDDD";
const DARK = "1A1A1A";
const NEW_GREEN = "2D7A3F";
const NEW_GREEN_LIGHT = "D4EDDA";

// ── Page constants (A4) ──
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9026

// ── Borders ──
const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── Cell helper ──
function cell(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [{ text }];
  const children = runs.map(r => new TextRun({
    text: r.text,
    bold: r.bold || false,
    italics: r.italics || false,
    color: r.color || (opts.color || "000000"),
    size: r.size || (opts.size || 20),
    font: r.font,
  }));
  return new TableCell({
    borders: opts.noBorders ? noBorders : borders,
    width: { size: opts.width || 4513, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    verticalAlign: opts.valign || VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children,
    })]
  });
}

// ── Paragraph helpers ──
function p(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [{ text }];
  return new Paragraph({
    spacing: opts.spacing || { before: 80, after: 80, line: 300 },
    alignment: opts.align || AlignmentType.LEFT,
    indent: opts.indent,
    children: runs.map(r => new TextRun({
      text: r.text,
      bold: r.bold || false,
      italics: r.italics || false,
      color: r.color || "1A1A1A",
      size: r.size || 22,
      font: r.font,
    })),
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    children: [new TextRun({ text, bold: true, size: 40, color: DARK })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, size: 30, color: ACCENT })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: TEAL })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 40, after: 40, line: 280 },
    children: Array.isArray(text)
      ? text.map(r => new TextRun({
          text: r.text, bold: r.bold || false, italics: r.italics || false,
          color: r.color || "1A1A1A", size: r.size || 22, font: r.font,
        }))
      : [new TextRun({ text, size: 22 })],
  });
}

function code(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 360 },
    shading: { fill: GRAY_LIGHT, type: ShadingType.CLEAR },
    children: [new TextRun({
      text, font: "Courier New", size: 18, color: GRAY,
    })],
  });
}

function spacer(size = 22) {
  return new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: " ", size })] });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
    children: [new TextRun(" ")],
  });
}

// ── Visual diagram of relationships using a styled box ──
function diagramBox(lines) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: {
          top: { style: BorderStyle.SINGLE, size: 8, color: ACCENT },
          bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT },
          left: { style: BorderStyle.SINGLE, size: 8, color: ACCENT },
          right: { style: BorderStyle.SINGLE, size: 8, color: ACCENT },
        },
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: "FDF8EC", type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 240, right: 240 },
        children: lines.map(line => new Paragraph({
          spacing: { before: 20, after: 20, line: 240 },
          children: [new TextRun({
            text: line,
            font: "Courier New",
            size: 18,
            color: DARK,
          })],
        })),
      })]
    })]
  });
}

// ── Field table (for showing what's in a table) ──
function fieldTable(rows, opts = {}) {
  const colW1 = 2400;
  const colW2 = CONTENT_W - colW1;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [colW1, colW2],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell("FIELD", { width: colW1, fill: ACCENT, color: "FFFFFF", bold: true, size: 18 }),
          cell("WHAT IT MEANS", { width: colW2, fill: ACCENT, color: "FFFFFF", bold: true, size: 18 }),
        ],
      }),
      ...rows.map(r => new TableRow({
        children: [
          cell(r[0], { width: colW1, fill: GRAY_LIGHT, bold: true, size: 18, font: "Courier New", color: TEAL }),
          cell(r[1], { width: colW2, size: 20 }),
        ],
      })),
    ],
  });
}

// ══════════════════════════════════════════
// CONTENT
// ══════════════════════════════════════════

const children = [];

// ── COVER ──
children.push(
  spacer(40),
  spacer(40),
  spacer(40),
  new Paragraph({
    spacing: { before: 0, after: 240 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "ProCabinet.App",
      bold: true, size: 64, color: ACCENT,
    })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 120 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "Database Visual Guide",
      bold: true, size: 44, color: DARK,
    })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 600 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "How your app's data is organised, in plain English",
      italics: true, size: 26, color: GRAY,
    })],
  }),
  spacer(40),
  // Cover summary box
  new Table({
    width: { size: 7000, type: WidthType.DXA },
    columnWidths: [7000],
    rows: [new TableRow({
      children: [new TableCell({
        borders: {
          top: { style: BorderStyle.SINGLE, size: 12, color: ACCENT },
          bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT },
          left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT },
          right: { style: BorderStyle.SINGLE, size: 12, color: ACCENT },
        },
        width: { size: 7000, type: WidthType.DXA },
        shading: { fill: "FDF8EC", type: ShadingType.CLEAR },
        margins: { top: 240, bottom: 240, left: 320, right: 320 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: "WHAT'S INSIDE", bold: true, size: 22, color: ACCENT })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: "1.  The big idea  -  what a database is for this app", size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: "2.  The big picture  -  visual map of all your data", size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: "3.  Each \"drawer\"  -  what every table holds", size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: "4.  Before & after  -  what changes from today", size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "5.  What you gain  -  why this is worth doing", size: 22 })],
          }),
        ],
      })]
    })]
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ══════════════════════════════════════════
// PART 1: THE BIG IDEA
// ══════════════════════════════════════════
children.push(
  h1("1. The Big Idea"),
  p([
    { text: "Think of your app like a workshop's filing cabinet.", bold: true, size: 24 },
  ]),
  p("Each drawer in the cabinet holds one type of thing — clients in one, projects in another, materials in another. Inside each drawer, every folder has a label (an ID) so you can reference it from anywhere else."),
  p([
    { text: "A database is just that: a set of drawers (called " },
    { text: "tables", italics: true },
    { text: ") that hold things (called " },
    { text: "rows", italics: true },
    { text: "), each labelled with an ID, and connected to other things via those IDs. That's it. The fancy word for those connections is \"relationships\" — which is why this is called a " },
    { text: "relational database", bold: true },
    { text: "." },
  ]),
  spacer(),
  h3("Why this matters for ProCabinet"),
  p("Right now, your app stores its data in two very different places:"),
  spacer(),
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [4513, 4513],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell("SUPABASE  (the cloud database)", { width: 4513, fill: TEAL, color: "FFFFFF", bold: true, align: AlignmentType.CENTER }),
          cell("LOCALSTORAGE  (this browser only)", { width: 4513, fill: RED, color: "FFFFFF", bold: true, align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell("Lives on a server", { width: 4513, fill: TEAL_LIGHT }),
          cell("Lives in this browser only", { width: 4513, fill: RED_LIGHT }),
        ],
      }),
      new TableRow({
        children: [
          cell("Same data on every device you log into", { width: 4513, fill: TEAL_LIGHT }),
          cell("Different on every device", { width: 4513, fill: RED_LIGHT }),
        ],
      }),
      new TableRow({
        children: [
          cell("Backed up daily", { width: 4513, fill: TEAL_LIGHT }),
          cell("Gone if you clear browser data", { width: 4513, fill: RED_LIGHT }),
        ],
      }),
      new TableRow({
        children: [
          cell("Searchable, reportable, future-proof", { width: 4513, fill: TEAL_LIGHT }),
          cell("Can't search or report across it", { width: 4513, fill: RED_LIGHT }),
        ],
      }),
      new TableRow({
        children: [
          cell([{ text: "TODAY:", bold: true, color: TEAL }, { text: " 5 things stored here", color: TEAL }], { width: 4513, fill: TEAL_LIGHT }),
          cell([{ text: "TODAY:", bold: true, color: RED }, { text: " ~15 things stored here", color: RED }], { width: 4513, fill: RED_LIGHT }),
        ],
      }),
    ],
  }),
  spacer(),
  p([
    { text: "The plan: ", bold: true },
    { text: "move almost everything from the right column to the left.", color: ACCENT, bold: true },
    { text: " That's what this guide describes." },
  ]),
  new Paragraph({ children: [new PageBreak()] }),
);

// ══════════════════════════════════════════
// PART 2: THE BIG PICTURE
// ══════════════════════════════════════════
children.push(
  h1("2. The Big Picture"),
  p("Here's the whole filing cabinet at a glance. The arrows show \"belongs to\" — read them as \"a project belongs to a client,\" \"a quote belongs to a project,\" and so on."),
  spacer(),
  diagramBox([
    "                    YOU  (your login)",
    "                         |",
    "        +----------------+----------------+",
    "        |                |                |",
    "        v                v                v",
    "   BUSINESS INFO    YOUR LIBRARY     STOCK ITEMS",
    "   (your details)        |           (your inventory)",
    "                         |",
    "                  +------+------+",
    "                  |             |",
    "                  v             v",
    "             catalog_items   cabinet_templates",
    "             (materials,     (reusable cabinet",
    "              handles,        designs)",
    "              finishes,",
    "              hardware  -",
    "              all one table)",
    "        |",
    "        v",
    "    CLIENTS  (your customers)",
    "        |",
    "        v",
    "    PROJECTS  (one per job)",
    "        |",
    "        +-------+-------+--------+--------+",
    "        |       |       |        |        |",
    "        v       v       v        v        v",
    "   CABINETS  SHEETS  PIECES  EDGE BANDS  QUOTES & ORDERS",
    "                                              |",
    "                                              v",
    "                                       (line items per cabinet)",
  ]),
  spacer(),
  p("Three things to notice:"),
  bullet([{ text: "Everything starts with " }, { text: "you", bold: true }, { text: " (your login). Nobody else can see your data — that's enforced at the database level." }]),
  bullet([{ text: "Customers (clients) own projects. Projects own everything else." }]),
  bullet([{ text: "Catalogs (materials, handles, etc.) sit on the side. They're shared across all your projects, like a price list you reference from anywhere." }]),
  new Paragraph({ children: [new PageBreak()] }),
);

// ══════════════════════════════════════════
// PART 3: EACH DRAWER EXPLAINED
// ══════════════════════════════════════════
children.push(
  h1("3. Each Drawer Explained"),
  p("Now we'll walk through each drawer of the cabinet. For each one: what it is, a real-world example, what's inside, and why it gets its own drawer."),

  // ── Business Info ──
  divider(),
  h2("Your Business"),
  p([{ text: "table: ", color: GRAY }, { text: "business_info", font: "Courier New", color: TEAL, bold: true }]),
  p([{ text: "What it is:  ", bold: true }, { text: "Your company details — name, contact info, logo, ABN, default currency." }]),
  p([{ text: "Real example:  ", bold: true }, { text: "\"ProCabinet Workshop, 12 High Street, +44 7700 900123, GBP, mm\"" }]),
  p([{ text: "Why a drawer:  ", bold: true }, { text: "These appear on every quote and invoice. Storing them once means you change them in one place when you move premises." }]),
  spacer(),
  fieldTable([
    ["name", "Your business name (shown on quotes/invoices)"],
    ["phone, email, address", "Contact details"],
    ["abn", "Tax/business number (shown on invoices)"],
    ["logo_url", "Link to your logo image (stored in Supabase Storage, not as a giant blob)"],
    ["default_currency", "£, $, €, etc."],
    ["default_units", "mm or inches — your preferred measurement"],
  ]),
  spacer(),

  // ── Library ──
  divider(),
  h2("Your Library"),
  p([
    { text: "tables: ", color: GRAY },
    { text: "catalog_items, cabinet_templates", font: "Courier New", color: TEAL, bold: true },
  ]),
  p([{ text: "What they are:  ", bold: true }, { text: "Reusable building blocks you reference from quotes and projects. Your master price list and your reusable cabinet designs." }]),
  p([{ text: "Real example:  ", bold: true }, { text: "\"Birch Plywood 18mm — £40/sheet.\" Used on 12 different quotes — but you only define it once. When the price changes, you update it in one place and every future quote uses the new figure." }]),
  spacer(),
  h3("catalog_items  —  your master price list"),
  p([
    { text: "One table holds every priced thing in your library: materials, handles, finishes, hardware. A " },
    { text: "type", font: "Courier New", bold: true, color: TEAL },
    { text: " column tells the app which kind of item each row is, so the cabinet editor only shows handles in the handle dropdown, materials in the material dropdown, and so on." },
  ]),
  spacer(),
  fieldTable([
    ["type", "material / handle / finish / hardware  — what kind of thing this is"],
    ["name", "\"Birch Plywood 18mm\" or \"Push to Open\" or \"Osmo Polyx Oil\""],
    ["price", "Cost — meaning depends on the type (per sheet, per unit, per m²)"],
    ["unit", "\"sheet\", \"each\", \"m²\"  — what the price is measured in"],
    ["notes", "Optional details (sheet size, thickness, supplier note, etc.)"],
    ["specs", "Extra fields used only for some types (e.g. material sheet size, grain) — kept as a small flexible field"],
  ]),
  spacer(),
  // ── Why one table callout ──
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: {
          top: { style: BorderStyle.SINGLE, size: 6, color: TEAL },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL },
          left: { style: BorderStyle.SINGLE, size: 6, color: TEAL },
          right: { style: BorderStyle.SINGLE, size: 6, color: TEAL },
        },
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: TEAL_LIGHT, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 240, right: 240 },
        children: [
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: "WHY ONE TABLE INSTEAD OF THREE?", bold: true, size: 20, color: TEAL })],
          }),
          new Paragraph({
            spacing: { after: 80, line: 280 },
            children: [new TextRun({
              text: "Originally this was three tables (materials, handles, finishes) plus more for hardware. They all had the same shape: name + price. Folding them into one table with a type column means:",
              size: 20,
            })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0, line: 280 },
            children: [new TextRun({ text: "•  One place to manage your entire price list", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0, line: 280 },
            children: [new TextRun({ text: "•  Adding a new category (\"adhesives\", \"fittings\") is a new row, not a new table", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0, line: 280 },
            children: [new TextRun({ text: "•  Less code  -  one set of save / load / search functions instead of three", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0, line: 280 },
            children: [new TextRun({ text: "•  Bulk price update queries are trivial  -  \"raise all hardware by 5%\" is one line", size: 20 })],
          }),
        ],
      })]
    })]
  }),
  spacer(),
  p([
    { text: "Why not remove the catalog entirely?  ", bold: true },
    { text: "Worth answering — it's tempting to just store the handle name on each cabinet and skip the catalog. But that means every cabinet carries its own copy of the price. When the supplier raises \"Push to Open\" from £25 to £28, you'd update it on every cabinet manually instead of in one place. The catalog " },
    { text: "is", italics: true },
    { text: " your single source of truth for prices." },
  ]),
  spacer(),
  h3("cabinet_templates  —  reusable cabinet designs"),
  p("A pre-built cabinet design you can drop into any project. \"Standard 600mm base unit with one drawer and double doors\" — saved once, used many times. Kept as its own table because cabinets have a much richer shape than a price list item."),
  fieldTable([
    ["name", "\"Standard 600 base, 1 drawer, doors\""],
    ["type", "base / wall / tall"],
    ["default_w, default_h, default_d", "Default dimensions"],
    ["default_specs", "All the other settings (materials, drawer counts, etc.) packaged up"],
  ]),
  new Paragraph({ children: [new PageBreak()] }),

  // ── Stock ──
  h2("Your Stock"),
  p([{ text: "table: ", color: GRAY }, { text: "stock_items", font: "Courier New", color: TEAL, bold: true }]),
  p([{ text: "What it is:  ", bold: true }, { text: "What you actually have on hand in the workshop, right now. This is different from the catalog — the catalog is what you " }, { text: "could", italics: true }, { text: " buy; stock is what you " }, { text: "have", italics: true }, { text: "." }]),
  p([{ text: "Real example:  ", bold: true }, { text: "\"3 sheets of 18mm birch ply on the rack, low-stock warning at 1 sheet.\"" }]),
  p([{ text: "Why a drawer:  ", bold: true }, { text: "When you confirm an order, you can deduct sheets used. When stock runs low, you get a warning. Right now, supplier and category info for stock is stuck in localStorage — moving it here means it follows you to other devices." }]),
  spacer(),
  fieldTable([
    ["name", "\"Birch Plywood 18mm\""],
    ["sku", "Your internal code for it"],
    ["w, h", "Sheet dimensions"],
    ["qty", "How many you have right now"],
    ["low", "Warn when qty drops below this"],
    ["cost", "What you paid for it"],
    ["category", "How you group it (e.g. \"Sheet goods\")  — moves out of localStorage"],
    ["supplier, supplier_url", "Where you buy it from  — moves out of localStorage"],
    ["thickness, width, length, glue", "Extra fields for things like edge banding rolls"],
  ]),
  spacer(),

  // ── Clients ──
  divider(),
  h2("Your Customers"),
  p([{ text: "table: ", color: GRAY }, { text: "clients", font: "Courier New", color: TEAL, bold: true }]),
  p([{ text: "What it is:  ", bold: true }, { text: "The people who pay you." }]),
  p([{ text: "Real example:  ", bold: true }, { text: "\"Sarah Mitchell, sarah@example.com, 14 Oak Lane.\"" }]),
  p([{ text: "Why a drawer:  ", bold: true }, { text: "One client can have many projects, many quotes, and many orders. Storing them once means you don't retype Sarah's address on every quote — you just link to her." }]),
  spacer(),
  fieldTable([
    ["name", "Sarah Mitchell"],
    ["email, phone, address", "How to reach her"],
    ["notes", "\"Prefers oak, allergic to MDF dust, second job for her\""],
  ]),
  new Paragraph({ children: [new PageBreak()] }),

  // ── Projects ──
  h2("Your Projects"),
  p([{ text: "table: ", color: GRAY }, { text: "projects", font: "Courier New", color: TEAL, bold: true }]),
  p([{ text: "What it is:  ", bold: true }, { text: "One job. A kitchen. A wardrobe. A bookshelf. A project belongs to one client and is the parent of all the design work." }]),
  p([{ text: "Real example:  ", bold: true }, { text: "\"Kitchen Refit — Mitchell residence — 14 cabinets, plywood carcass, oak doors.\"" }]),
  p([{ text: "Why a drawer:  ", bold: true }, { text: "Today, almost everything about a project (cabinets, sheets, pieces, edge bands) is dumped into one big text blob inside this row. That makes it impossible to ask \"how much edge banding did I use this year?\" because the data is locked inside text. The new design pulls all that out into proper drawers (next sections)." }]),
  spacer(),
  fieldTable([
    ["name", "\"Mitchell Kitchen\""],
    ["client_id", "Which client this is for (link to clients drawer)"],
    ["created_at, updated_at", "When you started it / last touched it"],
    ["ui_prefs", "Last zoom level, which tab was open  — small UI memory, stays as a blob"],
  ]),
  spacer(),

  // ── Cabinets ──
  divider(),
  h2("Cabinets in a Project"),
  p([{ text: "tables: ", color: GRAY }, { text: "cabinets, cabinet_hardware", font: "Courier New", color: TEAL, bold: true }]),
  p([{ text: "What it is:  ", bold: true }, { text: "Each individual cabinet you're building in this project, with its full spec." }]),
  p([{ text: "Real example:  ", bold: true }, { text: "\"Sink unit — 800x720x560, birch carcass, oak door, push-to-open, 1 fixed shelf.\"" }]),
  p([{ text: "Why a drawer:  ", bold: true }, { text: "Currently this lives inside the projects text blob. By giving cabinets their own drawer, you can: ask \"what's the most-quoted cabinet size this year?\", reuse a cabinet definition across projects, and edit one cabinet without rewriting the whole project blob." }]),
  spacer(),
  fieldTable([
    ["project_id", "Which project this cabinet is in"],
    ["name", "\"Sink unit\""],
    ["w_mm, h_mm, d_mm, qty", "Width, height, depth, how many"],
    ["carcass_material, top_material", "What the box is made of"],
    ["has_back, back_material", "Whether it has a back panel and what it's made of"],
    ["base_type, finish", "Plinth/legs/none, oil/lacquer/etc."],
    ["door_count, door_material, door_handle", "Door spec"],
    ["drawer_count, drawer_front_material, ...", "Drawer spec"],
    ["fixed_shelves, adj_shelves, loose_shelves", "Shelf counts"],
    ["cable_holes, extra_labour_hours", "Extras"],
    ["notes", "Free-form note for this cabinet"],
  ]),
  spacer(),
  p([{ text: "Hardware items (handles, hinges, runners) for each cabinet live in a small companion drawer ", color: GRAY },
     { text: "cabinet_hardware", font: "Courier New", color: TEAL, bold: true },
     { text: ", linked back to the cabinet by ID.", color: GRAY }]),
  new Paragraph({ children: [new PageBreak()] }),

  // ── Cut list bits ──
  h2("Cut List Bits"),
  p([{ text: "tables: ", color: GRAY }, { text: "sheets, pieces, edge_bands, piece_edges", font: "Courier New", color: TEAL, bold: true }]),
  p([{ text: "What they are:  ", bold: true }, { text: "The raw materials and the parts cut from them, for the panel-cutting tool." }]),
  spacer(),
  h3("sheets — the panels you cut from"),
  p("\"Two sheets of 2440x1220 18mm ply, 3mm kerf, grain runs vertically.\""),
  fieldTable([
    ["project_id", "Which project"],
    ["name, w_mm, h_mm, qty", "What it is, dimensions, how many"],
    ["kerf_mm", "Saw blade thickness"],
    ["grain", "none / horizontal / vertical"],
    ["color, enabled", "Visual color and whether it's used in the layout"],
  ]),
  spacer(),
  h3("pieces — the parts to cut"),
  p("\"14 side panels at 720x560, 7 backs at 800x720, etc.\""),
  fieldTable([
    ["project_id", "Which project"],
    ["label, w_mm, h_mm, qty", "Part name, dimensions, how many to cut"],
    ["grain, material, notes", "Grain requirement, which material to cut from, notes"],
    ["color, enabled", "Visual + whether to include in layout"],
  ]),
  spacer(),
  h3("edge_bands — the edge tape rolls"),
  p("\"3mm birch edge banding, 22mm wide, 50m roll.\""),
  fieldTable([
    ["project_id", "Which project"],
    ["name, thickness_mm, width_mm, length_m", "Spec of the roll"],
    ["glue, color", "Adhesive type, visual colour"],
  ]),
  spacer(),
  h3("piece_edges — which edge band on which side"),
  p("Today this is a tiny blob inside each piece (\"L1, W2, L3, W4\"). Pulling it out as its own drawer means you can ask \"how many metres of birch edge banding did I use this year?\" — currently impossible."),
  fieldTable([
    ["piece_id", "Which piece"],
    ["side", "L1 (long 1), W2 (short 2), L3, W4"],
    ["edge_band_id", "Which edge band roll to use"],
  ]),
  new Paragraph({ children: [new PageBreak()] }),

  // ── Quotes & Orders ──
  h2("Quotes & Orders"),
  p([{ text: "tables: ", color: GRAY }, { text: "quotes, quote_lines, orders, order_lines", font: "Courier New", color: TEAL, bold: true }]),
  p([{ text: "What they are:  ", bold: true }, { text: "A quote is a priced proposal. An order is the same thing, confirmed and being built. They have nearly identical structure." }]),
  p([{ text: "Real example:  ", bold: true }, { text: "Quote Q-0042 for Mitchell Kitchen — 14 cabinet line items, materials £2,400, labour £1,800, 20% markup, 13% tax, total £5,693." }]),
  p([{ text: "Why two drawers (header + lines):  ", bold: true }, { text: "Today a quote is one row with one big total. With a separate \"lines\" drawer, each cabinet becomes its own row with its own price breakdown — so you can edit, reorder, duplicate, or delete individual items, and your reports become much richer." }]),
  spacer(),
  h3("quotes (the header)"),
  fieldTable([
    ["client_id, project_id", "Who it's for"],
    ["quote_number", "Q-0042 (your customer-facing reference)"],
    ["status", "draft / sent / accepted / declined"],
    ["markup, tax", "Percentages applied to the subtotal"],
    ["notes, date", "Free-form note + when the quote was issued"],
  ]),
  spacer(),
  h3("quote_lines (one row per cabinet)"),
  fieldTable([
    ["quote_id", "Which quote this line belongs to"],
    ["position", "Order in the list (so you can drag to reorder)"],
    ["name, type, room", "\"Sink unit\" / base / \"Kitchen\""],
    ["w_mm, h_mm, d_mm, qty", "Dimensions and count"],
    ["material, finish, construction, base_type", "What it's made from"],
    ["door_count, drawer_count, ...", "All the same fields as a cabinet"],
    ["labour_hours, material_cost_override", "Manual overrides if you want them"],
    ["hardware, extras", "Free-form lists for ad-hoc items per line"],
  ]),
  spacer(),
  p([{ text: "Orders work exactly the same way: an ", color: GRAY },
     { text: "orders", font: "Courier New", color: TEAL, bold: true },
     { text: " header plus ", color: GRAY },
     { text: "order_lines", font: "Courier New", color: TEAL, bold: true },
     { text: " for each cabinet. An order can also link back to the quote it came from (", color: GRAY },
     { text: "quote_id", font: "Courier New", color: TEAL, bold: true },
     { text: " field), so you can trace any job back to its original proposal.", color: GRAY }]),
  new Paragraph({ children: [new PageBreak()] }),
);

// ══════════════════════════════════════════
// PART 4: BEFORE & AFTER
// ══════════════════════════════════════════
children.push(
  h1("4. Before & After"),
  p("Here's the same example — a cabinet quote line for a sink unit — shown as it lives today versus how it'll live after the migration."),
  spacer(),
  h3("BEFORE  —  one giant text blob in the browser"),
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: {
          top: { style: BorderStyle.SINGLE, size: 6, color: RED },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: RED },
          left: { style: BorderStyle.SINGLE, size: 6, color: RED },
          right: { style: BorderStyle.SINGLE, size: 6, color: RED },
        },
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: RED_LIGHT, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 240, right: 240 },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [new TextRun({ text: "localStorage key: ", bold: true, size: 18, color: RED })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 120 },
            children: [new TextRun({ text: "pc_cq_lines", font: "Courier New", size: 18, color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [new TextRun({ text: "value:", bold: true, size: 18, color: RED })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0, line: 240 },
            children: [new TextRun({
              text: "[{\"id\":1,\"name\":\"Sink unit\",\"w\":800,\"h\":720,\"d\":560,\"material\":\"Birch Plywood 18mm\",\"doorCount\":2,\"doorMat\":\"Solid Oak\",\"doorHandle\":\"Push to Open\",\"drawerCount\":0,\"fixedShelves\":1,\"hwItems\":[...],\"extras\":[...],\"notes\":\"...\"}, ... 13 more cabinets ...]",
              font: "Courier New", size: 16, color: DARK,
            })],
          }),
          new Paragraph({
            spacing: { before: 160, after: 0 },
            children: [new TextRun({ text: "Problems:", bold: true, size: 20, color: RED })],
          }),
          new Paragraph({
            spacing: { before: 40, after: 0 },
            children: [new TextRun({ text: "•  Only on this browser  -  no sync to your tablet in the workshop", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0 },
            children: [new TextRun({ text: "•  Gone if you clear browser data or the device dies", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0 },
            children: [new TextRun({ text: "•  Can't ask \"how many sink units have I quoted this year?\"", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0 },
            children: [new TextRun({ text: "•  No backup", size: 20 })],
          }),
        ],
      })]
    })]
  }),
  spacer(),
  h3("AFTER  —  proper rows in proper drawers, in the cloud"),
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: {
          top: { style: BorderStyle.SINGLE, size: 6, color: NEW_GREEN },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: NEW_GREEN },
          left: { style: BorderStyle.SINGLE, size: 6, color: NEW_GREEN },
          right: { style: BorderStyle.SINGLE, size: 6, color: NEW_GREEN },
        },
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: NEW_GREEN_LIGHT, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 240, right: 240 },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [new TextRun({ text: "drawer:", bold: true, size: 18, color: NEW_GREEN })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 120 },
            children: [new TextRun({ text: "quote_lines  (one row per cabinet)", font: "Courier New", size: 18, color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [new TextRun({ text: "row example:", bold: true, size: 18, color: NEW_GREEN })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: "id: 1042   |   quote_id: 17   |   position: 3", font: "Courier New", size: 18, color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: "name: \"Sink unit\"   |   type: \"base\"   |   room: \"Kitchen\"", font: "Courier New", size: 18, color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: "w_mm: 800   |   h_mm: 720   |   d_mm: 560   |   qty: 1", font: "Courier New", size: 18, color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: "material: \"Birch Plywood 18mm\"   (looked up in catalog_items)", font: "Courier New", size: 18, color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: "door_count: 2   |   door_material: \"Solid Oak\"   |   door_handle: \"Push to Open\"", font: "Courier New", size: 18, color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: "fixed_shelves: 1   |   labour_hours: 4.5   |   ...", font: "Courier New", size: 18, color: DARK })],
          }),
          new Paragraph({
            spacing: { before: 160, after: 0 },
            children: [new TextRun({ text: "What this gives you:", bold: true, size: 20, color: NEW_GREEN })],
          }),
          new Paragraph({
            spacing: { before: 40, after: 0 },
            children: [new TextRun({ text: "•  Same data on phone, laptop, workshop tablet  -  always", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0 },
            children: [new TextRun({ text: "•  Daily backups, can never be lost", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0 },
            children: [new TextRun({ text: "•  \"Show me every sink unit I've quoted this year\"  -  one query", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0 },
            children: [new TextRun({ text: "•  Can edit one line without rewriting the whole quote", size: 20 })],
          }),
          new Paragraph({
            spacing: { before: 20, after: 0 },
            children: [new TextRun({ text: "•  Can drag-reorder lines, duplicate one, delete one  -  cleanly", size: 20 })],
          }),
        ],
      })]
    })]
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ══════════════════════════════════════════
// PART 5: WHAT YOU GAIN
// ══════════════════════════════════════════
children.push(
  h1("5. What You Gain"),
  p("The whole point of doing this work is unlocking things you can't do today. Here are the headline wins, each as a one-liner you can imagine yourself using:"),
  spacer(),

  // Win 1
  h3("1.  Multi-device sync"),
  p("Open the app on your phone in the workshop and see the same cut list you started on your laptop this morning. Today this is impossible — half the data lives in your laptop's browser only."),
  spacer(),

  // Win 2
  h3("2.  Real reports"),
  p("\"How much edge banding have I used this year?\"  \"Which cabinet sizes are most often quoted?\"  \"What's my average markup on kitchens vs. wardrobes?\"  All of these become single queries — currently they're either impossible or require hand-counting through dozens of saved files."),
  spacer(),

  // Win 3
  h3("3.  Backups, automatically"),
  p("Supabase backs up the whole database daily. Your business's history can never be lost to a wiped browser, a stolen laptop, or a corrupted file."),
  spacer(),

  // Win 4
  h3("4.  Future features unlocked"),
  bullet([{ text: "Adding a teammate", bold: true }, { text: "  -  becomes a row in a team_members drawer (impossible today because half the data is per-browser)" }]),
  bullet([{ text: "Customer portal", bold: true }, { text: "  -  let clients view and accept quotes online" }]),
  bullet([{ text: "Stock auto-deduction", bold: true }, { text: "  -  when an order is confirmed, sheets used drop from inventory" }]),
  bullet([{ text: "Cabinet templates library", bold: true }, { text: "  -  build the cabinet once, reuse across every kitchen project" }]),
  bullet([{ text: "Cross-project search", bold: true }, { text: "  -  \"find every job that used 18mm birch ply\"" }]),
  spacer(),

  // Win 5
  h3("5.  Cleaner code, faster iteration"),
  p("Every \"localStorage.setItem(...JSON.stringify(...))\" pair becomes a single database call. A lot of the JSON-juggling boilerplate in the app simply disappears. Easier to add features, easier to fix bugs, easier for AI tools (like the one that helped write this guide) to work on the codebase."),
  spacer(),

  divider(),
  h2("In one sentence"),
  p([
    { text: "You're moving from ", size: 24 },
    { text: "\"a single-browser sketchpad\" ", italics: true, color: RED, size: 24 },
    { text: "to ", size: 24 },
    { text: "\"a real cloud business system\"", italics: true, color: NEW_GREEN, size: 24 },
    { text: "  -  while keeping every feature you have today.", size: 24 },
  ]),
  spacer(),
  spacer(),
  // closing card
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({
      children: [new TableCell({
        borders: {
          top: { style: BorderStyle.SINGLE, size: 12, color: ACCENT },
          bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT },
          left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT },
          right: { style: BorderStyle.SINGLE, size: 12, color: ACCENT },
        },
        width: { size: CONTENT_W, type: WidthType.DXA },
        shading: { fill: "FDF8EC", type: ShadingType.CLEAR },
        margins: { top: 280, bottom: 280, left: 320, right: 320 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: "NEXT STEP", bold: true, size: 22, color: ACCENT })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({
              text: "Sit with this design.  If it looks right, the next deliverable is the actual SQL  -  the migrations that build these drawers in your Supabase project.",
              size: 22,
            })],
          }),
        ],
      })]
    })]
  }),
);

// ══════════════════════════════════════════
// DOC SETUP
// ══════════════════════════════════════════
const doc = new Document({
  creator: "ProCabinet",
  title: "ProCabinet Database Visual Guide",
  description: "Plain-English visual guide to the proposed database schema for ProCabinet.app",
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 40, bold: true, font: "Calibri", color: DARK },
        paragraph: { spacing: { before: 480, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Calibri", color: ACCENT },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Calibri", color: TEAL },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 280 } } }
        }, {
          level: 1, format: LevelFormat.BULLET, text: "◦",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 280 } } }
        }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: "ProCabinet  •  Database Visual Guide",
            italics: true, size: 18, color: GRAY,
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", size: 18, color: GRAY }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GRAY }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  // Output to scripts/output/ — the canonical Building Docs/Database_Visual_Guide.docx
  // may have manual edits. Compare and copy across when ready.
  const path = require('path');
  const outDir = path.resolve(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'Database_Visual_Guide.docx');
  fs.writeFileSync(out, buffer);
  console.log("WROTE: " + out);
  console.log("(canonical version is at Building Docs/Database_Visual_Guide.docx — diff manually before replacing)");
});
